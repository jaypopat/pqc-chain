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
    title: 'Transfer',
    body: 'Send native tokens, signed with your ML-DSA-44 secret key in the browser and submitted unsigned. On first spend, the chain reveals your pubkey, verifies the signature, and moves the balance.',
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
          <RuntimeSidecar variant="hero" />
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

      {/* DIFF — read each row left-to-right through the arrow */}
      <section className="mt-16 surface px-8 py-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-6 pb-4 border-b border-rule">
          <div className="label-tag">Before · runtime v1</div>
          <div />
          <div className="label-tag text-violet">After · runtime v2</div>
        </div>

        <TransformRow
          k="verifier"
          before="ECDSA"
          after="ML-DSA-44"
          accent="hero"
        />
        <TransformRow
          k="balances.transfer"
          before="open"
          after="CallFiltered"
          afterLocked
        />
        <TransformRow
          k="pq_wallet.pq_transfer"
          before=""
          beforeAbsent
          after="open"
          afterOpened
        />

        <div className="mt-6 pt-4 border-t border-rule grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <div className="font-mono text-[12px] text-ink tabular-nums">spec_version 100 · tx_version 1</div>
          <span className="icon-[mdi--arrow-right] text-[14px] text-ink/40" />
          <div className="font-mono text-[12px] text-ink tabular-nums">spec_version <span className="text-violet font-semibold">200</span> · tx_version <span className="text-violet font-semibold">2</span></div>
        </div>
      </section>
    </div>
  )
}

interface TransformRowProps {
  k: string
  before: string
  after: string
  beforeAbsent?: boolean   // render before as a dashed slot (no value yet)
  afterLocked?: boolean    // after is closed off — show with a lock icon
  afterOpened?: boolean    // after is newly available — render in violet
  accent?: 'hero'
}

function TransformRow({ k, before, after, beforeAbsent, afterLocked, afterOpened, accent }: TransformRowProps) {
  const isHero = accent === 'hero'
  const size = isHero ? 'text-[22px] font-semibold tracking-[-0.015em]' : 'text-[16px] font-medium'

  const beforeNode = beforeAbsent
    ? <span className={`font-mono ${size} text-ink/35`}>(not available)</span>
    : <span className={`font-mono ${size} text-ink`}>{before}</span>

  const afterNode = afterLocked
    ? (
        <span className={`font-mono ${size} text-ink inline-flex items-center gap-2`}>
          <span className="icon-[mdi--lock-outline] text-[18px] text-ink/55" />
          {after}
        </span>
      )
    : (isHero || afterOpened)
        ? <span className={`font-mono ${size} text-violet font-semibold`}>{after}</span>
        : <span className={`font-mono ${size} text-ink`}>{after}</span>

  return (
    <div className="py-5 border-b border-rule last:border-0">
      <div className="text-[10px] font-mono tracking-[0.22em] uppercase text-mut mb-2">{k}</div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div>{beforeNode}</div>
        <span className={`icon-[mdi--arrow-right] text-[20px] ${isHero || afterOpened ? 'text-violet' : 'text-ink/40'}`} />
        <div>{afterNode}</div>
      </div>
    </div>
  )
}
