import type { CatalystEvent, Holding, Idea, NewsItem, TradeCounter, TwitterAccount } from '@/types'
import { addDays, currentMonth, hoursAgo, uid } from '@/lib/format'

/**
 * 示例数据：日期与时间均相对“今天”生成，保证倒计时和时间线始终是活的。
 * 用户在页面内的增删改会存入浏览器 localStorage，覆盖这里的默认值。
 */
export const seedHoldings = (): Holding[] => [
  {
    id: uid(),
    ticker: 'NVDA',
    name: '英伟达',
    market: '美股',
    direction: '多',
    weight: 18,
    thesis: '示例：数据中心资本开支周期未结束，下一代平台放量在即，估值相对增速仍合理。',
    invalidation: '云厂商资本开支指引下修，或毛利率连续两个季度下滑。',
    target: '分批止盈，前高上方 15%',
    stop: '跌破 50 日线且 thesis 受损',
    demo: true,
  },
  {
    id: uid(),
    ticker: 'LLY',
    name: '礼来',
    market: '美股',
    direction: '多',
    weight: 12,
    thesis: '示例：GLP-1 适应症扩展 + 口服管线数据读出，产能瓶颈缓解。',
    invalidation: '口服药关键数据不及预期，或竞品疗效显著超越。',
    demo: true,
  },
  {
    id: uid(),
    ticker: 'TSLQ',
    name: '特斯拉 2 倍做空 ETF',
    market: '美股',
    direction: '空2x',
    weight: 5,
    thesis: '示例：估值与基本面脱节，做空作为卫星仓方向性赌注。',
    invalidation: 'TSLA 放量突破前高，或新叙事（robotaxi 落地）被证实。',
    stop: '杠杆 ETF 有衰减：持有期 ≤ 20 个交易日，到期强制离场',
    demo: true,
  },
  {
    id: uid(),
    ticker: 'BTC',
    name: '比特币',
    market: '加密',
    direction: '多',
    weight: 4,
    thesis: '示例：减半后供给收缩 +  ETF 持续净流入，作为组合的非主权资产敞口。',
    invalidation: 'ETF 转为连续大额净流出，或出现系统性监管冲击。',
    demo: true,
  },
  {
    id: uid(),
    ticker: 'ETH',
    name: '以太坊',
    market: '加密',
    direction: '多',
    weight: 2,
    thesis: '示例：质押收益 + L2 生态活跃，小仓位观察仓。',
    invalidation: '链上活跃度持续萎缩，相对 BTC 汇率跌破关键支撑。',
    demo: true,
  },
]

export const seedEvents = (): CatalystEvent[] => [
  {
    id: uid(),
    date: addDays(1),
    type: '财报',
    title: 'NVDA 季度财报（盘后）',
    ticker: 'NVDA',
    note: '重点看数据中心收入增速与下季指引；财报前检查仓位与对冲。',
    demo: true,
  },
  {
    id: uid(),
    date: addDays(3),
    type: '宏观',
    title: '美国 CPI 数据',
    note: '影响联储降息路径，成长股与加密对利率敏感。',
    demo: true,
  },
  {
    id: uid(),
    date: addDays(6),
    type: '宏观',
    title: 'FOMC 会议纪要',
    note: '关注缩表节奏与内部投票分歧。',
    demo: true,
  },
  {
    id: uid(),
    date: addDays(9),
    type: 'FDA',
    title: 'LLY 口服 GLP-1 关键数据读出',
    ticker: 'LLY',
    note: '二元事件：数据前考虑是否降低敞口。',
    demo: true,
  },
  {
    id: uid(),
    date: addDays(14),
    type: '解禁',
    title: '某持仓标的锁定期解禁',
    note: '示例：解禁前后通常波动放大，提前设定应对。',
    demo: true,
  },
  {
    id: uid(),
    date: addDays(21),
    type: '宏观',
    title: '美国季度 GDP 修正值',
    demo: true,
  },
]

export const seedNews = (): NewsItem[] => [
  {
    id: uid(),
    ticker: 'NVDA',
    title: '财报临近，期权隐含波动率升至年内高位',
    summary: '财报前 IV 抬升意味着市场在定价大幅波动；如持有正股，可提前决定是否在财报前减仓。',
    source: '示例来源',
    sentiment: '中性',
    ts: hoursAgo(2),
    demo: true,
  },
  {
    id: uid(),
    ticker: 'LLY',
    title: '口服减肥药赛道竞争加剧，多家药企公布临床进展',
    summary: '竞品数据陆续读出，板块波动加大；关注自家管线的相对疗效与安全性。',
    source: '示例来源',
    sentiment: '风险',
    ts: hoursAgo(5),
    demo: true,
  },
  {
    id: uid(),
    ticker: 'TSLA',
    title: '特斯拉交付数据前瞻：分析师分歧扩大',
    summary: '多空双方围绕交付量与毛利率展开博弈；做空仓位注意控制持有期。',
    source: '示例来源',
    sentiment: '中性',
    ts: hoursAgo(20),
    demo: true,
  },
  {
    id: uid(),
    ticker: 'BTC',
    title: '现货 ETF 连续第五日净流入',
    summary: '资金面仍是当前最主要的边际驱动；留意宏观数据日的联动回撤。',
    source: '示例来源',
    sentiment: '利好',
    ts: hoursAgo(26),
    demo: true,
  },
]

export const seedTwitter = (): TwitterAccount[] => [
  { id: uid(), handle: 'elerianm', name: 'Mohamed El-Erian', focus: '宏观 / 联储', note: '' },
  { id: uid(), handle: 'LizAnnSonders', name: 'Liz Ann Sonders', focus: '美股策略', note: '' },
  { id: uid(), handle: 'fundstrat', name: 'Tom Lee', focus: '美股 / 加密', note: '' },
  { id: uid(), handle: 'woonomic', name: 'Willy Woo', focus: '加密链上数据', note: '' },
]

export const seedIdeas = (): Idea[] => [
  {
    id: uid(),
    title: '美国靶向药突破 → 关注创新药板块',
    source: '新闻',
    note: '单一公司事件是否预示平台级机会？先查同靶点管线公司，陈化后再决定。',
    createdAt: hoursAgo(30),
    status: 'aging',
  },
  {
    id: uid(),
    title: '铜库存持续下降，关注铜矿股',
    source: '自研',
    note: '已过 72h 陈化期，可进入研究池做正式评估。',
    createdAt: hoursAgo(80),
    status: 'aging',
  },
]

export const seedTrades = (): TradeCounter => ({ used: 1, limit: 4, month: currentMonth() })
