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

const KIND: Record<ToastKind, { bar: string; glow: string; icon: string; label: string }> = {
  ok:    { bar: 'bg-ok',     glow: 'shadow-[0_0_16px_-4px_rgba(0,204,170,0.4)]',     icon: '✓', label: 'text-ok'     },
  error: { bar: 'bg-danger', glow: 'shadow-[0_0_16px_-4px_rgba(240,61,85,0.4)]',     icon: '✕', label: 'text-danger' },
  warn:  { bar: 'bg-warn',   glow: 'shadow-[0_0_16px_-4px_rgba(255,170,42,0.4)]',    icon: '!', label: 'text-warn'   },
  info:  { bar: 'bg-accent', glow: 'shadow-[0_0_16px_-4px_rgba(79,142,247,0.35)]',   icon: 'i', label: 'text-accent' },
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
      className={`
        pointer-events-auto cursor-pointer
        min-w-[300px] max-w-[360px]
        bg-[#0d1120] border border-white/[0.07]
        rounded-2xl overflow-hidden
        ${c.glow}
        ${exiting ? 'anim-toast-out' : 'anim-toast-in'}
      `}
    >
      {/* Progress bar */}
      <div className="h-[2px] bg-surface2 relative overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 ${c.bar} rounded-full`}
          style={{
            animation: `toast-bar ${toast.duration}ms linear forwards`,
          }}
        />
      </div>

      <div className="px-4 py-3 flex items-start gap-3">
        {/* Icon badge */}
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${c.label} bg-current/10`}
          style={{ backgroundColor: 'rgba(var(--icon-bg, 0,0,0), 0.1)' }}
        >
          <span className={`${c.label} text-[13px] font-black leading-none`}>{c.icon}</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 py-0.5">
          <p className="text-[13px] font-semibold text-text leading-snug">{toast.title}</p>
          {toast.body && <p className="text-[11px] text-text2 mt-0.5 leading-snug">{toast.body}</p>}
        </div>

        {/* Close */}
        <button
          onClick={e => { e.stopPropagation(); dismiss() }}
          className="text-text2/40 hover:text-text2 text-xs mt-0.5 flex-shrink-0 transition-colors"
        >✕</button>
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
