import { useEffect, useState } from 'react'
import { useChain } from './useChain'

export interface RuntimeVersion {
  spec: number
  tx: number
  name: string
  blockNumber: number
}

export function useRuntimeVersion(): RuntimeVersion | undefined {
  const { client, api } = useChain()
  const [version, setVersion] = useState<RuntimeVersion>()

  useEffect(() => {
    let cancelled = false

    async function readNow(blockNumber: number) {
      try {
        const v = await api.constants.System.Version()
        if (cancelled) return
        setVersion({
          spec: Number(v.spec_version),
          tx: Number(v.transaction_version),
          name: String(v.spec_name),
          blockNumber,
        })
      }
      catch {
        // metadata may be reloading mid-upgrade; next block will retry
      }
    }

    readNow(0)
    const sub = client.bestBlocks$.subscribe((blocks) => {
      const top = blocks[0]
      if (top) readNow(top.number)
    })

    return () => {
      cancelled = true
      sub.unsubscribe()
    }
  }, [client, api])

  return version
}
