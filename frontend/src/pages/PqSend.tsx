import type { StepState } from '../components/StatusTracker'
import { AccountId, Binary } from 'polkadot-api'
import { useEffect, useMemo, useState } from 'react'
import Button from '../components/Button'
import Card from '../components/Card'
import HexField from '../components/HexField'
import StageHeader from '../components/StageHeader'
import StageLayout from '../components/StageLayout'
import StatusTracker from '../components/StatusTracker'
import { useChain } from '../hooks/useChain'
import { usePqKeypair } from '../hooks/usePqKeypair'
import { useRuntimeVersion } from '../hooks/useRuntimeVersion'
import { aliceAddress, bobAddress } from '../utils/devKeys'
import { fromHex, planckToUnit, shortHex, toHex } from '../utils/formatters'
import { ML_DSA_PK_LEN, ML_DSA_SIG_LEN, pkFromStoredHex, sign, skFromStoredHex } from '../utils/mlDsa'
import { encodeTransferMsg } from '../utils/transferPayload'
import { submitUnsigned } from '../utils/unsignedExtrinsic'

const CHAIN_ID = 42
const SS58_PREFIX = 42
const accountCodec = AccountId(SS58_PREFIX)
const DEFAULT_AMOUNT = '1000000000000'
const DEFAULT_NONCE = '0'

function isHex32(s: string): boolean {
  const h = s.startsWith('0x') ? s.slice(2) : s
  return /^[0-9a-fA-F]{64}$/.test(h)
}
function tryFromHex(s: string): Uint8Array | null {
  if (!isHex32(s)) return null
  try { return fromHex(s) } catch { return null }
}
function ss58FromBytes(b: Uint8Array): string {
  return accountCodec.dec(b)
}

interface Step { label: string, state: StepState, detail?: string }

