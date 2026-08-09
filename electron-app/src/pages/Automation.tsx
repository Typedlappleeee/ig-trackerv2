// Onglet fusionné « Automatisation » = Programmé (Scheduler) + Récurrent (Tasks).
// Simplifie la nav : un seul endroit mental pour « ce qui part tout seul ».
import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Scheduler } from './Scheduler'
import { Tasks } from './Tasks'
import { SubTabBar } from '@/components/SubTabBar'
import { useTr } from '@/lib/i18n'

export function Automation({ user, onNavigate, showRecurring = false }: {
  user: User
  onNavigate?: (page: string, tab?: string) => void
  showRecurring?: boolean
}) {
  const tr = useTr()
  const [tab, setTab] = useState<'scheduled' | 'recurring'>('scheduled')
  // Popup d'info affiché à CHAQUE entrée dans l'onglet (à chaque montage).
  const [notice, setNotice] = useState(true)
  const closeNotice = () => setNotice(false)
  const eff = showRecurring ? tab : 'scheduled'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {showRecurring && (
        <SubTabBar
          active={eff}
          onChange={id => setTab(id as 'scheduled' | 'recurring')}
          tabs={[
            { id: 'scheduled', label: tr('Programmé', 'Scheduled'), emoji: '📅' },
            { id: 'recurring', label: tr('Récurrent', 'Recurring'), emoji: '🤖' },
          ]}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {eff === 'scheduled'
          ? <Scheduler user={user} onNavigate={onNavigate} />
          : <Tasks user={user} />}
      </div>

      {/* ── Popup d'information à l'entrée ─────────────────────────────── */}
      {notice && (
        <div
          onClick={closeNotice}
          style={{ position: 'fixed', inset: 0, zIndex: 9600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(4,4,10,0.6)', backdropFilter: 'blur(6px)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="sf-glass"
            style={{ width: 'min(460px, 94vw)', padding: 24, textAlign: 'center', boxShadow: '0 30px 80px -30px rgba(0,0,0,0.8), 0 0 0 1px rgba(245,158,11,0.2)' }}
          >
            <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.4)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>
              {tr('Automatisation — en cours d\'amélioration', 'Automation — being improved')}
            </h2>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)' }}>
              {tr(
                'Des problèmes peuvent survenir sur les posts programmés et les tâches récurrentes. Un changement de serveur est prévu très prochainement pour régler ces soucis et fiabiliser l\'exécution PC éteint.',
                'Issues may occur with scheduled posts and recurring tasks. A server upgrade is planned very soon to fix these problems and make PC-off execution reliable.',
              )}
            </p>
            <button onClick={closeNotice} className="sf-btn sf-btn-primary cursor-pointer" style={{ width: '100%', justifyContent: 'center', height: 40 }}>
              {tr('J\'ai compris', 'Got it')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Automation
