// Grande carte d'outil / de format (Studio, Publication) : aperçu animé plein cadre, survol
// bien visible (soulèvement, contour violet, zoom de l'aperçu, bouton « Ouvrir » allumé),
// focus clavier. Même rendu partout pour qu'on sache toujours où on clique.
import { useState, type ReactNode } from 'react'
import { Icon } from '@/lib/ui'
import { ToolPreview } from '@/components/ToolArt'

export function BigCard({ preview, pick, icon, title, tag, desc, foot, onOpen, i = 0, height = 150 }: {
  preview: string; pick: (k: number) => string | null; icon: string; title: string; tag?: string; desc: ReactNode
  foot?: ReactNode; onOpen: () => void; i?: number; height?: number
}) {
  const [h, setH] = useState(false)
  return (
    <button type="button" onClick={onOpen} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onFocus={() => setH(true)} onBlur={() => setH(false)}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: 18, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
        background: h ? '#151418' : '#111113', border: `1px solid ${h ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.07)'}`,
        transform: h ? 'translateY(-4px)' : 'none', boxShadow: h ? '0 24px 50px -24px rgba(139,92,246,0.75)' : 'none',
        transition: 'transform .25s cubic-bezier(0.16,1,0.3,1), box-shadow .25s ease, border-color .2s ease, background .2s ease',
        animation: `aIn .4s cubic-bezier(0.16,1,0.3,1) ${i * 40}ms both`,
      }}>
      <span style={{ display: 'block', padding: '16px 16px 0' }}>
        <span style={{ display: 'block', transform: h ? 'scale(1.02)' : 'none', transition: 'transform .5s cubic-bezier(0.16,1,0.3,1)' }}>
          <ToolPreview id={preview} pick={pick} height={height} />
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px 16px', flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: h ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : '#18181B', border: h ? 'none' : '1px solid rgba(255,255,255,0.08)', color: h ? '#fff' : '#C4B5FD', transition: 'background .2s ease' }}>
            <Icon d={icon} size={15} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#F4F4F5', letterSpacing: '-0.02em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {tag && <span style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#A1A1AA', background: 'rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{tag}</span>}
        </span>
        <span style={{ fontSize: 13, lineHeight: 1.55, color: '#9A9AA3' }}>{desc}</span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#71717A' }}>{foot}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 800, color: h ? '#fff' : '#A1A1AA', background: h ? '#8B5CF6' : 'rgba(255,255,255,0.05)', transition: 'all .2s ease' }}>
            Ouvrir<Icon d="M5 12h14|M13 6l6 6-6 6" size={13} />
          </span>
        </span>
      </span>
    </button>
  )
}

/** Barre d'onglets d'une famille d'outils : l'outil ouvert est bien visible, 1 clic pour changer. */
export function ToolTabs({ backLabel, onBack, items, current, onPick }: {
  backLabel: string; onBack: () => void; items: { k: string; t: string; i: string }[]; current: string; onPick: (k: string) => void
}) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', margin: '0 -4px 18px', padding: '8px 4px', background: 'rgba(10,10,11,0.85)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', scrollbarWidth: 'none' }}>
      <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#A1A1AA', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>
        <Icon d="M15 18l-6-6 6-6" size={14} />{backLabel}
      </button>
      <span style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', flexShrink: 0, margin: '0 4px' }} />
      {items.map(x => {
        const on = x.k === current
        return (
          <button key={x.k} type="button" onClick={() => { if (!on) onPick(x.k) }} aria-current={on ? 'page' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, height: 36, padding: '0 13px', borderRadius: 10, cursor: on ? 'default' : 'pointer', fontSize: 13, fontWeight: on ? 800 : 600,
              border: on ? 'none' : '1px solid rgba(255,255,255,0.08)', color: on ? '#fff' : '#D4D4D8',
              background: on ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : '#111113', boxShadow: on ? '0 3px 0 #6D28D9' : 'none', transition: 'background .15s ease, border-color .15s ease' }}
            onMouseEnter={e => { if (!on) { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)'; e.currentTarget.style.background = '#17151C' } }}
            onMouseLeave={e => { if (!on) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = '#111113' } }}>
            <Icon d={x.i} size={14} />{x.t}
          </button>
        )
      })}
    </div>
  )
}
