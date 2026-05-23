import type { Tab } from '../components/Nav'
import { useEffect, useState } from 'react'
import { useChain } from '../hooks/useChain'
import { useRuntimeVersion } from '../hooks/useRuntimeVersion'
import { shortHex } from '../utils/formatters'

interface HomeProps {
  goto: (t: Tab) => void
}

const STEPS: { tab: Tab, num: string, title: string, body: string }[] = [
  {
    tab: 'commit',
    num: '01',
    title: 'Commit',
    body: 'Generate an ML-DSA-44 keypair in your browser. Hash its public key with a domain tag and store the 32-byte commitment on-chain, signed with your classical wallet.',
  },
  {
    tab: 'upgrade',
    num: '02',
    title: 'Upgrade',
    body: 'A sudo extrinsic flips the runtime to v2. Classical Balances::transfer goes behind a CallFilter; post-quantum spending opens up. No node restart.',
  },
  {
    tab: 'pq-send',
    num: '03',
    title: 'PQ Send',
    body: 'Sign a transfer with your ML-DSA-44 secret key locally and submit it unsigned. The chain reveals your pubkey on first spend, verifies the signature, and moves the funds.',
  },
]

export default function Home({ goto }: HomeProps) {
  const v = useRuntimeVersion()
  const { client } = useChain()
  const [best, setBest] = useState<number>(0)
  const [genesis, setGenesis] = useState<string>('')

  useEffect(() => {
    const sub = client.bestBlocks$.subscribe((b) => {
      if (b[0]) setBest(b[0].number)
    })
    client.getChainSpecData().then(s => setGenesis(s.genesisHash))
    return () => sub.unsubscribe()
  }, [client])

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
      <section className="space-y-3">
        <h1 className="text-4xl tracking-tight font-semibold text-zinc-950">
          A chain that walks before it runs,
          <br />
          {' '}
          <span className="text-emerald-600">then leaps post-quantum.</span>
        </h1>
        <p className="text-zinc-600 leading-relaxed max-w-xl">
          QuantumLeap boots on ECDSA. A forkless runtime upgrade swaps in
          FIPS-204 ML-DSA verification, and users reveal their post-quantum
          public keys lazily — only on first spend.
        </p>
      </section>

      <section>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map(s => (
            <button
              key={s.num}
              type="button"
              onClick={() => goto(s.tab)}
              className="text-left bg-white border border-zinc-200 p-5 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              <div className="text-xs font-mono text-emerald-600 mb-2">{s.num}</div>
              <div className="text-base font-semibold text-zinc-950 mb-1">{s.title}</div>
              <div className="text-xs text-zinc-600 leading-relaxed">{s.body}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Chain</div>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-6 text-xs font-mono border border-zinc-200 bg-zinc-50 p-4">
          <dt className="text-zinc-500">Endpoint</dt>
          <dd className="text-zinc-800">ws://127.0.0.1:9944</dd>
          <dt className="text-zinc-500">Name</dt>
          <dd className="text-zinc-800">{v?.name ?? '…'}</dd>
          <dt className="text-zinc-500">spec_version</dt>
          <dd className="text-zinc-800">{v?.spec ?? '…'}</dd>
          <dt className="text-zinc-500">transaction_version</dt>
          <dd className="text-zinc-800">{v?.tx ?? '…'}</dd>
          <dt className="text-zinc-500">Best block</dt>
          <dd className="text-zinc-800">
            #
            {best}
          </dd>
          <dt className="text-zinc-500">Genesis</dt>
          <dd className="text-zinc-800">{genesis ? shortHex(genesis, 8, 6) : '…'}</dd>
        </dl>
      </section>
    </div>
  )
}
