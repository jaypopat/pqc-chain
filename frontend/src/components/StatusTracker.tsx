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
    <ol className="space-y-2">
      {steps.map((s, i) => {
        let icon = 'icon-[mdi--circle-outline] text-zinc-300'
        let label = 'text-zinc-400'
        if (s.state === 'active') {
          icon = 'icon-[mdi--loading] text-emerald-600 animate-spin'
          label = 'text-zinc-900'
        }
        if (s.state === 'done') {
          icon = 'icon-[mdi--check-circle] text-emerald-600'
          label = 'text-zinc-700'
        }
        if (s.state === 'error') {
          icon = 'icon-[mdi--alert-circle] text-rose-600'
          label = 'text-rose-700'
        }
        return (
          <li key={i} className="flex items-start gap-3">
            <span className={`${icon} mt-0.5`} />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-mono ${label}`}>
                [
                {i + 1}
                /
                {steps.length}
                ]
                {' '}
                {s.label}
              </div>
              {s.detail && (
                <div className="text-xs text-zinc-500 font-mono mt-0.5 break-all">{s.detail}</div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