export default function PqSend() {
  const { api, client } = useChain()
  const version = useRuntimeVersion()
  const { keypair } = usePqKeypair()

  const [fromHexStr, setFromHexStr] = useState(toHex(aliceAddress))
  const [toHexStr, setToHexStr] = useState(toHex(bobAddress))
  const [amountStr, setAmountStr] = useState(DEFAULT_AMOUNT)
  const [nonceStr, setNonceStr] = useState(DEFAULT_NONCE)
  const [showFullPayload, setShowFullPayload] = useState(false)

  const [steps, setSteps] = useState<Step[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ txHash: string, blockNumber?: number } | null>(null)
  const [commitmentOk, setCommitmentOk] = useState<boolean | null>(null)

  const fromBytes = useMemo(() => tryFromHex(fromHexStr), [fromHexStr])
  const toBytes = useMemo(() => tryFromHex(toHexStr), [toHexStr])
  const amount: bigint | null = useMemo(() => {
    if (!/^\d+$/.test(amountStr)) return null
    try { return BigInt(amountStr) } catch { return null }
  }, [amountStr])
  const nonce: bigint | null = useMemo(() => {
    if (!/^\d+$/.test(nonceStr)) return null
    try { return BigInt(nonceStr) } catch { return null }
  }, [nonceStr])

  const payload = useMemo(() => {
    if (!fromBytes || !toBytes || amount == null || nonce == null || !version) return null
    try {
      return encodeTransferMsg({
        chainId: CHAIN_ID,
        specVersion: version.spec,
        from: fromBytes,
        to: toBytes,
        amount,
        nonce,
      })
    }
    catch { return null }
  }, [fromBytes, toBytes, amount, nonce, version])

  useEffect(() => {
    let cancelled = false
    setCommitmentOk(null)
    if (!fromBytes) return
    const ss58 = ss58FromBytes(fromBytes)
    api.query.PqRegistry.Commitment.getValue(ss58)
      .then((v) => { if (!cancelled) setCommitmentOk(v != null) })
      .catch(() => { if (!cancelled) setCommitmentOk(null) })
    return () => { cancelled = true }
  }, [api, fromBytes])

  const formValid = fromBytes && toBytes && amount != null && nonce != null && amount > 0n && nonce >= 0n
  const canSubmit = !!keypair && !!formValid && commitmentOk === true && !!version && !busy

  async function onSubmit() {
    if (!canSubmit || !payload || !keypair || !fromBytes || !toBytes || amount == null || nonce == null) return
    setError(null)
    setSuccess(null)
    setBusy(true)

    const localSteps: Step[] = [
      { label: 'encode payload', state: 'active' },
      { label: 'sign (ML-DSA-44)', state: 'idle' },
      { label: 'submit unsigned', state: 'idle' },
      { label: 'await events', state: 'idle' },
    ]
    setSteps(localSteps)
    function update(i: number, patch: Partial<Step>) {
      localSteps[i] = { ...localSteps[i]!, ...patch }
      setSteps([...localSteps])
    }

    const fromSs58 = ss58FromBytes(fromBytes)
    let revealedSeen = false
    let pqTransferSeen = false
    let inclusionBlock: number | undefined

    const revealedSub = api.event.PqWallet.Revealed.watch(
      (e) => e.who === fromSs58,
    ).subscribe((ev) => { revealedSeen = true; inclusionBlock = ev.meta.block.number })
    const pqTransferSub = api.event.PqWallet.PqTransfer.watch(
      (e) => e.from === fromSs58 && e.amount === amount,
    ).subscribe((ev) => { pqTransferSeen = true; inclusionBlock = ev.meta.block.number })

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    try {
      const payloadBytes = payload
      update(0, { state: 'done', detail: `${payloadBytes.length} B — ${shortHex(toHex(payloadBytes), 8, 6)}` })

      update(1, { state: 'active' })
      await new Promise(r => setTimeout(r, 0))
      const sk = skFromStoredHex(keypair.sk_hex)
      const pk = pkFromStoredHex(keypair.pk_hex)
      if (pk.length !== ML_DSA_PK_LEN) throw new Error(`pk length ${pk.length} != ${ML_DSA_PK_LEN}`)
      const sig = sign(sk, payloadBytes)
      if (sig.length !== ML_DSA_SIG_LEN) throw new Error(`sig length ${sig.length} != ${ML_DSA_SIG_LEN}`)
      update(1, { state: 'done', detail: `sig=${ML_DSA_SIG_LEN} B · pk=${ML_DSA_PK_LEN} B` })

      update(2, { state: 'active' })
      const pqTx = api.tx.PqWallet.pq_transfer({
        from: fromSs58,
        to: ss58FromBytes(toBytes),
        amount,
        nonce,
        pq_pubkey: Binary.fromBytes(pk),
        sig: Binary.fromBytes(sig),
      })
      const callBin = await pqTx.getEncodedData()
      const callBytes = callBin.asBytes()
      const txHash = await submitUnsigned(client, callBytes)
      update(2, { state: 'done', detail: `txHash ${shortHex(txHash, 6, 6)}` })

      update(3, { state: 'active' })
      await new Promise<void>((resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('timed out after 20s waiting for PqWallet events — check the node log'))
        }, 20_000)
        const interval = setInterval(() => {
          if (revealedSeen && pqTransferSeen) {
            clearInterval(interval)
            if (timeoutHandle) clearTimeout(timeoutHandle)
            resolve()
          }
        }, 100)
      })
      update(3, {
        state: 'done',
        detail: `Revealed{${shortHex(fromHexStr, 6, 4)}} + PqTransfer{${planckToUnit(amount)}}${inclusionBlock != null ? ` @ #${inclusionBlock}` : ''}`,
      })
      setSuccess({ txHash, blockNumber: inclusionBlock })
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const idx = localSteps.findIndex(s => s.state === 'active')
      if (idx >= 0) update(idx, { state: 'error', detail: msg })
      setError(msg)
    }
    finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      revealedSub.unsubscribe()
      pqTransferSub.unsubscribe()
      setBusy(false)
    }
  }

  // ----- Guard: no keypair -----
  if (!keypair) {
    return (
      <StageLayout>
        <StageHeader num="03" kicker="Lazy reveal" title="Leap" blurb="Sign a transfer with your ML-DSA-44 secret key in the browser, then submit it as an unsigned extrinsic." />
        <div className="bg-amber-wash/60 border border-amber-ink/25 px-4 py-3 text-amber-ink text-[13px] flex items-start gap-2">
          <span className="icon-[mdi--alert-outline] mt-0.5 shrink-0" />
          <div>
            No ML-DSA keypair in localStorage. Generate one on{' '}
            <span className="font-mono text-violet">/commit</span>{' '}
            first — without a secret key in the browser, nothing can be signed.
          </div>
        </div>
      </StageLayout>
    )
  }

  return (
    <StageLayout>
      <StageHeader
        num="03"
        kicker="Lazy reveal"
        title="Leap"
        blurb="Sign a transfer payload with your ML-DSA-44 secret key in the browser, then submit it as an unsigned extrinsic. The chain reveals your pubkey on first spend and applies the balance transfer atomically."
      />

      {commitmentOk === false && (
        <div className="mb-5 bg-amber-wash/60 border border-amber-ink/25 px-4 py-3 text-amber-ink text-[13px] flex items-start gap-2">
          <span className="icon-[mdi--alert-outline] mt-0.5 shrink-0" />
          <div>
            <code className="font-mono">from</code>{' '}
            <span className="text-ink/75">{shortHex(fromHexStr, 6, 4)}</span>{' '}
            has no commitment on chain — the runtime will reject this with{' '}
            <code className="font-mono">NoCommitment</code>. Commit on{' '}
            <span className="font-mono text-violet">/commit</span> first.
          </div>
        </div>
      )}

      <div className="space-y-5">
        <Card label="Transfer details" tag="PqWallet.pq_transfer">
          <div className="space-y-4">
            <Field label="from · 32-byte AccountId, hex" value={fromHexStr} onChange={setFromHexStr} invalid={fromHexStr.length > 0 && !fromBytes} />
            <Field label="to · 32-byte AccountId, hex" value={toHexStr} onChange={setToHexStr} invalid={toHexStr.length > 0 && !toBytes} />
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="amount · plancks, u128"
                value={amountStr}
                onChange={setAmountStr}
                invalid={amountStr.length > 0 && amount == null}
                footer={amount != null ? `= ${planckToUnit(amount)} UNIT` : 'invalid'}
              />
              <Field
                label="nonce · u64"
                value={nonceStr}
                onChange={setNonceStr}
                invalid={nonceStr.length > 0 && nonce == null}
                footer="first PQ tx is nonce 0; bump for each."
              />
            </div>
          </div>
        </Card>

        <Card label="Payload inspector" tag={payload ? `${payload.length} B` : '—'}>
          <div className="font-mono text-[12px] space-y-1">
            <Row k="domain · 17 B" v="QL_PQ_TRANSFER_V1" />
            <Row k="chain_id u32" v={String(CHAIN_ID)} />
            <Row k="spec_version u32" v={version ? String(version.spec) : '…'} />
            <Row k="from   [u8;32]" v={fromBytes ? shortHex(toHex(fromBytes), 8, 6) : '— invalid hex —'} />
            <Row k="to     [u8;32]" v={toBytes ? shortHex(toHex(toBytes), 8, 6) : '— invalid hex —'} />
            <Row k="amount u128" v={amount != null ? amount.toString() : '— invalid —'} />
            <Row k="nonce  u64" v={nonce != null ? nonce.toString() : '— invalid —'} />
            <div className="rule-x my-3" />
            <Row k="bytes" v={payload ? `${payload.length}` : '—'} hot />
            {payload && (
              <>
                <button
                  type="button"
                  onClick={() => setShowFullPayload(s => !s)}
                  className="mt-2 text-[11px] text-mut hover:text-violet underline underline-offset-2 transition-colors"
                >
                  {showFullPayload ? 'hide full hex' : 'show full hex'}
                </button>
                {showFullPayload && (
                  <pre className="mt-2 bg-white/70 border border-rule p-3 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-ink">
                    {toHex(payload)}
                  </pre>
                )}
              </>
            )}
          </div>
        </Card>

        <Card label="Signing key" tag="ML-DSA-44 · in browser">
          <HexField label="pubkey · 1312 B" value={keypair.pk_hex} byteLen={ML_DSA_PK_LEN} />
        </Card>

        <div className="flex items-center gap-4 flex-wrap">
          <Button
            variant="violet"
            size="lg"
            busy={busy}
            disabled={!canSubmit}
            onClick={onSubmit}
            iconLeft="icon-[mdi--key-variant]"
            iconRight="icon-[mdi--arrow-right]"
          >
            {busy ? 'signing + submitting' : 'Sign & submit'}
          </Button>
          {!keypair && <p className="text-[11px] font-mono text-mut">disabled · no keypair</p>}
          {keypair && commitmentOk === false && <p className="text-[11px] font-mono text-mut">disabled · `from` has no commitment</p>}
          {keypair && commitmentOk === null && fromBytes && <p className="text-[11px] font-mono text-mut inline-flex items-center gap-1"><span className="icon-[mdi--loading] animate-spin" /> checking commitment…</p>}
        </div>

        {steps.length > 0 && (
          <Card label="Progress">
            <StatusTracker steps={steps} />
          </Card>
        )}

        {error && (
          <div className="bg-rose-wash/50 border border-rose-ink/20 px-4 py-3 text-rose-ink text-[12px] font-mono space-y-2">
            <div className="flex items-start gap-2 break-all">
              <span className="icon-[mdi--alert-circle] mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
            {/Custom error 2/.test(error) && (
              <div className="text-[11px] border-t border-rose-ink/15 pt-2">
                <code>Custom error 2</code> = <code>NoCommitment</code>. The `from` address has not committed a pubkey hash yet — visit{' '}
                <span className="font-mono text-violet">/commit</span> with the matching classical signer.
              </div>
            )}
          </div>
        )}

        {success && !error && (
          <div className="relative bg-violet/[0.06] border border-violet/30 px-7 py-6 overflow-hidden">
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-violet/15 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-violet mb-2">first lazy reveal</div>
              <h3 className="text-[24px] tracking-[-0.02em] font-semibold text-ink leading-tight">
                Quantum-safe transfer{' '}
                <span className="italic-display violet-highlight">included.</span>
              </h3>
              {success.blockNumber != null && (
                <div className="mt-3 text-[13px] text-ink/75">
                  Block <span className="font-mono text-ink">#{success.blockNumber}</span> · your ML-DSA-44 pubkey is now on-chain. Subsequent transfers will use the revealed key directly.
                </div>
              )}
              <div className="mt-4 font-mono text-[11px] text-ink/65 break-all">
                txHash <span className="text-ink">{success.txHash}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </StageLayout>
  )
}

function Field({
  label, value, onChange, invalid, footer,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  footer?: string
}) {
  return (
    <div>
      <label className="block label-tag mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={`w-full bg-white/70 border px-3 py-2.5 font-mono text-[12.5px] text-ink focus:outline-none transition-colors ${
          invalid ? 'border-rose-ink/50 focus:border-rose-ink' : 'border-rule focus:border-violet'
        }`}
      />
      {footer && (
        <div className={`text-[11px] font-mono mt-1 ${invalid ? 'text-rose-ink' : 'text-mut'}`}>{footer}</div>
      )}
    </div>
  )
}

function Row({ k, v, hot }: { k: string, v: string, hot?: boolean }) {
  return (
    <div className="flex gap-3 items-baseline">
      <span className="text-mut w-44 shrink-0">{k}</span>
      <span className={`break-all ${hot ? 'text-violet font-semibold' : 'text-ink'}`}>{v}</span>
    </div>
  )
}
