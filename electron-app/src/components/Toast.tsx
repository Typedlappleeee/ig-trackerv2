import { useState, useCallback, createContext, useContext } from 'react'
import { playToast as sfxToast } from '@/lib/sounds'

type ToastKind = 'ok' | 'error' | 'warn' | 'info'

interface ToastItem {
  id:       string
  title:    string
  body?:    string
  kind:     ToastKind
  duration: number
}

interface ToastContextValue {
  show: (opts: { title: string; body?: string; kind?: ToastKind; duration?: number }) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside <ToastProvider>')
  return ctx
}

const KIND: Record<ToastKind, {
  border: string; glow: string; icon: string; iconBg: string; iconColor: string; barColor: string
}> = {
  ok: {
    border:    'rgba(52,211,153,0.3)',
    glow:      '0 0 24px -6px rgba(52,211,153,0.35)',
    icon:      '✓',
    iconBg:    'rgba(52,211,153,0.12)',
    iconColor: '#34d399',
    barColor:  '#34d399',
  },
  error: {
    border:    'rgba(240,61,85,0.3)',
    glow:      '0 0 24px -6px rgba(240,61,85,0.35)',
    icon:      '✕',
    iconBg:    'rgba(240,61,85,0.12)',
    iconColor: '#f87171',
    barColor:  '#f87171',
  },
  warn: {
    border:    'rgba(251,191,36,0.3)',
    glow:      '0 0 24px -6px rgba(251,191,36,0.3)',
    icon:      '!',
    iconBg:    'rgba(251,191,36,0.1)',
    iconColor: '#fbbf24',
    barColor:  '#fbbf24',
  },
  info: {
    border:    'rgba(139,92,246,0.35)',
    glow:      '0 0 24px -6px rgba(139,92,246,0.4)',
    icon:      'i',
    iconBg:    'rgba(139,92,246,0.12)',
    iconColor: '#a78bfa',
    barColor:  'linear-gradient(90deg, #7c3aed, #ec4899)',
  },
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false)
  const c = KIND[toast.kind]

  function dismiss() {
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 210)
  }

  return (
    <div
      onClick={dismiss}
      className={`pointer-events-auto cursor-pointer min-w-[300px] max-w-[360px] rounded-2xl overflow-hidden relative ${exiting ? 'anim-toast-out' : 'anim-toast-in'}`}
      style={{
        background: 'rgba(8,5,20,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${c.border}`,
        boxShadow: `${c.glow}, 0 16px 48px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Colored left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        style={{ background: c.barColor }}
      />

      {/* Top progress bar */}
      <div className="h-[2px] relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: c.barColor,
            animation: `toast-bar ${toast.duration}ms linear forwards`,
          }}
        />
      </div>

      <div className="pl-5 pr-4 py-3 flex items-start gap-3">
        {/* Icon badge */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: c.iconBg }}
        >
          <span className="text-[13px] font-black leading-none" style={{ color: c.iconColor }}>
            {c.icon}
          </span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-[13px] font-semibold leading-snug" style={{ color: '#e2d9f3' }}>
            {toast.title}
          </p>
          {toast.body && (
            <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'rgba(196,181,253,0.5)' }}>
              {toast.body}
            </p>
          )}
        </div>

        {/* Close */}
        <button
          onClick={e => { e.stopPropagation(); dismiss() }}
          className="text-xs mt-0.5 flex-shrink-0 transition-colors"
          style={{ color: 'rgba(196,181,253,0.3)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(196,181,253,0.7)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(196,181,253,0.3)')}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((opts: { title: string; body?: string; kind?: ToastKind; duration?: number }) => {
    const id   = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const dur  = opts.duration ?? 4000
    const kind = opts.kind ?? 'ok'
    const item: ToastItem = { id, title: opts.title, body: opts.body, kind, duration: dur }
    setToasts(prev => [...prev, item])
    sfxToast(kind)
    if (dur > 0) setTimeout(() => dismiss(id), dur + 300)
  }, [])

  function dismiss(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map(t => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
