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
  hint = 'or click to browse',
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const f = files[0]
    if (!f) return
    onFile(f)
  }

  const baseClasses
    = 'border-2 border-dashed p-12 text-center transition-colors cursor-pointer select-none'
  const stateClasses = disabled
    ? 'border-zinc-200 bg-zinc-50/50 cursor-not-allowed opacity-60'
    : dragOver
      ? 'border-emerald-500 bg-emerald-50/50'
      : 'border-zinc-300 bg-zinc-50 hover:border-emerald-400 hover:bg-emerald-50/30'

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
      onDragOver={(e) => {
        e.preventDefault()
        if (disabled) return
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (disabled) return
        handleFiles(e.dataTransfer.files)
      }}
      className={`${baseClasses} ${stateClasses}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
        disabled={disabled}
      />
      <span className="icon-[mdi--upload-outline] text-4xl text-zinc-400 block mx-auto mb-3" />
      <div className="text-sm font-medium text-zinc-700">{label}</div>
      <div className="text-xs text-zinc-500 font-mono mt-1">{hint}</div>
    </div>
  )
}
