import { useState } from 'react'
import type { TwitterAccount } from '@/types'
import { uid } from '@/lib/format'
import Panel from './Panel'

interface Props {
  accounts: TwitterAccount[]
  setAccounts: (fn: (prev: TwitterAccount[]) => TwitterAccount[]) => void
}

export default function TwitterPanel({ accounts, setAccounts }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [form, setForm] = useState({ handle: '', name: '', focus: '' })

  const save = () => {
    if (!form.handle.trim()) return
    setAccounts((prev) => [
      ...prev,
      {
        id: uid(),
        handle: form.handle.trim().replace(/^@/, ''),
        name: form.name.trim() || form.handle.trim(),
        focus: form.focus.trim() || '未分类',
        note: '',
      },
    ])
    setForm({ handle: '', name: '', focus: '' })
    setShowForm(false)
  }

  const updateNote = (id: string, note: string) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, note } : a)))
  }

  return (
    <Panel
      label="X 关注 · 观点归档"
      count={accounts.length}
      actions={
        <button className="icon-btn" title="添加账号" onClick={() => setShowForm(!showForm)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      }
    >
      {showForm && (
        <div className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] p-2 mb-2 space-y-1.5">
          <input className="input2 font-mono2" placeholder="X 账号（不含 @）*" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} />
          <div className="grid grid-cols-2 gap-1.5">
            <input className="input2" placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input2" placeholder="关注领域" value={form.focus} onChange={(e) => setForm({ ...form, focus: e.target.value })} />
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <button className="flex-1 text-[12px] py-1.5 bg-[var(--cyan)] text-black font-semibold rounded-sm hover:opacity-85 transition-opacity" onClick={save}>添加</button>
            <button className="px-3 text-[12px] t3 border border-[var(--line)] rounded-sm hover:text-[var(--txt)] transition-colors" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {accounts.length === 0 && <div className="empty-state">暂无关注账号</div>}
        {accounts.map((a) => (
          <article key={a.id} className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] px-2.5 py-2 hover:border-[#26355c] transition-colors">
            <div className="flex items-center gap-1.5">
              <a href={`https://x.com/${a.handle}`} target="_blank" rel="noreferrer" className="link-cyan font-mono2 text-[12px] font-semibold">
                @{a.handle}
              </a>
              <span className="text-[11px] t3 truncate">{a.name}</span>
              <span className="flex-1" />
              <span className="tag t3">{a.focus}</span>
              {confirmId === a.id ? (
                <button className="font-mono2 text-[9px] text-[var(--red)]" onClick={() => setAccounts((prev) => prev.filter((x) => x.id !== a.id))}>
                  确认
                </button>
              ) : (
                <button className="icon-btn" style={{ padding: 2 }} title="删除" onClick={() => { setConfirmId(a.id); setTimeout(() => setConfirmId(null), 2500) }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4h8v2m1 0-1 14H8L7 6" />
                  </svg>
                </button>
              )}
            </div>
            <textarea
              className="input2 mt-1.5"
              rows={2}
              placeholder="今日观点待记录——打开 X 扫一遍，把值得归档的看法写在这里（自动保存）"
              value={a.note}
              onChange={(e) => updateNote(a.id, e.target.value)}
            />
          </article>
        ))}
      </div>
    </Panel>
  )
}
