import { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children:  ReactNode
  variant?:  'primary' | 'secondary' | 'danger' | 'ghost'
  size?:     'sm' | 'md' | 'lg'
  loading?:  boolean
  fullWidth?: boolean
}

const variants = {
  primary:   'bg-accent hover:bg-accent2 text-white border-transparent',
  secondary: 'bg-surface2 hover:bg-surface3 text-text border-border',
  danger:    'bg-danger/10 hover:bg-danger/20 text-danger border-danger/30',
  ghost:     'bg-transparent hover:bg-surface2 text-text2 hover:text-text border-transparent',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2.5 text-sm rounded-lg',
  lg: 'px-6 py-3 text-sm rounded-lg',
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
        font-medium border transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
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
