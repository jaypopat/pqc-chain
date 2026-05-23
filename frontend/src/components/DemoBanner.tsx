import { useEffect, useState } from 'react'
import { useCurrentBlock } from '../hooks/useCurrentBlock'

// Grace window before escalating a missing connection to a full warning.
// Keeps the local demo from flashing the banner during the ~6s first-block wait.
const GRACE_MS = 6000

export default function DemoBanner() {
  const { isConnected } = useCurrentBlock('ql')
  const [graceElapsed, setGraceElapsed] = useState(false)

  useEffect(() => {
    const t = setTimeout(setGraceElapsed, GRACE_MS, true)
    return () => clearTimeout(t)
  }, [])

  // Connected to a local node — the live demo. No banner needed.
  if (isConnected)
    return null

  // Still inside the grace window: a quiet "connecting" line, not an alarm.
  if (!graceElapsed) {
    return (
      <div className="bg-paper-2/60 border-b border-rule">
        <div className="max-w-6xl mx-auto px-6 py-1.5 text-[11px] font-mono text-mut flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-mut-2 live-dot" />
          connecting to local node · ws://127.0.0.1:9944
        </div>
      </div>
    )
  }

  // No node after the grace window — this is the deployed review build.
  return (
    <div className="bg-amber-wash/70 border-b border-amber-ink/25">
      <div className="max-w-6xl mx-auto px-6 py-2.5 text-amber-ink text-[13px] flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" aria-hidden>⚠</span>
        <div>
          <span className="font-semibold">Live demo runs against a local QuantumLeap node.</span>
          {' '}
          This frontend is deployed for review only — a Substrate node with custom
          host functions can't run on serverless hosting, so the chain runs locally
          during the presentation.
          {' '}
          To run end-to-end: clone the repo and
          {' '}
          <code className="font-mono bg-white/50 px-1 py-0.5 rounded">just demo-reset</code>
          .
          {' '}
          The UI, architecture, and code are fully live here.
        </div>
      </div>
    </div>
  )
}
