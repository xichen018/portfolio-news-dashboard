import { AlertTriangle, Activity } from 'lucide-react'
import type { Holding, ReportChange } from '@/types'
import Panel from './Panel'

interface Props { holdings:Holding[]; changes:ReportChange[]; portfolioImplications:string[] }

export default function PortfolioRiskPanel({holdings,changes,portfolioImplications}:Props){
  const gross=holdings.reduce((sum,item)=>sum+item.weight*(item.direction==='空2x'?2:1),0)
  const net=holdings.reduce((sum,item)=>sum+item.weight*(item.direction==='多'?1:item.direction==='空2x'?-2:-1),0)
  const largest=[...holdings].sort((a,b)=>b.weight-a.weight)[0]
  const top3=[...holdings].sort((a,b)=>b.weight-a.weight).slice(0,3).reduce((sum,item)=>sum+item.weight,0)
  const markets=Object.entries(holdings.reduce<Record<string,number>>((acc,item)=>({...acc,[item.market]:(acc[item.market]||0)+item.weight}),{})).sort((a,b)=>b[1]-a[1])
  const implication=[...new Set(portfolioImplications.filter(Boolean))][0]
  return <Panel label="组合风险中枢" actions={<Activity size={13} className="text-[var(--cyan)]"/>}>
    <div className="grid grid-cols-3 gap-1.5">
      {[['净敞口',`${net.toFixed(1)}%`],['杠杆敞口',`${gross.toFixed(1)}%`],['前三集中',`${top3.toFixed(1)}%`]].map(([label,value])=><div key={label} className="border border-[var(--line)] bg-[var(--bg2)] rounded-sm p-2"><div className="font-mono2 text-[9px] t4">{label}</div><div className="font-mono2 text-[14px] mt-0.5">{value}</div></div>)}
    </div>
    <div className="mt-2 flex flex-wrap gap-1">{markets.map(([market,weight])=><span key={market} className="tag t3">{market} {weight.toFixed(1)}%</span>)}</div>
    {largest&&largest.weight>15&&<div className="mt-2 flex gap-1.5 text-[10.5px] text-[var(--amber)]"><AlertTriangle size={12} className="mt-0.5 flex-none"/>{largest.ticker} 单一仓位 {largest.weight.toFixed(1)}%，需核对集中度上限。</div>}
    <div className="mt-2 border-t border-[var(--line-soft)] pt-2 text-[10.5px] t2 leading-relaxed">{implication||'待补数据：日报尚未形成可靠的组合级含义。'}</div>
    <div className="mt-2 font-mono2 text-[9px] t4">相较上一期 · {changes.length}</div>
    {changes.length===0?<div className="mt-1 text-[10.5px] t4">暂无可核验的判断变化</div>:changes.slice(0,3).map(item=><div key={item.id} className="mt-1 text-[10.5px] t2"><span className="text-[var(--cyan)]">{item.ticker} · {item.kind}</span>：{item.summary}</div>)}
  </Panel>
}
