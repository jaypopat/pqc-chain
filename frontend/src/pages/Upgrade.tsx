import type { StepState } from '../components/StatusTracker'
import { Binary } from 'polkadot-api'
import { useEffect, useRef, useState } from 'react'
import FileDropZone from '../components/FileDropZone'
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

export default function Upgrade() {
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
      if (bytes.length < 4 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6D) {
        setWasm(undefined)
        setLoadError(`${file.name} is not a valid WASM module (missing magic \\x00asm).`)
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

  // Watch for the spec_version flip to advance step 3.
  useEffect(() => {
    if (!submit) return
    if (step3 !== 'active') return
    if (!version) return
    if (version.spec !== submit.startSpec) {
      setStep3('done')
      setSubmit(s => s ? { ...s, finishedAt: performance.now(), newSpec: version.spec } : s)
    }
  }, [version, submit, step3])

  useEffect(() => {
    return () => {
      subRef.current?.unsubscribe()
    }
  }, [])

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
    const startedAt = performance.now()
    setSubmit({ startSpec, startedAt })
    setStep1('active')

    try {
      const setCodeCall = api.tx.System.set_code({ code: Binary.fromBytes(wasm.bytes) }).decodedCall
      const sudoTx = api.tx.Sudo.sudo_unchecked_weight({
        call: setCodeCall,
        weight: { ref_time: 0n, proof_size: 0n },
      })

      const sub = sudoTx.signSubmitAndWatch(aliceSigner).subscribe({
        next: (evt) => {
          if (evt.type === 'signed' || evt.type === 'broadcasted') {
            setStep1('done')
          }
          if (evt.type === 'txBestBlocksState' && evt.found) {
            setStep1('done')
            setStep2('done')
            setStep3('active')
            setSubmit(s => s ? {
              ...s,
              txHash: evt.txHash,
              blockNumber: evt.block.number,
            } : s)
          }
          if (evt.type === 'finalized') {
            if (!evt.ok) {
              const errType = evt.dispatchError?.type ?? 'Unknown'
              setStep1(p => p === 'done' ? p : 'error')
              setStep2('error')
              setStep3('error')
              setSubmit(s => s ? { ...s, error: `dispatchError: ${errType}` } : s)
            }
          }
        },
        error: (err: unknown) => {
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

  const submitDisabled
    = !wasm
      || !version
      || needsConfirm
      || step1 === 'active'
      || (submit !== undefined && !submit.error && step3 !== 'done')

  const elapsedMs
    = submit?.finishedAt != null
      ? Math.round(submit.finishedAt - submit.startedAt)
      : undefined

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Stage 2</div>
        <h2 className="text-3xl tracking-tight font-semibold text-zinc-950 mb-4">Upgrade</h2>
        <p className="text-sm text-zinc-600 max-w-xl">
          Drop the v2 runtime WASM and flip the chain forklessly. Signed by the
          dev sudo key //Alice — no wallet popup on a multi-hundred-kB extrinsic.
        </p>
      </div>

      {!wasm && (
        <FileDropZone
          accept=".wasm"
          onFile={handleFile}
          label="Drop runtime WASM here"
          hint="or click to browse  (.wasm only)"
        />
      )}

      {loadError && (
        <div className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <span className="icon-[mdi--alert] mt-0.5 text-rose-600" />
          <div className="font-mono">{loadError}</div>
        </div>
      )}

      {wasm && (
        <div className="bg-white border border-zinc-200 p-6 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="icon-[mdi--file-code-outline] text-emerald-600 text-xl" />
              <span className="font-mono text-sm text-zinc-900">{wasm.filename}</span>
            </div>
            {!submit && (
              <button
                type="button"
                onClick={() => {
                  setWasm(undefined)
                  setLoadError(undefined)
                  setConfirmDowngrade(false)
                }}
                className="text-xs text-zinc-500 hover:text-rose-600 font-mono"
              >
                clear
              </button>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <dt className="uppercase tracking-wider text-zinc-500 mb-1">Size</dt>
              <dd className="font-mono text-zinc-800">
                {byteFmt.format(wasm.size)}
                {' '}
                B
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-wider text-zinc-500 mb-1">SHA-256</dt>
              <dd className="font-mono text-zinc-800" title={wasm.sha256}>{shortHex(wasm.sha256)}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wider text-zinc-500 mb-1">Inferred spec</dt>
              <dd className="font-mono text-zinc-800">{wasm.inferredSpec}</dd>
            </div>
          </dl>

          {wasm.inferredSpec === 'unknown' && (
            <div className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
              <span className="icon-[mdi--alert] mt-0.5 text-amber-600" />
              <div>
                Filename does not match
                {' '}
                <code className="font-mono">*_v2.*</code>
                {' '}
                or
                {' '}
                <code className="font-mono">*v2.compact*</code>
                {' '}
                — this might not actually upgrade the runtime. Continue at your own risk.
              </div>
            </div>
          )}
        </div>
      )}

      {wasm && (
        <div className="bg-white border border-zinc-200 p-6 space-y-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Pre-flight</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Current</div>
              <div className="font-mono text-zinc-900">
                {version
                  ? `spec=${version.spec} tx=${version.tx}`
                  : 'connecting…'}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Target</div>
              <div className="font-mono text-zinc-900">
                spec=
                {targetSpec}
              </div>
            </div>
          </div>

          {alreadyV2 && (
            <div className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-2">
              <div className="flex items-start gap-2">
                <span className="icon-[mdi--alert] mt-0.5 text-amber-600" />
                <div>
                  Chain is already on v2 — uploading again will downgrade or
                  fail. Continue?
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmDowngrade}
                  onChange={e => setConfirmDowngrade(e.target.checked)}
                  className="accent-emerald-600"
                />
                <span className="font-mono">I understand, proceed anyway</span>
              </label>
            </div>
          )}
        </div>
      )}

      {wasm && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={submitDisabled}
            onClick={onSubmit}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
          >
            <span className="icon-[mdi--upload-outline]" />
            Upgrade chain (sudo)
          </button>
          {submit?.error && (
            <button
              type="button"
              onClick={reset}
              className="px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 font-mono"
            >
              reset
            </button>
          )}
        </div>
      )}

      {submit && (
        <div className="bg-white border border-zinc-200 p-6 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Progress</div>
          <StatusTracker
            steps={[
              {
                label: 'sudo extrinsic signed and submitted',
                state: step1,
              },
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
        </div>
      )}

      {submit?.error && (
        <div className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <span className="icon-[mdi--alert] mt-0.5 text-rose-600" />
          <div className="font-mono break-all">{submit.error}</div>
        </div>
      )}

      {submit && step3 === 'done' && !submit.error && (
        <div className="border border-emerald-200 bg-emerald-50 p-5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-700">
            <span className="icon-[mdi--check-circle] text-xl" />
            <span className="text-sm font-semibold">Runtime upgrade complete</span>
          </div>
          <div className="text-xs text-emerald-800 font-mono space-y-1">
            <div>
              spec_version =
              {' '}
              {submit.newSpec}
            </div>
            {elapsedMs != null && (
              <div>
                elapsed =
                {' '}
                {byteFmt.format(elapsedMs)}
                {' '}
                ms
              </div>
            )}
          </div>
          <div className="text-xs text-emerald-700 pt-1">
            Continue to PQ Send →
          </div>
        </div>
      )}
    </div>
  )
}
