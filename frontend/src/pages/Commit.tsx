import type { Subscription } from 'rxjs'
import type { StepState } from '../components/StatusTracker'
import { Binary } from 'polkadot-api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../components/Button'
import Card from '../components/Card'
import HexField from '../components/HexField'
import StageHeader from '../components/StageHeader'
import StageLayout from '../components/StageLayout'
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

  const local = useMemo(() => {
    if (!keypair) return null
    try {
      const pk = fromHex(keypair.pk_hex)
      const hashHex = commitmentHashHex(pk)
      return { pk, hashHex }
    }
    catch { return null }
  }, [keypair])

  const refreshOnChain = useCallback(async () => {
    if (!selectedAccount) { setOnChain({ kind: 'none' }); return }
    setOnChain({ kind: 'loading' })
    try {
      const addr = unifyAddress(selectedAccount.address)
      const stored = await api.query.PqRegistry.Commitment.getValue(addr)
      if (!stored) { setOnChain({ kind: 'none' }); return }
      setOnChain({ kind: 'present', hashHex: stored.asHex() })
    }
    catch (err) {
      setOnChain({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [api, selectedAccount])

  useEffect(() => { refreshOnChain() }, [refreshOnChain])

  const alreadyCommitted = onChain.kind === 'present'
  const matches = alreadyCommitted && local && onChain.hashHex.toLowerCase() === local.hashHex.toLowerCase()

  function handleGenerate() {
    const kp = keygenHex()
    save({ pk_hex: kp.pk_hex, sk_hex: kp.sk_hex })
  }

  async function handleSubmit() {
    if (!selectedAccount || !keypair || !local || submitting) return

    setSubmitError(null)
    setSubmitResult(null)
    setSubmitting(true)

    const isRecommit = alreadyCommitted
    setSteps([
      { label: 'wallet popup — sign with classical key', state: 'active' },
      { label: 'extrinsic submitted', state: 'idle' },
      { label: 'finalized', state: 'idle' },
    ])

    let sub: Subscription | null = null
    try {
      const signer = await polkadotSigner()
      if (!signer) throw new Error('No signer available for the selected account')

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
              { label: `extrinsic in best block #${ev.block.number}`, state: 'done', detail: `txHash ${shortHex(ev.txHash)}` },
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
              { label: `extrinsic in best block #${ev.block.number}`, state: 'done' },
              { label: `finalized in #${ev.block.number} — ${eventName}{hash=${shortHex(eventHash)}}`, state: 'done', detail: `block ${shortHex(ev.block.hash)}` },
            ])
            setSubmitResult({ blockHash: ev.block.hash, blockNumber: ev.block.number, eventHash, recommit: isRecommit })
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
      if (sub) sub.unsubscribe()
    }
  }

  return (
    <StageLayout>
      <StageHeader
        num="01"
        kicker="Pre-quantum lockbox"
        title="Commit"
        blurb="Generate a post-quantum keypair in your browser and commit the hash of its public key on-chain, signed with your classical wallet. This is the lockbox that survives the upgrade."
      />

      <div className="space-y-5">
        {!selectedAccount && (
          <Card label="Wallet required">
            <div className="flex items-start gap-3">
              <span className="icon-[mdi--wallet-outline] text-ink/40 text-2xl mt-0.5" />
              <div>
                <div className="text-[14px] font-medium text-ink mb-1">No wallet connected</div>
                <div className="text-[13px] text-ink/70">
                  Click{' '}
                  <span className="font-mono tracking-[0.12em] text-violet uppercase text-[11px] border border-violet/30 px-1.5 py-0.5">Connect</span>{' '}
                  in the header to choose a Talisman account.
                </div>
              </div>
            </div>
          </Card>
        )}

        {selectedAccount && !keypair && (
          <Card label="Generate keypair" tag="ML-DSA-44">
            <div className="flex items-start gap-3 mb-5">
              <span className="icon-[mdi--key-variant] text-ink/40 text-2xl mt-0.5" />
              <div>
                <div className="text-[14px] font-medium text-ink mb-1">No post-quantum key yet</div>
                <div className="text-[13px] text-ink/70 max-w-[52ch]">
                  Generate a fresh ML-DSA-44 keypair in your browser. The secret key stays in
                  localStorage on this device.
                </div>
              </div>
            </div>
            <Button variant="violet" iconLeft="icon-[mdi--key-plus]" onClick={handleGenerate}>
              Generate ML-DSA-44 keypair
            </Button>
          </Card>
        )}

        {selectedAccount && keypair && local && (
          <>
            <Card label="Local keypair" tag="ML-DSA-44">
              <div className="space-y-4">
                <HexField label="Public key" value={keypair.pk_hex} byteLen={1312} />

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="label-tag">Secret key</span>
                    <button
                      type="button"
                      onClick={() => setRevealSk(s => !s)}
                      className="text-[10px] font-mono uppercase tracking-[0.18em] text-mut hover:text-violet inline-flex items-center gap-1 transition-colors"
                    >
                      <span className={revealSk ? 'icon-[mdi--eye-off-outline] text-sm' : 'icon-[mdi--eye-outline] text-sm'} />
                      {revealSk ? 'hide' : 'reveal'}
                    </button>
                  </div>
                  {revealSk
                    ? (
                        <>
                          <div className="flex items-start gap-2 bg-amber-wash/60 border border-amber-ink/20 text-amber-ink text-[12px] px-3 py-2 mb-2">
                            <span className="icon-[mdi--alert-outline] mt-0.5 shrink-0" />
                            <span>
                              Demo wallet — localStorage is not a safe place for a real
                              post-quantum secret key. Do not reuse this key with funds.
                            </span>
                          </div>
                          <HexField label="" value={keypair.sk_hex} byteLen={2560} />
                        </>
                      )
                    : (
                        <div className="bg-white/70 border border-rule px-3 py-2.5 font-mono text-[11.5px] text-ink/30 select-none tracking-[0.2em]">
                          {'•'.repeat(48)}
                        </div>
                      )}
                </div>

                <HexField label="Commitment hash · derived locally" value={local.hashHex} byteLen={32} full />
              </div>
            </Card>

            <Card label="On-chain commitment" tag={`PqRegistry.Commitment(${shortHex(unifyAddress(selectedAccount.address), 4, 4)})`}>
              {onChain.kind === 'loading' && (
                <div className="text-[12px] font-mono text-mut inline-flex items-center gap-2">
                  <span className="icon-[mdi--loading] animate-spin" />
                  reading storage…
                </div>
              )}
              {onChain.kind === 'none' && (
                <div className="text-[13px] text-ink/70 inline-flex items-center gap-2">
                  <span className="icon-[mdi--circle-outline] text-ink/30" />
                  No commitment stored for this account yet.
                </div>
              )}
              {onChain.kind === 'error' && (
                <div className="text-[13px] text-rose-ink inline-flex items-center gap-2">
                  <span className="icon-[mdi--alert-circle]" />
                  {onChain.message}
                </div>
              )}
              {onChain.kind === 'present' && (
                <div className="space-y-3">
                  <HexField label="Stored hash" value={onChain.hashHex} byteLen={32} full />
                  {matches
                    ? (
                        <div className="inline-flex items-center gap-2 text-[13px] text-violet">
                          <span className="icon-[mdi--check-circle]" />
                          matches local key
                        </div>
                      )
                    : (
                        <div className="inline-flex items-start gap-2 text-[13px] text-amber-ink">
                          <span className="icon-[mdi--alert-circle] mt-0.5" />
                          <span>stored a different key — re-commit to update</span>
                        </div>
                      )}
                </div>
              )}
            </Card>

            <Card
              label={alreadyCommitted ? 'Re-commit on-chain' : 'Commit on-chain'}
              tag={`PqRegistry.${alreadyCommitted ? 'recommit' : 'commit'}(${shortHex(local.hashHex)})`}
            >
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div className="text-[13px] text-ink/75 max-w-[42ch]">
                  Submit the commitment, signed with{' '}
                  <span className="font-mono text-ink">{selectedAccount.name}</span>'s
                  classical key.
                </div>
                <Button
                  variant="violet"
                  size="lg"
                  busy={submitting}
                  disabled={submitting || onChain.kind === 'loading' || (matches === true && !submitError && !submitResult)}
                  onClick={handleSubmit}
                  iconRight="icon-[mdi--arrow-right]"
                  title={matches ? 'Already committed with this key' : undefined}
                >
                  {alreadyCommitted ? 'Re-commit' : 'Commit'}
                </Button>
              </div>

              {steps.length > 0 && (
                <div className="mt-6 pt-5 border-t border-rule">
                  <StatusTracker steps={steps} />
                </div>
              )}

              {submitError && (
                <div className="mt-5 bg-rose-wash/50 border border-rose-ink/20 px-4 py-3 text-rose-ink text-[12px] font-mono break-all flex items-start gap-2">
                  <span className="icon-[mdi--alert-circle] mt-0.5 shrink-0" />
                  <div>{submitError}</div>
                </div>
              )}

              {submitResult && (
                <div className="mt-5 bg-violet/[0.05] border border-violet/25 px-5 py-4 space-y-3">
                  <div className="flex items-baseline gap-2 text-ink">
                    <span className="icon-[mdi--check-circle] text-violet text-lg self-center" />
                    <span className="text-[14px] font-medium">
                      {submitResult.recommit ? 'Re-commit' : 'Commit'} finalized in block <span className="font-mono">#{submitResult.blockNumber}</span>
                    </span>
                  </div>
                  <HexField label="Block hash" value={submitResult.blockHash} byteLen={32} />
                  <HexField label="Event hash" value={submitResult.eventHash} byteLen={32} full />
                  <div className="inline-flex items-center gap-2 text-[11px] font-mono tracking-[0.18em] uppercase text-violet">
                    Continue to <span className="italic-display normal-case tracking-normal text-[14px]">Upgrade</span>
                    <span className="icon-[mdi--arrow-right] text-base" />
                  </div>
                </div>
              )}
            </Card>

            <div className="flex items-center justify-between text-[11px] font-mono text-mut pt-2">
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 hover:text-violet transition-colors"
              >
                <span className="icon-[mdi--refresh] text-base" />
                regenerate keypair
              </button>
              <span>
                account · <span className="text-ink/70">{shortHex(unifyAddress(selectedAccount.address), 6, 6)}</span>
              </span>
            </div>
          </>
        )}
      </div>
    </StageLayout>
  )
}
