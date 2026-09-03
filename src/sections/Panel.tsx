import type { ReactNode } from 'react'

interface PanelProps {
  label: string
  count?: number
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export default function Panel({ label, count, actions, children, className = '', bodyClassName = '' }: PanelProps) {
  return (
    <section className={`panel w-full ${className}`}>
      <header className="panel-head">
        <span className="panel-label">{label}</span>
        {typeof count === 'number' && (
          <span className="font-mono2 text-[10px] px-1.5 py-0.5 border border-[var(--line)] rounded-sm t3">{count}</span>
        )}
        <span className="flex-1" />
        {actions}
      </header>
      <div className={`panel-body ${bodyClassName}`}>{children}</div>
    </section>
  )
}
