import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Bank } from '@/pages/Bank'
import { CaptionBank } from '@/pages/CaptionBank'
import { playNav } from '@/lib/sounds'
import { useTr } from '@/lib/i18n'
import { BG_0, HAIR } from '@/lib/theme'

type Tab = 'videos' | 'captions'

// ── Banque : onglet unifié vidéos + captions ─────────────────────────────────
export function BankHub({ user, initialTab = 'videos' }: { user: User; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const tr = useTr()

  const TABS: { id: Tab; label: string; icon: React.ReactNode; accent: string; accentRgb: string }[] = [
    {
      id:        'videos',
      label:     tr('Vidéos & médias', 'Videos & media'),
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
    <div className="h-full flex flex-col overflow-hidden anim-page" style={{ background: BG_0 }}>

      {/* ── Page header (v2 canonical pattern) ──────────────────────────────── */}
      <div className="sf-page-header flex-shrink-0" style={{ borderBottom: `1px solid ${HAIR}` }}>
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          {/* Icon tile */}
          <div
            className="sf-page-icon sf-anim-scale-spring sf-float"
            style={{ ['--icon-grad' as any]: `linear-gradient(135deg, #818CF8, ${activeTab.accent} 50%, #8B5CF6)`, transition: 'background 0.3s ease' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
            </svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title sf-title-grad">{tr('Banque de contenu', 'Content Bank')}</h1>
            <p className="sf-page-sub">{tr('Gérez vos vidéos, médias et modèles de légendes', 'Manage your videos, media and caption templates')} · {activeTab.label}</p>
          </div>
        </div>
      </div>

      {/* Segmented tab bar */}
      <div className="flex-shrink-0" style={{ padding: '14px 28px 0' }}>
        <div className="sf-tabs sf-anim-slide-up sf-d150">
          {TABS.map(tb => {
            const active = tab === tb.id
            return (
              <button
                key={tb.id}
                onClick={() => { if (!active) { playNav(); setTab(tb.id) } }}
                className={`sf-tab flex-1 cursor-pointer inline-flex items-center justify-center gap-2 sf-press${active ? ' active' : ''}`}
                aria-pressed={active}
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
