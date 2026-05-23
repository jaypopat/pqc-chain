import type { Tab } from './Nav'
import Connect from './Connect'
import Nav from './Nav'
import Wordmark from './Wordmark'

interface HeaderProps {
  tab: Tab
  setTab: (t: Tab) => void
}

export default function Header({ tab, setTab }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-paper/70 border-b border-rule">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
        <Wordmark onClick={() => setTab('home')} />
        <Nav tab={tab} setTab={setTab} />
        <Connect />
      </div>
    </header>
  )
}
