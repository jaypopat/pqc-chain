import { useState } from 'react'
import { shortHex } from '../utils/formatters'

interface HexFieldProps {
  label: string
  value: string
  full?: boolean
  head?: number
  tail?: number
  byteLen?: number
}

export default function HexField({ label, value, full, head = 6, tail = 6, byteLen }: HexFieldProps) {
  const [copied, setCopied] = useState(false)
  const [show, setShow] = useState(false)
  const display = full || show ? value : shortHex(value, head, tail)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }
    catch { /* clipboard unavailable */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
        {byteLen != null && (
          <span className="text-[10px] text-zinc-400 font-mono">
            {byteLen}
            {' '}
            B
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 px-3 py-2 font-mono text-xs text-zinc-800">
        <code className="truncate flex-1">{display}</code>
        {!full && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="text-zinc-400 hover:text-zinc-700"
            title={show ? 'collapse' : 'expand'}
          >
            <span className={show ? 'icon-[mdi--chevron-up]' : 'icon-[mdi--chevron-down]'} />
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="text-zinc-400 hover:text-emerald-600"
          title="copy"
        >
          <span className={copied ? 'icon-[mdi--check]' : 'icon-[mdi--content-copy]'} />
        </button>
      </div>
    </div>
  )
}
