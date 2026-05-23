export default function Upgrade() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Stage 2</div>
      <h2 className="text-3xl tracking-tight font-semibold text-zinc-950 mb-4">Upgrade</h2>
      <p className="text-sm text-zinc-600 mb-8 max-w-xl">
        Drop the v2 runtime WASM and flip the chain forklessly. Signed by the
        dev sudo key — no wallet popup on a multi-hundred-kB extrinsic.
      </p>
      <div className="border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 font-mono">
        F4 placeholder — fan-out target
      </div>
    </div>
  )
}
