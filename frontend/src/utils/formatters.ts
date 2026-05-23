import { AccountId } from 'polkadot-api'

export function unifyAddress(address: string) {
  const addressCodec = AccountId(0)
  const publicKey = addressCodec.enc(address)
  return addressCodec.dec(publicKey)
}

export function stripAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

export function shortHex(hex: string, head = 6, tail = 4): string {
  const h = hex.startsWith('0x') ? hex : `0x${hex}`
  if (h.length <= head + tail + 2) return h
  return `${h.slice(0, head + 2)}…${h.slice(-tail)}`
}

export function toHex(bytes: Uint8Array): string {
  let s = '0x'
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, '0')
  }
  return s
}

export function fromHex(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  if (h.length % 2 !== 0) throw new Error('odd-length hex')
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function planckToUnit(plancks: bigint, decimals = 12): string {
  const neg = plancks < 0n
  const abs = neg ? -plancks : plancks
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = abs % base
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  const body = fracStr.length ? `${whole}.${fracStr}` : whole.toString()
  return neg ? `-${body}` : body
}
