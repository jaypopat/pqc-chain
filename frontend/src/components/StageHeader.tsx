interface StageHeaderProps {
  num: '01' | '02' | '03'
  title: string
  kicker: string
  blurb: string
}

export default function StageHeader({ num, title, kicker, blurb }: StageHeaderProps) {
  return (
    <header className="pt-12 pb-10">
      <div className="flex items-baseline gap-7">
        <div className="numeral text-[112px] md:text-[140px] tabular-nums">{num}</div>
        <div className="flex-1">
          <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-violet mb-2">{kicker}</div>
          <h1 className="text-[44px] md:text-[52px] font-semibold tracking-[-0.025em] leading-none text-ink">{title}</h1>
        </div>
      </div>
      <p className="mt-7 text-[15px] leading-[1.6] text-ink/75 max-w-[58ch] text-balance">{blurb}</p>
      <div className="rule-x mt-9" />
    </header>
  )
}
