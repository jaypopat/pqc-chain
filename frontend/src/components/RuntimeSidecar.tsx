import { useEffect, useRef, useState } from 'react'
import { usePqUpgrade } from '../hooks/usePqUpgrade'

const ENDPOINT = 'ws://127.0.0.1:9944'

function useRollValue(value: string | number) {
  const [prev, setPrev] = useState<string | number | null>(null)
  const [rolling, setRolling] = useState(false)
  const last = useRef<string | number | null>(null)

  useEffect(() => {
    if (last.current != null && last.current !== value) {
      setPrev(last.current)
      setRolling(true)
      const t = window.setTimeout(() => setRolling(false), 720)
      last.current = value
      return () => window.clearTimeout(t)
    }
    last.current = value
  }, [value])

  return { rolling, prev }
}

function Roll({ value, hot = false, mono = true }: { value: string | number, hot?: boolean, mono?: boolean }) {
  const { rolling, prev } = useRollValue(value)
  const family = mono ? 'font-mono' : ''
  const color = hot ? 'text-violet font-semibold' : 'text-ink'
  if (!rolling) {
    return <span className={`${family} ${color}`}>{value}</span>
  }
  return (
    <span className={`${family} ${color} relative inline-block overflow-hidden align-baseline`} style={{ minWidth: '2ch' }}>
      <span className="invisible">{value}</span>
      <span className="absolute inset-0 roll-out">{prev}</span>
      <span className="absolute inset-0 roll-in">{value}</span>
    </span>
  )
}

interface RuntimeSidecarProps {
  variant?: 'panel' | 'compact'
}

export default function RuntimeSidecar({ variant = 'panel' }: RuntimeSidecarProps) {
  const { current, bestBlock, transition, isPostQuantum } = usePqUpgrade()

  // Toggle data-pq on <html> when post-quantum mode active
  useEffect(() => {
    if (isPostQuantum) {
      document.documentElement.setAttribute('data-pq', 'active')
    }
    else {
      document.documentElement.removeAttribute('data-pq')
    }
  }, [isPostQuantum])

  const halo = transition ? 'halo' : ''

  if (!current) {
    return (
      <aside className={`surface p-5 ${variant === 'compact' ? 'text-[11px]' : ''}`}>
        <div className="label-tag mb-3">Runtime</div>
        <div className="text-mut font-mono text-[12px] inline-flex items-center gap-2">
          <span className="icon-[mdi--lan-pending] animate-pulse" />
          connecting to {ENDPOINT}…
        </div>
      </aside>
    )
  }

  return (
    <aside className={`surface p-5 ${halo}`}>
      <header className="flex items-center justify-between mb-4">
        <div className="label-tag">Runtime</div>
        <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-success">
          <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-success" />
          live
        </div>
      </header>

      <dl className="space-y-0">
        <Row k="name" v={<span className="font-mono text-ink">{current.name}</span>} />
        <Row k="impl" v={<Roll value={current.impl} mono />} />
        <Row k="spec_version" v={<Roll value={current.spec} hot={!!transition} mono />} />
        <Row k="tx_version" v={<Roll value={current.tx} hot={!!transition} mono />} />
        <Row k="verifier" v={<Roll value={current.verifier} hot={!!transition || isPostQuantum} mono />} last />
      </dl>

      <div className="mt-5 pt-4 border-t border-rule">
        <div className="label-tag mb-1">Best block</div>
        <div className="font-mono text-ink text-[17px] font-semibold">
          #<span className="tabular-nums">{bestBlock || '—'}</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-rule">
        <div className="label-tag mb-1">Endpoint</div>
        <div className="font-mono text-ink/80 text-[11px] break-all">{ENDPOINT}</div>
      </div>

      {transition && (
        <div className="mt-4 -mx-5 -mb-5 px-5 py-3 bg-violet/[0.07] border-t border-violet/30">
          <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-violet">runtime swapped</div>
          <div className="mt-1 text-[12px] text-ink/80 leading-snug">
            spec {transition.from.spec} → <span className="font-semibold text-violet">{transition.to.spec}</span>
            <span className="text-ink/40"> · </span>
            verifier <span className="italic-display">{transition.to.verifier.toLowerCase()}</span> live
          </div>
        </div>
      )}
    </aside>
  )
}

function Row({ k, v, last }: { k: string, v: React.ReactNode, last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between py-2 ${last ? '' : 'dash-row'}`}>
      <dt className="text-[11px] font-mono text-mut">{k}</dt>
      <dd className="text-[12px]">{v}</dd>
    </div>
  )
}
