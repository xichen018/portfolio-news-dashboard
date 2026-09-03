export const pad = (n: number) => String(n).padStart(2, '0')

export const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const addDays = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return fmtDate(d)
}

export const hoursAgo = (h: number) => Date.now() - h * 3600_000

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']
export const weekdayCN = (d: Date) => `周${WEEK_CN[d.getDay()]}`

export const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 与今天相差的天数：0=今天，负数=已过去 */
export const dayDiff = (dateStr: string) => {
  const today = parseDay(fmtDate(new Date()))
  return Math.round((parseDay(dateStr).getTime() - today.getTime()) / 86400_000)
}

export const countdownLabel = (dateStr: string) => {
  const diff = dayDiff(dateStr)
  if (diff === 0) return { label: '今天', tone: 'today' as const }
  if (diff === 1) return { label: '明天', tone: 'soon' as const }
  if (diff > 1) return { label: `D-${diff}`, tone: diff <= 7 ? ('soon' as const) : ('later' as const) }
  return { label: `已过 ${-diff} 天`, tone: 'past' as const }
}

export const timeAgo = (ts: number) => {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (mins < 60) return `${mins} 分钟前`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.floor(h / 24)} 天前`
}

export const ageHours = (ts: number) => Math.max(0, (Date.now() - ts) / 3600_000)

export const uid = () => Math.random().toString(36).slice(2, 10)

export const currentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
