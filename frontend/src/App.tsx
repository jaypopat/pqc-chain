import type { Tab } from './components/Nav'
import { useState } from 'react'
import Footer from './components/Footer'
import Header from './components/Header'
import Commit from './pages/Commit'
import Home from './pages/Home'
import PqSend from './pages/PqSend'
import Upgrade from './pages/Upgrade'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')

  return (
    <div className="min-h-screen flex flex-col">
      <Header tab={tab} setTab={setTab} />
      <main className="flex-1">
        {tab === 'home' && <Home goto={setTab} />}
        {tab === 'commit' && <Commit goto={setTab} />}
        {tab === 'upgrade' && <Upgrade goto={setTab} />}
        {tab === 'pq-send' && <PqSend />}
      </main>
      <Footer />
    </div>
  )
}
