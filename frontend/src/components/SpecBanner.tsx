import { useRuntimeVersion } from '../hooks/useRuntimeVersion'

export default function SpecBanner() {
  const v = useRuntimeVersion()

  if (!v) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-100 border border-zinc-200 text-xs font-mono text-zinc-500">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse" />
        connecting…
      </div>
    )
  }

  const isV2 = v.spec >= 200
  const label = isV2 ? 'v2 ML-DSA' : 'v1 ECDSA'
  const bg = isV2 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-zinc-100 border-zinc-200 text-zinc-700'
  const dot = isV2 ? 'bg-emerald-500' : 'bg-zinc-400'

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 border text-xs font-mono ${bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="font-semibold">{label}</span>
      <span className="text-zinc-500">
        spec=
        {v.spec}
      </span>
      <span className="text-zinc-500">
        tx=
        {v.tx}
      </span>
    </div>
  )
}
