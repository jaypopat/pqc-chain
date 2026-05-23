import type { ReactNode } from 'react'
import RuntimeSidecar from './RuntimeSidecar'

interface StageLayoutProps {
  children: ReactNode
}

export default function StageLayout({ children }: StageLayoutProps) {
  return (
    <div className="max-w-6xl mx-auto px-6 pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] gap-10">
        <div>{children}</div>
        <div className="lg:pt-20">
          <div className="lg:sticky lg:top-24">
            <RuntimeSidecar />
          </div>
        </div>
      </div>
    </div>
  )
}
