import { useEffect, useState } from 'react'
import Header from '@/sections/Header'
import TickerBanner from '@/sections/TickerBanner'
import HoldingsPanel from '@/sections/HoldingsPanel'
import CatalystPanel from '@/sections/CatalystPanel'
import NewsPanel from '@/sections/NewsPanel'
import TwitterPanel from '@/sections/TwitterPanel'
import IdeasPanel from '@/sections/IdeasPanel'
import DisciplinePanel from '@/sections/DisciplinePanel'
import PortfolioRiskPanel from '@/sections/PortfolioRiskPanel'
import { LS_KEYS, useLocalStorage } from '@/hooks/useLocalStorage'
import { seedEvents, seedHoldings, seedIdeas, seedNews, seedTrades, seedTwitter, seedXDigest, X_HANDLES } from '@/data/seed'
import { countdownLabel, currentMonth, uid } from '@/lib/format'
import { useDailyReport } from '@/hooks/useDailyReport'
import { usePersistentHoldings } from '@/hooks/usePersistentHoldings'
import type { CatalystEvent, Idea, NewsItem, ReportChange, TradeCounter, TwitterAccount, XDigestItem } from '@/types'

export default function Home() {
  const [holdings, setHoldings, holdingsSync] = usePersistentHoldings(seedHoldings)
  const [events, setEvents] = useLocalStorage<CatalystEvent[]>(LS_KEYS.events, seedEvents)
  const [news, setNews] = useLocalStorage<NewsItem[]>(LS_KEYS.news, seedNews)
  const [twitter, setTwitter] = useLocalStorage<TwitterAccount[]>(LS_KEYS.twitter, seedTwitter)
  const [xDigest, setXDigest] = useLocalStorage<XDigestItem[]>(LS_KEYS.xDigest, seedXDigest)
  const [ideas, setIdeas] = useLocalStorage<Idea[]>(LS_KEYS.ideas, seedIdeas)
  const [trades, setTrades] = useLocalStorage<TradeCounter>(LS_KEYS.trades, seedTrades)
  const [decisionSnapshot, setDecisionSnapshot] = useLocalStorage<{runId:string;views:Record<string,string>}>(LS_KEYS.decisionSnapshot,()=>({runId:'',views:{}}))
  const [reportChanges,setReportChanges]=useState<ReportChange[]>([])
  const report = useDailyReport()

  // 跨月自动重置交易额度
  useEffect(() => {
    if (trades.month !== currentMonth()) {
      setTrades((prev) => ({ ...prev, used: 0, month: currentMonth() }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades.month])

  useEffect(() => {
    setTwitter((previous) => {
      const retiredDemoHandles = new Set(['elerianm', 'fundstrat', 'woonomic'])
      const retained = previous.filter((account) => !retiredDemoHandles.has(account.handle.toLowerCase()))
      const existing = new Set(retained.map((account) => account.handle.toLowerCase()))
      const missing = X_HANDLES.filter((handle) => !existing.has(handle.toLowerCase())).map((handle) => ({
        id: uid(), handle, name: handle, focus: '待分类', note: '',
      }))
      return retained.length !== previous.length || missing.length ? [...retained, ...missing] : previous
    })
    // Only merge the configured watchlist when this application version loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const hadLegacyDemo = holdings.some((item) => item.demo)
    setHoldings((previous) => previous.filter((item) => !item.demo))
    setIdeas((previous) => previous.filter((item) => !['美国靶向药突破 → 关注创新药板块', '铜库存持续下降，关注铜矿股'].includes(item.title)))
    setXDigest((previous) => previous.filter((item) => item.title !== '等待接入 X 数据源'))
    setEvents((previous) => [...previous.filter((item) => !item.demo && !item.id.startsWith('report-') && !item.id.startsWith('calendar-')), ...report.events])
    setNews((previous) => [...previous.filter((item) => !item.demo && !item.id.startsWith('report-news-')), ...report.news])
    if (hadLegacyDemo && trades.used === 1) setTrades((previous) => ({ ...previous, used: 0 }))
    // Report data is replaced as one verified snapshot whenever the fetch completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.runId])

  useEffect(()=>{
    if(!report.runId||report.runId===decisionSnapshot.runId)return
    const nextViews=Object.fromEntries(report.decisions.map((item)=>[item.ticker,item.view]))
    const changes=report.decisions.reduce<ReportChange[]>((result,item)=>{
      const prior=decisionSnapshot.views[item.ticker]
      if(!prior&&decisionSnapshot.runId)result.push({id:`${report.runId}-${item.ticker}`,ticker:item.ticker,kind:'新增判断',summary:item.view})
      else if(prior&&prior!==item.view)result.push({id:`${report.runId}-${item.ticker}`,ticker:item.ticker,kind:'判断变化',summary:item.view})
      return result
    },[])
    setReportChanges(changes)
    setDecisionSnapshot(()=>({runId:report.runId!,views:nextViews}))
    // Compare once for each newly published report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[report.runId])

  const nextEvent = [...events]
    .filter((e) => countdownLabel(e.date).tone !== 'past')
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  const marqueeItems = [
    ...holdings.map((h) => `${h.ticker} ${h.direction === '多' ? '多' : h.direction === '空' ? '空' : '空2x'} · ${h.weight}%`),
    ...news.slice(0, 4).map((n) => `${n.ticker} · ${n.title}`),
    ...(nextEvent ? [`下一催化剂 · ${nextEvent.title} · ${countdownLabel(nextEvent.date).label}`] : []),
  ]

  return (
    <div className="scanlines min-h-screen bg-[var(--bg0)]">
      <Header tradesUsed={trades.used} tradesLimit={trades.limit} dataStatus={report.status} updatedAt={report.updatedAt} />

      <div className="pt-12">
        <TickerBanner items={marqueeItems.length > 0 ? marqueeItems : ['暂无数据']} />

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-2 p-2 lg:h-[calc(100vh-80px)]">
          {/* 左栏：持仓 */}
          <div className="lg:col-span-3 min-h-[420px] lg:min-h-0 flex flex-col gap-2">
            <div className="flex-none"><PortfolioRiskPanel holdings={holdings} changes={reportChanges} portfolioImplications={report.decisions.map((item)=>item.portfolioImplication||'')} /></div>
            <div className="flex-1 min-h-[300px] flex"><HoldingsPanel holdings={holdings} decisions={report.decisions} setHoldings={setHoldings} /></div>
          </div>

          {/* 中栏：日历 + 新闻 */}
          <div className="lg:col-span-6 flex flex-col gap-2 min-h-0">
            <div className="flex-none max-h-[46%] min-h-[260px] flex">
              <CatalystPanel events={events} setEvents={setEvents} />
            </div>
            <div className="flex-1 min-h-[320px] flex">
              <NewsPanel news={news} setNews={setNews} />
            </div>
          </div>

          {/* 右栏：X 关注 + 陈化池 + 纪律 */}
          <div className="lg:col-span-3 flex flex-col gap-2 min-h-0">
            <div className="flex-1 min-h-[260px] flex">
              <TwitterPanel accounts={twitter} digest={xDigest} setDigest={setXDigest} />
            </div>
            <div className="flex-none max-h-[34%] min-h-[200px] flex">
              <IdeasPanel ideas={ideas} setIdeas={setIdeas} />
            </div>
            <div className="flex-none flex">
              <DisciplinePanel trades={trades} setTrades={setTrades} />
            </div>
          </div>
        </main>

        <footer className="border-t border-[var(--line)] px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span className="font-mono2 text-[9.5px] t4">
            持仓：{holdingsSync==='synced'?'AWS 已同步':holdingsSync==='loading'?'正在同步':'本地保存，云端暂不可用'}
          </span>
          <span className="font-mono2 text-[9.5px] t4">日报数据：{report.status === 'ready' ? `已核验 · ${report.updatedAt}` : report.status === 'loading' ? '读取中' : '待补数据'}</span>
          <span className="flex-1" />
          <span className="font-mono2 text-[9.5px] t4">仅供个人研究记录，不构成投资建议</span>
        </footer>
      </div>
    </div>
  )
}
