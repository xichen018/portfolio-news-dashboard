import { useEffect, useRef, useState } from 'react'
import type { Holding } from '@/types'
import { LS_KEYS } from './useLocalStorage'

type SyncStatus = 'loading' | 'synced' | 'local-only'

const readLocal = (initial:()=>Holding[]) => {
  try { const raw=window.localStorage.getItem(LS_KEYS.holdings); if(raw)return JSON.parse(raw) as Holding[] } catch { /* use seed */ }
  return initial()
}

export function usePersistentHoldings(initial:()=>Holding[]){
  const [holdings,setHoldings]=useState<Holding[]>(()=>readLocal(initial))
  const [syncStatus,setSyncStatus]=useState<SyncStatus>('loading')
  const hydrated=useRef(false)

  useEffect(()=>{
    fetch(`${import.meta.env.BASE_URL}api/holdings`,{cache:'no-store'})
      .then(async response=>{if(!response.ok)throw new Error(String(response.status));return response.json() as Promise<{initialized:boolean;holdings:Holding[]}>})
      .then(async remote=>{
        if(remote.initialized){setHoldings(remote.holdings);window.localStorage.setItem(LS_KEYS.holdings,JSON.stringify(remote.holdings))}
        else {setHoldings([]);window.localStorage.removeItem(LS_KEYS.holdings)}
        hydrated.current=true;setSyncStatus('synced')
      })
      .catch(()=>{hydrated.current=true;setSyncStatus('local-only')})
  },[])

  useEffect(()=>{
    window.localStorage.setItem(LS_KEYS.holdings,JSON.stringify(holdings))
    if(!hydrated.current)return
    const timer=window.setTimeout(()=>fetch(`${import.meta.env.BASE_URL}api/holdings`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({holdings:holdings.filter((item)=>!item.demo)})}).then(response=>{if(!response.ok)throw new Error(String(response.status));setSyncStatus('synced')}).catch(()=>setSyncStatus('local-only')),350)
    return ()=>window.clearTimeout(timer)
  },[holdings])

  return [holdings,setHoldings,syncStatus] as const
}
