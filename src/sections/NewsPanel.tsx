import { useState } from 'react'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import type { NewsItem, NewsKind, Sentiment } from '@/types'
import { timeAgo, uid } from '@/lib/format'
import Panel from './Panel'

const KINDS: NewsKind[] = ['重大新闻', '重大事项', 'SEC披露']
const SENT_STYLE: Record<Sentiment,string> = { 利好:'text-[var(--mint)]', 中性:'t3', 风险:'text-[var(--red)]' }

interface Props { news: NewsItem[]; setNews: (fn:(prev:NewsItem[])=>NewsItem[])=>void }

export default function NewsPanel({news,setNews}:Props) {
  const [showForm,setShowForm]=useState(false)
  const [kind,setKind]=useState<'全部'|NewsKind>('全部')
  const [form,setForm]=useState({ticker:'',title:'',source:'',url:'',kind:'重大新闻' as NewsKind,sentiment:'中性' as Sentiment,summary:'',filterReason:'',aiAdvice:''})
  const visible=[...news].filter((item)=>kind==='全部'||(item.kind??'重大新闻')===kind).sort((a,b)=>b.ts-a.ts)
  const save=()=>{if(!form.title.trim()||!form.ticker.trim())return;setNews((prev)=>[...prev,{id:uid(),ticker:form.ticker.trim().toUpperCase(),title:form.title.trim(),source:form.source.trim()||'手动记录',url:form.url.trim()||undefined,kind:form.kind,sentiment:form.sentiment,summary:form.summary.trim()||undefined,filterReason:form.filterReason.trim()||undefined,aiAdvice:form.aiAdvice.trim()||undefined,ts:Date.now()}]);setForm({ticker:'',title:'',source:'',url:'',kind:'重大新闻',sentiment:'中性',summary:'',filterReason:'',aiAdvice:''});setShowForm(false)}
  return <Panel label="持仓情报 · 新闻 / 事项 / SEC" count={news.length} className="flex-1" actions={<button className="icon-btn" title="记录情报" onClick={()=>setShowForm(!showForm)}><Plus size={13}/></button>}>
    <div className="flex gap-1 mb-2 overflow-x-auto">{(['全部',...KINDS] as const).map((value)=><button key={value} className={`tag ${kind===value?'border-[rgba(34,211,238,.55)] text-[var(--cyan)]':'t4'}`} onClick={()=>setKind(value)}>{value}</button>)}</div>
    {showForm&&<div className="border border-[var(--line)] rounded-sm bg-[var(--bg2)] p-2 mb-2 space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5"><input className="input2 font-mono2" placeholder="代码 *" value={form.ticker} onChange={(e)=>setForm({...form,ticker:e.target.value})}/><select className="input2" value={form.kind} onChange={(e)=>setForm({...form,kind:e.target.value as NewsKind})}>{KINDS.map((x)=><option key={x}>{x}</option>)}</select><select className="input2" value={form.sentiment} onChange={(e)=>setForm({...form,sentiment:e.target.value as Sentiment})}>{(['利好','中性','风险'] as Sentiment[]).map((x)=><option key={x}>{x}</option>)}</select></div>
      <input className="input2" placeholder="标题 *" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}/><div className="grid grid-cols-2 gap-1.5"><input className="input2" placeholder="来源" value={form.source} onChange={(e)=>setForm({...form,source:e.target.value})}/><input className="input2" placeholder="原文链接" value={form.url} onChange={(e)=>setForm({...form,url:e.target.value})}/></div>
      <textarea className="input2" rows={2} placeholder="事实摘要" value={form.summary} onChange={(e)=>setForm({...form,summary:e.target.value})}/><textarea className="input2" rows={2} placeholder="为何通过筛选：与持仓的关联和重要性" value={form.filterReason} onChange={(e)=>setForm({...form,filterReason:e.target.value})}/><textarea className="input2" rows={2} placeholder="AI 建议（模型接入前可留空）" value={form.aiAdvice} onChange={(e)=>setForm({...form,aiAdvice:e.target.value})}/>
      <div className="flex gap-1.5"><button className="action-primary flex-1" onClick={save}>保存</button><button className="action-secondary" onClick={()=>setShowForm(false)}>取消</button></div>
    </div>}
    <div className="space-y-1.5">{visible.length===0&&<div className="empty-state">暂无符合条件的持仓情报</div>}{visible.map((item)=><article key={item.id} className="border border-[var(--line)] bg-[var(--bg2)] rounded-sm p-2.5">
      <div className="flex items-center gap-1.5 flex-wrap"><span className="tag font-mono2 t2">{item.ticker}</span><span className="tag t3">{item.kind??'重大新闻'}</span><span className={`tag ${SENT_STYLE[item.sentiment]}`}>{item.sentiment}</span>{item.demo&&<span className="tag t4">示例</span>}<span className="flex-1"/><span className="font-mono2 text-[9.5px] t4">{item.source} · {timeAgo(item.ts)}</span>{item.url&&<a href={item.url} target="_blank" rel="noreferrer" className="icon-btn" title="打开原文"><ExternalLink size={11}/></a>}<button className="icon-btn" title="删除" onClick={()=>setNews((prev)=>prev.filter((x)=>x.id!==item.id))}><Trash2 size={11}/></button></div>
      <h3 className="mt-1.5 text-[12.5px] t1 font-medium">{item.title}</h3>{item.summary&&<p className="mt-1 text-[11.5px] t3">{item.summary}</p>}{item.filterReason&&<p className="mt-1 text-[10.5px] t4">过滤依据 · {item.filterReason}</p>}
      <div className="mt-2 border-l-2 border-[var(--red)] bg-[rgba(248,113,113,.05)] p-2"><div className="font-mono2 text-[9px] text-[var(--red)] mb-1">AI 建议</div><p className="text-[11.5px] t2">{item.aiAdvice||'待补筛选 Prompt 与模型分析'}</p></div>
    </article>)}</div>
  </Panel>
}
