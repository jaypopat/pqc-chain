export default function Footer() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-[11px] font-mono text-mut">
        <span>
          QuantumLeap · ECDSA
          <span className="text-violet">→</span>
          {' '}
          ML-DSA-44 · Substrate solochain
        </span>
        <span className="tracking-[0.18em] uppercase">post-quantum, lazily revealed</span>
      </div>
    </footer>
  )
}
