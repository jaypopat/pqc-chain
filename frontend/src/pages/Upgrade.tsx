import type { Tab } from '../components/Nav'
import type { StepState } from '../components/StatusTracker'
import { Binary } from 'polkadot-api'
import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import Card from '../components/Card'
import FileDropZone from '../components/FileDropZone'
import StageHeader from '../components/StageHeader'
import StageLayout from '../components/StageLayout'
import StatusTracker from '../components/StatusTracker'
import { useChain } from '../hooks/useChain'
import { useRuntimeVersion } from '../hooks/useRuntimeVersion'
import { aliceSigner } from '../utils/devKeys'
import { shortHex, toHex } from '../utils/formatters'

interface LoadedWasm {
  filename: string
  bytes: Uint8Array
  size: number
  sha256: string
  inferredSpec: number | 'unknown'
}

interface SubmitState {
  startSpec: number
  txHash?: string
  blockNumber?: number
  startedAt: number
  finishedAt?: number
  newSpec?: number
  error?: string
}

const byteFmt = new Intl.NumberFormat('en-US')

function inferSpec(filename: string): number | 'unknown' {
  if (filename.includes('_v2.') || filename.includes('v2.compact')) return 200
  return 'unknown'
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  return toHex(new Uint8Array(digest))
}

export default function Upgrade({ goto }: { goto: (t: Tab) => void }) {
  const { api } = useChain()
  const version = useRuntimeVersion()

  const [loadError, setLoadError] = useState<string>()
  const [wasm, setWasm] = useState<LoadedWasm>()
  const [confirmDowngrade, setConfirmDowngrade] = useState(false)

  const [submit, setSubmit] = useState<SubmitState>()
  const [step1, setStep1] = useState<StepState>('idle')
  const [step2, setStep2] = useState<StepState>('idle')
  const [step3, setStep3] = useState<StepState>('idle')
  const subRef = useRef<{ unsubscribe: () => void } | null>(null)

  async function handleFile(file: File) {
    setLoadError(undefined)
    try {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      const isRawWasm = bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6D
      // Substrate's compressed-WASM prefix (8 bytes), used by *.compact.compressed.wasm.
      // sp-maybe-compressed-blob::WASM_HEADER. set_code accepts either form.
      const isSubstrateCompressed = bytes.length >= 8
        && bytes[0] === 0x52 && bytes[1] === 0xBC && bytes[2] === 0x53 && bytes[3] === 0x76
        && bytes[4] === 0x46 && bytes[5] === 0xDB && bytes[6] === 0x8E && bytes[7] === 0x05
      if (!isRawWasm && !isSubstrateCompressed) {
        setWasm(undefined)
        setLoadError(`${file.name} is not a runtime WASM (expected raw \\x00asm or Substrate compressed magic).`)
        return
      }
      const sha = await sha256Hex(bytes)
      setWasm({
        filename: file.name,
        bytes,
        size: bytes.length,
        sha256: sha,
        inferredSpec: inferSpec(file.name),
      })
      setConfirmDowngrade(false)
    }
    catch (err) {
      setWasm(undefined)
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (!submit) return
    if (step3 !== 'active') return
    if (!version) return
    if (version.spec !== submit.startSpec) {
      setStep3('done')
      setSubmit(s => s ? { ...s, finishedAt: performance.now(), newSpec: version.spec } : s)
    }
  }, [version, submit, step3])

  useEffect(() => () => { subRef.current?.unsubscribe() }, [])

  function reset() {
    subRef.current?.unsubscribe()
    subRef.current = null
    setSubmit(undefined)
    setStep1('idle')
    setStep2('idle')
    setStep3('idle')
  }

  async function onSubmit() {
    if (!wasm || !version) return
    reset()
    const startSpec = version.spec
    setSubmit({ startSpec, startedAt: performance.now() })
    setStep1('active')

    try {
      const setCodeCall = api.tx.System.set_code({ code: Binary.fromBytes(wasm.bytes) }).decodedCall
      const sudoTx = api.tx.Sudo.sudo_unchecked_weight({
        call: setCodeCall,
        weight: { ref_time: 0n, proof_size: 0n },
      })

      const sub = sudoTx.signSubmitAndWatch(aliceSigner).subscribe({
        next: (evt) => {
          if (evt.type === 'signed' || evt.type === 'broadcasted') setStep1('done')
          if (evt.type === 'txBestBlocksState' && evt.found) {
            setStep1('done')
            setStep2('done')
            setStep3('active')
            setSubmit(s => s ? { ...s, txHash: evt.txHash, blockNumber: evt.block.number } : s)
          }
          if (evt.type === 'finalized' && !evt.ok) {
            const errType = evt.dispatchError?.type ?? 'Unknown'
            setStep1(p => p === 'done' ? p : 'error')
            setStep2('error')
            setStep3('error')
            setSubmit(s => s ? { ...s, error: `dispatchError: ${errType}` } : s)
          }
        },
        error: (err) => {
          const msg = err instanceof Error ? err.message : String(err)
          setStep1(p => p === 'done' ? p : 'error')
          setStep2(p => p === 'done' ? p : 'error')
          setStep3(p => p === 'done' ? p : 'error')
          setSubmit(s => s ? { ...s, error: msg } : s)
        },
      })
      subRef.current = sub
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStep1('error')
      setSubmit(s => s ? { ...s, error: msg } : s)
    }
  }

  const currentSpec = version?.spec
  const targetSpec = wasm?.inferredSpec
  const alreadyV2 = currentSpec === 200
  const needsConfirm = alreadyV2 && !confirmDowngrade
  const submitDisabled = !wasm || !version || needsConfirm || step1 === 'active' || (submit !== undefined && !submit.error && step3 !== 'done')
  const elapsedMs = submit?.finishedAt != null ? Math.round(submit.finishedAt - submit.startedAt) : undefined

  return (
    <StageLayout>
      <StageHeader
        num="02"
        kicker="Runtime swap"
        title="Upgrade"
        blurb="Drop the v2 runtime WASM and flip the chain forklessly. Signed by the dev sudo key //Alice — no wallet popup on a multi-hundred-kB extrinsic."
      />

      {!wasm && (
        <FileDropZone
          accept=".wasm"
          onFile={handleFile}
          label="Drop runtime WASM"
          hint=".wasm only — or click to browse"
        />
      )}

      {loadError && (
        <div className="mt-5 bg-rose-wash/50 border border-rose-ink/20 px-4 py-3 text-rose-ink text-[12px] font-mono break-all flex items-start gap-2">
          <span className="icon-[mdi--alert-circle] mt-0.5 shrink-0" />
          <div>{loadError}</div>
        </div>
      )}

      {wasm && (
        <div className="space-y-5 mt-2">
          <Card label="Loaded runtime" tag={`spec → ${wasm.inferredSpec}`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="icon-[mdi--file-code-outline] text-violet text-xl shrink-0" />
                <span className="font-mono text-[13px] text-ink truncate">{wasm.filename}</span>
              </div>
              {!submit && (
                <button
                  type="button"
                  onClick={() => { setWasm(undefined); setLoadError(undefined); setConfirmDowngrade(false) }}
                  className="text-[10px] font-mono tracking-[0.18em] uppercase text-mut hover:text-rose-ink transition-colors"
                >
                  clear
                </button>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-6">
              <div>
                <dt className="label-tag mb-1.5">Size</dt>
                <dd className="font-mono text-[13px] text-ink tabular-nums">{byteFmt.format(wasm.size)} <span className="text-mut">B</span></dd>
              </div>
              <div>
                <dt className="label-tag mb-1.5">SHA-256</dt>
                <dd className="font-mono text-[13px] text-ink truncate" title={wasm.sha256}>{shortHex(wasm.sha256)}</dd>
              </div>
              <div>
                <dt className="label-tag mb-1.5">Inferred spec</dt>
                <dd className="font-mono text-[13px] text-violet font-semibold">{wasm.inferredSpec}</dd>
              </div>
            </dl>

            {wasm.inferredSpec === 'unknown' && (
              <div className="mt-5 bg-amber-wash/60 border border-amber-ink/25 px-3 py-2.5 text-amber-ink text-[12px] flex items-start gap-2">
                <span className="icon-[mdi--alert-outline] mt-0.5 shrink-0" />
                <div>
                  Filename does not match <code className="font-mono">*_v2.*</code> or <code className="font-mono">*v2.compact*</code> —
                  this might not upgrade the runtime. Continue at your own risk.
                </div>
              </div>
            )}
          </Card>

          <Card label="Pre-flight" tag={`sudo //Alice`}>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="label-tag mb-1.5">Current</div>
                <div className="font-mono text-[14px] text-ink tabular-nums">
                  {version ? <>spec=<span className="text-ink">{version.spec}</span> · tx=<span className="text-ink">{version.tx}</span></> : 'connecting…'}
                </div>
              </div>
              <div>
                <div className="label-tag mb-1.5">Target</div>
                <div className="font-mono text-[14px] text-violet font-semibold tabular-nums">spec={targetSpec}</div>
              </div>
            </div>

            {alreadyV2 && (
              <div className="mt-5 bg-amber-wash/60 border border-amber-ink/25 px-3 py-3 text-amber-ink text-[12px] space-y-2">
                <div className="flex items-start gap-2">
                  <span className="icon-[mdi--alert-outline] mt-0.5 shrink-0" />
                  <div>Chain is already on v2 — uploading again will downgrade or fail. Continue?</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer pl-6">
                  <input
                    type="checkbox"
                    checked={confirmDowngrade}
                    onChange={e => setConfirmDowngrade(e.target.checked)}
                    className="accent-violet"
                  />
                  <span className="font-mono text-[12px]">I understand, proceed anyway</span>
                </label>
              </div>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Button
              variant="violet"
              size="lg"
              busy={step1 === 'active'}
              disabled={submitDisabled}
              onClick={onSubmit}
              iconLeft="icon-[mdi--rocket-launch-outline]"
            >
              Execute upgrade
            </Button>
            {submit?.error && (
              <Button variant="ghost" onClick={reset} iconLeft="icon-[mdi--refresh]">Reset</Button>
            )}
          </div>

          {submit && (
            <Card label="Progress" tag={submit.txHash ? `txHash ${shortHex(submit.txHash)}` : undefined}>
              <StatusTracker
                steps={[
                  { label: 'sudo extrinsic signed and submitted', state: step1 },
                  {
                    label: submit.blockNumber != null
                      ? `set_code dispatched in block #${submit.blockNumber}`
                      : 'set_code dispatched',
                    state: step2,
                    detail: submit.txHash ? `txHash ${shortHex(submit.txHash)}` : undefined,
                  },
                  {
                    label: submit.newSpec != null
                      ? `runtime upgraded — spec_version ${submit.startSpec} → ${submit.newSpec}`
                      : `runtime upgrading — spec_version ${submit.startSpec} → ?`,
                    state: step3,
                  },
                ]}
              />
            </Card>
          )}

          {submit?.error && (
            <div className="bg-rose-wash/50 border border-rose-ink/20 px-4 py-3 text-rose-ink text-[12px] font-mono break-all flex items-start gap-2">
              <span className="icon-[mdi--alert-circle] mt-0.5 shrink-0" />
              <div>{submit.error}</div>
            </div>
          )}

          {submit && step3 === 'done' && !submit.error && (
            <div className="relative bg-violet/[0.06] border border-violet/30 px-7 py-6 overflow-hidden">
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-violet/15 blur-3xl pointer-events-none" />
              <div className="relative">
                <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-violet mb-2">runtime upgrade complete</div>
                <h3 className="text-[28px] tracking-[-0.02em] font-semibold text-ink">
                  QuantumLeap is now{' '}
                  <span className="italic-display violet-highlight">post-quantum.</span>
                </h3>
                <div className="mt-4 grid grid-cols-3 gap-6 font-mono text-[12px] text-ink/80">
                  <div>
                    <div className="label-tag mb-1">spec_version</div>
                    <div className="text-violet font-semibold text-[15px]">{submit.newSpec}</div>
                  </div>
                  <div>
                    <div className="label-tag mb-1">elapsed</div>
                    <div className="text-ink text-[15px]">{elapsedMs != null ? `${byteFmt.format(elapsedMs)} ms` : '—'}</div>
                  </div>
                  <div>
                    <div className="label-tag mb-1">classical transfers</div>
                    <div className="text-ink text-[15px]">CallFiltered</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goto('pq-send')}
                  className="mt-5 group inline-flex items-center gap-2 text-[11px] font-mono tracking-[0.18em] uppercase text-violet hover:text-ink transition-colors focus:outline-none"
                >
                  Continue to <span className="italic-display normal-case tracking-normal text-[14px]">Transfer</span>
                  <span className="icon-[mdi--arrow-right] text-base transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </StageLayout>
  )
}
