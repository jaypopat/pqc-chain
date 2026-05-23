import type { Subscription } from 'rxjs'
import type { StepState } from '../components/StatusTracker'
import { Binary } from 'polkadot-api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import HexField from '../components/HexField'
import StatusTracker from '../components/StatusTracker'
import { useChain } from '../hooks/useChain'
import { useConnect } from '../hooks/useConnect'
import { usePqKeypair } from '../hooks/usePqKeypair'
import { commitmentHash, commitmentHashHex } from '../utils/commitment'
import { fromHex, shortHex, unifyAddress } from '../utils/formatters'
import { keygenHex } from '../utils/mlDsa'
import { polkadotSigner } from '../utils/sdk-interface'

type OnChainState
  = | { kind: 'loading' }
    | { kind: 'none' }
    | { kind: 'present', hashHex: string }
    | { kind: 'error', message: string }

interface SubmitResult {
  blockHash: string
  blockNumber: number
  eventHash: string
  recommit: boolean
}

export default function Commit() {
  const { api } = useChain()
  const { selectedAccount } = useConnect()
  const { keypair, save } = usePqKeypair()

  const [onChain, setOnChain] = useState<OnChainState>({ kind: 'loading' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [steps, setSteps] = useState<{ label: string, state: StepState, detail?: string }[]>([])
  const [revealSk, setRevealSk] = useState(false)

  // Derived: local pubkey bytes + commitment hash hex
  const local = useMemo(() => {
    if (!keypair)
      return null
    try {
      const pk = fromHex(keypair.pk_hex)
      const hashHex = commitmentHashHex(pk)
      return { pk, hashHex }
    }
    catch {
      return null
    }
  }, [keypair])

  // Query existing on-chain commitment for the selected account.
  const refreshOnChain = useCallback(async () => {
    if (!selectedAccount) {
      setOnChain({ kind: 'none' })
      return
    }
    setOnChain({ kind: 'loading' })
    try {
      const addr = unifyAddress(selectedAccount.address)
      const stored = await api.query.PqRegistry.Commitment.getValue(addr)
      if (!stored) {
        setOnChain({ kind: 'none' })
        return
      }
      setOnChain({ kind: 'present', hashHex: stored.asHex() })
    }
    catch (err) {
      setOnChain({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [api, selectedAccount])

  useEffect(() => {
    refreshOnChain()
  }, [refreshOnChain])

  const alreadyCommitted = onChain.kind === 'present'
  const matches = alreadyCommitted && local && onChain.hashHex.toLowerCase() === local.hashHex.toLowerCase()

  function handleGenerate() {
    const kp = keygenHex()
    save({ pk_hex: kp.pk_hex, sk_hex: kp.sk_hex })
  }

  async function handleSubmit() {
    if (!selectedAccount || !keypair || !local || submitting)
      return

    setSubmitError(null)
    setSubmitResult(null)
    setSubmitting(true)

    const isRecommit = alreadyCommitted
    const initialSteps: { label: string, state: StepState, detail?: string }[] = [
      { label: 'wallet popup — sign with classical key', state: 'active' },
      { label: 'extrinsic submitted', state: 'idle' },
      { label: 'finalized', state: 'idle' },
    ]
    setSteps(initialSteps)

    let sub: Subscription | null = null
    try {
      const signer = await polkadotSigner()
      if (!signer) {
        throw new Error('No signer available for the selected account')
      }

      const hashBytes = commitmentHash(local.pk)
      const hashBinary = Binary.fromBytes(hashBytes)
      const tx = isRecommit
        ? api.tx.PqRegistry.recommit({ new_hash: hashBinary })
        : api.tx.PqRegistry.commit({ hash: hashBinary })

      sub = tx.signSubmitAndWatch(signer).subscribe({
        next: (ev) => {
          if (ev.type === 'signed') {
            setSteps([
              { label: 'wallet popup — sign with classical key', state: 'done', detail: `txHash ${shortHex(ev.txHash)}` },
              { label: 'extrinsic submitted', state: 'active' },
              { label: 'finalized', state: 'idle' },
            ])
          }
          else if (ev.type === 'txBestBlocksState' && ev.found) {
            setSteps([
              { label: 'wallet popup — sign with classical key', state: 'done', detail: `txHash ${shortHex(ev.txHash)}` },
              { label: `extrinsic submitted — txHash ${shortHex(ev.txHash)}`, state: 'done', detail: `block #${ev.block.number}` },
              { label: 'finalized', state: 'active' },
            ])
          }
          else if (ev.type === 'finalized') {
            if (!ev.ok) {
              const dispatchMsg = typeof ev.dispatchError?.type === 'string'
                ? `${ev.dispatchError.type}: ${JSON.stringify(ev.dispatchError.value)}`
                : 'dispatch error'
              setSteps(prev => prev.map((s, i) => i === 2 ? { ...s, state: 'error', detail: dispatchMsg } : s))
              setSubmitError(dispatchMsg)
              setSubmitting(false)
              return
            }

            const eventName = isRecommit ? 'Recommitted' : 'Committed'
            const match = ev.events.find(
              e => e.type === 'PqRegistry' && (e.value as { type: string }).type === eventName,
            )
            const payload = match?.value as { type: string, value: Record<string, unknown> } | undefined
            const inner = payload?.value ?? {}
            const rawHash = isRecommit
              ? (inner as { new_hash?: { asHex?: () => string } }).new_hash
              : (inner as { hash?: { asHex?: () => string } }).hash
            const eventHash = rawHash && typeof rawHash.asHex === 'function' ? rawHash.asHex() : local.hashHex

            setSteps([
              { label: 'wallet popup — sign with classical key', state: 'done' },
              { label: `extrinsic submitted — txHash ${shortHex(ev.txHash)}`, state: 'done' },
              {
                label: `finalized in block #${ev.block.number} — ${eventName}{hash=${shortHex(eventHash)}}`,
                state: 'done',
                detail: `block ${shortHex(ev.block.hash)}`,
              },
            ])
            setSubmitResult({
              blockHash: ev.block.hash,
              blockNumber: ev.block.number,
              eventHash,
              recommit: isRecommit,
            })
            setSubmitting(false)
            refreshOnChain()
          }
        },
        error: (err) => {
          const message = err instanceof Error ? err.message : String(err)
          setSteps(prev => prev.map(s => s.state === 'active' ? { ...s, state: 'error', detail: message } : s))
          setSubmitError(message)
          setSubmitting(false)
        },
      })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSteps(prev => prev.map(s => s.state === 'active' ? { ...s, state: 'error', detail: message } : s))
      setSubmitError(message)
      setSubmitting(false)
      if (sub)
        sub.unsubscribe()
    }
  }

  // -------- render helpers --------

  const primaryBtn = 'bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-mono uppercase tracking-wider disabled:bg-zinc-300 disabled:cursor-not-allowed inline-flex items-center gap-2'
  const secondaryBtn = 'border border-zinc-300 text-zinc-700 hover:border-zinc-500 px-4 py-2 text-sm font-mono uppercase tracking-wider inline-flex items-center gap-2'
  const card = 'bg-white border border-zinc-200 p-6'

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Stage 1</div>
      <h2 className="text-3xl tracking-tight font-semibold text-zinc-950 mb-4">Commit</h2>
      <p className="text-sm text-zinc-600 mb-8 max-w-xl">
        Generate a post-quantum keypair in your browser and commit the hash of
        its public key on-chain, signed with your classical wallet.
      </p>

      <div className="space-y-6">
        {!selectedAccount && (
          <div className={card}>
            <div className="flex items-start gap-3">
              <span className="icon-[mdi--wallet] text-zinc-400 text-xl mt-0.5" />
              <div>
                <div className="text-sm font-medium text-zinc-900 mb-1">No wallet connected</div>
                <div className="text-sm text-zinc-600">
                  Click
                  {' '}
                  <span className="font-mono uppercase tracking-wider text-zinc-700">Connect Wallet</span>
                  {' '}
                  in the header above to choose a Talisman account.
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedAccount && !keypair && (
          <div className={card}>
            <div className="flex items-start gap-3 mb-4">
              <span className="icon-[mdi--key-variant] text-zinc-400 text-xl mt-0.5" />
              <div>
                <div className="text-sm font-medium text-zinc-900 mb-1">No post-quantum key yet</div>
                <div className="text-sm text-zinc-600">
                  Generate a fresh ML-DSA-44 keypair in your browser. The secret
                  key stays in localStorage on this device.
                </div>
              </div>
            </div>
            <button type="button" onClick={handleGenerate} className={primaryBtn}>
              <span className="icon-[mdi--key-plus]" />
              Generate ML-DSA-44 keypair
            </button>
          </div>
        )}

        {selectedAccount && keypair && local && (
          <>
            <div className={card}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs uppercase tracking-wider text-zinc-500">Local keypair</div>
                <div className="text-[10px] text-zinc-400 font-mono">ML-DSA-44</div>
              </div>
              <div className="space-y-4">
                <HexField label="Public key" value={keypair.pk_hex} byteLen={1312} />

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs uppercase tracking-wider text-zinc-500">Secret key</span>
                    <button
                      type="button"
                      onClick={() => setRevealSk(s => !s)}
                      className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-emerald-600 inline-flex items-center gap-1"
                    >
                      <span className={revealSk ? 'icon-[mdi--eye-off-outline]' : 'icon-[mdi--eye-outline]'} />
                      {revealSk ? 'Hide secret' : 'Reveal secret'}
                    </button>
                  </div>
                  {revealSk
                    ? (
                        <>
                          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 mb-2">
                            <span className="icon-[mdi--alert-outline] mt-0.5" />
                            <span>
                              Demo wallet — localStorage is not a safe place for a real
                              post-quantum secret key. Do not reuse this key with funds.
                            </span>
                          </div>
                          <HexField label="" value={keypair.sk_hex} byteLen={2560} />
                        </>
                      )
                    : (
                        <div className="bg-zinc-50 border border-zinc-200 px-3 py-2 font-mono text-xs text-zinc-400 select-none">
                          {'•'.repeat(64)}
                        </div>
                      )}
                </div>

                <HexField label="Commitment hash (local)" value={local.hashHex} byteLen={32} full />
              </div>
            </div>

            <div className={card}>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs uppercase tracking-wider text-zinc-500">On-chain commitment</div>
                {onChain.kind === 'loading' && (
                  <span className="text-[10px] font-mono text-zinc-400 inline-flex items-center gap-1">
                    <span className="icon-[mdi--loading] animate-spin" />
                    loading
                  </span>
                )}
              </div>

              {onChain.kind === 'none' && (
                <div className="text-sm text-zinc-600 inline-flex items-center gap-2">
                  <span className="icon-[mdi--circle-outline] text-zinc-400" />
                  No commitment stored for this account yet.
                </div>
              )}

              {onChain.kind === 'error' && (
                <div className="text-sm text-rose-700 inline-flex items-center gap-2">
                  <span className="icon-[mdi--alert-circle]" />
                  {onChain.message}
                </div>
              )}

              {onChain.kind === 'present' && (
                <div className="space-y-3">
                  <HexField label="On-chain hash" value={onChain.hashHex} byteLen={32} full />
                  {matches
                    ? (
                        <div className="inline-flex items-center gap-2 text-sm text-emerald-700">
                          <span className="icon-[mdi--check-circle]" />
                          matches local key
                        </div>
                      )
                    : (
                        <div className="inline-flex items-start gap-2 text-sm text-amber-700">
                          <span className="icon-[mdi--alert-circle] mt-0.5" />
                          <span>stored a different key — re-commit to update</span>
                        </div>
                      )}
                </div>
              )}
            </div>

            <div className={card}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-medium text-zinc-900">
                    {alreadyCommitted ? 'Re-commit to update on-chain hash' : 'Commit hash on-chain'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 font-mono">
                    PqRegistry.
                    {alreadyCommitted ? 'recommit' : 'commit'}
                    (
                    {shortHex(local.hashHex)}
                    )
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || onChain.kind === 'loading' || (matches === true && !submitError && !submitResult)}
                  className={primaryBtn}
                  title={matches ? 'Already committed with this key' : undefined}
                >
                  {submitting && <span className="icon-[mdi--loading] animate-spin" />}
                  {alreadyCommitted ? 'Re-commit' : 'Commit'}
                </button>
              </div>

              {steps.length > 0 && (
                <div className="mt-2 pt-4 border-t border-zinc-100">
                  <StatusTracker steps={steps} />
                </div>
              )}

              {submitError && (
                <div className="mt-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span className="icon-[mdi--alert-circle] mt-0.5" />
                    <div className="font-mono break-all">{submitError}</div>
                  </div>
                </div>
              )}

              {submitResult && (
                <div className="mt-4 bg-emerald-50 border border-emerald-200 px-4 py-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <span className="icon-[mdi--check-circle]" />
                    <span className="text-sm font-medium">
                      {submitResult.recommit ? 'Re-commit finalized' : 'Commit finalized'}
                      {' '}
                      in block #
                      {submitResult.blockNumber}
                    </span>
                  </div>
                  <HexField label="Block hash" value={submitResult.blockHash} byteLen={32} />
                  <HexField label="Event hash" value={submitResult.eventHash} byteLen={32} full />
                  <div className="text-xs text-emerald-700 inline-flex items-center gap-1 font-mono uppercase tracking-wider">
                    Continue to Upgrade
                    <span className="icon-[mdi--arrow-right]" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
              <button type="button" onClick={handleGenerate} className={secondaryBtn}>
                <span className="icon-[mdi--refresh]" />
                Regenerate keypair
              </button>
              <span>
                account:
                {shortHex(unifyAddress(selectedAccount.address), 8, 6)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
