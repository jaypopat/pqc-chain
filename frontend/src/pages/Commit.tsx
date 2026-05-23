export default function Commit() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Stage 1</div>
      <h2 className="text-3xl tracking-tight font-semibold text-zinc-950 mb-4">Commit</h2>
      <p className="text-sm text-zinc-600 mb-8 max-w-xl">
        Generate a post-quantum keypair in your browser and commit the hash of
        its public key on-chain, signed with your classical wallet.
      </p>
      <div className="border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 font-mono">
        F3 placeholder — fan-out target
      </div>
    </div>
  )
}
