// Écran « bientôt disponible » pour une fonction verrouillée jusqu'à sa date de sortie.
import type { ReactNode } from 'react'
import type { Theme } from '@/lib/theme'
import { Icon } from '@/lib/ui'

export default function ComingSoon({ theme, icon, badge, title, text, action }: {
  theme: Theme; icon: string; badge: string; title: string; text: ReactNode; action?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '72px 24px', textAlign: 'center', animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 14, background: `rgba(${theme.tone},0.12)`, border: `1px solid rgba(${theme.tone},0.3)`, color: theme.accentText }}>
        <Icon d={icon} size={22} />
      </span>
      <span style={{ padding: '4px 11px', borderRadius: 99, background: `rgba(${theme.tone},0.14)`, border: `1px solid rgba(${theme.tone},0.3)`, color: theme.accentText, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>{badge}</span>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#F4F4F6' }}>{title}</div>
      <div style={{ maxWidth: 440, fontSize: 13, lineHeight: 1.6, color: '#A1A1AA' }}>{text}</div>
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}
