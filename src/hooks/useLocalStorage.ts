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
  xChat: 'cockpit.x-chat.v1',
  ideas: 'cockpit.ideas.v1',
  trades: 'cockpit.trades.v1',
  decisionSnapshot: 'cockpit.decision-snapshot.v1',
}

const SYNCED_KEYS = [LS_KEYS.events,LS_KEYS.news,LS_KEYS.twitter,LS_KEYS.xDigest,LS_KEYS.xChat,LS_KEYS.ideas,LS_KEYS.trades]

export const resetAll = async () => {
  const responses=await Promise.all([
    fetch(`${import.meta.env.BASE_URL}api/holdings`,{method:'DELETE'}),
    ...SYNCED_KEYS.map((key)=>fetch(`${import.meta.env.BASE_URL}api/state/${encodeURIComponent(key)}`,{method:'DELETE'})),
  ])
  if(responses.some((response)=>!response.ok))throw new Error('云端数据清理失败')
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
  const uploads=[]
  for(const key of Object.values(LS_KEYS)){
    if(!(key in parsed.data))continue
    const value=parsed.data[key]
    window.localStorage.setItem(key,JSON.stringify(value))
    if(key===LS_KEYS.holdings)uploads.push(fetch(`${import.meta.env.BASE_URL}api/holdings`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({holdings:value})}))
    else if(SYNCED_KEYS.includes(key))uploads.push(fetch(`${import.meta.env.BASE_URL}api/state/${encodeURIComponent(key)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value})}))
  }
  const responses=await Promise.all(uploads)
  if(responses.some((response)=>!response.ok))throw new Error('备份未能完整同步到云端')
  window.location.reload()
}
