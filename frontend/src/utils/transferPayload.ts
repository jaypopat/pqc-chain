// Mirrors `pallet-pq-wallet::encode_transfer_msg`: raw domain bytes
// (NOT SCALE-length-prefixed) followed by SCALE-encoded
// `(chain_id, spec_version, from, to, amount, nonce)`.
//
// Layout (exact bytes — must match Rust):
//   payload  =  b"QL_PQ_TRANSFER_V1"                          (17 raw bytes)
//            || u32_le(chain_id)                              (4 bytes)
//            || u32_le(spec_version)                          (4 bytes)
//            || from   (32 raw bytes, AccountId = [u8;32])
//            || to     (32 raw bytes)
//            || u128_le(amount)                               (16 bytes)
//            || u64_le(nonce)                                 (8 bytes)
//   total: 17 + 4 + 4 + 32 + 32 + 16 + 8 = 113 bytes
//
// The domain tag is appended verbatim (NOT encoded as `&[u8]` inside the tuple)
// because SCALE-encoding `&[u8]` prepends a 1-byte compact length and skews
// every downstream offset. This was a real bug; do not reintroduce.
//
// AccountId32 is a SCALE fixed-size byte array `[u8;32]`; fixed-size arrays in
// SCALE have no length prefix, so we splice in the raw 32 bytes directly.

import { u32, u64, u128 } from '@polkadot-api/substrate-bindings'

/** Raw domain-separation tag prefixed to every signed transfer message. */
export const TRANSFER_DOMAIN = new TextEncoder().encode('QL_PQ_TRANSFER_V1')

if (TRANSFER_DOMAIN.length !== 17) {
  throw new Error(`TRANSFER_DOMAIN must be 17 bytes, got ${TRANSFER_DOMAIN.length}`)
}

export interface TransferMsgInput {
  chainId: number
  specVersion: number
  /** 32-byte raw AccountId */
  from: Uint8Array
  /** 32-byte raw AccountId */
  to: Uint8Array
  amount: bigint
  nonce: bigint
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/** Build the exact bytes the pallet hashes for ML-DSA signing. */
export function encodeTransferMsg(input: TransferMsgInput): Uint8Array {
  const { chainId, specVersion, from, to, amount, nonce } = input
  if (from.length !== 32)
    throw new Error(`from must be 32 bytes, got ${from.length}`)
  if (to.length !== 32)
    throw new Error(`to must be 32 bytes, got ${to.length}`)

  return concat([
    TRANSFER_DOMAIN,
    u32.enc(chainId),
    u32.enc(specVersion),
    from,
    to,
    u128.enc(amount),
    u64.enc(nonce),
  ])
}
