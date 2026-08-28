import { useMemo, useState } from 'react'
import { C, F, R } from '../theme'
import { PageHead, Panel, Kpi, Chip, Btn, Icon, ICONS, StatusDot, Mono } from '../ui'
import { PHONES, type Phone, type PhoneStatus } from '../data/mock'

const STATUS_LABEL: Record<PhoneStatus, string> = { online: 'En ligne', warmup: 'Warmup', limited: 'Limité', offline: 'Hors ligne', error: 'Erreur' }
const STATUS_KIND: Record<PhoneStatus, 'ok' | 'warn' | 'bad' | 'off'> = { online: 'ok', warmup: 'warn', limited: 'warn', offline: 'off', error: 'bad' }

function healthColor(h: number) { return h >= 70 ? C.ok : h >= 45 ? C.warn : C.bad }

export function Phones() {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('all')
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'risk'>('all')
  const [sel, setSel] = useState<Set<string>>(new Set())

  const groups = useMemo(() => ['all', ...Array.from(new Set(PHONES.map(p => p.group)))], [])
  const rows = useMemo(() => PHONES.filter(p => {
    if (group !== 'all' && p.group !== group) return false
    if (filter === 'online' && p.status !== 'online') return false
    if (filter === 'offline' && p.status !== 'offline') return false
    if (filter === 'risk' && p.health >= 70) return false
    if (q && !(`${p.name} ${p.account} ${p.group}`.toLowerCase().includes(q.toLowerCase()))) return false
    return true
  }), [q, group, filter])

  const online = PHONES.filter(p => p.status === 'online').length
  const offline = PHONES.filter(p => p.status === 'offline').length
  const risk = PHONES.filter(p => p.health < 70).length

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allShown = rows.length > 0 && rows.every(r => sel.has(r.id))

  return (
    <div>
      <PageHead title="Téléphones" sub="Gère et surveille tous tes cloud phones depuis un seul endroit."
        right={<><Chip text={`${PHONES.length}`} tone="violet" /><Btn label="Sync GeeLark" icon={ICONS.refresh} tone="primary" sm /><Btn label="Ajouter" icon={ICONS.plus} tone="ghost" sm /></>} />

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <Kpi label="Total" value={PHONES.length} />
        <Kpi label="En ligne" value={online} color={C.ok} />
        <Kpi label="Hors ligne" value={offline} color={C.t2} />
        <Kpi label="À risque" value={risk} color={C.bad} hint="santé < 70" hintColor={C.bad} />
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220, height: 34, padding: '0 12px', borderRadius: R.btn, border: '1px solid ' + C.b1, background: 'rgba(255,255,255,0.02)' }}>
          <Icon paths={ICONS.search} size={14} color={C.t3} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher téléphone, compte, groupe…" style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', color: C.t1, fontSize: 12.5 }} />
        </div>
        <select value={group} onChange={e => setGroup(e.target.value)} style={{ height: 34, padding: '0 12px', borderRadius: R.btn, border: '1px solid ' + C.b2, background: C.panel, color: C.t1, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          {groups.map(g => <option key={g} value={g}>{g === 'all' ? 'Tous les groupes' : g}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['all', 'Tous'], ['online', 'En ligne'], ['offline', 'Hors ligne'], ['risk', 'À risque']] as const).map(([v, l]) => (
            <FilterPill key={v} label={l} active={filter === v} tone={v === 'risk' ? 'bad' : 'violet'} onClick={() => setFilter(v)} />
          ))}
        </div>
      </div>

      {/* Table */}
      <Panel pad={0} style={{ overflow: 'hidden' }}>
        <TableRow head cells={[
          <Check checked={allShown} onClick={() => setSel(allShown ? new Set() : new Set(rows.map(r => r.id)))} />,
          'Téléphone', 'Groupe', 'Santé', 'Statut', 'Proxy · IP', <span style={{ textAlign: 'right', display: 'block' }}>Actions</span>,
        ]} />
        <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
          {rows.map(p => <PhoneLine key={p.id} p={p} checked={sel.has(p.id)} onToggle={() => toggle(p.id)} />)}
        </div>
      </Panel>

      {/* Barre d'actions groupées */}
      {sel.size > 0 && (
        <div style={{ position: 'sticky', bottom: 16, marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: R.panel, background: C.raise, border: '1px solid ' + C.accentBorder, boxShadow: '0 20px 50px -16px rgba(0,0,0,0.7)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{sel.size} sélectionné{sel.size > 1 ? 's' : ''}</span>
          <span style={{ flex: 1 }} />
          <Btn label="Publier" icon={ICONS.send} tone="primary" sm />
          <Btn label="Chauffer" icon={ICONS.flame} tone="ghost" sm />
          <Btn label="Démarrer" icon={ICONS.bolt} tone="ghost" sm />
          <Btn label="Groupe" tone="ghost" sm />
        </div>
      )}
    </div>
  )
}

const GRID = '30px 1.6fr 1fr 1.1fr 1fr 1.1fr 96px'

function TableRow({ cells, head }: { cells: React.ReactNode[]; head?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid ' + C.b1, ...(head ? { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.t4, background: 'rgba(255,255,255,0.015)' } : {}) }}>
      {cells.map((c, i) => <div key={i} style={{ minWidth: 0 }}>{c}</div>)}
    </div>
  )
}

function PhoneLine({ p, checked, onToggle }: { p: Phone; checked: boolean; onToggle: () => void }) {
  const [h, setH] = useState(false)
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid ' + C.b1, background: checked ? C.accentDim : h ? 'rgba(255,255,255,0.02)' : 'transparent', fontSize: 12.5, transition: 'background .12s' }}>
      <Check checked={checked} onClick={onToggle} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <Mono color={C.t1} size={12.5}>{p.name}</Mono>
        <span style={{ fontSize: 11.5, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.account}</span>
      </div>
      <div><Chip text={p.group} tone="mute" /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.07)', maxWidth: 70 }}><div style={{ height: '100%', width: p.health + '%', borderRadius: 99, background: healthColor(p.health) }} /></div>
        <Mono color={healthColor(p.health)} size={11.5}>{p.health}</Mono>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><StatusDot kind={STATUS_KIND[p.status]} /><span style={{ color: C.t2 }}>{STATUS_LABEL[p.status]}</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        {p.proxy ? <><Mono size={11.5} color={C.t2}>{p.proxy}</Mono><Mono size={10.5} color={C.t4}>{p.ip}</Mono></> : <span style={{ color: C.t4 }}>—</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <IconBtn icon={ICONS.bolt} />
        <IconBtn icon={ICONS.dots} />
      </div>
    </div>
  )
}

function Check({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 17, height: 17, borderRadius: 5, border: '1.5px solid ' + (checked ? C.accent : C.b3), background: checked ? C.accent : 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
      {checked && <Icon paths={ICONS.check} size={11} color="#fff" w={3} />}
    </button>
  )
}
function IconBtn({ icon }: { icon: string }) {
  const [h, setH] = useState(false)
  return <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid ' + (h ? C.b3 : C.b1), background: h ? 'rgba(255,255,255,0.04)' : 'transparent', color: h ? C.t1 : C.t3, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon paths={icon} size={14} /></button>
}
function FilterPill({ label, active, tone, onClick }: { label: string; active: boolean; tone: 'violet' | 'bad'; onClick: () => void }) {
  const col = tone === 'bad' ? C.bad : C.accent
  return <button onClick={onClick} style={{ height: 34, padding: '0 14px', borderRadius: 99, border: '1px solid ' + (active ? (tone === 'bad' ? 'rgba(248,113,113,0.4)' : C.accentBorder) : C.b2), background: active ? (tone === 'bad' ? 'rgba(248,113,113,0.12)' : C.accentDim) : 'transparent', color: active ? (tone === 'bad' ? C.bad : '#fff') : C.t3, fontSize: 12, fontWeight: active ? 800 : 600, cursor: 'pointer' }}>{label}</button>
}
