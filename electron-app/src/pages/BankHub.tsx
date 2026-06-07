import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Bank } from '@/pages/Bank'
import { CaptionBank } from '@/pages/CaptionBank'
import { playNav } from '@/lib/sounds'

type Tab = 'videos' | 'captions'

// ── Banque : onglet unifié vidéos + captions ─────────────────────────────────
export function BankHub({ user, initialTab = 'videos' }: { user: User; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)

  const TABS: { id: Tab; label: string; icon: string; accent: string }[] = [
    { id: 'videos',   label: 'Vidéos & médias', icon: 'M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z', accent: '34,211,238' },
    { id: 'captions', label: 'Captions',        icon: 'M17 8h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v4l-4-4H9a1.994 1.994 0 0 1-1.414-.586m0 0L11 14h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v4', accent: '139,92,246' },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#07070B' }}>
      {/* Segmented tab bar */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
        padding: '12px 22px 0',
      }}>
        <div style={{
          display: 'inline-flex', gap: 4, padding: 4, borderRadius: 13,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {TABS.map(tb => {
            const active = tab === tb.id
            return (
              <button key={tb.id}
                onClick={() => { if (!active) { playNav(); setTab(tb.id) } }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 16px',
                  borderRadius: 10, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', border: 'none',
                  background: active ? `linear-gradient(135deg, rgba(${tb.accent},0.2), rgba(${tb.accent},0.06))` : 'transparent',
                  color: active ? `rgb(${tb.accent})` : 'rgba(148,163,184,0.6)',
                  boxShadow: active ? `inset 0 0 0 1px rgba(${tb.accent},0.3)` : 'none',
                  transition: 'all 0.18s',
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={tb.icon} />
                </svg>
                {tb.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active page fills the rest */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'videos' ? <Bank user={user} /> : <CaptionBank user={user} />}
      </div>
    </div>
  )
}
