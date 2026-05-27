import { useState, useEffect } from 'react'

interface AppTourProps {
  onClose: () => void
  onNavigate: (page: string) => void
}

interface TourStep {
  title:    string
  desc:     string
  icon:     string
  page?:    string   // if set, navigates to this page when step is shown
  color:    string
}

const STEPS: TourStep[] = [
  {
    icon: '👋',
    title: 'Bienvenue sur ScaleFlow',
    desc: 'ScaleFlow automatise ta présence sur Instagram — posting, remix, stats et plus. Ce tour rapide te montre les fonctionnalités clés.',
    color: '#7C3AED',
  },
  {
    icon: '📊',
    title: 'Dashboard',
    desc: 'Ton tableau de bord central. Vois tes statistiques en temps réel, l\'activité récente et l\'état de tes comptes Instagram.',
    page: 'dashboard',
    color: '#2563EB',
  },
  {
    icon: '📤',
    title: 'Mass Posting',
    desc: 'Poste automatiquement une vidéo sur plusieurs comptes Instagram en même temps. Sélectionne tes téléphones, ta vidéo, et lance.',
    page: 'massposting',
    color: '#7C3AED',
  },
  {
    icon: '🎬',
    title: 'MassRemix',
    desc: 'Génère des dizaines de remix uniques depuis un pool de vidéos. Chaque remix est différent pour éviter le duplicate content.',
    page: 'remix',
    color: '#059669',
  },
  {
    icon: '⚡',
    title: 'CloneVid',
    desc: 'Clone et transforme tes vidéos avec zoom, couleurs, crop et overlay texte. Parfait pour le anti-ban à grande échelle.',
    page: 'repurpose',
    color: '#D97706',
  },
  {
    icon: '🗄️',
    title: 'Banque de contenu',
    desc: 'Stocke et organise toutes tes vidéos par dossiers. Retrouve-les facilement pour tes campagnes de posting.',
    page: 'bank',
    color: '#DC2626',
  },
  {
    icon: '📈',
    title: 'Stats Instagram',
    desc: 'Analyse les performances de tes comptes : vues, abonnés, engagement. Identifie tes meilleures vidéos.',
    page: 'stats',
    color: '#0891B2',
  },
  {
    icon: '🚀',
    title: 'C\'est parti !',
    desc: 'Tu es prêt à utiliser ScaleFlow. Si tu as des questions, ouvre un ticket dans la section Support.',
    color: '#7C3AED',
  },
]

export function AppTour({ onClose, onNavigate }: AppTourProps) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1
  const isFirst = step === 0

  useEffect(() => {
    if (current.page) onNavigate(current.page)
  }, [step])

  function next() {
    if (isLast) { onClose(); return }
    setStep(s => s + 1)
  }
  function back() { if (!isFirst) setStep(s => s - 1) }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        width: 420, borderRadius: 20,
        background: 'linear-gradient(145deg, #16112a 0%, #1a1035 100%)',
        border: '1px solid rgba(124,58,237,0.25)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.1)',
        overflow: 'hidden',
        animation: 'tour-in 0.22s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{
            height: '100%',
            width: `${((step + 1) / STEPS.length) * 100}%`,
            background: `linear-gradient(90deg, ${current.color}, #a855f7)`,
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Body */}
        <div style={{ padding: '28px 28px 24px' }}>
          {/* Icon */}
          <div style={{
            width: 60, height: 60, borderRadius: 16, marginBottom: 20,
            background: `${current.color}22`,
            border: `1.5px solid ${current.color}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
          }}>{current.icon}</div>

          {/* Step counter */}
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(167,139,250,0.6)', marginBottom: 6, textTransform: 'uppercase' }}>
            Étape {step + 1} / {STEPS.length}
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 10px', lineHeight: 1.2 }}>
            {current.title}
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(196,181,253,0.75)', margin: 0, lineHeight: 1.6 }}>
            {current.desc}
          </p>

          {/* Dot indicators */}
          <div style={{ display: 'flex', gap: 5, marginTop: 24 }}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                style={{
                  width: i === step ? 20 : 6, height: 6, borderRadius: 3,
                  background: i === step ? current.color : 'rgba(255,255,255,0.15)',
                  border: 'none', cursor: 'pointer', padding: 0,
                  transition: 'all 0.25s',
                }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '0 28px 24px',
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          {!isFirst && (
            <button
              onClick={back}
              style={{
                flex: 1, height: 40, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.8)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
            >
              ← Retour
            </button>
          )}

          <button
            onClick={next}
            style={{
              flex: 2, height: 40, borderRadius: 10, border: 'none',
              background: `linear-gradient(135deg, ${current.color}, #a855f7)`,
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.15s', boxShadow: `0 4px 16px ${current.color}44`,
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '0.9' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '1' }}
          >
            {isLast ? 'Commencer →' : 'Suivant →'}
          </button>

          {!isLast && (
            <button
              onClick={onClose}
              style={{
                padding: '0 12px', height: 40, borderRadius: 10, border: 'none',
                background: 'transparent', color: 'rgba(148,163,184,0.5)',
                fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Passer
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes tour-in {
          from { opacity: 0; transform: scale(0.88) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
