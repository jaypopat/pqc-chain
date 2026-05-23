import type { StepState } from '../components/StatusTracker'
import { AccountId, Binary } from 'polkadot-api'
import { useEffect, useMemo, useState } from 'react'
import HexField from '../components/HexField'
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

// Default tx parameters; mirror scripts/e2e/run.mjs.
const DEFAULT_AMOUNT = '1000000000000' // = 1 UNIT @ 12 decimals
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

interface Step {
  label: string
  state: StepState
  detail?: string
}

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

  // Live-validate the form. Empty strings are tolerated until submit; here we
  // only flag the inputs as "ready to encode".
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

  // Live-render the payload bytes so the user can sanity-check the hex.
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

  // Check that `from` has a committed pubkey hash on chain — without one the
  // chain rejects pq_transfer with NoCommitment at ValidateUnsigned.
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

    // Subscriptions for the two events we expect from a successful tx. Subscribe
    // BEFORE submitting so we cannot miss the inclusion block.
    const fromSs58 = ss58FromBytes(fromBytes)
    let revealedSeen = false
    let pqTransferSeen = false
    let inclusionBlock: number | undefined

    const revealedSub = api.event.PqWallet.Revealed.watch(
      (e) => e.who === fromSs58,
    ).subscribe((ev) => {
      revealedSeen = true
      inclusionBlock = ev.meta.block.number
    })
    const pqTransferSub = api.event.PqWallet.PqTransfer.watch(
      (e) => e.from === fromSs58 && e.amount === amount,
    ).subscribe((ev) => {
      pqTransferSeen = true
      inclusionBlock = ev.meta.block.number
    })

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    try {
      // [1/4] encode payload
      const payloadBytes = payload
      update(0, { state: 'done', detail: `${payloadBytes.length} B — ${shortHex(toHex(payloadBytes), 8, 6)}` })

      // [2/4] sign with the in-browser secret key. ~200ms blocking call; yield
      // a frame first so the spinner can paint.
      update(1, { state: 'active' })
      await new Promise(r => setTimeout(r, 0))
      const sk = skFromStoredHex(keypair.sk_hex)
      const pk = pkFromStoredHex(keypair.pk_hex)
      if (pk.length !== ML_DSA_PK_LEN) throw new Error(`pk length ${pk.length} != ${ML_DSA_PK_LEN}`)
      const sig = sign(sk, payloadBytes)
      if (sig.length !== ML_DSA_SIG_LEN) throw new Error(`sig length ${sig.length} != ${ML_DSA_SIG_LEN}`)
      update(1, { state: 'done', detail: `sig=${ML_DSA_SIG_LEN} B, pk=${ML_DSA_PK_LEN} B` })

      // [3/4] build the typed call + wrap in an unsigned envelope + submit
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

      // [4/4] wait for Revealed + PqTransfer events (or fail after 20s)
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
      // Mark the first non-done step as errored so the tracker shows where we died.
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

  // ---------- Guards: keypair must exist ----------
  if (!keypair) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
        <Header />
        <div className="bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 font-mono flex items-start gap-2">
          <span className="icon-[mdi--alert] text-amber-600 mt-0.5" />
          <div>
            No ML-DSA keypair in localStorage. Generate one on
            {' '}
            <span className="text-emerald-700">/commit</span>
            {' '}
            first — without a secret key in the browser, nothing can be signed.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <Header />

      {/* Guard: no commitment for `from` */}
      {commitmentOk === false && (
        <div className="bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 font-mono flex items-start gap-2">
          <span className="icon-[mdi--alert] text-amber-600 mt-0.5" />
          <div>
            <code>from</code>
            {' '}
            <span className="text-zinc-700">{shortHex(fromHexStr, 6, 4)}</span>
            {' '}
            has no commitment on chain — the runtime will reject this with
            {' '}
            <code>NoCommitment</code>
            . Commit on
            {' '}
            <span className="text-emerald-700">/commit</span>
            {' '}
            first.
          </div>
        </div>
      )}

      {/* Form */}
      <section className="space-y-4">
        <Field
          label="from (32-byte AccountId, hex)"
          value={fromHexStr}
          onChange={setFromHexStr}
          invalid={fromHexStr.length > 0 && !fromBytes}
        />
        <Field
          label="to (32-byte AccountId, hex)"
          value={toHexStr}
          onChange={setToHexStr}
          invalid={toHexStr.length > 0 && !toBytes}
        />
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="amount (plancks, u128)"
            value={amountStr}
            onChange={setAmountStr}
            invalid={amountStr.length > 0 && amount == null}
            footer={amount != null ? `= ${planckToUnit(amount)} UNIT` : 'invalid'}
          />
          <Field
            label="nonce (u64)"
            value={nonceStr}
            onChange={setNonceStr}
            invalid={nonceStr.length > 0 && nonce == null}
            footer="first PQ tx is nonce 0; bump for each subsequent."
          />
        </div>
      </section>

      {/* Payload Inspector */}
      <section>
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
          Payload Inspector
        </div>
        <div className="bg-zinc-50 border border-zinc-200 p-4 font-mono text-xs space-y-1 text-zinc-700">
          <Row k="domain (17 B)" v="QL_PQ_TRANSFER_V1" />
          <Row k="chain_id u32" v={String(CHAIN_ID)} />
          <Row k="spec_version u32" v={version ? String(version.spec) : '…'} />
          <Row k="from   [u8;32]" v={fromBytes ? shortHex(toHex(fromBytes), 8, 6) : '— invalid hex —'} />
          <Row k="to     [u8;32]" v={toBytes ? shortHex(toHex(toBytes), 8, 6) : '— invalid hex —'} />
          <Row k="amount u128" v={amount != null ? amount.toString() : '— invalid —'} />
          <Row k="nonce  u64" v={nonce != null ? nonce.toString() : '— invalid —'} />
          <div className="border-t border-zinc-200 my-2" />
          <Row k="payload bytes" v={payload ? `${payload.length}` : '—'} />
          {payload && (
            <>
              <button
                type="button"
                onClick={() => setShowFullPayload(s => !s)}
                className="text-zinc-500 hover:text-emerald-600 underline underline-offset-2 mt-2"
              >
                {showFullPayload ? 'hide full hex' : 'show full hex'}
              </button>
              {showFullPayload && (
                <pre className="mt-2 bg-white border border-zinc-200 p-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-zinc-800">
                  {toHex(payload)}
                </pre>
              )}
            </>
          )}
        </div>
      </section>

      {/* Keypair indicator */}
      <section>
        <HexField label="signing pubkey (ML-DSA-44, 1312 B)" value={keypair.pk_hex} byteLen={ML_DSA_PK_LEN} />
      </section>

      {/* Submit */}
      <section className="space-y-3">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="bg-emerald-600 text-white px-5 py-2.5 text-sm font-mono hover:bg-emerald-700 disabled:bg-zinc-300 disabled:text-zinc-500 inline-flex items-center gap-2"
        >
          <span className={busy ? 'icon-[mdi--loading] animate-spin' : 'icon-[mdi--key-variant]'} />
          {busy ? 'signing + submitting…' : 'Sign + submit (ML-DSA)'}
        </button>
        {!keypair && (
          <p className="text-xs text-zinc-500 font-mono">disabled: no keypair</p>
        )}
        {keypair && commitmentOk === false && (
          <p className="text-xs text-zinc-500 font-mono">disabled: `from` has no commitment</p>
        )}
        {keypair && commitmentOk === null && fromBytes && (
          <p className="text-xs text-zinc-500 font-mono">checking commitment for `from`…</p>
        )}
      </section>

      {/* Status */}
      {steps.length > 0 && (
        <section className="border border-zinc-200 bg-white p-4">
          <StatusTracker steps={steps} />
        </section>
      )}

      {/* Error */}
      {error && (
        <section className="bg-rose-50 border border-rose-200 p-4 text-sm text-rose-900 font-mono space-y-2">
          <div className="flex items-start gap-2">
            <span className="icon-[mdi--alert-circle] text-rose-600 mt-0.5" />
            <div className="break-all">{error}</div>
          </div>
          {/Custom error 2/.test(error) && (
            <div className="text-xs text-rose-800 border-t border-rose-200 pt-2">
              <code>Custom error 2</code>
              {' '}
              =
              {' '}
              <code>NoCommitment</code>
              . The `from` address has not committed a pubkey hash yet — visit
              {' '}
              <span className="text-emerald-700">/commit</span>
              {' '}
              with the matching classical signer.
            </div>
          )}
        </section>
      )}

      {/* Success */}
      {success && !error && (
        <section className="bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 font-mono flex items-start gap-2">
          <span className="icon-[mdi--check-circle] text-emerald-600 mt-0.5" />
          <div className="space-y-1">
            <div>
              transfer included
              {success.blockNumber != null ? ` @ #${success.blockNumber}` : ''}
              .
            </div>
            <div className="text-xs text-emerald-800 break-all">
              txHash
              {' '}
              <code>{success.txHash}</code>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function Header() {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Stage 3</div>
      <h2 className="text-3xl tracking-tight font-semibold text-zinc-950 mb-2">PQ Send</h2>
      <p className="text-sm text-zinc-600 max-w-xl">
        Sign a transfer payload with your ML-DSA-44 secret key in the browser,
        then submit it as an unsigned extrinsic. The chain reveals your pubkey
        on first spend and applies the balance transfer atomically.
      </p>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  invalid,
  footer,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  footer?: string
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={`bg-white border px-3 py-2 font-mono text-sm focus:outline-none w-full ${
          invalid ? 'border-rose-400 focus:border-rose-500' : 'border-zinc-300 focus:border-emerald-500'
        }`}
      />
      {footer && (
        <div className={`text-[11px] font-mono mt-1 ${invalid ? 'text-rose-600' : 'text-zinc-500'}`}>
          {footer}
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string, v: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-zinc-500 w-40 shrink-0">{k}</span>
      <span className="text-zinc-800 break-all">{v}</span>
    </div>
  )
}
