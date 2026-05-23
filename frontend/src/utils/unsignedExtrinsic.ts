// Build + submit a v4 *unsigned* extrinsic via the legacy `author_submitExtrinsic`
// RPC. We use the legacy RPC (not PAPI's chainHead operations) because PAPI's
// chainHead returns async operation IDs that don't fit our simple "submit + watch
// events" UX, and because unsigned tx submission is fully supported by the
// legacy author module on dev nodes.
//
// Wire format of a v4 unsigned extrinsic:
//   body = 0x04                             // version byte (4) with signed bit (0x80) clear
//        || SCALE-encoded call (`pq_transfer { ... }`)
//   wire = SCALE compact length of `body` || `body`
//
// `submitUnsigned` returns the transaction hash echoed by the node.

import type { PolkadotClient } from 'polkadot-api'
import { toHex } from './formatters'

/** SCALE compact-length prefix (mode flag in the low 2 bits). */
export function compactLen(n: number): Uint8Array {
  if (n < 0)
    throw new Error('negative length')
  if (n < 1 << 6) {
    // single-byte mode (mode=00), value in upper 6 bits
    return new Uint8Array([n << 2])
  }
  if (n < 1 << 14) {
    // two-byte mode (mode=01)
    const v = (n << 2) | 0b01
    return new Uint8Array([v & 0xFF, (v >> 8) & 0xFF])
  }
  if (n < 1 << 30) {
    // four-byte mode (mode=10)
    const v = (n << 2) | 0b10
    return new Uint8Array([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF])
  }
  // big-integer mode (mode=11) — supports up to 2^536; here we only support up
  // to 4 bytes of length, which covers any realistic extrinsic body size.
  const bytes: number[] = []
  let v = n
  while (v > 0) {
    bytes.push(v & 0xFF)
    v = Math.floor(v / 256)
  }
  if (bytes.length > 67)
    throw new Error('length too large for compact')
  const header = 0b11 | ((bytes.length - 4) << 2)
  return new Uint8Array([header, ...bytes])
}

/**
 * Wraps `callBytes` (the SCALE-encoded call from
 * `api.tx.Pallet.method(...).getEncodedData()`) in a v4 unsigned envelope and
 * submits it via `author_submitExtrinsic`. Returns the tx hash (hex string).
 *
 * Throws with the raw RPC error message on tx-pool rejection — most commonly
 * `Invalid Transaction: Custom error 2` (NoCommitment) for the demo.
 */
export async function submitUnsigned(
  client: PolkadotClient,
  callBytes: Uint8Array,
): Promise<string> {
  // 0x04 = version 4, signed bit (top bit 0x80) clear → unsigned.
  const body = new Uint8Array(1 + callBytes.length)
  body[0] = 0x04
  body.set(callBytes, 1)

  const lenPrefix = compactLen(body.length)
  const wire = new Uint8Array(lenPrefix.length + body.length)
  wire.set(lenPrefix, 0)
  wire.set(body, lenPrefix.length)

  const hex = toHex(wire)
  // PAPI doesn't expose author_submitExtrinsic in its typed API, but the
  // underlying provider does; `_request` is the documented escape hatch.
  return await (client as unknown as {
    _request: <R>(method: string, params: unknown[]) => Promise<R>
  })._request<string>('author_submitExtrinsic', [hex])
}
