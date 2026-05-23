import type { Tab } from '../components/Nav'
import RuntimeSidecar from '../components/RuntimeSidecar'

interface HomeProps {
  goto: (t: Tab) => void
}

const STAGES: { num: '01' | '02' | '03', tab: Tab, title: string, kicker: string, body: string }[] = [
  {
    num: '01',
    tab: 'commit',
    kicker: 'Pre-quantum lockbox',
    title: 'Commit',
    body: 'Generate an ML-DSA-44 keypair in your browser. Hash its public key with a domain tag and store the 32-byte commitment on-chain, signed with your classical wallet.',
  },
  {
    num: '02',
    tab: 'upgrade',
    kicker: 'Runtime swap',
    title: 'Upgrade',
    body: 'A sudo extrinsic flips the runtime to v2. Classical transfers go behind a CallFilter; post-quantum spending opens up. No fork, no restart.',
  },
  {
    num: '03',
    tab: 'pq-send',
    kicker: 'Lazy reveal',
    title: 'Leap',
    body: 'Sign a transfer with your ML-DSA-44 secret key locally and submit it unsigned. The chain reveals your pubkey on first spend, verifies the signature, and moves the funds.',
  },
]

export default function Home({ goto }: HomeProps) {
  return (
    <div className="max-w-6xl mx-auto px-6 pb-24">
      {/* HERO */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)] gap-12 pt-16 pb-8 items-end">
        <div>
          <div className="eyebrow mb-7">Post-quantum, lazily revealed</div>
          <h1 className="font-display text-[68px] md:text-[92px] leading-[0.95] tracking-[-0.04em] font-semibold text-ink text-balance">
            <span className="block">A chain that</span>
            <span className="block">walks before</span>
            <span className="block">it runs,</span>
            <span className="block">
              then
              {' '}
              <span className="italic-display violet-highlight">leaps.</span>
            </span>
          </h1>
          <p className="mt-8 max-w-[52ch] text-[16px] leading-[1.6] text-ink/75 text-balance">
            QuantumLeap boots on ECDSA. A forkless runtime upgrade swaps in
            FIPS-204 ML-DSA verification, and users reveal their post-quantum
            public keys lazily — only on first spend.
          </p>
        </div>

        <div className="lg:pb-3">
          <RuntimeSidecar />
        </div>
      </section>

      {/* RIBBON */}
      <section className="mt-14">
        <div className="rule-x mb-10" />
        <div className="grid grid-cols-1 md:grid-cols-3 -mx-2">
          {STAGES.map((s, i) => (
            <button
              key={s.num}
              type="button"
              onClick={() => goto(s.tab)}
              className="group relative text-left px-7 py-8 mx-2 transition-all hover:bg-white/55 focus:outline-none"
            >
              <div className="numeral text-[80px] md:text-[88px] tabular-nums">{s.num}</div>
              <div className="mt-4 text-[10px] font-mono tracking-[0.22em] uppercase text-violet">{s.kicker}</div>
              <div className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-ink">{s.title}</div>
              <p className="mt-3 text-[13px] leading-[1.55] text-ink/70 max-w-[36ch]">{s.body}</p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-mono tracking-[0.16em] uppercase text-ink/60 group-hover:text-violet transition-colors">
                <span>begin {s.num}</span>
                <span className="icon-[mdi--arrow-right] text-base transition-transform group-hover:translate-x-1" />
              </div>
              {i < STAGES.length - 1 && (
                <span className="hidden md:block absolute -right-[9px] top-12 w-4 h-4 bg-paper border-t border-r border-rule rotate-45 z-10" />
              )}
            </button>
          ))}
        </div>
        <div className="rule-x mt-2" />
      </section>

      {/* DIFF */}
      <section className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-px bg-rule border border-rule">
        <div className="bg-paper/80 p-8">
          <div className="label-tag mb-5">Before · runtime v1</div>
          <Diff k="verifier" v="ECDSA" />
          <Diff k="spec_version" v="100" />
          <Diff k="tx_version" v="1" />
          <Diff k="balances.transfer" v="open" />
          <Diff k="pq_wallet.pq_transfer" v="—" muted />
        </div>
        <div className="bg-violet/[0.04] p-8 relative">
          <div className="label-tag mb-5 text-violet">After · runtime v2</div>
          <Diff k="verifier" v="ML-DSA-44" hot />
          <Diff k="spec_version" v="200" hot />
          <Diff k="tx_version" v="2" hot />
          <Diff k="balances.transfer" v="CallFiltered" muted />
          <Diff k="pq_wallet.pq_transfer" v="open" hot />
        </div>
      </section>
    </div>
  )
}

function Diff({ k, v, hot, muted }: { k: string, v: string, hot?: boolean, muted?: boolean }) {
  const color = hot ? 'text-violet font-semibold' : muted ? 'text-mut' : 'text-ink'
  return (
    <div className="flex items-baseline justify-between py-2.5 dash-row last:border-0">
      <span className="text-[11px] font-mono text-mut">{k}</span>
      <span className={`text-[13px] font-mono ${color}`}>{v}</span>
    </div>
  )
}
