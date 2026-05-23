import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'ql_pq_key'

export interface StoredPqKey {
  pk_hex: string
  sk_hex: string
  createdAt: number
}

function read(): StoredPqKey | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as StoredPqKey
    if (!parsed.pk_hex || !parsed.sk_hex)
      return null
    return parsed
  }
  catch {
    return null
  }
}

export function usePqKeypair() {
  const [keypair, setKeypair] = useState<StoredPqKey | null>(() => read())

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY)
        setKeypair(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const save = useCallback((kp: { pk_hex: string, sk_hex: string }) => {
    const obj: StoredPqKey = { ...kp, createdAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    setKeypair(obj)
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setKeypair(null)
  }, [])

  return { keypair, save, clear }
}
