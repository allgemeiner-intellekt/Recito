export interface JobState {
  tabId: number
  jobId: string
  createdAt: number
  canceled: boolean

  playingChunkIndex: number
  chunkDurations: Map<number, number>
  playbackRate: number

  abortControllers: Set<AbortController>

  // Used for simple backpressure waits.
  notifyProgress: (() => void) | null
}

export class JobManager {
  private jobsByTab = new Map<number, JobState>()
  private tabByJobId = new Map<string, number>()

  getJobByTab(tabId: number): JobState | undefined {
    return this.jobsByTab.get(tabId)
  }

  getTabId(jobId: string): number | undefined {
    return this.tabByJobId.get(jobId)
  }

  startJob(tabId: number, jobId: string, playbackRate: number): JobState {
    const existing = this.jobsByTab.get(tabId)
    if (existing) this.cancelJob(existing.jobId)

    const state: JobState = {
      tabId,
      jobId,
      createdAt: Date.now(),
      canceled: false,
      playingChunkIndex: 0,
      chunkDurations: new Map(),
      playbackRate,
      abortControllers: new Set(),
      notifyProgress: null
    }

    this.jobsByTab.set(tabId, state)
    this.tabByJobId.set(jobId, tabId)
    return state
  }

  isCanceled(jobId: string): boolean {
    const tabId = this.tabByJobId.get(jobId)
    if (tabId == null) return true
    const state = this.jobsByTab.get(tabId)
    return !state || state.canceled
  }

  trackAbort(jobId: string, ac: AbortController): void {
    const tabId = this.tabByJobId.get(jobId)
    if (tabId == null) return
    const state = this.jobsByTab.get(tabId)
    if (!state) return
    state.abortControllers.add(ac)
  }

  untrackAbort(jobId: string, ac: AbortController): void {
    const tabId = this.tabByJobId.get(jobId)
    if (tabId == null) return
    const state = this.jobsByTab.get(tabId)
    if (!state) return
    state.abortControllers.delete(ac)
  }

  cancelJob(jobId: string): void {
    const tabId = this.tabByJobId.get(jobId)
    if (tabId == null) return
    const state = this.jobsByTab.get(tabId)
    if (!state) return

    state.canceled = true
    for (const ac of state.abortControllers) ac.abort()
    state.abortControllers.clear()

    state.notifyProgress?.()
    state.notifyProgress = null

    this.jobsByTab.delete(tabId)
    this.tabByJobId.delete(jobId)
  }

  updateProgress(jobId: string, playingChunkIndex: number, chunkIndex: number, duration: number): void {
    const tabId = this.tabByJobId.get(jobId)
    if (tabId == null) return
    const state = this.jobsByTab.get(tabId)
    if (!state) return

    state.playingChunkIndex = playingChunkIndex
    if (Number.isFinite(duration) && duration > 0) state.chunkDurations.set(chunkIndex, duration)
    state.notifyProgress?.()
  }

  setChunkDuration(jobId: string, chunkIndex: number, duration: number): void {
    const tabId = this.tabByJobId.get(jobId)
    if (tabId == null) return
    const state = this.jobsByTab.get(tabId)
    if (!state) return
    if (Number.isFinite(duration) && duration > 0) state.chunkDurations.set(chunkIndex, duration)
    state.notifyProgress?.()
  }

  setPlaybackRate(jobId: string, playbackRate: number): void {
    const tabId = this.tabByJobId.get(jobId)
    if (tabId == null) return
    const state = this.jobsByTab.get(tabId)
    if (!state) return
    state.playbackRate = playbackRate
  }

  async waitForProgress(jobId: string, timeoutMs = 1500): Promise<void> {
    const tabId = this.tabByJobId.get(jobId)
    if (tabId == null) return
    const state = this.jobsByTab.get(tabId)
    if (!state) return

    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        if (state.notifyProgress === onProgress) state.notifyProgress = null
        resolve()
      }

      const onProgress = () => finish()
      state.notifyProgress = onProgress
      setTimeout(finish, timeoutMs)
    })
  }
}
