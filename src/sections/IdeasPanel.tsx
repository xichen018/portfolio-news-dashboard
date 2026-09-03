import { useState } from 'react'
import type { Idea, IdeaSource } from '@/types'
import { ageHours, uid } from '@/lib/format'
import Panel from './Panel'

const AGING_HOURS = 72

interface Props {
  ideas: Idea[]
  setIdeas: (fn: (prev: Idea[]) => Idea[]) => void
}

export default function IdeasPanel({ ideas, setIdeas }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', source: '新闻' as IdeaSource, note: '' })

  const active = ideas.filter((i) => i.status === 'aging')

  const save = () => {
    if (!form.title.trim()) return
    setIdeas((prev) => [
      ...prev,
      { id: uid(), title: form.title.trim(), source: form.source, note: form.note.trim() || undefined, createdAt: Date.now(), status: 'aging' },
    ])
    setForm({ title: '', source: '新闻', note: '' })
    setShowForm(false)
  }

  return (
    <Panel
      label="想法陈化池 · 72h"
      count={active.length}
      actions={
        <button className="icon-btn" title="记录想法" onClick={() => setShowForm(!showForm)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      }
    >
      {showForm && (
        <div className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] p-2 mb-2 space-y-1.5">
          <input className="input2" placeholder="想法标题 *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-1.5">
            <select className="input2" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as IdeaSource })}>
              {(['新闻', '推特', '自研', '其他'] as IdeaSource[]).map((s) => <option key={s}>{s}</option>)}
            </select>
            <input className="input2" placeholder="备注（可选）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <button className="flex-1 text-[12px] py-1.5 bg-[var(--cyan)] text-black font-semibold rounded-sm hover:opacity-85 transition-opacity" onClick={save}>放入陈化池</button>
            <button className="px-3 text-[12px] t3 border border-[var(--line)] rounded-sm hover:text-[var(--txt)] transition-colors" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {ideas.length === 0 && <div className="empty-state">新闻驱动的想法先放这里，满 72 小时再决定是否行动</div>}
        {ideas.map((idea) => {
          const age = ageHours(idea.createdAt)
          const ready = age >= AGING_HOURS
          const pct = Math.min(100, (age / AGING_HOURS) * 100)
          const done = idea.status !== 'aging'
          return (
            <article
              key={idea.id}
              className={`border rounded-sm px-2.5 py-2 transition-colors ${
                done
                  ? 'border-[var(--line)] bg-[var(--bg1)] opacity-45'
                  : ready
                    ? 'border-[rgba(52,211,153,0.45)] bg-[var(--bg2)]'
                    : 'border-[var(--line)] bg-[var(--bg2)] hover:border-[#26355c]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="tag t3">{idea.source}</span>
                <span className="text-[12.5px] t1 font-medium leading-snug flex-1">{idea.title}</span>
                {idea.status === 'upgraded' && <span className="tag border-[rgba(52,211,153,0.5)] text-[var(--mint)]">已升级</span>}
              </div>
              {idea.note && <p className="mt-1 text-[11.5px] t3 leading-relaxed">{idea.note}</p>}
              {idea.status === 'aging' && (
                <>
                  <div className="mt-2 h-[3px] bg-[var(--bg0)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: ready ? 'var(--mint)' : 'var(--amber)' }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className={`font-mono2 text-[9.5px] ${ready ? 'text-[var(--mint)]' : 't4'}`}>
                      {ready ? `可决策 · 已满 ${Math.floor(age)}h` : `陈化中 · ${Math.floor(age)}h / ${AGING_HOURS}h`}
                    </span>
                    <span className="flex gap-2">
                      <button
                        className="font-mono2 text-[9.5px] link-cyan"
                        onClick={() => setIdeas((prev) => prev.map((x) => (x.id === idea.id ? { ...x, status: 'upgraded' } : x)))}
                      >
                        升级研究
                      </button>
                      <button
                        className="font-mono2 text-[9.5px] t4 hover:text-[var(--red)] transition-colors"
                        onClick={() => setIdeas((prev) => prev.filter((x) => x.id !== idea.id))}
                      >
                        放弃
                      </button>
                    </span>
                  </div>
                </>
              )}
            </article>
          )
        })}
      </div>
    </Panel>
  )
}
