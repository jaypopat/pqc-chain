import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js'
import { fromHex, toHex } from './formatters'

export const ML_DSA_PK_LEN = 1312
export const ML_DSA_SIG_LEN = 2420
const SEED_LEN = 32

export interface KeypairBytes {
  pk: Uint8Array
  sk: Uint8Array
}

export function keygen(): KeypairBytes {
  const seed = crypto.getRandomValues(new Uint8Array(SEED_LEN))
  const { secretKey, publicKey } = ml_dsa44.keygen(seed)
  if (publicKey.length !== ML_DSA_PK_LEN)
    throw new Error(`unexpected pk len: ${publicKey.length}`)
  return { pk: publicKey, sk: secretKey }
}

export function keygenHex() {
  const { pk, sk } = keygen()
  return { pk_hex: toHex(pk), sk_hex: toHex(sk), pk, sk }
}

export function sign(sk: Uint8Array, msg: Uint8Array): Uint8Array {
  // @noble/post-quantum >=0.6 takes (msg, secretKey).
  const sig = ml_dsa44.sign(msg, sk)
  if (sig.length !== ML_DSA_SIG_LEN)
    throw new Error(`unexpected sig len: ${sig.length}`)
  return sig
}

export function verify(pk: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean {
  // @noble/post-quantum >=0.6 takes (sig, msg, publicKey).
  return ml_dsa44.verify(sig, msg, pk)
}

export function pkFromStoredHex(pk_hex: string): Uint8Array {
  return fromHex(pk_hex)
}

export function skFromStoredHex(sk_hex: string): Uint8Array {
  return fromHex(sk_hex)
}
