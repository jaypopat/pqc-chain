import { useRef, useState } from 'react'

interface FileDropZoneProps {
  accept?: string
  onFile: (file: File) => void
  disabled?: boolean
  label?: string
  hint?: string
}

export default function FileDropZone({
  accept = '.wasm',
  onFile,
  disabled = false,
  label = 'Drop runtime WASM here',
  hint = 'or click to browse (.wasm only)',
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const f = files[0]
    if (!f) return
    onFile(f)
  }

  const state = disabled
    ? 'border-rule bg-white/30 cursor-not-allowed opacity-50'
    : dragOver
      ? 'border-violet bg-violet/[0.06] scale-[1.005]'
      : 'border-rule-strong bg-white/60 hover:border-violet/60 hover:bg-violet/[0.03]'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (disabled) return
        inputRef.current?.click()
      }}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (disabled) return
        handleFiles(e.dataTransfer.files)
      }}
      className={`relative border-2 border-dashed transition-all duration-300 p-14 text-center cursor-pointer select-none ${state}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
        disabled={disabled}
      />
      <div className={`relative inline-flex items-center justify-center w-14 h-14 mb-4 ${dragOver ? 'dz-glow' : ''}`}>
        <div className="absolute inset-0 rounded-full bg-violet/[0.10]" />
        <span className={`relative icon-[mdi--upload-outline] text-3xl ${dragOver ? 'text-violet' : 'text-ink/60'}`} />
      </div>
      <div className="text-[15px] font-medium text-ink">{label}</div>
      <div className="text-[12px] text-mut font-mono mt-1.5">{hint}</div>
    </div>
  )
}
