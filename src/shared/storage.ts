import { DEFAULT_SETTINGS } from './constants'
import type { TTSSettings } from './types'
import { storageLocalGet, storageLocalSet } from './chrome-async'

const SETTINGS_KEY = 'ir_settings'

export async function getSettings(): Promise<TTSSettings> {
  const result = await storageLocalGet<Record<string, unknown>>(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] as Partial<TTSSettings> | undefined) }
}

export async function setSettings(partial: Partial<TTSSettings>): Promise<TTSSettings> {
  const current = await getSettings()
  const next = { ...current, ...partial }
  await storageLocalSet({ [SETTINGS_KEY]: next })
  return next
}

export async function resetSettings(): Promise<TTSSettings> {
  await storageLocalSet({ [SETTINGS_KEY]: DEFAULT_SETTINGS })
  return DEFAULT_SETTINGS
}
