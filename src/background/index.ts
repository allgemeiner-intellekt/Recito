import type { ExtensionMessage } from '../shared/messages'
import { isExtensionMessage } from '../shared/messages'
import { runtimeSendMessage, tabsSendMessage } from '../shared/chrome-async'
import { getSettings } from '../shared/storage'
import type { LangMode } from '../shared/types'
import { ensureOffscreen } from './offscreen-manager'
import { JobManager } from './job-manager'
import { generateChunkAudio, makeChunks, waitForBackpressure } from './tts-service'

const jobManager = new JobManager()

function safeSendToTab(tabId: number, msg: ExtensionMessage): void {
  chrome.tabs.sendMessage(tabId, msg, () => void chrome.runtime.lastError)
}

async function sendToOffscreen(msg: ExtensionMessage): Promise<void> {
  await ensureOffscreen()
  await runtimeSendMessage(msg)
}

function calcGlobalTime(durations: Map<number, number>, chunkIndex: number, currentTime: number): number {
  let t = 0
  for (let i = 0; i < chunkIndex; i++) t += durations.get(i) ?? 0
  t += currentTime
  return t
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  if (!isExtensionMessage(raw)) return
  const msg = raw as ExtensionMessage

  const fromTabId = sender.tab?.id

  ;(async () => {
    switch (msg.type) {
      case 'GET_PAGE_INFO': {
        const tabId = msg.payload.tabId
        try {
          const resp = (await tabsSendMessage(tabId, msg)) as ExtensionMessage
          sendResponse(resp)
        } catch {
          sendResponse({ type: 'PAGE_INFO_RESPONSE', payload: { wordCount: 0, unitCount: 0, langMode: 'space' } })
        }
        return
      }

      case 'START_PAGE_READING': {
        safeSendToTab(msg.payload.tabId, msg)
        sendResponse({ ok: true })
        return
      }

      case 'TTS_REQUEST': {
        const tabId = msg.payload.tabId ?? fromTabId
        if (tabId == null) {
          sendResponse({ ok: false, error: 'Missing tabId' })
          return
        }

        const { jobId, text, langMode, initialPlaybackRate } = msg.payload
        const baseSettings = await getSettings()
        const settings = {
          ...baseSettings,
          selectedVoice: msg.payload.voice || baseSettings.selectedVoice,
          ttsModel: msg.payload.model || baseSettings.ttsModel,
          responseFormat: msg.payload.responseFormat || baseSettings.responseFormat
        }

        if (!settings.apiEndpoint || !settings.apiKey) {
          safeSendToTab(tabId, { type: 'TTS_ERROR', payload: { jobId, error: 'Please configure API endpoint and API key in Options.' } })
          sendResponse({ ok: false })
          return
        }

        jobManager.startJob(tabId, jobId, initialPlaybackRate)

        safeSendToTab(tabId, { type: 'TTS_STARTED', payload: { jobId } })

        const chunks = makeChunks(text, langMode as LangMode, undefined)
        const totalChunks = chunks.length

        // Kick the offscreen playback session.
        await sendToOffscreen({ type: 'AUDIO_SET_PLAYBACK_RATE', payload: { jobId, playbackRate: initialPlaybackRate } })

        ;(async () => {
          try {
            for (const chunk of chunks) {
              if (jobManager.isCanceled(jobId)) return

              await waitForBackpressure(jobManager, jobId, chunk.index)

              const ac = new AbortController()
              jobManager.trackAbort(jobId, ac)
              let audio: ArrayBuffer
              try {
                audio = await generateChunkAudio(text.slice(chunk.startCharOffset, chunk.endCharOffset), settings, ac.signal)
              } finally {
                jobManager.untrackAbort(jobId, ac)
              }

              if (jobManager.isCanceled(jobId)) return

          await sendToOffscreen({
                type: 'AUDIO_LOAD_CHUNK',
                payload: { jobId, chunkIndex: chunk.index, audioData: audio, totalChunks }
              })

              safeSendToTab(tabId, {
                type: 'TTS_CHUNK_READY',
                payload: { jobId, chunkIndex: chunk.index, totalChunks, chunkMeta: chunk }
              })

              // Autoplay as soon as the first chunk arrives.
              if (chunk.index === 0) await sendToOffscreen({ type: 'AUDIO_PLAY', payload: { jobId } })
            }

            if (jobManager.isCanceled(jobId)) return
            safeSendToTab(tabId, { type: 'TTS_COMPLETE', payload: { jobId, totalChunks: chunks.length } })
          } catch (err) {
            if (jobManager.isCanceled(jobId)) return
            safeSendToTab(tabId, {
              type: 'TTS_ERROR',
              payload: { jobId, error: err instanceof Error ? err.message : String(err) }
            })
          }
        })()

        sendResponse({ ok: true })
        return
      }

      case 'TTS_CANCEL': {
        const { jobId } = msg.payload
        jobManager.cancelJob(jobId)
        await sendToOffscreen({ type: 'AUDIO_STOP', payload: { jobId } })
        sendResponse({ ok: true })
        return
      }

      case 'PLAYBACK_CONTROL': {
        const { jobId, action, value } = msg.payload
        if (action === 'play') await sendToOffscreen({ type: 'AUDIO_PLAY', payload: { jobId } })
        if (action === 'pause') await sendToOffscreen({ type: 'AUDIO_PAUSE', payload: { jobId } })
        if (action === 'stop') await sendToOffscreen({ type: 'AUDIO_STOP', payload: { jobId } })
        if (action === 'seek') await sendToOffscreen({ type: 'AUDIO_SEEK', payload: { jobId, globalTime: value ?? 0 } })
        if (action === 'setPlaybackRate') {
          const rate = value ?? 1
          jobManager.setPlaybackRate(jobId, rate)
          await sendToOffscreen({ type: 'AUDIO_SET_PLAYBACK_RATE', payload: { jobId, playbackRate: rate } })
        }
        sendResponse({ ok: true })
        return
      }

      case 'AUDIO_TIME_UPDATE': {
        const { jobId, chunkIndex, currentTime, duration, isPlaying } = msg.payload
        const tabId = jobManager.getTabId(jobId)
        if (tabId == null) return

        jobManager.updateProgress(jobId, chunkIndex, chunkIndex, duration)
        const job = jobManager.getJobByTab(tabId)
        if (!job) return

        const globalTime = calcGlobalTime(job.chunkDurations, chunkIndex, currentTime)
        safeSendToTab(tabId, {
          type: 'PLAYBACK_STATE_UPDATE',
          payload: {
            jobId,
            globalTime,
            chunkIndex,
            isPlaying,
            duration,
            playbackRate: job.playbackRate
          }
        })
        return
      }

      case 'CHUNK_DURATION_KNOWN': {
        const { jobId, chunkIndex, duration } = msg.payload
        jobManager.setChunkDuration(jobId, chunkIndex, duration)
        return
      }

      case 'AUDIO_ENDED': {
        const { jobId } = msg.payload
        const tabId = jobManager.getTabId(jobId)
        if (tabId != null) {
          safeSendToTab(tabId, {
            type: 'PLAYBACK_STATE_UPDATE',
            payload: { jobId, globalTime: 0, chunkIndex: 0, isPlaying: false, duration: 0, playbackRate: 1 }
          })
        }
        jobManager.cancelJob(jobId)
        return
      }

      default: {
        return
      }
    }
  })().catch((err) => {
    sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) })
  })

  return true
})
