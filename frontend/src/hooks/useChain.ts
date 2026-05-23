import { useMemo } from 'react'
import sdk from '../utils/sdk'

export function useChain() {
  return useMemo(() => sdk('ql'), [])
}
