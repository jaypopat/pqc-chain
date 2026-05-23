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
      {label && (
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="label-tag">{label}</span>
          {byteLen != null && (
            <span className="text-[10px] font-mono text-mut-2 tabular-nums">{byteLen} B</span>
          )}
        </div>
      )}
      <div className="group flex items-center gap-2 bg-white/70 border border-rule px-3 py-2.5 font-mono text-[11.5px] text-ink hover:border-rule-strong transition-colors">
        <code className="truncate flex-1 select-all">{display}</code>
        {!full && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="text-mut hover:text-violet transition-colors"
            title={show ? 'collapse' : 'expand'}
          >
            <span className={`${show ? 'icon-[mdi--chevron-up]' : 'icon-[mdi--chevron-down]'} text-base`} />
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="text-mut hover:text-violet transition-colors"
          title="copy"
        >
          <span className={`${copied ? 'icon-[mdi--check]' : 'icon-[mdi--content-copy]'} text-[15px]`} />
        </button>
      </div>
    </div>
  )
}
