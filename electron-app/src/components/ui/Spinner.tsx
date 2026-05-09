interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-7 h-7 border-2',
  lg: 'w-10 h-10 border-[3px]',
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`${sizes[size]} rounded-full border-surface3 border-t-accent animate-spin ${className}`}
    />
  )
}

export function FullPageLoader() {
  return (
    <div className="fixed inset-0 bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-text2 text-sm">Chargement…</p>
      </div>
    </div>
  )
}
