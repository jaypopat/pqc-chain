import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'ink' | 'violet' | 'ghost'
type Size = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
  iconLeft?: string
  iconRight?: string
  busy?: boolean
}

const base = 'inline-flex items-center justify-center gap-2 font-medium tracking-[0.14em] uppercase transition-[transform,background,color,border] duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-violet/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-y-px'

const sizes: Record<Size, string> = {
  md: 'px-4 py-2.5 text-[11px]',
  lg: 'px-6 py-3.5 text-xs',
}

const variants: Record<Variant, string> = {
  ink: 'bg-ink text-paper hover:bg-ink-soft',
  violet: 'bg-violet text-paper hover:bg-violet/90 shadow-[0_1px_0_rgba(15,23,42,0.04),0_8px_22px_-12px_rgba(124,58,237,0.55)]',
  ghost: 'bg-transparent text-ink border border-rule-strong hover:border-ink hover:bg-white/50',
}

export default function Button({
  variant = 'ink',
  size = 'md',
  children,
  iconLeft,
  iconRight,
  busy,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {busy ? <span className="icon-[mdi--loading] animate-spin text-base" /> : iconLeft && <span className={`${iconLeft} text-base`} />}
      <span>{children}</span>
      {iconRight && !busy && <span className={`${iconRight} text-base`} />}
    </button>
  )
}
