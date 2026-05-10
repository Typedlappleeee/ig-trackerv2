import { forwardRef, InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:   string
  error?:   string
  hint?:    string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-[11px] font-semibold text-text2/80 uppercase tracking-widest">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full px-4 py-2.5 rounded-xl text-sm text-text
            bg-surface2 border border-border
            placeholder:text-text2/50
            focus:outline-none focus:border-accent/60
            focus:ring-1 focus:ring-accent/20
            focus:shadow-[0_0_0_3px_rgba(79,142,247,0.1)]
            transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-danger/50 focus:border-danger/70 focus:ring-danger/20 focus:shadow-[0_0_0_3px_rgba(240,61,85,0.1)]' : ''}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-xs text-danger flex items-center gap-1"><span>⚠</span>{error}</p>}
        {hint && !error && <p className="text-[11px] text-text2/60">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
