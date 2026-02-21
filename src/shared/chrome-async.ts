export function runtimeSendMessage<T = unknown>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (resp) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(resp as T)
    })
  })
}

export function tabsSendMessage<T = unknown>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(resp as T)
    })
  })
}

export function tabsQuery(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(tabs)
    })
  })
}

export function storageLocalGet<T = unknown>(keys?: string | string[] | { [key: string]: any } | null): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys as any, (items) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve(items as T)
    })
  })
}

export function storageLocalSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else resolve()
    })
  })
}

