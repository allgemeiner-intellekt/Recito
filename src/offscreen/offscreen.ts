import type { ExtensionMessage } from '../shared/messages'
import { isExtensionMessage } from '../shared/messages'
import { MAX_BUFFER_AHEAD_CHUNKS, MAX_BUFFER_BEHIND_CHUNKS } from '../shared/constants'
import { runtimeSendMessage } from '../shared/chrome-async'

interface AudioChunkEntry {
  chunkIndex: number
  audio: HTMLAudioElement
  url: string
  duration: number
}

interface JobPlayback {
  jobId: string
  totalChunks: number
  playbackRate: number
  isPlaying: boolean
  currentChunkIndex: number
  entries: Map<number, AudioChunkEntry>
  lastTimeUpdateMs: number
}

const jobs = new Map<string, JobPlayback>()

function getOrCreateJob(jobId: string): JobPlayback {
  const existing = jobs.get(jobId)
  if (existing) return existing
  const job: JobPlayback = {
    jobId,
    totalChunks: 0,
    playbackRate: 1,
    isPlaying: false,
    currentChunkIndex: 0,
    entries: new Map(),
    lastTimeUpdateMs: 0
  }
  jobs.set(jobId, job)
  return job
}

function post(msg: ExtensionMessage): void {
  void runtimeSendMessage(msg).catch(() => {
    // ignore
  })
}

function cleanupEntry(entry: AudioChunkEntry): void {
  try {
    entry.audio.pause()
  } catch {
    // ignore
  }
  entry.audio.src = ''
  entry.audio.load()
  try {
    URL.revokeObjectURL(entry.url)
  } catch {
    // ignore
  }
}

function cleanupJob(job: JobPlayback): void {
  for (const entry of job.entries.values()) cleanupEntry(entry)
  job.entries.clear()
  jobs.delete(job.jobId)
}

function prune(job: JobPlayback): void {
  const min = Math.max(0, job.currentChunkIndex - MAX_BUFFER_BEHIND_CHUNKS)
  const max = job.currentChunkIndex + MAX_BUFFER_AHEAD_CHUNKS
  for (const [idx, entry] of job.entries) {
    if (idx < min || idx > max) {
      cleanupEntry(entry)
      job.entries.delete(idx)
    }
  }
}

function emitState(job: JobPlayback): void {
  const entry = job.entries.get(job.currentChunkIndex)
  if (!entry) return
  const dur = Number(entry.audio.duration)
  post({
    type: 'AUDIO_TIME_UPDATE',
    payload: {
      jobId: job.jobId,
      chunkIndex: entry.chunkIndex,
      currentTime: Number(entry.audio.currentTime) || 0,
      duration: Number.isFinite(dur) ? dur : entry.duration || 0,
      isPlaying: job.isPlaying
    }
  })
}

async function playCurrent(job: JobPlayback): Promise<void> {
  const entry = job.entries.get(job.currentChunkIndex)
  if (!entry) return
  entry.audio.playbackRate = job.playbackRate
  job.isPlaying = true
  try {
    await entry.audio.play()
  } catch {
    // Autoplay might still fail in some edge cases; we'll rely on subsequent user gestures.
  }
  emitState(job)
}

function attachListeners(job: JobPlayback, entry: AudioChunkEntry): void {
  entry.audio.addEventListener('loadedmetadata', () => {
    const dur = Number(entry.audio.duration)
    if (Number.isFinite(dur) && dur > 0) {
      entry.duration = dur
      post({ type: 'CHUNK_DURATION_KNOWN', payload: { jobId: job.jobId, chunkIndex: entry.chunkIndex, duration: dur } })
    }
  })

  entry.audio.addEventListener('timeupdate', () => {
    const now = Date.now()
    if (now - job.lastTimeUpdateMs < 250) return
    job.lastTimeUpdateMs = now

    const dur = Number(entry.audio.duration)
    post({
      type: 'AUDIO_TIME_UPDATE',
      payload: {
        jobId: job.jobId,
        chunkIndex: entry.chunkIndex,
        currentTime: Number(entry.audio.currentTime) || 0,
        duration: Number.isFinite(dur) ? dur : 0,
        isPlaying: job.isPlaying
      }
    })
  })

  entry.audio.addEventListener('ended', () => {
    if (job.currentChunkIndex !== entry.chunkIndex) return
    job.currentChunkIndex++
    prune(job)

    const next = job.entries.get(job.currentChunkIndex)
    if (next) {
      void playCurrent(job)
    } else if (job.currentChunkIndex >= job.totalChunks) {
      job.isPlaying = false
      post({ type: 'AUDIO_ENDED', payload: { jobId: job.jobId } })
      cleanupJob(job)
    } else {
      // Waiting for the next chunk to arrive.
      job.isPlaying = true
    }
  })
}

