export type Tab = 'home' | 'commit' | 'upgrade' | 'pq-send'

interface NavProps {
  tab: Tab
  setTab: (t: Tab) => void
}

const TABS: { id: Tab, label: string, num?: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'commit', label: 'Commit', num: '01' },
  { id: 'upgrade', label: 'Upgrade', num: '02' },
  { id: 'pq-send', label: 'Transfer', num: '03' },
]

export default function Nav({ tab, setTab }: NavProps) {
  return (
    <nav className="flex items-center gap-1">
      {TABS.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`group relative px-3.5 py-2 text-[12px] tracking-[-0.005em] inline-flex items-baseline gap-1.5 transition-colors ${
              active ? 'text-ink' : 'text-mut hover:text-ink'
            }`}
          >
            {t.num && (
              <span className={`text-[9px] font-mono tracking-[0.16em] ${active ? 'text-violet' : 'text-mut-2'}`}>{t.num}</span>
            )}
            <span className="font-medium">{t.label}</span>
            <span
              className={`absolute left-3 right-3 -bottom-px h-px ${active ? 'bg-violet' : 'bg-transparent group-hover:bg-rule'}`}
            />
          </button>
        )
      })}
    </nav>
  )
}
