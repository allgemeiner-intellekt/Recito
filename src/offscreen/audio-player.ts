import { MSG } from '@shared/messages';
import { PROGRESS_REPORT_INTERVAL_MS } from '@shared/constants';

interface QueuedChunk {
  buffer: AudioBuffer;
  index: number;
  source: AudioBufferSourceNode | null;
  startAt: number;
}

export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private pauseOffset = 0;
  private isPlaying = false;
  private currentChunkIndex = -1;
  private playbackRate = 1;
  private volume = 1;
  private next: QueuedChunk | null = null;
  private playbackVersion = 0;
  private queueVersion = 0;

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async play(audioData: ArrayBuffer, chunkIndex: number, _format: string): Promise<void> {
    this.stop();
    const version = this.playbackVersion;
    const ctx = this.getContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (version !== this.playbackVersion) return;

    const buffer = await ctx.decodeAudioData(audioData.slice(0));
    if (version !== this.playbackVersion) return;
    this.currentBuffer = buffer;
    this.currentChunkIndex = chunkIndex;
    this.startPlayback();
  }

  /** Start the next chunk at the current chunk's audio-clock boundary. */
  async scheduleNext(audioData: ArrayBuffer, chunkIndex: number, format: string): Promise<void> {
    if (!this.currentBuffer) {
      await this.play(audioData, chunkIndex, format);
      return;
    }

    const version = ++this.queueVersion;
    this.stopSource(this.next?.source ?? null);
    this.next = null;
    const buffer = await this.getContext().decodeAudioData(audioData.slice(0));
    if (version !== this.queueVersion) return;

    // A paused chunk has no source; an ended chunk retains its source until
    // replacement. Late decoding should start only after natural completion.
    if (!this.isPlaying && this.sourceNode) {
      this.currentBuffer = buffer;
      this.currentChunkIndex = chunkIndex;
      this.pauseOffset = 0;
      this.startPlayback();
      return;
    }

    this.next = { buffer, index: chunkIndex, source: null, startAt: 0 };
    this.scheduleQueuedChunk();
  }

  private createSource(buffer: AudioBuffer): AudioBufferSourceNode {
    const source = this.ctx!.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;
    source.connect(this.gainNode!);
    source.onended = () => this.completeChunk(source);
    return source;
  }

  private startPlayback(): void {
    this.sourceNode = this.createSource(this.currentBuffer!);
    this.startTime = this.ctx!.currentTime;
    this.sourceNode.start(0, this.pauseOffset);
    this.isPlaying = true;
    this.scheduleQueuedChunk();
    this.startProgressReporting();
  }

  private scheduleQueuedChunk(): void {
    if (!this.next || !this.isPlaying) return;
    this.stopSource(this.next.source);
    const remaining = (this.currentBuffer!.duration - this.getCurrentTime()) / this.playbackRate;
    this.next.startAt = this.ctx!.currentTime + Math.max(0, remaining);
    this.next.source = this.createSource(this.next.buffer);
    this.next.source.start(this.next.startAt);
  }

  private completeChunk(source: AudioBufferSourceNode): void {
    if (source !== this.sourceNode || !this.isPlaying) return;
    const chunkIndex = this.currentChunkIndex;
    source.disconnect();
    if (this.next?.source) {
      this.sourceNode = this.next.source;
      this.currentBuffer = this.next.buffer;
      this.currentChunkIndex = this.next.index;
      this.startTime = this.next.startAt;
      this.pauseOffset = 0;
      this.next = null;
    } else {
      this.isPlaying = false;
      this.stopProgressReporting();
    }
    this.sendMessage({ type: MSG.CHUNK_COMPLETE, chunkIndex });
  }

  private stopSource(source: AudioBufferSourceNode | null): void {
    if (!source) return;
    source.onended = null;
    source.stop();
    source.disconnect();
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getCurrentTime();
    this.isPlaying = false;
    this.stopSource(this.sourceNode);
    this.sourceNode = null;
    this.stopSource(this.next?.source ?? null);
    if (this.next) this.next.source = null;
    this.stopProgressReporting();
  }

  resume(): void {
    if (!this.isPlaying && this.currentBuffer) this.startPlayback();
  }

  stop(): void {
    this.playbackVersion++;
    this.queueVersion++;
    this.isPlaying = false;
    this.stopProgressReporting();
    this.stopSource(this.sourceNode);
    this.stopSource(this.next?.source ?? null);
    this.sourceNode = null;
    this.currentBuffer = null;
    this.next = null;
    this.pauseOffset = 0;
    this.currentChunkIndex = -1;
  }

  setSpeed(rate: number): void {
    this.pauseOffset = this.getCurrentTime();
    if (this.ctx) this.startTime = this.ctx.currentTime;
    this.playbackRate = rate;
    if (this.sourceNode && this.isPlaying) {
      this.sourceNode.playbackRate.value = rate;
      this.scheduleQueuedChunk();
    }
  }

  setVolume(level: number): void {
    this.volume = Math.max(0, Math.min(1, level));
    if (this.gainNode) this.gainNode.gain.value = this.volume;
  }

  getCurrentTime(): number {
    if (!this.ctx || !this.isPlaying) return this.pauseOffset;
    return this.pauseOffset + (this.ctx.currentTime - this.startTime) * this.playbackRate;
  }

  getDuration(): number {
    return this.currentBuffer?.duration ?? 0;
  }

  private startProgressReporting(): void {
    this.stopProgressReporting();
    this.progressInterval = setInterval(() => {
      this.sendMessage({
        type: MSG.PLAYBACK_PROGRESS,
        currentTime: this.getCurrentTime(),
        duration: this.getDuration(),
        chunkIndex: this.currentChunkIndex,
      });
    }, PROGRESS_REPORT_INTERVAL_MS);
  }

  private stopProgressReporting(): void {
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private sendMessage(message: Record<string, unknown>): void {
    chrome.runtime.sendMessage(message).catch((err) => {
      if (!err?.message?.includes('Receiving end does not exist')) {
        console.debug('[audio-player] sendMessage error:', err);
      }
    });
  }
}
