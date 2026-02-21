import type { ChunkMetaLite } from '../state/player-store'

export interface TimingInput {
  chunkTime: number
  chunkDuration: number
  chunkMeta: ChunkMetaLite
}

export function estimateUnitIndex(input: TimingInput): number {
  const { chunkTime, chunkDuration, chunkMeta } = input
  if (chunkDuration <= 0 || chunkMeta.unitCount <= 0) return chunkMeta.startUnitIndex
  const ratio = Math.max(0, Math.min(1, chunkTime / chunkDuration))
  const within = Math.max(0, Math.min(chunkMeta.unitCount - 1, Math.floor(ratio * chunkMeta.unitCount)))
  return chunkMeta.startUnitIndex + within
}

