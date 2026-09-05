import { useCallback, useEffect, useRef, useState } from 'react'

export type SyncStatus = 'loading' | 'synced' | 'local-only'

const readLocal=<T,>(key:string,initial:()=>T,clean:(value:T)=>T)=>{
  try{const raw=window.localStorage.getItem(key);if(raw!=null)return clean(JSON.parse(raw) as T)}catch{/* use initial */}
  return clean(initial())
}

export function useSyncedStorage<T>(key:string,initial:()=>T,clean:(value:T)=>T=(value)=>value){
  const cleanRef=useRef(clean)
  const initialRef=useRef(initial)
  const [value,setValue]=useState<T>(()=>readLocal(key,initialRef.current,cleanRef.current))
  const [status,setStatus]=useState<SyncStatus>('loading')
  const hydrated=useRef(false)
  const endpoint=`${import.meta.env.BASE_URL}api/state/${encodeURIComponent(key)}`

  const loadRemote=useCallback(async(migrate:boolean)=>{
    const response=await fetch(endpoint,{cache:'no-store'})
    if(!response.ok)throw new Error(String(response.status))
    const remote=await response.json() as {initialized:boolean;value:T|null}
    if(remote.initialized){const next=cleanRef.current(remote.value as T);setValue(next);window.localStorage.setItem(key,JSON.stringify(next))}
    else if(migrate&&window.localStorage.getItem(key)!=null){const local=readLocal(key,initialRef.current,cleanRef.current);const saved=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:local})});if(!saved.ok)throw new Error(String(saved.status));setValue(local)}
    setStatus('synced')
  },[endpoint,key])

  useEffect(()=>{loadRemote(true).then(()=>{hydrated.current=true}).catch(()=>{hydrated.current=true;setStatus('local-only')})},[loadRemote])
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')loadRemote(false).catch(()=>setStatus('local-only'))};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[loadRemote])
  useEffect(()=>{
    const cleaned=cleanRef.current(value)
    window.localStorage.setItem(key,JSON.stringify(cleaned))
    if(!hydrated.current)return
    const timer=window.setTimeout(()=>fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:cleaned})}).then(response=>{if(!response.ok)throw new Error(String(response.status));setStatus('synced')}).catch(()=>setStatus('local-only')),350)
    return()=>window.clearTimeout(timer)
  },[endpoint,key,value])
  return[value,setValue,status] as const
}
