export type Direction = '多' | '空' | '空2x'

export interface Holding {
  id: string
  ticker: string
  name: string
  market: '美股' | 'A股' | '港股' | '加密' | '其他'
  direction: Direction
  weight: number // 占总资产 %
  thesis: string
  invalidation: string
  target?: string
  stop?: string
  demo?: boolean
}

export type EventType = '财报' | '宏观' | 'FDA' | '解禁' | '其他'

export interface CatalystEvent {
  id: string
  date: string // YYYY-MM-DD
  type: EventType
  title: string
  ticker?: string
  note?: string
  demo?: boolean
}

export type Sentiment = '利好' | '中性' | '风险'

export interface NewsItem {
  id: string
  ticker: string
  title: string
  summary?: string
  source: string
  sentiment: Sentiment
  ts: number // epoch ms
  demo?: boolean
}

export interface TwitterAccount {
  id: string
  handle: string // without @
  name: string
  focus: string
  note: string // 今日观点记录
}

export type IdeaSource = '新闻' | '推特' | '自研' | '其他'
export type IdeaStatus = 'aging' | 'upgraded' | 'dropped'

export interface Idea {
  id: string
  title: string
  source: IdeaSource
  note?: string
  createdAt: number
  status: IdeaStatus
}

export interface TradeCounter {
  used: number
  limit: number
  month: string // YYYY-MM，跨月自动重置
}
