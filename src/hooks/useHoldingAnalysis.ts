import { useEffect, useState } from 'react'

export interface HoldingAnalysis { ticker:string; text:string; technical_facts:Record<string,unknown> }

export function useHoldingAnalysis(){
  const [analyses,setAnalyses]=useState<HoldingAnalysis[]>([])
  const [updatedAt,setUpdatedAt]=useState<string|undefined>()
  const [refreshing,setRefreshing]=useState(false)
  const load=async()=>{const response=await fetch(`${import.meta.env.BASE_URL}api/holding-analysis`,{cache:'no-store'});if(!response.ok)throw new Error();const payload=await response.json() as {generated_at?:string;analyses:HoldingAnalysis[]};setAnalyses(payload.analyses||[]);setUpdatedAt(payload.generated_at)}
  useEffect(()=>{void load().catch(()=>undefined)},[])
  const refresh=async()=>{setRefreshing(true);try{const response=await fetch(`${import.meta.env.BASE_URL}api/holding-analysis/refresh`,{method:'POST'});if(!response.ok)throw new Error();const payload=await response.json() as {generated_at:string;analyses:HoldingAnalysis[]};setAnalyses(payload.analyses);setUpdatedAt(payload.generated_at)}finally{setRefreshing(false)}}
  return {analyses,updatedAt,refreshing,refresh}
}
