import { useState } from 'react'
import { ClipboardCheck, X } from 'lucide-react'
import type { TradeCounter } from '@/types'
import Panel from './Panel'

const RULES = [
  '每月交易 ≤ 4 次，先问「这值得用掉一次额度吗」',
  '新闻驱动的想法，一律先进 72h 陈化池',
  '卖出三触发：thesis 失效 / 到目标价 / 时间止损',
  '卫星仓合计 ≤ 总资产 15%，单标的 ≤ 3%',
  '杠杆 ETF 设硬性持有期，到期无条件离场',
]

interface Props {
  trades: TradeCounter
  setTrades: (fn: (prev: TradeCounter) => TradeCounter) => void
}

export default function DisciplinePanel({ trades, setTrades }: Props) {
  const [showCheck,setShowCheck]=useState(false)
  const [checks,setChecks]=useState<boolean[]>(()=>RULES.map(()=>false))
  const pct = Math.min(100, (trades.used / trades.limit) * 100)
  const exhausted = trades.used >= trades.limit

  const bump = (d: number) =>
    setTrades((prev) => ({ ...prev, used: Math.max(0, Math.min(prev.limit, prev.used + d)) }))

  return (
    <Panel label="交易纪律" actions={<button className="icon-btn" title="交易前检查" onClick={()=>setShowCheck(!showCheck)}>{showCheck?<X size={13}/>:<ClipboardCheck size={13}/>}</button>}>
      {showCheck&&<div className="mb-2 border border-[var(--line)] bg-[var(--bg2)] rounded-sm p-2">
        <div className="font-mono2 text-[9px] text-[var(--cyan)] mb-1.5">交易前硬检查 · {checks.filter(Boolean).length}/{RULES.length}</div>
        {RULES.map((rule,index)=><label key={rule} className="flex gap-2 py-1 text-[10.5px] t2 cursor-pointer"><input type="checkbox" checked={checks[index]} onChange={(event)=>setChecks((previous)=>previous.map((value,i)=>i===index?event.target.checked:value))}/><span>{rule}</span></label>)}
        <div className={`mt-1.5 border-l-2 pl-2 text-[10.5px] ${checks.every(Boolean)?'border-[var(--mint)] text-[var(--mint)]':'border-[var(--amber)] text-[var(--amber)]'}`}>{checks.every(Boolean)?'纪律条件已确认；仍需按日报中的触发与失效条件执行。':'检查未完成，不建议提交交易。'}</div>
      </div>}
      <div className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] px-3 py-2.5">
        <div className="flex items-end justify-between">
          <span className="font-mono2 text-[10px] t4 uppercase tracking-[0.15em]">本月交易额度</span>
          <span className={`font-mono2 text-[20px] leading-none font-semibold ${exhausted ? 'text-[var(--red)]' : 't1'}`}>
            {trades.used}
            <span className="text-[12px] t4"> / {trades.limit}</span>
          </span>
        </div>
        <div className="mt-2 h-[3px] bg-[var(--bg0)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: exhausted ? 'var(--red)' : 'var(--cyan)' }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-[10.5px] ${exhausted ? 'text-[var(--red)]' : 't4'}`}>
            {exhausted ? '额度已用完——本月不再开新仓' : `剩余 ${trades.limit - trades.used} 次`}
          </span>
          <span className="flex gap-1">
            <button className="icon-btn font-mono2 text-[11px] px-2" onClick={() => bump(-1)} title="撤销一次计数">−</button>
            <button className="icon-btn font-mono2 text-[11px] px-2" onClick={() => bump(1)} title="记一笔交易">+</button>
          </span>
        </div>
      </div>

      <ul className="mt-2 space-y-1.5 px-1">
        {RULES.map((r, i) => (
          <li key={i} className="flex gap-2 text-[11.5px] t2 leading-relaxed">
            <span className="flex-none mt-[5px] w-1.5 h-1.5 bg-[var(--cyan)]" style={{ borderRadius: 1 }} />
            {r}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
