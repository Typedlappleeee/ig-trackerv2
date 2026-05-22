import { useState, useEffect, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { fetchAllPhones, stopPhone, takeScreenshot, GeelarkPhone } from '@/lib/geelark'

const POLL_MS = 2000  // refresh every 2s per phone

function PhoneCard({
  phone,
  bearer,
  onStopped,
}: {
  phone: GeelarkPhone
  bearer: string
  onStopped: (id: string) => void
}) {
  const [imgSrc, setImgSrc]     = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [stopping, setStopping] = useState(false)
  const [error, setError]       = useState(false)
  const activeRef               = useRef(true)

  const refresh = useCallback(async () => {
    if (!activeRef.current) return
    const src = await takeScreenshot(bearer, phone.id)
    if (!activeRef.current) return
    if (src) { setImgSrc(src); setLoading(false); setError(false) }
    else      { setError(true); setLoading(false) }
  }, [bearer, phone.id])

  useEffect(() => {
    activeRef.current = true
    refresh()
    const t = setInterval(refresh, POLL_MS)
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
    <div
      className="flex flex-col rounded-2xl overflow-hidden transition-all hover:border-accent/30"
      style={{ background: '#0E0E16', border: '1px solid rgba(139,92,246,0.15)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
    >
      {/* Screenshot area — 9:16 ratio */}
      <div className="relative w-full" style={{ paddingBottom: '177.78%' /* 9:16 */ }}>
        <div className="absolute inset-0 bg-black flex items-center justify-center">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={name}
              className="w-full h-full object-contain"
              style={{ imageRendering: 'auto' }}
            />
          ) : error ? (
            <div className="flex flex-col items-center gap-2 text-center px-4">
              <span style={{ fontSize: 28 }}>⚠️</span>
              <p className="text-xs" style={{ color: 'rgba(148,163,184,0.6)' }}>
                Screenshot indisponible
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(139,92,246,0.6)', borderTopColor: 'transparent' }} />
              <p className="text-xs" style={{ color: 'rgba(148,163,184,0.4)' }}>Chargement…</p>
            </div>
          )}

          {/* Live indicator */}
          {imgSrc && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-medium text-green-400">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'rgba(226,232,240,0.9)' }}>{name}</p>
          {phone.groupName && (
            <p className="text-[11px] truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>{phone.groupName}</p>
          )}
        </div>
        <button
          onClick={handleStop}
          disabled={stopping}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: stopping ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: stopping ? 'rgba(239,68,68,0.4)' : '#f87171',
            cursor: stopping ? 'not-allowed' : 'pointer',
          }}
        >
          {stopping ? (
            <div className="w-3 h-3 rounded-full border border-t-transparent animate-spin" style={{ borderColor: '#f87171', borderTopColor: 'transparent' }} />
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="1" y="1" width="8" height="8" rx="1" />
            </svg>
          )}
          {stopping ? 'Arrêt…' : 'Éteindre'}
        </button>
      </div>
    </div>
  )
}

export default function Monitor({ user }: { user: User }) {
  const conns  = useConnections(user)
  const bearer = conns.bearer ?? ''

  const [phones, setPhones]     = useState<GeelarkPhone[]>([])
  const [fetching, setFetching] = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const loadPhones = useCallback(async () => {
    if (!bearer) return
    try {
      const all = await fetchAllPhones(bearer)
      // GéeLark: 0=running, 1=stopped, 2=starting, 3=stopping — show 0 and 2
      setPhones(all.filter(p => p.status === 0 || p.status === 2))
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setFetching(false)
    }
  }, [bearer])

  useEffect(() => {
    loadPhones()
    // Refresh the phone list every 10s to pick up newly started phones
    const t = setInterval(loadPhones, 10_000)
    return () => clearInterval(t)
  }, [loadPhones])

  const handleStopped = (id: string) => {
    setPhones(prev => prev.filter(p => p.id !== id))
  }

  if (!bearer) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'rgba(148,163,184,0.5)' }}>
        <span style={{ fontSize: 40 }}>🔑</span>
        <p className="text-sm">Configure ton token GéeLark dans les paramètres</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="sf-live-dot" />
            <h1 className="text-[18px] font-black text-white">Monitor Live</h1>
          </div>
          {!fetching && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)' }}>
              {phones.length} allumé{phones.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={loadPhones}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(196,181,253,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 6a4 4 0 11-1.17-2.83"/>
            <path d="M10 2v2.5H7.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Actualiser
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {fetching ? (
          <div className="flex items-center justify-center h-40 gap-3" style={{ color: 'rgba(148,163,184,0.4)' }}>
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(139,92,246,0.5)', borderTopColor: 'transparent' }} />
            <span className="text-sm">Chargement des téléphones…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span style={{ fontSize: 32 }}>❌</span>
            <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
          </div>
        ) : phones.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3" style={{ color: 'rgba(148,163,184,0.4)' }}>
            <span style={{ fontSize: 48 }}>📱</span>
            <p className="text-base font-medium" style={{ color: 'rgba(148,163,184,0.6)' }}>Aucun téléphone allumé</p>
            <p className="text-sm text-center max-w-xs">Démarre un ou plusieurs téléphones depuis la page Téléphones pour les voir ici.</p>
            <button onClick={loadPhones} className="mt-2 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
              Réessayer
            </button>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {phones.map(phone => (
              <PhoneCard
                key={phone.id}
                phone={phone}
                bearer={bearer}
                onStopped={handleStopped}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
