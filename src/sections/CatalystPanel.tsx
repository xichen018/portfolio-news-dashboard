import { useState } from 'react'
import type { CatalystEvent, EventType } from '@/types'
import { countdownLabel, parseDay, uid, weekdayCN } from '@/lib/format'
import Panel from './Panel'

const TYPE_STYLE: Record<EventType, string> = {
  财报: 'border-[rgba(34,211,238,0.5)] text-[var(--cyan)]',
  宏观: 'border-[rgba(251,191,36,0.5)] text-[var(--amber)]',
  FDA: 'border-[rgba(232,121,249,0.5)] text-[var(--magenta)]',
  解禁: 'border-[rgba(52,211,153,0.5)] text-[var(--mint)]',
  其他: 'border-[var(--line)] t3',
}

const CD_STYLE = {
  today: 'border-[rgba(248,113,113,0.6)] text-[var(--red)]',
  soon: 'border-[rgba(34,211,238,0.5)] text-[var(--cyan)]',
  later: 'border-[var(--line)] t3',
  past: 'border-[var(--line)] t4',
}

interface Props {
  events: CatalystEvent[]
  setEvents: (fn: (prev: CatalystEvent[]) => CatalystEvent[]) => void
}

export default function CatalystPanel({ events, setEvents }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [form, setForm] = useState({ date: '', type: '财报' as EventType, title: '', ticker: '', note: '' })

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))
  const upcoming = events.filter((e) => countdownLabel(e.date).tone !== 'past').length

  const save = () => {
    if (!form.date || !form.title.trim()) return
    setEvents((prev) => [
      ...prev,
      {
        id: uid(),
        date: form.date,
        type: form.type,
        title: form.title.trim(),
        ticker: form.ticker.trim().toUpperCase() || undefined,
        note: form.note.trim() || undefined,
      },
    ])
    setForm({ date: '', type: '财报', title: '', ticker: '', note: '' })
    setShowForm(false)
  }

  return (
    <Panel
      label="催化剂日历"
      count={upcoming}
      actions={
        <button className="icon-btn" title="添加事件" onClick={() => setShowForm(!showForm)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      }
    >
      {showForm && (
        <div className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] p-2 mb-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <input className="input2 font-mono2" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <select className="input2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}>
              {(['财报', '宏观', 'FDA', '解禁', '其他'] as EventType[]).map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <input className="input2" placeholder="事件标题 *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-1.5">
            <input className="input2 font-mono2" placeholder="关联代码（可选）" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} />
            <input className="input2" placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <button className="flex-1 text-[12px] py-1.5 bg-[var(--cyan)] text-black font-semibold rounded-sm hover:opacity-85 transition-opacity" onClick={save}>添加</button>
            <button className="px-3 text-[12px] t3 border border-[var(--line)] rounded-sm hover:text-[var(--txt)] transition-colors" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {sorted.length === 0 && <div className="empty-state">暂无事件——把财报、宏观数据、FDA 日期都放进来</div>}
        {sorted.map((e) => {
          const cd = countdownLabel(e.date)
          const d = parseDay(e.date)
          const past = cd.tone === 'past'
          return (
            <div
              key={e.id}
              className={`flex gap-2.5 items-start border border-[var(--line)] rounded-sm bg-[var(--bg2)] px-2.5 py-2 hover:border-[#26355c] transition-colors ${past ? 'opacity-40' : ''}`}
            >
              <div className="flex-none w-[52px] text-center border-r border-[var(--line-soft)] pr-2">
                <div className="font-mono2 text-[12px] t1 leading-tight">{e.date.slice(5)}</div>
                <div className="font-mono2 text-[9px] t4 mt-0.5">{weekdayCN(d)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`tag ${TYPE_STYLE[e.type]}`}>{e.type}</span>
                  {e.ticker && <span className="tag font-mono2 t2">{e.ticker}</span>}
                  <span className="text-[12.5px] t1 font-medium leading-snug">{e.title}</span>
                </div>
                {e.note && <p className="mt-1 text-[11.5px] t3 leading-relaxed">{e.note}</p>}
              </div>
              <div className="flex-none flex flex-col items-end gap-1">
                <span className={`tag ${CD_STYLE[cd.tone]}`}>{cd.label}</span>
                {confirmId === e.id ? (
                  <button
                    className="font-mono2 text-[9px] text-[var(--red)]"
                    onClick={() => setEvents((prev) => prev.filter((x) => x.id !== e.id))}
                  >
                    确认删除
                  </button>
                ) : (
                  <button className="icon-btn" style={{ padding: 2 }} title="删除" onClick={() => { setConfirmId(e.id); setTimeout(() => setConfirmId(null), 2500) }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
