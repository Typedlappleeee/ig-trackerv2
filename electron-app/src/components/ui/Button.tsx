import { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children:   ReactNode
  variant?:   'primary' | 'secondary' | 'danger' | 'ghost'
  size?:      'sm' | 'md' | 'lg'
  loading?:   boolean
  fullWidth?: boolean
}

const variants = {
  primary: `
    bg-accent hover:bg-accent2 active:bg-accent2 text-white border-transparent
    shadow-[0_2px_12px_-3px_rgba(79,142,247,0.45)]
    hover:shadow-[0_4px_16px_-3px_rgba(79,142,247,0.6)]
    active:shadow-[0_1px_6px_-2px_rgba(79,142,247,0.35)]
  `,
  secondary: `
    bg-surface2 hover:bg-surface3 active:bg-surface2 text-text border-border
    hover:border-accent/20
  `,
  danger: `
    bg-danger/10 hover:bg-danger/20 active:bg-danger/15 text-danger border-danger/30
    hover:border-danger/50 hover:shadow-[0_2px_12px_-3px_rgba(240,61,85,0.3)]
  `,
  ghost: `
    bg-transparent hover:bg-surface2 active:bg-surface3 text-text2 hover:text-text border-transparent
  `,
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3   text-sm rounded-xl',
}

export function Button({
  children,
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  fullWidth = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2
        font-semibold border
        transition-all duration-150 ease-out
        active:scale-[0.97]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
