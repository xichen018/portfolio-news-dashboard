import { useEffect, useState } from 'react'
import { adaptMonthlyCalendar, adaptReport, type MonthlyCalendarPayload, type ReportPayload } from '@/lib/reportAdapter'
import type { NewsItem } from '@/types'

type LiveNewsPayload = { generated_at:string; news:NewsItem[] }

export function useDailyReport(){
  const [state,setState]=useState<{status:'loading'|'ready'|'error';runId?:string;updatedAt?:string;newsUpdatedAt?:string;events:ReturnType<typeof adaptReport>['events'];news:ReturnType<typeof adaptReport>['news'];decisions:ReturnType<typeof adaptReport>['decisions']}>({status:'loading',events:[],news:[],decisions:[]})
  useEffect(()=>{Promise.all([fetch(`${import.meta.env.BASE_URL}data/latest.json`,{cache:'no-store'}),fetch(`${import.meta.env.BASE_URL}data/monthly-calendar.json`,{cache:'no-store'}),fetch(`${import.meta.env.BASE_URL}data/holdings-news.json`,{cache:'no-store'})]).then(async([reportResponse,calendarResponse,liveNewsResponse])=>{if(!reportResponse.ok)throw new Error(String(reportResponse.status));const payload=await reportResponse.json() as ReportPayload;const calendar=calendarResponse.ok?await calendarResponse.json() as MonthlyCalendarPayload:null;const liveNews=liveNewsResponse.ok?await liveNewsResponse.json() as LiveNewsPayload:null;const adapted=adaptReport(payload);const macroTask=payload.tasks.find((task)=>task.task_id==='macro_market');const monthEvents=calendar?adaptMonthlyCalendar(calendar,{marketRegime:macroTask?.market_regime_zh,portfolioImplication:macroTask?.portfolio_implications_zh}):[];const reportEvents=calendar?adapted.events.filter((item)=>item.id.startsWith('report-macro-')):adapted.events;const seen=new Set<string>();const news=[...(liveNews?.news||[]),...adapted.news].filter((item)=>{const key=`${item.ticker}|${item.title}`;if(seen.has(key))return false;seen.add(key);return true});setState({status:'ready',runId:payload.run_context.run_id,updatedAt:payload.run_context.scheduled_for,newsUpdatedAt:liveNews?.generated_at,events:[...monthEvents,...reportEvents],news,decisions:adapted.decisions})}).catch(()=>setState({status:'error',events:[],news:[],decisions:[]}))},[])
  return state
}
