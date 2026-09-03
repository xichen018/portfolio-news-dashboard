import { useState } from 'react'
import type { NewsItem, Sentiment } from '@/types'
import { timeAgo, uid } from '@/lib/format'
import Panel from './Panel'

const SENT_STYLE: Record<Sentiment, string> = {
  利好: 'border-[rgba(52,211,153,0.5)] text-[var(--mint)]',
  中性: 'border-[var(--line)] t3',
  风险: 'border-[rgba(248,113,113,0.5)] text-[var(--red)]',
}

interface Props {
  news: NewsItem[]
  setNews: (fn: (prev: NewsItem[]) => NewsItem[]) => void
}

export default function NewsPanel({ news, setNews }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [form, setForm] = useState({ ticker: '', title: '', source: '', sentiment: '中性' as Sentiment, summary: '' })

  const sorted = [...news].sort((a, b) => b.ts - a.ts)

  const save = () => {
    if (!form.title.trim()) return
    setNews((prev) => [
      ...prev,
      {
        id: uid(),
        ticker: form.ticker.trim().toUpperCase() || '宏观',
        title: form.title.trim(),
        summary: form.summary.trim() || undefined,
        source: form.source.trim() || '手动记录',
        sentiment: form.sentiment,
        ts: Date.now(),
      },
    ])
    setForm({ ticker: '', title: '', source: '', sentiment: '中性', summary: '' })
    setShowForm(false)
  }

  return (
    <Panel
      label="持仓新闻 · 24–30h"
      count={news.length}
      className="flex-1"
      actions={
        <button className="icon-btn" title="记录新闻" onClick={() => setShowForm(!showForm)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      }
    >
      {showForm && (
        <div className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] p-2 mb-2 space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            <input className="input2 font-mono2" placeholder="代码" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} />
            <input className="input2" placeholder="来源" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            <select className="input2" value={form.sentiment} onChange={(e) => setForm({ ...form, sentiment: e.target.value as Sentiment })}>
              {(['利好', '中性', '风险'] as Sentiment[]).map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <input className="input2" placeholder="标题 *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className="input2" rows={2} placeholder="一句话总结：这条新闻对我的持仓意味着什么？" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          <div className="flex gap-1.5 pt-0.5">
            <button className="flex-1 text-[12px] py-1.5 bg-[var(--cyan)] text-black font-semibold rounded-sm hover:opacity-85 transition-opacity" onClick={save}>记录</button>
            <button className="px-3 text-[12px] t3 border border-[var(--line)] rounded-sm hover:text-[var(--txt)] transition-colors" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {sorted.length === 0 && <div className="empty-state">暂无记录——看到重要新闻就归档到这里，并写下它对你持仓的含义</div>}
        {sorted.map((n) => (
          <article key={n.id} className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] px-2.5 py-2 hover:border-[#26355c] transition-colors">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="tag font-mono2 t2">{n.ticker}</span>
              <span className={`tag ${SENT_STYLE[n.sentiment]}`}>{n.sentiment}</span>
              {n.demo && <span className="tag t4">示例</span>}
              <span className="flex-1" />
              <span className="font-mono2 text-[9.5px] t4">
                {n.source} · {timeAgo(n.ts)}
              </span>
              {confirmId === n.id ? (
                <button className="font-mono2 text-[9px] text-[var(--red)]" onClick={() => setNews((prev) => prev.filter((x) => x.id !== n.id))}>
                  确认删除
                </button>
              ) : (
                <button className="icon-btn" style={{ padding: 2 }} title="删除" onClick={() => { setConfirmId(n.id); setTimeout(() => setConfirmId(null), 2500) }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6" />
                  </svg>
                </button>
              )}
            </div>
            <h3 className="mt-1.5 text-[12.5px] t1 font-medium leading-snug">{n.title}</h3>
            {n.summary && <p className="mt-1 text-[11.5px] t3 leading-relaxed">{n.summary}</p>}
          </article>
        ))}
      </div>
    </Panel>
  )
}
