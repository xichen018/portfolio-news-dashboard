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
export type CatalystCategory = '宏观信息' | '资金流向与资金成本' | '市场估值与潜在风险'

export interface CatalystEvent {
  id: string
  date: string // YYYY-MM-DD
  type: EventType
  category?: CatalystCategory
  title: string
  ticker?: string
  note?: string
  sourceUrl?: string
  filterReason?: string
  aiAdvice?: string
  evidenceGap?: string
  demo?: boolean
}

export type Sentiment = '利好' | '中性' | '风险'
export type NewsKind = '重大新闻' | '重大事项' | 'SEC披露'

export interface NewsItem {
  id: string
  ticker: string
  title: string
  summary?: string
  source: string
  sentiment: Sentiment
  kind?: NewsKind
  url?: string
  filterReason?: string
  aiAdvice?: string
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

export type XDigestCategory = '市场观点' | 'meme' | '风险汇总' | '估值逻辑'

export interface XDigestItem {
  id: string
  category: XDigestCategory
  title: string
  summary: string
  handles: string[]
  ts: number
  sourceUrl?: string
}

export type IdeaSource = '新闻' | '推特' | '自研' | '其他'
export type IdeaStatus = 'aging' | 'upgraded' | 'dropped'

export interface Idea {
  id: string
  title: string
  source: IdeaSource
  note?: string
  rawContent?: string
  aiConversation?: string
  createdAt: number
  status: IdeaStatus
}

export interface TradeCounter {
  used: number
  limit: number
  month: string // YYYY-MM，跨月自动重置
}

export interface PMDecision {
  id: string
  taskId: string
  ticker: string
  view: string
  evidence: string[]
  pricing?: string
  variant?: string
  catalysts?: string
  actions?: string
  portfolioImplication?: string
  sourceUrls: string[]
}

export interface ReportChange {
  id: string
  ticker: string
  kind: '新增判断' | '判断变化'
  summary: string
}
