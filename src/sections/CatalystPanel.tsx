import { useState } from 'react'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import type { CatalystCategory, CatalystEvent, EventType } from '@/types'
import { countdownLabel, parseDay, uid, weekdayCN } from '@/lib/format'
import Panel from './Panel'

const CATEGORIES: CatalystCategory[] = ['宏观信息', '资金流向与资金成本', '市场估值与潜在风险']
const CATEGORY_STYLE: Record<CatalystCategory, string> = {
  宏观信息: 'border-[rgba(34,211,238,0.5)] text-[var(--cyan)]',
  资金流向与资金成本: 'border-[rgba(251,191,36,0.5)] text-[var(--amber)]',
  市场估值与潜在风险: 'border-[rgba(248,113,113,0.5)] text-[var(--red)]',
}

const normalizeCategory = (event: CatalystEvent): CatalystCategory => event.category ?? (
  event.type === '宏观' ? '宏观信息' : event.type === '解禁' ? '资金流向与资金成本' : '市场估值与潜在风险'
)

interface Props {
  events: CatalystEvent[]
  setEvents: (fn: (prev: CatalystEvent[]) => CatalystEvent[]) => void
}

export default function CatalystPanel({ events, setEvents }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [activeCategory, setActiveCategory] = useState<CatalystCategory>('宏观信息')
  const [form, setForm] = useState({ date: '', title: '', note: '', sourceUrl: '', filterReason: '', aiAdvice: '' })
  const visible = [...events].filter((event) => normalizeCategory(event) === activeCategory).sort((a, b) => a.date.localeCompare(b.date))

  const save = () => {
    if (!form.date || !form.title.trim()) return
    setEvents((prev) => [...prev, {
      id: uid(), date: form.date, type: '其他' as EventType, category: activeCategory,
      title: form.title.trim(), note: form.note.trim() || undefined,
      sourceUrl: form.sourceUrl.trim() || undefined, filterReason: form.filterReason.trim() || undefined,
      aiAdvice: form.aiAdvice.trim() || undefined,
      evidenceGap: form.aiAdvice.trim() ? undefined : '待补筛选 Prompt 与模型分析',
    }])
    setForm({ date: '', title: '', note: '', sourceUrl: '', filterReason: '', aiAdvice: '' })
    setShowForm(false)
  }

  return <Panel label="市场监测 · 过滤后信息" count={events.length} actions={
    <button className="icon-btn" title="添加过滤结果" aria-label="添加过滤结果" onClick={() => setShowForm(!showForm)}><Plus size={13} /></button>
  }>
    <div className="grid grid-cols-3 gap-1 mb-2" role="tablist">
      {CATEGORIES.map((category) => <button key={category} role="tab" aria-selected={activeCategory === category}
        className={`min-h-9 px-1 text-[10px] leading-tight border rounded-sm ${activeCategory === category ? CATEGORY_STYLE[category] + ' bg-[var(--bg2)]' : 'border-[var(--line)] t4'}`}
        onClick={() => setActiveCategory(category)}>{category}</button>)}
    </div>
    {showForm && <div className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] p-2 mb-2 space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5"><input className="input2 font-mono2" type="date" value={form.date} onChange={(e) => setForm({...form,date:e.target.value})}/><input className="input2" placeholder="标题 *" value={form.title} onChange={(e) => setForm({...form,title:e.target.value})}/></div>
      <input className="input2" placeholder="来源链接" value={form.sourceUrl} onChange={(e) => setForm({...form,sourceUrl:e.target.value})}/>
      <textarea className="input2" rows={2} placeholder="事实摘要" value={form.note} onChange={(e) => setForm({...form,note:e.target.value})}/>
      <textarea className="input2" rows={2} placeholder="为何通过过滤" value={form.filterReason} onChange={(e) => setForm({...form,filterReason:e.target.value})}/>
      <textarea className="input2" rows={2} placeholder="AI 建议（模型接入前可留空）" value={form.aiAdvice} onChange={(e) => setForm({...form,aiAdvice:e.target.value})}/>
      <div className="flex gap-1.5"><button className="action-primary flex-1" onClick={save}>保存</button><button className="action-secondary" onClick={() => setShowForm(false)}>取消</button></div>
    </div>}
    <div className="space-y-1.5">
      {visible.length === 0 && <div className="empty-state">该类别暂无通过过滤的信息</div>}
      {visible.map((event) => { const cd=countdownLabel(event.date); return <article key={event.id} className="border border-[var(--line)] bg-[var(--bg2)] rounded-sm p-2.5">
        <div className="flex gap-2 items-start"><div className="font-mono2 text-[10px] t3 flex-none">{event.date.slice(5)}<br/>{weekdayCN(parseDay(event.date))}</div><div className="min-w-0 flex-1"><div className="flex gap-1.5 items-center flex-wrap"><span className={`tag ${CATEGORY_STYLE[normalizeCategory(event)]}`}>{normalizeCategory(event)}</span><strong className="text-[12.5px] font-medium">{event.title}</strong><span className="tag t4">{cd.label}</span></div>{event.note && <p className="mt-1.5 text-[11.5px] t3 leading-relaxed">{event.note}</p>}{event.filterReason && <p className="mt-1 text-[10.5px] t4">过滤依据 · {event.filterReason}</p>}</div>
          {event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="icon-btn" title="打开来源"><ExternalLink size={12}/></a>}<button className="icon-btn" title="删除" onClick={() => setEvents((prev)=>prev.filter((item)=>item.id!==event.id))}><Trash2 size={12}/></button></div>
        <div className="mt-2 border-l-2 border-[var(--red)] bg-[rgba(248,113,113,0.05)] p-2"><div className="font-mono2 text-[9px] text-[var(--red)] mb-1">AI 建议</div><p className="text-[11.5px] t2 leading-relaxed">{event.aiAdvice || event.evidenceGap || '待补筛选 Prompt 与模型分析'}</p></div>
      </article>})}
    </div>
  </Panel>
}
