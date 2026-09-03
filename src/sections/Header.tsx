import { useEffect, useState } from 'react'
import { pad, weekdayCN } from '@/lib/format'
import { exportAll, importAll, resetAll } from '@/hooks/useLocalStorage'
import { Download, RotateCcw, Upload } from 'lucide-react'

interface HeaderProps {
  tradesUsed: number
  tradesLimit: number
  dataStatus: 'loading' | 'ready' | 'error'
  updatedAt?: string
}

export default function Header({ tradesUsed, tradesLimit, dataStatus, updatedAt }: HeaderProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const exhausted = tradesUsed >= tradesLimit

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-12 bg-[var(--bg0)] border-b border-[var(--line)] flex items-center gap-3 px-3">
      {/* radar logo */}
      <span className="relative flex items-center justify-center w-5 h-5 flex-none">
        <span className="absolute inset-0 rounded-full border border-[rgba(0,255,65,0.4)]" />
        <span className="dot dot-pulse bg-[var(--term)]" />
      </span>
      <div className="flex items-baseline gap-2 min-w-0">
        <h1 className="text-[13px] font-semibold tracking-wide whitespace-nowrap">每日投资驾驶舱</h1>
        <span className="font-mono2 text-[9px] tracking-[0.22em] t4 uppercase hidden sm:inline">Daily Cockpit</span>
      </div>
      <span className={`tag flex-none ${dataStatus === 'ready' ? 'border-[rgba(52,211,153,.45)] text-[var(--mint)]' : 'border-[var(--line)] t3'}`} title={updatedAt ? `数据生成时间 ${updatedAt}` : '正在读取日报数据'}>
        {dataStatus === 'ready' ? 'VERIFIED' : dataStatus === 'loading' ? 'LOADING' : 'NO DATA'}
      </span>

      <span className="flex-1" />

      {/* 本月交易额度 */}
      <span
        className={`tag flex-none ${exhausted ? 'border-[rgba(248,113,113,0.5)] text-[var(--red)]' : 'border-[var(--line)] t2'}`}
        title="本月已用交易次数 / 上限"
      >
        交易 {tradesUsed}/{tradesLimit}
      </span>

      <div className="hidden md:flex flex-col items-end leading-none flex-none">
        <span className="font-mono2 text-[13px] t1">
          {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
        </span>
        <span className="font-mono2 text-[9px] t4 mt-1">
          {now.getFullYear()}-{pad(now.getMonth() + 1)}-{pad(now.getDate())} {weekdayCN(now)}
        </span>
      </div>

      <button className="icon-btn flex-none" title="导出数据备份" onClick={exportAll} aria-label="导出数据备份">
        <Download size={14} />
      </button>
      <label className="icon-btn flex-none cursor-pointer" title="导入数据备份" aria-label="导入数据备份">
        <Upload size={14} />
        <input
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) importAll(file).catch((error: unknown) => window.alert(error instanceof Error ? error.message : '导入失败'))
          }}
        />
      </label>
      <button
        className="icon-btn flex-none"
        title="清空本地修改，恢复示例数据"
        aria-label="恢复示例数据"
        onClick={() => {
          if (window.confirm('将清空你在本机的全部修改并恢复示例数据，确定？')) resetAll()
        }}
      >
        <RotateCcw size={14} />
      </button>
    </header>
  )
}
