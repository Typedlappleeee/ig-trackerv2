// Barre de sous-onglets premium (segmented control) — utilisée par les pages
// fusionnées (Automatisation, Activité) pour basculer entre deux vues.
import type { CSSProperties } from 'react'

export interface SubTab { id: string; label: string; emoji?: string }

export function SubTabBar({ tabs, active, onChange }: { tabs: SubTab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div style={{ flexShrink: 0, padding: '14px 28px 0', background: 'var(--base)' }}>
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 13, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {tabs.map(t => {
          const on = active === t.id
          const st: CSSProperties = {
            display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', cursor: 'pointer',
            padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: on ? 800 : 600, fontFamily: 'inherit',
            color: on ? '#fff' : 'var(--text-3)',
            background: on ? 'linear-gradient(100deg,#6366F1,#8B5CF6)' : 'transparent',
            boxShadow: on ? '0 10px 22px -12px rgba(99,102,241,0.7)' : 'none',
            transition: 'all .15s',
          }
          return (
            <button key={t.id} onClick={() => onChange(t.id)} style={st}>
              {t.emoji && <span style={{ fontSize: 14 }}>{t.emoji}</span>}
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default SubTabBar
