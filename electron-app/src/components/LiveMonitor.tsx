import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchAllPhones, stopPhone, takeScreenshot, type GeelarkPhone } from '@/lib/geelark'

// ── PhoneLiveCard ────────────────────────────────────────────────────────────
function PhoneLiveCard({ phone, bearer, onStopped }: {
  phone: GeelarkPhone; bearer: string; onStopped: (id: string) => void
}) {
  const [imgSrc, setImgSrc]     = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const activeRef               = useRef(true)

  const refresh = useCallback(async () => {
    if (!activeRef.current) return
    const src = await takeScreenshot(bearer, phone.id)
    if (activeRef.current && src) setImgSrc(src)
  }, [bearer, phone.id])

  useEffect(() => {
    activeRef.current = true
    refresh()
    const t = setInterval(refresh, 3000)
    return () => { activeRef.current = false; clearInterval(t) }
  }, [refresh])

  const handleStop = async () => {
    setStopping(true)
    activeRef.current = false
    await stopPhone(bearer, phone.id)
    onStopped(phone.id)
  }

  const name = phone.serialName ?? phone.name ?? phone.id

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden"
      style={{ background: 'rgba(10,6,24,0.95)', border: '1px solid rgba(139,92,246,0.2)' }}>
      {/* 9:16 screen */}
      <div className="relative w-full" style={{ paddingBottom: '177.78%' }}>
        <div className="absolute inset-0 bg-black flex items-center justify-center">
          {imgSrc ? (
            <img src={imgSrc} alt={name} className="w-full h-full object-contain" />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'rgba(139,92,246,0.5)', borderTopColor: 'transparent' }} />
          )}
          {imgSrc && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-medium text-green-400">LIVE</span>
            </div>
          )}
        </div>
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="text-xs font-medium truncate" style={{ color: 'rgba(226,232,240,0.9)' }}>{name}</p>
        <button onClick={handleStop} disabled={stopping}
          className="flex-shrink-0 px-2 py-1 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.28)',
            color: stopping ? 'rgba(239,68,68,0.35)' : '#f87171',
            cursor: stopping ? 'not-allowed' : 'pointer',
          }}>
          {stopping ? '…' : '⏹'}
        </button>
      </div>
    </div>
  )
}

// ── LiveMonitorOverlay ───────────────────────────────────────────────────────
export default function LiveMonitorOverlay({ bearer }: { bearer: string }) {
  const [open, setOpen]           = useState(false)
  const [phones, setPhones]       = useState<GeelarkPhone[]>([])
  const [fetching, setFetching]   = useState(false)
  const loadedRef                 = useRef(false)

  // Listen for open events dispatched by any page (e.g. Phones button)
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('open-live-monitor', handler)
    return () => window.removeEventListener('open-live-monitor', handler)
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const loadPhones = useCallback(async () => {
    if (!bearer) return
    setFetching(true)
    try {
      const all = await fetchAllPhones(bearer)
      setPhones(all.filter(p => p.status === 0 || p.status === 2))
      loadedRef.current = true
    } catch { /* ignore */ } finally {
      setFetching(false)
    }
  }, [bearer])

  // Fetch phones once when first opened (not on every open — stays cached)
  useEffect(() => {
    if (open && !loadedRef.current) loadPhones()
  }, [open, loadPhones])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(6,4,18,0.97)', backdropFilter: 'blur(12px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          <h2 className="text-xl font-bold text-white">Monitor Live</h2>
          {!fetching && (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.22)' }}>
              {phones.length} allumé{phones.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadPhones}
            disabled={fetching}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {fetching ? (
              <div className="w-3 h-3 rounded-full border border-t-transparent animate-spin"
                style={{ borderColor: '#a78bfa', borderTopColor: 'transparent' }} />
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10 6a4 4 0 11-1.17-2.83"/><path d="M10 2v2.5H7.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            Actualiser
          </button>
          <button
            onClick={() => setOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-xl text-lg transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {fetching && phones.length === 0 ? (
          <div className="flex items-center justify-center h-40 gap-3" style={{ color: 'rgba(148,163,184,0.4)' }}>
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'rgba(139,92,246,0.5)', borderTopColor: 'transparent' }} />
            <span className="text-sm">Chargement des téléphones…</span>
          </div>
        ) : phones.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3"
            style={{ color: 'rgba(148,163,184,0.4)' }}>
            <span style={{ fontSize: 48 }}>📱</span>
            <p className="text-base font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>
              Aucun téléphone allumé
            </p>
            <button onClick={loadPhones}
              className="mt-1 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
              Réessayer
            </button>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {phones.map(phone => (
              <PhoneLiveCard
                key={phone.id}
                phone={phone}
                bearer={bearer}
                onStopped={id => setPhones(prev => prev.filter(p => p.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
