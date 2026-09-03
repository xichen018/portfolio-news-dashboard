import { useState } from 'react'
import { MessageSquareText, Send, Trash2 } from 'lucide-react'
import type { Idea, IdeaSource } from '@/types'
import { ageHours, uid } from '@/lib/format'
import Panel from './Panel'

const AGING_HOURS=72
interface Props { ideas:Idea[]; setIdeas:(fn:(prev:Idea[])=>Idea[])=>void }

export default function IdeasPanel({ideas,setIdeas}:Props){
  const [form,setForm]=useState({source:'自研' as IdeaSource,rawContent:''})
  const [question,setQuestion]=useState<Record<string,string>>({})
  const save=()=>{const raw=form.rawContent.trim();if(!raw)return;const title=raw.split('\n').find(Boolean)?.slice(0,70)||'未命名想法';setIdeas((prev)=>[{id:uid(),title,source:form.source,rawContent:raw,createdAt:Date.now(),status:'aging'},...prev]);setForm({...form,rawContent:''})}
  const saveQuestion=(idea:Idea)=>{const value=question[idea.id]?.trim();if(!value)return;setIdeas((prev)=>prev.map((x)=>x.id===idea.id?{...x,aiConversation:[x.aiConversation,`我：${value}\nAI：待接入模型，问题已保存。`].filter(Boolean).join('\n\n')}:x));setQuestion((prev)=>({...prev,[idea.id]:''}))}
  return <Panel label="想法陈化池 · AI 对话" count={ideas.filter((x)=>x.status==='aging').length}>
    <div className="border border-[rgba(52,211,153,.45)] bg-[rgba(52,211,153,.04)] rounded-sm p-2 mb-2 space-y-1.5">
      <div className="flex items-center gap-1.5 font-mono2 text-[10px] text-[var(--mint)]"><MessageSquareText size={12}/>输入原始材料</div>
      <textarea className="input2 min-h-24" placeholder="粘贴与 Claude 的对话、新闻摘录或你的直接想法…" value={form.rawContent} onChange={(e)=>setForm({...form,rawContent:e.target.value})}/>
      <div className="flex gap-1.5"><select className="input2 max-w-24" value={form.source} onChange={(e)=>setForm({...form,source:e.target.value as IdeaSource})}>{(['新闻','推特','自研','其他'] as IdeaSource[]).map((x)=><option key={x}>{x}</option>)}</select><button className="action-primary flex-1" onClick={save}>放入陈化池</button></div>
    </div>
    <div className="space-y-1.5">{ideas.length===0&&<div className="empty-state">暂无待陈化想法</div>}{ideas.map((idea)=>{const age=ageHours(idea.createdAt);const ready=age>=AGING_HOURS;return <article key={idea.id} className={`border rounded-sm p-2.5 ${ready?'border-[rgba(52,211,153,.45)]':'border-[var(--line)]'} bg-[var(--bg2)]`}>
      <div className="flex gap-1.5 items-start"><span className="tag t3">{idea.source}</span><strong className="text-[11.5px] font-medium flex-1">{idea.title}</strong><button className="icon-btn" title="删除" onClick={()=>setIdeas((prev)=>prev.filter((x)=>x.id!==idea.id))}><Trash2 size={10}/></button></div>
      <p className="mt-1.5 text-[10.5px] t3 whitespace-pre-wrap line-clamp-5">{idea.rawContent||idea.note}</p>
      <div className="mt-2 h-[3px] bg-[var(--bg0)]"><div className="h-full bg-[var(--mint)]" style={{width:`${Math.min(100,age/AGING_HOURS*100)}%`}}/></div><div className="mt-1 font-mono2 text-[9px] t4">{ready?`可决策 · ${Math.floor(age)}h`:`陈化中 · ${Math.floor(age)}h / ${AGING_HOURS}h`}</div>
      {idea.aiConversation&&<pre className="mt-2 whitespace-pre-wrap font-sans text-[10.5px] t3 border-l-2 border-[var(--mint)] pl-2">{idea.aiConversation}</pre>}
      <div className="mt-2 flex gap-1"><input className="input2" placeholder="向 AI 追问这个想法…" value={question[idea.id]||''} onChange={(e)=>setQuestion((prev)=>({...prev,[idea.id]:e.target.value}))}/><button className="icon-btn border border-[var(--line)]" title="保存问题" onClick={()=>saveQuestion(idea)}><Send size={12}/></button></div>
    </article>})}</div>
  </Panel>
}
