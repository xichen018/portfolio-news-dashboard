import { useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw != null) return JSON.parse(raw) as T
    } catch {
      /* ignore */
    }
    return initial()
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  }, [key, value])

  return [value, setValue] as const
}

export const LS_KEYS = {
  holdings: 'cockpit.holdings.v1',
  events: 'cockpit.events.v1',
  news: 'cockpit.news.v1',
  twitter: 'cockpit.twitter.v1',
  xDigest: 'cockpit.x-digest.v1',
  ideas: 'cockpit.ideas.v1',
  trades: 'cockpit.trades.v1',
  decisionSnapshot: 'cockpit.decision-snapshot.v1',
}

export const resetAll = () => {
  Object.values(LS_KEYS).forEach((k) => window.localStorage.removeItem(k))
  window.location.reload()
}

export type CockpitBackup = Record<(typeof LS_KEYS)[keyof typeof LS_KEYS], unknown>

export const exportAll = () => {
  const data = Object.fromEntries(
    Object.values(LS_KEYS).map((key) => [key, JSON.parse(window.localStorage.getItem(key) ?? 'null')]),
  )
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], {
    type: 'application/json',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `portfolio-cockpit-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

export const importAll = async (file: File) => {
  const parsed = JSON.parse(await file.text()) as { version?: number; data?: CockpitBackup }
  if (parsed.version !== 1 || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('不支持的备份文件')
  }
  Object.values(LS_KEYS).forEach((key) => {
    if (key in parsed.data!) window.localStorage.setItem(key, JSON.stringify(parsed.data![key]))
  })
  window.location.reload()
}
