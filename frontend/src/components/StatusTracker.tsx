export type StepState = 'idle' | 'active' | 'done' | 'error'

interface Step {
  label: string
  state: StepState
  detail?: string
}

interface StatusTrackerProps {
  steps: Step[]
}

export default function StatusTracker({ steps }: StatusTrackerProps) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1
        return (
          <li key={i} className="relative flex items-start gap-4 pb-5 last:pb-0">
            {!isLast && <span className="absolute left-[9px] top-5 bottom-0 w-px bg-rule" />}
            <Indicator state={s.state} />
            <div className="flex-1 min-w-0 -mt-0.5">
              <div className={`text-[13px] leading-snug ${labelColor(s.state)}`}>{s.label}</div>
              {s.detail && (
                <div className="text-[11px] text-mut font-mono mt-1 break-all">{s.detail}</div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Indicator({ state }: { state: StepState }) {
  const ring = 'absolute inset-0 rounded-full border-2'
  if (state === 'done') {
    return (
      <span className="relative inline-block w-[18px] h-[18px] mt-0.5">
        <span className={`${ring} border-violet bg-violet`} />
        <span className="absolute inset-0 flex items-center justify-center text-paper">
          <span className="icon-[mdi--check] text-[12px]" />
        </span>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="relative inline-block w-[18px] h-[18px] mt-0.5">
        <span className={`${ring} border-violet`} />
        <span className="absolute inset-[3px] rounded-full bg-violet ring-pulse" />
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="relative inline-block w-[18px] h-[18px] mt-0.5">
        <span className={`${ring} border-rose-ink bg-rose-wash`} />
        <span className="absolute inset-0 flex items-center justify-center text-rose-ink">
          <span className="icon-[mdi--close] text-[12px]" />
        </span>
      </span>
    )
  }
  return (
    <span className="relative inline-block w-[18px] h-[18px] mt-0.5">
      <span className={`${ring} border-rule-strong bg-white/60`} />
    </span>
  )
}

function labelColor(s: StepState) {
  if (s === 'done') return 'text-ink'
  if (s === 'active') return 'text-ink font-medium'
  if (s === 'error') return 'text-rose-ink'
  return 'text-mut'
}
