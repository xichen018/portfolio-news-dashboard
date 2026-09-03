import { useEffect, useState } from 'react'
import { adaptReport, type ReportPayload } from '@/lib/reportAdapter'

export function useDailyReport(){
  const [state,setState]=useState<{status:'loading'|'ready'|'error';runId?:string;updatedAt?:string;events:ReturnType<typeof adaptReport>['events'];news:ReturnType<typeof adaptReport>['news']}>({status:'loading',events:[],news:[]})
  useEffect(()=>{fetch(`${import.meta.env.BASE_URL}data/latest.json`,{cache:'no-store'}).then((response)=>{if(!response.ok)throw new Error(String(response.status));return response.json()}).then((payload:ReportPayload)=>{const adapted=adaptReport(payload);setState({status:'ready',runId:payload.run_context.run_id,updatedAt:payload.run_context.scheduled_for,...adapted})}).catch(()=>setState({status:'error',events:[],news:[]}))},[])
  return state
}
