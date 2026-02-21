import { MAX_BUFFER_AHEAD_CHUNKS, MAX_CHUNK_CHARS, MAX_JOB_CHARS } from '../shared/constants'
import type { LangMode, TTSSettings } from '../shared/types'
import { countUnits } from '../shared/segmentation'
import type { JobManager } from './job-manager'

export interface TTSChunk {
  index: number
  startCharOffset: number
  endCharOffset: number
  charCount: number
  unitCount: number
  startUnitIndex: number
  endUnitIndex: number
}

export function makeChunks(fullText: string, langMode: LangMode, locale?: string): TTSChunk[] {
  const text = fullText.slice(0, MAX_JOB_CHARS)
  const chunks: TTSChunk[] = []
  let cursor = 0
  let startUnitIndex = 0
  let index = 0

  while (cursor < text.length) {
    const hardEnd = Math.min(cursor + MAX_CHUNK_CHARS, text.length)
    let end = hardEnd

    if (hardEnd < text.length) {
      const window = text.slice(cursor, hardEnd)

      // Prefer sentence boundary within the window.
      let best = -1
      for (let i = window.length - 1; i >= 0; i--) {
        const ch = window[i]!
        if (/[.!?。！？]/.test(ch)) {
          best = i + 1
          break
        }
      }
      if (best > 0 && best >= Math.min(200, window.length)) end = cursor + best
      else {
        const lastSpace = window.lastIndexOf(' ')
        if (lastSpace > 0 && lastSpace >= Math.min(200, window.length)) end = cursor + lastSpace + 1
      }
    }

    const chunkText = text.slice(cursor, end)
    const unitCount = countUnits(chunkText, langMode, locale)

    chunks.push({
      index,
      startCharOffset: cursor,
      endCharOffset: end,
      charCount: end - cursor,
      unitCount,
      startUnitIndex,
      endUnitIndex: startUnitIndex + unitCount
    })

    startUnitIndex += unitCount
    cursor = end
    index++
  }

  return chunks
}

export async function generateChunkAudio(chunkText: string, settings: TTSSettings, signal: AbortSignal): Promise<ArrayBuffer> {
  const endpoint = settings.apiEndpoint.replace(/\/+$/, '')
  const url = `${endpoint}/audio/speech`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.ttsModel,
      input: chunkText,
      voice: settings.selectedVoice,
      speed: 1.0,
      response_format: settings.responseFormat ?? 'mp3'
    }),
    signal
  })

  if (!response.ok) {
    let errBody = ''
    try {
      errBody = await response.text()
    } catch {
      // ignore
    }
    throw new Error(`TTS API error: ${response.status} ${response.statusText}${errBody ? ` - ${errBody}` : ''}`)
  }

  return response.arrayBuffer()
}

export async function waitForBackpressure(jobManager: JobManager, jobId: string, chunkIndex: number): Promise<void> {
  while (!jobManager.isCanceled(jobId)) {
    const tabId = jobManager.getTabId(jobId)
    if (tabId == null) return
    const job = jobManager.getJobByTab(tabId)
    if (!job) return

    const playing = job.playingChunkIndex
    const ahead = chunkIndex - playing
    if (ahead <= MAX_BUFFER_AHEAD_CHUNKS) return
    await jobManager.waitForProgress(jobId, 1200)
  }
}

