interface TickerBannerProps {
  items: string[]
}

export default function TickerBanner({ items }: TickerBannerProps) {
  const doubled = [...items, ...items]
  return (
    <div className="marquee bg-[var(--bg0)] border-b border-[var(--line)] h-8 flex items-center">
      <div className="marquee-inner">
        {doubled.map((it, i) => (
          <span key={i} className="font-mono2 text-[11px] t3 px-5 whitespace-nowrap">
            <span className="text-[var(--cyan)] mr-2">▸</span>
            {it}
          </span>
        ))}
      </div>
    </div>
  )
}
