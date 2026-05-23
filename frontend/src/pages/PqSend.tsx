export default function PqSend() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Stage 3</div>
      <h2 className="text-3xl tracking-tight font-semibold text-zinc-950 mb-4">PQ Send</h2>
      <p className="text-sm text-zinc-600 mb-8 max-w-xl">
        Sign a transfer payload with your ML-DSA-44 secret key in the browser,
        and submit it unsigned. The chain reveals your pubkey on first spend.
      </p>
      <div className="border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 font-mono">
        F5 placeholder — fan-out target
      </div>
    </div>
  )
}
