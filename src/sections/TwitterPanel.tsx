import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, LoaderCircle, RefreshCw, Send, Trash2 } from 'lucide-react'
import type { TwitterAccount, XChatMessage, XDigestItem } from '@/types'
import { uid } from '@/lib/format'
import Panel from './Panel'

interface Props {
  accounts: TwitterAccount[]
  digest: XDigestItem[]
  messages: XChatMessage[]
  setDigest: (fn: (prev: XDigestItem[]) => XDigestItem[]) => void
  setMessages: (fn: (prev: XChatMessage[]) => XChatMessage[]) => void
}

type ChatResponse = { answer: string; citations: string[]; remaining_today: number }
type DigestResponse = { initialized?: boolean; generated_at?: string; remaining_today?: number; summaries?: Array<{ handles: string[]; summary: string; citations: string[] }> }

const errorMessage = (status: number) => {
  if (status === 429) return '今日对话额度已用完。'
  if (status === 400) return '消息过长，请缩短后重试。'
  return 'Grok 暂时无法响应，请稍后重试。'
}

const cleanDigestText = (value: string) => value.replace(/\*\*/g, '').trim()
const isNoMajorUpdate = (value: string) => /无重大新增/.test(value)
const digestTime = (timestamp: number) => new Intl.DateTimeFormat('zh-HK', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(timestamp)

export default function TwitterPanel({ accounts, digest, messages, setDigest, setMessages }: Props) {
  const [view, setView] = useState<'chat' | 'watchlist'>('watchlist')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)

  const mergeAutomaticDigest = useCallback((payload: DigestResponse) => {
    if (!payload.initialized && (!payload.generated_at || !payload.summaries?.length)) return
    if (!payload.generated_at || !payload.summaries?.length) return
    const generated = new Date(payload.generated_at).getTime()
    if (!Number.isFinite(generated)) return
    const automatic = payload.summaries.map((summary, index): XDigestItem => ({
      id: `xai-30h-${generated}-${index}`,
      category: '市场观点',
      title: payload.summaries!.length === 1 ? '过去30小时重点' : `过去30小时重点 · ${index + 1}/${payload.summaries!.length}`,
      summary: cleanDigestText(summary.summary),
      handles: summary.handles,
      sourceUrls: isNoMajorUpdate(summary.summary) ? [] : summary.citations,
      ts: generated,
    }))
    setDigest((previous) => {
      const currentAutomatic = previous.filter((item) => item.id.startsWith('xai-30h-') && !item.id.startsWith('xai-30h-error-'))
      if (currentAutomatic.some((item) => item.ts > generated)) return previous
      return [...automatic, ...previous.filter((item) => !item.id.startsWith('xai-30h-'))]
    })
    if (typeof payload.remaining_today === 'number') setRemaining(payload.remaining_today)
  }, [setDigest])

  useEffect(() => {
    let active = true
    fetch(`${import.meta.env.BASE_URL}api/x-digest`, { cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json() as Promise<DigestResponse> })
      .then((payload) => { if (active) mergeAutomaticDigest(payload) })
      .catch(() => undefined)
    return () => { active = false }
  }, [mergeAutomaticDigest])

  const send = async () => {
    const content = input.trim()
    if (!content || sending) return
    const userMessage: XChatMessage = { id: uid(), role: 'user', content, ts: Date.now() }
    const conversation = [...messages, userMessage].slice(-20)
    setMessages(() => conversation)
    setInput('')
    setSending(true)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation.map(({ role, content: text }) => ({ role, content: text })) }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const payload = await response.json() as ChatResponse
      const assistantMessage: XChatMessage = {
        id: uid(), role: 'assistant', content: payload.answer,
        citations: payload.citations, ts: Date.now(),
      }
      setMessages((previous) => [...previous, assistantMessage].slice(-40))
      setRemaining(payload.remaining_today)
    } catch (error) {
      const status = Number(error instanceof Error ? error.message : 0)
      const assistantMessage: XChatMessage = {
        id: uid(), role: 'assistant', content: errorMessage(status), ts: Date.now(),
      }
      setMessages((previous) => [...previous, assistantMessage])
    } finally {
      setSending(false)
    }
  }

  const refreshDigest = async () => {
    if (refreshing || accounts.length === 0) return
    setRefreshing(true)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/x-digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handles: accounts.map((account) => account.handle) }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const payload = await response.json() as DigestResponse
      mergeAutomaticDigest({ ...payload, initialized: true })
    } catch (error) {
      const status = Number(error instanceof Error ? error.message : 0)
      const message = errorMessage(status)
      setDigest((previous) => [{
        id: `xai-30h-error-${Date.now()}`, category: '风险汇总', title: '30小时扫描未完成',
        summary: message, handles: [], ts: Date.now(),
      }, ...previous.filter((item) => !item.id.startsWith('xai-30h-error-'))])
    } finally {
      setRefreshing(false)
    }
  }

  return <Panel label="Grok · X 市场情报" count={messages.filter((item) => item.role === 'assistant').length} actions={
    <div className="flex items-center gap-1">
      <button className={`tag ${view === 'chat' ? 'text-[var(--cyan)]' : 't4'}`} onClick={() => setView('chat')}>对话</button>
      <button className={`tag ${view === 'watchlist' ? 'text-[var(--cyan)]' : 't4'}`} onClick={() => setView('watchlist')}>关注</button>
    </div>
  }>
    {view === 'chat' ? <div className="h-full min-h-[250px] flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && <div className="h-full min-h-[150px] grid place-items-center text-center">
          <span className="font-mono2 text-[10px] t4">向 Grok 询问市场或 X 上的最新讨论</span>
        </div>}
        {messages.map((message) => <article key={message.id} className={message.role === 'user' ? 'ml-5 border-l-2 border-[var(--cyan)] bg-[var(--bg2)] p-2' : 'mr-2 border border-[var(--line)] bg-[var(--bg2)] rounded-sm p-2'}>
          <div className="font-mono2 text-[9px] t4 mb-1">{message.role === 'user' ? 'YOU' : 'GROK'}</div>
          <p className="text-[10.5px] t2 leading-relaxed whitespace-pre-wrap">{message.content}</p>
          {!!message.citations?.length && <div className="flex flex-wrap gap-1 mt-2">{message.citations.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="tag text-[var(--cyan)]" title={url}>X 来源 {index + 1}<ExternalLink size={9} className="inline ml-1" /></a>)}</div>}
        </article>)}
        {sending && <div className="flex items-center gap-1.5 text-[10px] t4"><LoaderCircle size={11} className="animate-spin" />Grok 正在检索</div>}
      </div>
      <div className="border-t border-[var(--line)] mt-2 pt-2">
        <textarea className="input2 w-full resize-none" rows={2} maxLength={8000} placeholder="询问市场、持仓或 X 上的实时观点" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} />
        <div className="flex items-center gap-1 mt-1">
          <button className="icon-btn" title="清空对话" disabled={messages.length === 0 || sending} onClick={() => setMessages(() => [])}><Trash2 size={12} /></button>
          <span className="font-mono2 text-[9px] t4">{remaining == null ? 'Grok 4.3 · X Search' : `今日剩余 ${remaining} 次`}</span>
          <span className="flex-1" />
          <button className="action-primary px-2" title="发送" disabled={!input.trim() || sending} onClick={() => void send()}><Send size={12} /></button>
        </div>
      </div>
    </div> : <div className="space-y-2">
      <div className="flex items-center gap-1"><span className="font-mono2 text-[9px] t4 flex-1">{accounts.length} 个账号 · 严格30小时</span><button className="action-secondary flex items-center gap-1" disabled={refreshing || accounts.length === 0} onClick={() => void refreshDigest()}>{refreshing ? <LoaderCircle size={11} className="animate-spin" /> : <RefreshCw size={11} />}更新</button></div>
      <details className="text-[10px] t4"><summary className="cursor-pointer select-none">查看关注账号</summary><div className="flex gap-1 flex-wrap max-h-20 overflow-y-auto mt-2">{accounts.map((account) => <a key={account.id} href={`https://x.com/${account.handle}`} target="_blank" rel="noreferrer" className="tag t3 hover:text-[var(--cyan)]">@{account.handle}</a>)}</div></details>
      {digest.length === 0 ? <div className="border border-dashed border-[var(--line)] px-2 py-3 text-center text-[10px] t4">尚未扫描</div> : <div className="border-t border-[var(--line)] pt-2 space-y-1">{digest.map((item) => <article key={item.id} className="border border-[var(--line)] bg-[var(--bg2)] rounded-sm p-2"><div className="flex items-center gap-1"><strong className="text-[11px] font-medium flex-1">{item.title}</strong>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="icon-btn" title="查看原帖"><ExternalLink size={10} /></a>}<button className="icon-btn" title="删除" onClick={() => setDigest((previous) => previous.filter((entry) => entry.id !== item.id))}><Trash2 size={10} /></button></div><div className="font-mono2 text-[9px] t4 mt-0.5">更新于 {digestTime(item.ts)}</div><p className="mt-1.5 text-[10px] t2 leading-relaxed whitespace-pre-wrap">{cleanDigestText(item.summary)}</p>{!!item.sourceUrls?.length && !isNoMajorUpdate(item.summary) && <details className="mt-2 text-[10px]"><summary className="cursor-pointer text-[var(--cyan)] select-none">查看 {item.sourceUrls.length} 条原帖</summary><div className="flex flex-wrap gap-1 mt-2">{item.sourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="tag text-[var(--cyan)]" title={url}>原帖 {index + 1}<ExternalLink size={9} className="inline ml-1" /></a>)}</div></details>}</article>)}</div>}
    </div>}
  </Panel>
}
