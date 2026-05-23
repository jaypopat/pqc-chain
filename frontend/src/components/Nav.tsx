export type Tab = 'home' | 'commit' | 'upgrade' | 'pq-send'

interface NavProps {
  tab: Tab
  setTab: (t: Tab) => void
}

const TABS: { id: Tab, label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'commit', label: 'Commit' },
  { id: 'upgrade', label: 'Upgrade' },
  { id: 'pq-send', label: 'PQ Send' },
]

export default function Nav({ tab, setTab }: NavProps) {
  return (
    <nav className="flex items-center gap-1">
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={`px-4 py-2 text-sm font-mono uppercase tracking-wider border-b-2 transition-colors ${
            tab === t.id
              ? 'border-emerald-600 text-zinc-950'
              : 'border-transparent text-zinc-500 hover:text-zinc-900'
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
