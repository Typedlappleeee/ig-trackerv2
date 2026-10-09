// Écran « bientôt disponible » pour une fonction verrouillée jusqu'à sa date de sortie.
import type { ReactNode } from 'react'
import type { Theme } from '@/lib/theme'
import { Icon } from '@/lib/ui'

export default function ComingSoon({ theme, icon, badge, title, text, action }: {
  theme: Theme; icon: string; badge: string; title: string; text: ReactNode; action?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '64px 24px', textAlign: 'center', animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 8, background: '#161618', border: '1px solid rgba(255,255,255,0.08)', color: theme.accentText }}>
        <Icon d={icon} size={18} />
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px', boxSizing: 'border-box', borderRadius: 5, background: `rgba(${theme.tone},0.08)`, border: `1px solid rgba(${theme.tone},0.2)`, color: theme.accentText, fontSize: 11, fontWeight: 500 }}>{badge}</span>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.015em' }}>{title}</div>
      <div style={{ maxWidth: 440, fontSize: 13, lineHeight: 1.55, color: '#8B8B94' }}>{text}</div>
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}
