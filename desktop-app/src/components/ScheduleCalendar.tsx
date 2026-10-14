// Calendrier des publications programmées (semaine / mois), avec glisser-déposer
// pour décaler un post serveur (status 'pending') à un autre jour — même heure.
import { useState } from 'react'
import type { Theme } from '@/lib/theme'
import { Btn, Segmented, toast, useNarrow } from '@/lib/ui'

export interface CalPost { id: string; type: string; status: string; scheduled_at: string; caption: string | null; phones: unknown[] | null }

const DAY_MS = 86400000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Les 7 jours (lundi → dimanche) de la semaine contenant `anchor`. */
export function weekDays(anchor: Date): Date[] {
  const d = startOfDay(anchor)
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
}
/** 42 cases (6 semaines) couvrant le mois de `anchor`, en commençant un lundi. */
export function monthCells(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = weekDays(first)[0]
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}
/** Seuls les posts serveur encore en attente, dans le futur, peuvent être déplacés. */
export function canMove(p: CalPost, now = Date.now()): boolean {
  return p.status === 'pending' && new Date(p.scheduled_at).getTime() > now
}
/** Nouvelle date : le jour cible, à la même heure qu'avant. */
export function movedDate(origIso: string, day: Date): Date {
  const o = new Date(origIso)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), o.getHours(), o.getMinutes(), 0, 0)
}

const TYPE: Record<string, { label: string; color: string }> = {
  mass_posting: { label: 'Reel', color: '#E1306C' }, posting: { label: 'Reel', color: '#E1306C' },
  story: { label: 'Story', color: '#A78BFA' }, tiktok: { label: 'TikTok', color: '#25F4EE' }, cross: { label: 'Cross-post', color: '#A1A1AA' },
}

