import { useEffect, useState } from 'react'
import { adaptMonthlyCalendar, adaptReport, type MonthlyCalendarPayload, type ReportPayload } from '@/lib/reportAdapter'

export function useDailyReport(){
  const [state,setState]=useState<{status:'loading'|'ready'|'error';runId?:string;updatedAt?:string;events:ReturnType<typeof adaptReport>['events'];news:ReturnType<typeof adaptReport>['news'];decisions:ReturnType<typeof adaptReport>['decisions']}>({status:'loading',events:[],news:[],decisions:[]})
  useEffect(()=>{Promise.all([fetch(`${import.meta.env.BASE_URL}data/latest.json`,{cache:'no-store'}),fetch(`${import.meta.env.BASE_URL}data/monthly-calendar.json`,{cache:'no-store'})]).then(async([reportResponse,calendarResponse])=>{if(!reportResponse.ok)throw new Error(String(reportResponse.status));const payload=await reportResponse.json() as ReportPayload;const calendar=calendarResponse.ok?await calendarResponse.json() as MonthlyCalendarPayload:null;const adapted=adaptReport(payload);const monthEvents=calendar?adaptMonthlyCalendar(calendar):[];const reportEvents=calendar?adapted.events.filter((item)=>item.id.startsWith('report-macro-')):adapted.events;setState({status:'ready',runId:payload.run_context.run_id,updatedAt:payload.run_context.scheduled_for,events:[...monthEvents,...reportEvents],news:adapted.news,decisions:adapted.decisions})}).catch(()=>setState({status:'error',events:[],news:[],decisions:[]}))},[])
  return state
}
