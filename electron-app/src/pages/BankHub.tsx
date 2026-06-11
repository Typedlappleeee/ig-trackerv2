import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Bank } from '@/pages/Bank'
import { CaptionBank } from '@/pages/CaptionBank'
import { playNav } from '@/lib/sounds'

type Tab = 'videos' | 'captions'

// ── Banque : onglet unifié vidéos + captions ─────────────────────────────────
export function BankHub({ user, initialTab = 'videos' }: { user: User; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)

  const TABS: { id: Tab; label: string; icon: React.ReactNode; accent: string; accentRgb: string }[] = [
    {
      id:        'videos',
      label:     'Vidéos & médias',
      accentRgb: '34,211,238',
      accent:    '#6366F1',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/>
        </svg>
      ),
    },
    {
      id:        'captions',
      label:     'Captions',
      accentRgb: '139,92,246',
      accent:    '#6366F1',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 8h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v4l-4-4H9a1.994 1.994 0 0 1-1.414-.586m0 0L11 14h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v4"/>
        </svg>
      ),
    },
  ]

  const activeTab = TABS.find(t => t.id === tab)!

  return (
    <div className="h-full flex flex-col overflow-hidden anim-page" style={{ background: 'var(--base)' }}>

      {/* ── Premium header with gradient title ──────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-7 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-4 mb-5">
          {/* Icon with glow */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 sf-anim-scale-spring"
            style={{
              background: `linear-gradient(135deg, rgba(${activeTab.accentRgb},0.18), rgba(${activeTab.accentRgb},0.06))`,
              border: `1px solid rgba(${activeTab.accentRgb},0.3)`,
              boxShadow: `0 0 20px -4px rgba(${activeTab.accentRgb},0.4)`,
              color: activeTab.accent,
              transition: 'all 0.3s ease',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-black leading-none sf-text-gradient sf-anim-slide-up sf-d50">Content Bank</h1>
            <p className="text-[13px] text-text3 mt-1 sf-anim-slide-up sf-d100">Manage your videos, media and caption templates</p>
          </div>
        </div>

        {/* Segmented tab bar */}
        <div className="sf-tabs sf-anim-slide-up sf-d150">
          {TABS.map(tb => {
            const active = tab === tb.id
            return (
              <button
                key={tb.id}
                onClick={() => { if (!active) { playNav(); setTab(tb.id) } }}
                className="sf-tab flex-1 cursor-pointer inline-flex items-center justify-center gap-2"
                style={active
                  ? {
                      background: `linear-gradient(135deg, rgba(${tb.accentRgb},0.18), rgba(${tb.accentRgb},0.06))`,
                      color:      tb.accent,
                      boxShadow:  `inset 0 0 0 1px rgba(${tb.accentRgb},0.3)`,
                      fontWeight: 700,
                    }
                  : {}}
              >
                {tb.icon}
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
