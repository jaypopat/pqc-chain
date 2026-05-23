import { blake2b } from '@noble/hashes/blake2.js'
import { toHex } from './formatters'

const DOMAIN = new TextEncoder().encode('QL_PQ_COMMIT_V1')

export function commitmentHash(pk: Uint8Array): Uint8Array {
  const input = new Uint8Array(DOMAIN.length + pk.length)
  input.set(DOMAIN, 0)
  input.set(pk, DOMAIN.length)
  return blake2b(input, { dkLen: 32 })
}

export function commitmentHashHex(pk: Uint8Array): string {
  return toHex(commitmentHash(pk))
}
