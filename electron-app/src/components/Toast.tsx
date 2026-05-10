import { useState, useEffect, useCallback, createContext, useContext } from 'react'

type ToastKind = 'ok' | 'error' | 'warn' | 'info'

interface ToastItem {
  id:    string
  title: string
  body?: string
  kind:  ToastKind
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

const KIND_COLORS: Record<ToastKind, { border: string; bar: string; icon: string }> = {
  ok:    { border: 'border-ok/40',     bar: 'bg-ok',     icon: '✅' },
  error: { border: 'border-danger/40', bar: 'bg-danger', icon: '❌' },
  warn:  { border: 'border-warn/40',   bar: 'bg-warn',   icon: '⚠' },
  info:  { border: 'border-accent/40', bar: 'bg-accent', icon: 'ℹ️' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((opts: { title: string; body?: string; kind?: ToastKind; duration?: number }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const kind = opts.kind ?? 'ok'
    setToasts(prev => [...prev, { id, title: opts.title, body: opts.body, kind }])
    const dur = opts.duration ?? 4000
    if (dur > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), dur)
    }
  }, [])

  function dismiss(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const c = KIND_COLORS[t.kind]
          return (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={`pointer-events-auto cursor-pointer min-w-[280px] max-w-[340px] bg-surface border ${c.border} rounded-xl shadow-2xl overflow-hidden animate-slide-up`}
            >
              <div className={`h-[3px] w-full ${c.bar}`} />
              <div className="px-4 py-3 flex items-start gap-3">
                <span className="text-base flex-shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text">{t.title}</p>
                  {t.body && <p className="text-xs text-text2 mt-0.5">{t.body}</p>}
                </div>
                <button className="text-text2 hover:text-text text-xs">✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
