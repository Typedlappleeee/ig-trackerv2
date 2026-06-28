import { useState, useEffect } from 'react'

interface AppTourProps {
  onClose: () => void
  onNavigate: (page: string) => void
  /** If provided, tour steps that target a page not passing this check are hidden */
  canSeePage?: (page: string) => boolean
}

interface TourStep {
  title:    string
  desc:     string
  iconName: string
  page?:    string   // if set, navigates to this page when step is shown
  color:    string
}

// Lucide-style step icons (no emoji per UI/UX Pro Max rule)
const STEP_ICON_PATHS: Record<string, string> = {
  welcome: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z',
  send:    'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  video:   'm22 8-6 4 6 4V8Z M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z',
  zap:     'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  folder:  'M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z',
  rocket:  'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  phone:    'M12 18h.01M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z',
  link:     'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  flame:    'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z',
  shield:   'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
}

function StepIcon({ name, size, color }: { name: string; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={STEP_ICON_PATHS[name]} />
    </svg>
  )
}

const STEPS: TourStep[] = [
  {
    iconName: 'welcome',
    title: 'Bienvenue sur ScaleFlow',
    desc: 'ScaleFlow automatise ta présence sur Instagram — posting, stories, remix, warmup et plus. Ce tour rapide te montre les onglets clés.',
    color: '#6366F1',
  },
  {
    iconName: 'phone',
    title: 'Téléphones',
    desc: 'Connecte et gère tous tes cloud phones GeeLark : groupes, comptes Instagram, démarrage. C’est ta base pour tout le reste.',
    page: 'phones',
    color: '#6366F1',
  },
  {
    iconName: 'send',
    title: 'Posting',
    desc: 'Poste une vidéo sur plusieurs comptes Instagram en même temps. Sélectionne tes téléphones, ta vidéo, et lance.',
    page: 'posting',
    color: '#6366F1',
  },
  {
    iconName: 'link',
    title: 'Story',
    desc: 'Publie ou programme des stories avec sticker lien sur tous tes comptes, automatiquement.',
    page: 'storylink',
    color: '#0EA5E9',
  },
  {
    iconName: 'calendar',
    title: 'Scheduler',
    desc: 'Programme tes posts à l’avance. ScaleFlow publie tout seul à l’heure prévue, même PC éteint.',
    page: 'scheduler',
    color: '#8B5CF6',
  },
  {
    iconName: 'flame',
    title: 'Warmup',
    desc: 'Chauffe tes comptes (scroll, likes, navigation naturelle) pour un comportement humain et limiter les blocages.',
    page: 'warmup',
    color: '#F97316',
  },
  {
    iconName: 'video',
    title: 'MassRemix',
    desc: 'Génère des dizaines de remix uniques depuis un pool de vidéos. Chaque remix est différent pour éviter le duplicate content.',
    page: 'remix',
    color: '#059669',
  },
  {
    iconName: 'shield',
    title: 'Spoof',
    desc: 'Rend chaque vidéo unique (métadonnées, luminosité, grain, zoom, teinte…) sans toucher au texte à l’écran. Anti-ban.',
    page: 'spoof',
    color: '#D97706',
  },
  {
    iconName: 'folder',
    title: 'Banque de contenu',
    desc: 'Stocke et organise toutes tes vidéos par dossiers. Retrouve-les facilement pour tes campagnes de posting.',
    page: 'bank',
    color: '#DC2626',
  },
  {
    iconName: 'rocket',
    title: 'C’est parti !',
    desc: 'Tu es prêt à utiliser ScaleFlow. Si tu as des questions, ouvre un ticket dans la section Support.',
    color: '#6366F1',
  },
]

export function AppTour({ onClose, onNavigate, canSeePage }: AppTourProps) {
  // Filter steps so pages the user can't access are skipped.
  // Steps without a `page` (welcome / finale) are always included.
  const steps = STEPS.filter(s => !s.page || !canSeePage || canSeePage(s.page))

  const [step, setStep] = useState(0)
  const current = steps[step]
  const isLast  = step === steps.length - 1
  const isFirst = step === 0

  useEffect(() => {
    if (current?.page) onNavigate(current.page)
  }, [step])

  function next() {
    if (isLast) { onClose(); return }
    setStep(s => s + 1)
  }
  function back() { if (!isFirst) setStep(s => s - 1) }

  // Safety: if all feature steps were filtered out (extreme restriction), close immediately.
  if (!current) { onClose(); return null }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      padding: '0 32px 32px 0',
      background: 'transparent', pointerEvents: 'none',
    }}>
      <div style={{
        width: 380, borderRadius: 20, pointerEvents: 'auto',
        background: 'linear-gradient(145deg, #16112a 0%, #1a1035 100%)',
        border: '1px solid rgba(99,102,241,0.25)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)',
        overflow: 'hidden',
        animation: 'tour-in 0.22s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{
            height: '100%',
            width: `${((step + 1) / steps.length) * 100}%`,
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
          }}>
            <StepIcon name={current.iconName} size={28} color={current.color} />
          </div>

          {/* Step counter */}
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(99,102,241,0.6)', marginBottom: 6, textTransform: 'uppercase' }}>
            Étape {step + 1} / {steps.length}
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 10px', lineHeight: 1.2 }}>
            {current.title}
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(233,234,240,0.75)', margin: 0, lineHeight: 1.6 }}>
            {current.desc}
          </p>

          {/* Dot indicators */}
          <div style={{ display: 'flex', gap: 5, marginTop: 24 }}>
            {steps.map((_, i) => (
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
                background: 'rgba(255,255,255,0.04)', color: 'rgba(233,234,240,0.8)',
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
