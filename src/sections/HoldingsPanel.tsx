import { useState } from 'react'
import type { Direction, Holding, PMDecision } from '@/types'
import { uid } from '@/lib/format'
import Panel from './Panel'

const DIR_STYLE: Record<Direction, string> = {
  多: 'border-[rgba(34,211,238,0.5)] text-[var(--cyan)]',
  空: 'border-[rgba(248,113,113,0.5)] text-[var(--red)]',
  空2x: 'border-[rgba(251,191,36,0.5)] text-[var(--amber)]',
}
const DIR_LABEL: Record<Direction, string> = { 多: '做多', 空: '做空', 空2x: '做空 2x' }

const emptyForm = {
  ticker: '',
  name: '',
  market: '美股' as Holding['market'],
  direction: '多' as Direction,
  weight: '',
  thesis: '',
  invalidation: '',
  target: '',
  stop: '',
}

interface Props {
  holdings: Holding[]
  decisions: PMDecision[]
  setHoldings: (fn: (prev: Holding[]) => Holding[]) => void
}

export default function HoldingsPanel({ holdings, decisions, setHoldings }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const totalWeight = holdings.reduce((s, h) => s + (h.weight || 0), 0)

  const startEdit = (h: Holding) => {
    setEditingId(h.id)
    setForm({
      ticker: h.ticker,
      name: h.name,
      market: h.market,
      direction: h.direction,
      weight: String(h.weight),
      thesis: h.thesis,
      invalidation: h.invalidation,
      target: h.target ?? '',
      stop: h.stop ?? '',
    })
    setShowForm(true)
  }

  const save = () => {
    if (!form.ticker.trim()) return
    const weight = Number(form.weight)
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) return
    const base = {
      ticker: form.ticker.trim().toUpperCase(),
      name: form.name.trim() || form.ticker.trim().toUpperCase(),
      market: form.market,
      direction: form.direction,
      weight,
      thesis: form.thesis.trim(),
      invalidation: form.invalidation.trim(),
      target: form.target.trim() || undefined,
      stop: form.stop.trim() || undefined,
    }
    if (editingId) {
      setHoldings((prev) => prev.map((h) => (h.id === editingId ? { ...h, ...base } : h)))
    } else {
      setHoldings((prev) => [...prev, { id: uid(), ...base }])
    }
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
  }

  return (
    <Panel
      label="持仓 · 论点与失效条件"
      count={holdings.length}
      className="h-full"
      actions={
        <button className="icon-btn" title="添加持仓" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm) }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      }
    >
      {/* 总仓位 */}
      <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-[var(--line-soft)]">
        <span className="font-mono2 text-[10px] t4 uppercase tracking-[0.15em]">总仓位</span>
        <span className="font-mono2 text-[12px] t1">{totalWeight.toFixed(1)}%</span>
      </div>

      {showForm && (
        <div className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] p-2 mb-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <input className="input2 font-mono2" placeholder="代码 *" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} />
            <input className="input2" placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="input2" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value as Holding['market'] })}>
              {['美股', 'A股', '港股', '加密', '其他'].map((m) => <option key={m}>{m}</option>)}
            </select>
            <select className="input2" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as Direction })}>
              <option value="多">做多</option>
              <option value="空">做空</option>
              <option value="空2x">做空 2x</option>
            </select>
          </div>
          <input className="input2 font-mono2" type="number" min="0" max="100" step="0.1" placeholder="仓位占比 %" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
          <textarea className="input2" rows={2} placeholder="投资论点（一句话：为什么买）" value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} />
          <textarea className="input2" rows={2} placeholder="失效条件（出现什么信号证明我错了）" value={form.invalidation} onChange={(e) => setForm({ ...form, invalidation: e.target.value })} />
          <div className="grid grid-cols-2 gap-1.5">
            <input className="input2" placeholder="目标价 / 止盈（可选）" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
            <input className="input2" placeholder="止损 / 时间止损（可选）" value={form.stop} onChange={(e) => setForm({ ...form, stop: e.target.value })} />
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <button className="flex-1 text-[12px] py-1.5 bg-[var(--cyan)] text-black font-semibold rounded-sm hover:opacity-85 transition-opacity" onClick={save}>
              {editingId ? '保存修改' : '添加'}
            </button>
            <button className="px-3 text-[12px] t3 border border-[var(--line)] rounded-sm hover:text-[var(--txt)] transition-colors" onClick={() => { setShowForm(false); setEditingId(null) }}>
              取消
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {holdings.length === 0 && <div className="empty-state">暂无持仓——点击右上角 + 添加第一笔</div>}
        {holdings.map((h) => {
          const decision=decisions.find((item)=>item.ticker.toUpperCase()===h.ticker.toUpperCase())
          const longTrendMentioned=/长期趋势|200日/.test(h.invalidation)
          const aboveLongTrend=Boolean(decision&&/高于[^。]*200日均线|200日均线[^。]*上方/.test(decision.view+decision.evidence.join(' ')))
          const belowLongTrend=Boolean(decision&&/低于[^。]*200日均线|跌破[^。]*200日均线/.test(decision.view+decision.evidence.join(' ')))
          return (
          <article key={h.id} className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] p-2.5 hover:border-[#26355c] transition-colors">
            <div className="flex items-center gap-2">
              <span className="font-mono2 text-[13px] font-semibold t1">{h.ticker}</span>
              <span className={`tag ${DIR_STYLE[h.direction]}`}>{DIR_LABEL[h.direction]}</span>
              <span className="tag t3">{h.market}</span>
              {h.demo && <span className="tag t4">示例</span>}
              <span className="flex-1" />
              <span className="font-mono2 text-[12px] t1">{h.weight}%</span>
            </div>
            <div className="mt-1.5 h-[3px] bg-[var(--bg0)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, h.weight)}%`,
                  background: h.direction === '多' ? 'var(--cyan)' : 'var(--amber)',
                }}
              />
            </div>
            <div className="mt-1.5 text-[12px] t2">{h.name}</div>
            {h.thesis && (
              <p className="mt-1.5 text-[12px] leading-relaxed t2">
                <span className="t4 font-mono2 text-[10px] uppercase tracking-wider mr-1.5">论点</span>
                {h.thesis}
              </p>
            )}
            {longTrendMentioned&&decision&&(aboveLongTrend||belowLongTrend)&&<p className={`mt-1.5 text-[11px] border-l-2 pl-2 ${belowLongTrend?'border-[var(--red)] text-[var(--red)]':'border-[var(--mint)] text-[var(--mint)]'}`}><span className="font-mono2 text-[10px] mr-1.5">当前状态</span>{belowLongTrend?'已触发：价格低于200日均线':'未触发：价格仍高于200日均线'}</p>}
            {longTrendMentioned&&decision&&(aboveLongTrend||belowLongTrend)?(
              <p className="mt-1.5 text-[12px] leading-relaxed t2 border-l-2 border-[var(--amber)] pl-2">
                <span className="text-[var(--amber)] font-mono2 text-[10px] uppercase tracking-wider mr-1.5">触发规则</span>
                日线收盘重新跌破200日均线后，才进入长期趋势失效复核。
              </p>
            ):h.invalidation && (
              <p className="mt-1.5 text-[12px] leading-relaxed t2 border-l-2 border-[var(--amber)] pl-2">
                <span className="text-[var(--amber)] font-mono2 text-[10px] uppercase tracking-wider mr-1.5">失效条件（若发生）</span>
                {h.invalidation}
              </p>
            )}
            {(h.target || h.stop) && (
              <div className="mt-1.5 space-y-0.5 font-mono2 text-[10px] t3">
                {h.target && <div>目标 · {h.target}</div>}
                {h.stop && <div className="text-[var(--red)]">止损 · {h.stop}</div>}
              </div>
            )}
            <div className="mt-2 border-t border-[var(--line-soft)] pt-2">
              <div className="font-mono2 text-[9px] text-[var(--cyan)]">AI 决策框架 · 已核验日报</div>
              {!decision?<div className="mt-1 text-[10.5px] t4">待补数据</div>:<div className="mt-1.5 space-y-1.5 text-[10.5px] t2 leading-relaxed">
                {h.weight>=25&&<p className="border-l-2 border-[var(--amber)] pl-2 text-[var(--amber)]">集中度提示：该持仓占组合 {h.weight}%，单一财报或回购事件可能主导组合净值；决策需先定义事件前后的减仓条件。</p>}
                <p>{decision.view}</p>
                {decision.evidence.length>0&&<p><span className="t4">证据：</span>{decision.evidence.join('；')}</p>}
                {decision.pricing&&<p><span className="t4">定价：</span>{decision.pricing}</p>}
                {decision.variant&&<p><span className="t4">分歧：</span>{decision.variant}</p>}
                {decision.catalysts&&<p><span className="t4">催化：</span>{decision.catalysts}</p>}
                {decision.actions&&<p className="border-l-2 border-[var(--cyan)] pl-2"><span className="text-[var(--cyan)]">条件与动作：</span>{decision.actions}</p>}
              </div>}
            </div>
            <div className="mt-2 pt-1.5 border-t border-[var(--line-soft)] flex items-center gap-1">
              <a className="link-cyan font-mono2 text-[10px]" href={`https://www.google.com/search?q=${encodeURIComponent(h.ticker + ' ' + h.name + ' 新闻')}&tbm=nws`} target="_blank" rel="noreferrer">
                新闻 ↗
              </a>
              <span className="t4 mx-1">·</span>
              <a className="link-cyan font-mono2 text-[10px]" href={`https://x.com/search?q=%24${encodeURIComponent(h.ticker)}&f=live`} target="_blank" rel="noreferrer">
                X 讨论 ↗
              </a>
              <span className="flex-1" />
              <button className="icon-btn" title="编辑" onClick={() => startEdit(h)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
              {confirmId === h.id ? (
                <button
                  className="font-mono2 text-[10px] text-[var(--red)] border border-[rgba(248,113,113,0.5)] rounded-sm px-1.5 py-0.5"
                  onClick={() => { setHoldings((prev) => prev.filter((x) => x.id !== h.id)); setConfirmId(null) }}
                >
                  确认删除
                </button>
              ) : (
                <button className="icon-btn" title="删除" onClick={() => { setConfirmId(h.id); setTimeout(() => setConfirmId(null), 2500) }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6" />
                  </svg>
                </button>
              )}
            </div>
          </article>
        )})}
      </div>
    </Panel>
  )
}
