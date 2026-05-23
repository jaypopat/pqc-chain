import type { RuntimeVersion } from './useRuntimeVersion'
import { useEffect, useRef, useState } from 'react'
import { useRuntimeVersion } from './useRuntimeVersion'

export interface SpecSnapshot {
  spec: number
  tx: number
  name: string
  verifier: string
  impl: string
}

export interface PqTransition {
  from: SpecSnapshot
  to: SpecSnapshot
  startedAt: number
}

function snap(v: RuntimeVersion): SpecSnapshot {
  return {
    spec: v.spec,
    tx: v.tx,
    name: v.name,
    impl: v.spec >= 200 ? 'quantumleap_v2' : 'quantumleap_v1',
    verifier: v.spec >= 200 ? 'ML-DSA-44' : 'ECDSA',
  }
}

export function usePqUpgrade() {
  const v = useRuntimeVersion()
  const [transition, setTransition] = useState<PqTransition | null>(null)
  const lastSpec = useRef<number | null>(null)

  useEffect(() => {
    if (!v)
      return
    const prev = lastSpec.current
    if (prev != null && prev !== v.spec) {
      const fromSnap = { ...snap(v), spec: prev, tx: prev >= 200 ? 2 : 1, impl: prev >= 200 ? 'quantumleap_v2' : 'quantumleap_v1', verifier: prev >= 200 ? 'ML-DSA-44' : 'ECDSA' }
      setTransition({
        from: fromSnap,
        to: snap(v),
        startedAt: Date.now(),
      })
      const t = window.setTimeout(setTransition, 2400, null)
      lastSpec.current = v.spec
      return () => window.clearTimeout(t)
    }
    lastSpec.current = v.spec
  }, [v])

  return {
    current: v ? snap(v) : null,
    bestBlock: v?.blockNumber ?? 0,
    transition,
    isPostQuantum: v != null && v.spec >= 200,
  }
}
