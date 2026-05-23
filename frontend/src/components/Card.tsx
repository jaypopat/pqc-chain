import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode
  tag?: ReactNode
  children: ReactNode
  variant?: 'default' | 'strong'
}

export default function Card({ label, tag, children, variant = 'default', className = '', ...rest }: CardProps) {
  const surface = variant === 'strong' ? 'surface-strong' : 'surface'
  return (
    <div className={`${surface} p-6 ${className}`} {...rest}>
      {(label || tag) && (
        <div className="flex items-center justify-between mb-5">
          {label && <div className="label-tag">{label}</div>}
          {tag && <div className="label-tag text-violet">{tag}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
