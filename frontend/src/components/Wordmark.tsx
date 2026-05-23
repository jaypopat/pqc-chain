interface WordmarkProps {
  onClick?: () => void
  size?: 'sm' | 'md'
}

export default function Wordmark({ onClick, size = 'md' }: WordmarkProps) {
  const dot = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'
  const text = size === 'sm' ? 'text-[13px]' : 'text-[15px]'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 ${onClick ? 'cursor-pointer hover:opacity-90' : ''}`}
    >
      <span className={`wm-dot ${dot}`} />
      <span className={`${text} font-semibold tracking-[-0.01em] text-ink`}>
        Quantum<span className="italic-display text-violet">Leap</span>
      </span>
    </Tag>
  )
}