export default function ScheduleCalendar({ theme, posts, onMove, onOpen }: {
  theme: Theme; posts: CalPost[]
  onMove: (p: CalPost, to: Date) => Promise<void>
  onOpen?: (p: CalPost) => void
}) {
  const narrow = useNarrow(760)
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [dragId, setDragId] = useState<string | null>(null)
  const [overDay, setOverDay] = useState<number | null>(null)
  const today = new Date()
  const days = view === 'week' ? weekDays(anchor) : monthCells(anchor)
  const byDay = (d: Date) => posts.filter(p => sameDay(new Date(p.scheduled_at), d)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const shift = (dir: number) => setAnchor(a => view === 'week' ? new Date(a.getTime() + dir * 7 * DAY_MS) : new Date(a.getFullYear(), a.getMonth() + dir, 1))
  const title = view === 'week'
    ? `${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const drop = async (d: Date) => {
    const p = posts.find(x => x.id === dragId)
    setDragId(null); setOverDay(null)
    if (!p) return
    const to = movedDate(p.scheduled_at, d)
    if (sameDay(to, new Date(p.scheduled_at))) return
    if (to.getTime() <= Date.now()) { toast('Impossible de programmer dans le passé.', 'bad'); return }
    await onMove(p, to)
  }

  const pill = (p: CalPost, compact: boolean) => {
    const t = TYPE[p.type] ?? { label: p.type, color: '#A1A1AA' }
    const movable = canMove(p)
    const n = p.phones?.length ?? 0
    const time = new Date(p.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return (
      <button key={p.id} type="button" draggable={movable}
        onDragStart={e => { if (!movable) { e.preventDefault(); return } setDragId(p.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={() => { setDragId(null); setOverDay(null) }}
        onClick={() => onOpen?.(p)}
        title={movable ? 'Glisse pour changer de jour' : p.status === 'geelark' ? 'Programmé chez GeeLark — annule puis reprogramme pour le déplacer' : ''}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0, padding: compact ? '3px 6px' : '6px 8px', borderRadius: 9,
          border: '1px solid rgba(255,255,255,0.08)', background: dragId === p.id ? 'rgba(255,255,255,0.08)' : '#161618', cursor: movable ? 'grab' : 'pointer',
          textAlign: 'left', color: '#EDEDEF', fontSize: compact ? 11 : 12, opacity: ['done', 'cancelled'].includes(p.status) ? 0.55 : 1, boxSizing: 'border-box',
        }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: p.status === 'failed' ? '#F87171' : t.color }} />
        <span style={{ fontVariantNumeric: 'tabular-nums', color: '#A1A1AA', flexShrink: 0 }}>{time}</span>
        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
        {!compact && <span style={{ marginLeft: 'auto', color: '#71717A', flexShrink: 0 }}>{n}</span>}
      </button>
    )
  }

  const cell = (d: Date, i: number, tall: boolean) => {
    const list = byDay(d)
    const isToday = sameDay(d, today)
    const out = view === 'month' && d.getMonth() !== anchor.getMonth()
    const max = view === 'month' ? 3 : 99
    return (
      <div key={i} onDragOver={e => { if (dragId) { e.preventDefault(); setOverDay(i) } }} onDragLeave={() => setOverDay(o => o === i ? null : o)} onDrop={e => { e.preventDefault(); void drop(d) }}
        style={{
          display: 'flex', flexDirection: 'column', gap: 4, minHeight: tall ? 220 : 96, padding: 6, minWidth: 0, boxSizing: 'border-box',
          background: overDay === i ? 'rgba(139,124,246,0.08)' : out ? '#0D0D0F' : '#111113',
          outline: overDay === i ? `1px solid ${theme.accent}` : 'none', transition: 'background .12s ease',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          {view === 'week' && <span style={{ fontSize: 11.5, color: '#71717A', textTransform: 'capitalize' }}>{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>}
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, borderRadius: 99, fontSize: 12, fontWeight: 600,
            background: isToday ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'transparent', color: isToday ? '#fff' : out ? '#5A5A63' : '#A1A1AA', fontVariantNumeric: 'tabular-nums', boxShadow: isToday ? '0 4px 12px -4px rgba(236,72,153,.7)' : 'none',
          }}>{d.getDate()}</span>
          {list.length > 0 && view === 'week' && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#71717A' }}>{list.length}</span>}
        </div>
        {list.slice(0, max).map(p => pill(p, view === 'month'))}
        {list.length > max && <span style={{ fontSize: 11, color: '#71717A', paddingLeft: 4 }}>+{list.length - max}</span>}
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 22, border: '1px solid rgba(255,255,255,0.07)', background: '#0E0E10', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <Btn theme={theme} sm tone="ghost" icon="M15 18l-6-6 6-6" onClick={() => shift(-1)} />
        <Btn theme={theme} sm tone="ghost" label="Aujourd’hui" onClick={() => setAnchor(new Date())} />
        <Btn theme={theme} sm tone="ghost" icon="M9 18l6-6-6-6" onClick={() => shift(1)} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF', textTransform: 'capitalize', marginLeft: 4 }}>{title}</span>
        <span style={{ marginLeft: 'auto' }}>
          <Segmented sm value={view} onChange={setView} options={[{ v: 'week', l: 'Semaine' }, { v: 'month', l: 'Mois' }]} />
        </span>
      </div>
      {view === 'month' && !narrow && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {weekDays(new Date()).map((d, i) => <span key={i} style={{ padding: '6px 8px', fontSize: 11.5, color: '#71717A', textTransform: 'capitalize' }}>{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>)}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'repeat(7,minmax(0,1fr))', gap: 1, background: 'rgba(255,255,255,0.06)' }}>
        {(narrow && view === 'month' ? days.filter(d => d.getMonth() === anchor.getMonth()) : days).map((d, i) => cell(d, i, view === 'week' && !narrow))}
      </div>
      <div style={{ padding: '8px 12px', fontSize: 11.5, color: '#71717A', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        Glisse un post « En attente (serveur) » sur un autre jour pour le décaler (même heure).
      </div>
    </div>
  )
}
