import type { Tab } from './Nav'
import Connect from './Connect'
import Nav from './Nav'
import SpecBanner from './SpecBanner'

interface HeaderProps {
  tab: Tab
  setTab: (t: Tab) => void
}

export default function Header({ tab, setTab }: HeaderProps) {
  const showWallet = tab !== 'upgrade'

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <span className="icon-[mdi--atom] text-2xl text-emerald-600" />
          <span className="text-lg font-semibold tracking-tight text-zinc-950">
            QuantumLeap
          </span>
        </div>

        <Nav tab={tab} setTab={setTab} />

        <div className="flex items-center gap-3">
          <SpecBanner />
          <div className={showWallet ? '' : 'invisible'}>
            <Connect />
          </div>
        </div>
      </div>
    </header>
  )
}