function seek(job: JobPlayback, globalTime: number): void {
  // Best-effort: seek within currently loaded window based on known durations.
  let t = globalTime
  const indices = [...job.entries.keys()].sort((a, b) => a - b)
  if (indices.length === 0) return

  // Find earliest loaded chunk to start accumulating.
  const startIdx = indices[0]!
  let targetChunk = startIdx
  for (const idx of indices) {
    const entry = job.entries.get(idx)!
    const dur = Number.isFinite(entry.duration) && entry.duration > 0 ? entry.duration : Number(entry.audio.duration) || 0
    if (idx === startIdx && idx !== 0) {
      // If we don't have chunk 0, we can't map absolute time precisely. Clamp to the earliest loaded chunk.
      break
    }
    if (t <= dur || dur === 0) {
      targetChunk = idx
      break
    }
    t -= dur
    targetChunk = idx + 1
  }

  const entry = job.entries.get(targetChunk)
  if (!entry) return

  job.currentChunkIndex = targetChunk
  prune(job)
  try {
    entry.audio.currentTime = Math.max(0, Math.min(t, (entry.audio.duration || t) - 0.05))
  } catch {
    // ignore
  }
  if (job.isPlaying) void playCurrent(job)
}

chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  if (!isExtensionMessage(raw)) return
  const msg = raw as ExtensionMessage

  switch (msg.type) {
    case 'AUDIO_LOAD_CHUNK': {
      const { jobId, chunkIndex, audioData, totalChunks } = msg.payload
      const job = getOrCreateJob(jobId)
      job.totalChunks = totalChunks

      if (job.entries.has(chunkIndex)) {
        sendResponse({ ok: true })
        return
      }

      const blob = new Blob([audioData])
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.playbackRate = job.playbackRate

      const entry: AudioChunkEntry = { chunkIndex, audio, url, duration: 0 }
      job.entries.set(chunkIndex, entry)
      attachListeners(job, entry)

      prune(job)

      // If we're waiting for this chunk, continue playback.
      if (job.isPlaying && chunkIndex === job.currentChunkIndex) void playCurrent(job)

      sendResponse({ ok: true })
      return
    }

    case 'AUDIO_PLAY': {
      const job = getOrCreateJob(msg.payload.jobId)
      job.isPlaying = true
      void playCurrent(job)
      emitState(job)
      sendResponse({ ok: true })
      return
    }

    case 'AUDIO_PAUSE': {
      const job = jobs.get(msg.payload.jobId)
      if (job) {
        job.isPlaying = false
        const entry = job.entries.get(job.currentChunkIndex)
        entry?.audio.pause()
        emitState(job)
      }
      sendResponse({ ok: true })
      return
    }

    case 'AUDIO_SEEK': {
      const job = jobs.get(msg.payload.jobId)
      if (job) {
        seek(job, msg.payload.globalTime)
        emitState(job)
      }
      sendResponse({ ok: true })
      return
    }

    case 'AUDIO_SET_PLAYBACK_RATE': {
      const job = getOrCreateJob(msg.payload.jobId)
      job.playbackRate = msg.payload.playbackRate
      for (const entry of job.entries.values()) entry.audio.playbackRate = job.playbackRate
      emitState(job)
      sendResponse({ ok: true })
      return
    }

    case 'AUDIO_STOP': {
      const job = jobs.get(msg.payload.jobId)
      if (job) cleanupJob(job)
      sendResponse({ ok: true })
      return
    }

    default: {
      return
    }
  }
})
