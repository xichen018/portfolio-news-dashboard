import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { LogIn } from 'lucide-react'

interface Props { children: (user:string, logout:()=>Promise<void>)=>ReactNode }

export default function AuthGate({children}:Props){
  const [user,setUser]=useState<string|null>(null)
  const [checking,setChecking]=useState(true)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  useEffect(()=>{fetch(`${import.meta.env.BASE_URL}api/auth/session`,{cache:'no-store'}).then(async response=>{
    if(!response.ok)throw new Error()
    const payload=await response.json() as {user:string};setUser(payload.user)
  }).catch(()=>setUser(null)).finally(()=>setChecking(false))},[])

  const login=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setError('')
    const form=new FormData(event.currentTarget)
    const response=await fetch(`${import.meta.env.BASE_URL}api/auth/session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:form.get('user'),password:form.get('password')})})
    if(response.ok){const payload=await response.json() as {user:string};setUser(payload.user)}
    else setError('登录名或密码不正确')
    setBusy(false)
  }
  const logout=async()=>{await fetch(`${import.meta.env.BASE_URL}api/auth/session`,{method:'DELETE'});Object.keys(localStorage).filter(key=>key.startsWith('cockpit.')).forEach(key=>localStorage.removeItem(key));setUser(null)}

  if(checking)return <div className="min-h-screen bg-[var(--bg0)] grid place-items-center t3 font-mono2 text-xs">VERIFYING SESSION</div>
  if(!user)return <main className="min-h-screen bg-[var(--bg0)] grid place-items-center p-5">
    <form onSubmit={login} className="w-full max-w-[360px] border border-[var(--line)] bg-[var(--bg1)] p-6 rounded-sm">
      <div className="flex items-center gap-3 mb-7"><span className="relative flex items-center justify-center w-8 h-8"><span className="absolute inset-0 rounded-full border border-[rgba(0,255,65,0.4)]"/><span className="dot dot-pulse bg-[var(--term)]"/></span><div><h1 className="text-base font-semibold">每日投资驾驶舱</h1><p className="font-mono2 text-[9px] t4 mt-1">PRIVATE PORTFOLIO</p></div></div>
      <label className="block text-[11px] t3 mb-1.5" htmlFor="user">登录名</label><input className="input2 mb-4" id="user" name="user" autoComplete="username" required autoFocus />
      <label className="block text-[11px] t3 mb-1.5" htmlFor="password">密码</label><input className="input2" id="password" name="password" type="password" autoComplete="current-password" required />
      {error&&<p className="text-[11px] text-[var(--red)] mt-3" role="alert">{error}</p>}
      <button className="mt-5 w-full h-9 border border-[rgba(34,211,238,.55)] text-[var(--cyan)] hover:bg-[rgba(34,211,238,.08)] flex items-center justify-center gap-2 rounded-sm disabled:opacity-50" disabled={busy}><LogIn size={14}/>{busy?'登录中':'登录'}</button>
    </form>
  </main>
  return <>{children(user,logout)}</>
}
