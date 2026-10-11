// Liens suivis (façon GetMySocial) — réservé à l'admin pour l'instant.
//   • Tableau de bord : visites, visites avec clic, taux de clic, visites par groupe,
//     courbe, top liens, en direct, pays.
//   • Liens : rangés par groupe (une modèle = un groupe), lien « page » par compte et liens
//     directs (OF, MYM…), notes, tendance, aujourd'hui, taux de clic.
//   • Création automatique : pour tous les comptes d'un coup (page + liens directs).
//   • Pages : les pages de liens (photo envoyée depuis le PC, boutons, thème).
// Servi publiquement par api/l.js (/l/<code>, ou tapmylink.fr/<code>).
// Tables : supabase/migrations/20261011_links.sql + 20261011b_links_v2.sql.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, Empty, Icon, Modal, PageHead, Panel, PanelHead, SkeletonRows, Toggle, Segmented, FIELD, TEXTAREA, MONO, toast, confirmDialog, promptDialog, useNarrow } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { phoneLabel, fmtNumber } from '@/lib/data'
import { IS_WEB } from '@/lib/platform'
import { computeLinkStats, type Period } from '@/lib/linkStats'

type PageTheme = 'dark' | 'light' | 'violet' | 'rose'
interface LinkPage { id: string; slug: string; title: string; bio: string; avatar_url: string | null; buttons: { label: string; url: string }[]; active: boolean; theme: PageTheme }
interface TLink { id: string; page_id: string | null; phone_id: string | null; code: string; destination: string | null; label: string; kind: 'landing' | 'direct'; group_id: string | null; notes: string; overrides: Record<string, string> }
interface Group { id: string; name: string }
interface Phone { id: string; phone_name: string; ig_username: string | null; geelark_id: string | null }
interface Click { link_id: string | null; page_id: string | null; button: number | null; created_at: string; device: string | null; country: string | null; visit_id: string | null }
type Owner = { user_id: string; org_id: string | null }

const SF_BASE = IS_WEB && typeof window !== 'undefined' && /^https?:/.test(window.location.origin) ? `${window.location.origin}/l/` : 'https://scaleflow.company/l/'
export type LinkDomain = 'scaleflow' | 'tapmylink'
const DOMAIN_KEY = 'sf-link-domain'
export const baseFor = (d: LinkDomain) => d === 'tapmylink' ? 'https://tapmylink.fr/' : SF_BASE
const loadDomain = (): LinkDomain => { try { return localStorage.getItem(DOMAIN_KEY) === 'tapmylink' ? 'tapmylink' : 'scaleflow' } catch { return 'scaleflow' } }
export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
/** Code unique : base, puis base2, base3… si déjà pris. */
export function makeCode(base: string, taken: Set<string>): string {
  const b = (slugify(base) || 'lien').slice(0, 56)
  let c = b, n = 2
  while (taken.has(c) || c.length < 2) c = `${b}${n++}`
  return c
}
/** Quel bouton de la page reçoit le lien OF / MYM d'un compte (par URL ou texte, sinon par position). */
export function buttonIndexFor(buttons: { label: string; url: string }[], kind: 'of' | 'mym'): number {
  const re = kind === 'of' ? /onlyfans/i : /mym/i
  const i = buttons.findIndex(b => re.test(b.url) || re.test(b.label))
  return i >= 0 ? i : kind === 'of' ? 0 : 1
}

const THEMES: { k: PageTheme; l: string; c: [string, string, string, string, string] }[] = [
  { k: 'dark', l: 'Sombre', c: ['#0A0A0B', '#EDEDEF', '#161618', '#EDEDEF', '#0A0A0B'] },
  { k: 'light', l: 'Clair', c: ['#FAFAFA', '#0A0A0B', '#FFFFFF', '#0A0A0B', '#FFFFFF'] },
  { k: 'violet', l: 'Violet', c: ['#140F24', '#F4F1FF', '#211936', '#8B7CF6', '#FFFFFF'] },
  { k: 'rose', l: 'Rose', c: ['#1F0F17', '#FFF1F6', '#2E1622', '#F472B6', '#1F0F17'] },
]
const DAY = 86400000
const EMPTY_PAGE: Omit<LinkPage, 'id'> = { slug: '', title: '', bio: '', avatar_url: '', buttons: [{ label: 'Mon OnlyFans', url: '' }, { label: 'Mon MYM', url: '' }], active: true, theme: 'dark' }
const ICON_LINK = 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1'
const ICON_PAGE = 'M4 4h16v16H4z|M4 9h16|M9 20V9'
const ICON_COPY = 'M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2|M16 4h4v4|M10 14L20 4'
const ICON_TRASH = 'M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6'

function Spark({ values, color = '#8B7CF6', w = 96, h = 26 }: { values: number[]; color?: string; w?: number; h?: number }) {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - 2 - (v / max) * (h - 5)}`).join(' ')
  return <svg width={w} height={h} aria-hidden style={{ display: 'block', overflow: 'visible', maxWidth: '100%' }}><polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity={0.1} /><polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /></svg>
}

export default function Links({ theme, user, org }: { theme: Theme; user: User; org: OrgState }) {
  const { currentOrg } = org
  const [pages, setPages] = useState<LinkPage[]>([])
  const [links, setLinks] = useState<TLink[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [phones, setPhones] = useState<Phone[]>([])
  const [clicks, setClicks] = useState<Click[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState<'' | 'v1' | 'v2'>('')
  const [tab, setTab] = useState<'dash' | 'links' | 'pages' | 'settings'>('dash')
  const [period, setPeriod] = useState<Period>('today')
  const [domain, setDomainState] = useState<LinkDomain>(loadDomain)
  const [edit, setEdit] = useState<(Omit<LinkPage, 'id'> & { id?: string }) | null>(null)
  const [auto, setAuto] = useState(false)
  const setDomain = (d: LinkDomain) => { setDomainState(d); try { localStorage.setItem(DOMAIN_KEY, d) } catch { /* ignore */ } }
  const BASE = baseFor(domain)
  const scope = useCallback((q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null), [currentOrg?.id, user.id])
  const owner: Owner = { user_id: user.id, org_id: currentOrg?.id ?? null }

  const load = useCallback(async (bg = false) => {
    if (!bg) setLoading(true)
    const since = new Date(Date.now() - 31 * DAY).toISOString()
    const [pg, ln, gr, ph, ck] = await Promise.all([
      scope(supabase.from('link_pages').select('*')).order('created_at'),
      scope(supabase.from('tracked_links').select('*')).order('created_at'),
      scope(supabase.from('link_groups').select('id,name')).order('created_at'),
      scope(supabase.from('phones').select('id,phone_name,ig_username,geelark_id')).order('phone_name'),
      supabase.from('link_clicks').select('*').eq('bot', false).gte('created_at', since).order('created_at', { ascending: false }).limit(50000),
    ])
    const noTable = (e: { message: string } | null) => !!e && /relation|does not exist|schema cache|column/i.test(e.message)
    setMissing(noTable(pg.error) ? 'v1' : noTable(gr.error) ? 'v2' : '')
    setPages(((pg.data ?? []) as LinkPage[]).map(p => ({ ...p, theme: p.theme ?? 'dark' })))
    setLinks(((ln.data ?? []) as TLink[]).map(l => ({ ...l, kind: l.kind ?? 'landing', notes: l.notes ?? '', overrides: l.overrides ?? {} })))
    setGroups((gr.data ?? []) as Group[]); setPhones((ph.data ?? []) as Phone[]); setClicks((ck.data ?? []) as Click[])
    setLoading(false)
  }, [scope])
  useEffect(() => { void load() }, [load])
  // Rafraîchit les stats toutes les 30 s sur le tableau de bord.
  useEffect(() => { if (tab !== 'dash') return; const iv = setInterval(() => { void load(true) }, 30_000); return () => clearInterval(iv) }, [tab, load])

  const stats = useMemo(() => computeLinkStats(clicks, links, period), [clicks, links, period])
  const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => toast('Lien copié', 'ok'), () => toast(t, 'info')) }

  if (missing) return (
    <div><PageHead title="Liens" sub="Pages de liens et liens suivis par compte." />
      <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01" title="Activation requise"
        text={missing === 'v1' ? 'Les tables des liens n’existent pas encore : colle supabase/migrations/20261011_links.sql puis 20261011b_links_v2.sql dans Supabase → SQL Editor → Run, puis recharge.' : 'Mise à jour de la base requise : colle supabase/migrations/20261011b_links_v2.sql dans Supabase → SQL Editor → Run, puis recharge.'} /></Panel>
    </div>
  )

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Liens" sub="Pages de liens et liens suivis par compte : tu sais quel compte envoie du trafic, et combien cliquent."
        actions={<>
          <Btn theme={theme} icon={ICON_PAGE} label="Nouvelle page" onClick={() => setEdit({ ...EMPTY_PAGE })} />
          <Btn theme={theme} tone="primary" icon="M13 2L3 14h9l-1 8 10-12h-9z" label="Création automatique" onClick={() => setAuto(true)} />
        </>} />
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Segmented value={tab} onChange={setTab} options={[{ v: 'dash', l: 'Tableau de bord' }, { v: 'links', l: 'Liens', n: links.length }, { v: 'pages', l: 'Pages', n: pages.length }, { v: 'settings', l: 'Réglages' }]} />
        {tab === 'dash' && <span style={{ marginLeft: 'auto' }}><Segmented value={period} onChange={setPeriod} options={[{ v: 'today', l: 'Aujourd’hui' }, { v: '7', l: '7 jours' }, { v: '30', l: '30 jours' }]} /></span>}
      </div>

      {loading ? <Panel theme={theme}><SkeletonRows rows={5} /></Panel>
        : tab === 'dash' ? <Dashboard theme={theme} stats={stats} links={links} groups={groups} period={period} BASE={BASE} />
        : tab === 'links' ? <LinksTab theme={theme} links={links} groups={groups} phones={phones} stats={stats} BASE={BASE} copy={copy} owner={owner} reload={() => load(true)} />
        : tab === 'pages' ? <PagesTab theme={theme} pages={pages} clicks={clicks} BASE={BASE} copy={copy} onEdit={p => setEdit({ ...p, avatar_url: p.avatar_url ?? '', buttons: p.buttons.length ? p.buttons : [{ label: '', url: '' }] })} reload={() => load(true)} onNew={() => setEdit({ ...EMPTY_PAGE })} />
        : <SettingsTab theme={theme} domain={domain} setDomain={setDomain} />}

      {edit && <PageEditor theme={theme} value={edit} setEdit={setEdit} BASE={BASE} scopeFolder={currentOrg ? `orgs/${currentOrg.id}` : `users/${user.id}`}
        onSave={async row => {
          const { error } = edit.id ? await supabase.from('link_pages').update(row).eq('id', edit.id) : await supabase.from('link_pages').insert({ ...row, ...owner })
          if (error) { toast(/duplicate|unique/i.test(error.message) ? 'Cette adresse est déjà prise — choisis-en une autre.' : `Échec : ${error.message}`, 'bad'); return }
          toast('Page enregistrée', 'ok'); setEdit(null); void load(true)
        }} />}
      {auto && <AutoCreate theme={theme} pages={pages} groups={groups} phones={phones} links={links} owner={owner} BASE={BASE} onClose={() => setAuto(false)} onDone={() => { setAuto(false); setTab('links'); void load(true) }} onNewPage={() => { setAuto(false); setEdit({ ...EMPTY_PAGE }) }} />}
    </div>
  )
}

// ── Tableau de bord ──────────────────────────────────────────────────────────
type Stats = ReturnType<typeof computeLinkStats>
function Dashboard({ theme, stats, links, groups, period, BASE }: { theme: Theme; stats: Stats; links: TLink[]; groups: Group[]; period: Period; BASE: string }) {
  const narrow = useNarrow(980)
  const per = period === 'today' ? 'Aujourd’hui' : period === '7' ? '7 jours' : '30 jours'
  const top = links.map(l => ({ l, s: stats.perLink.get(l.id) })).filter(x => x.s && x.s.visits > 0).sort((a, b) => b.s!.visits - a.s!.visits).slice(0, 12)
  const gName = (id: string | null) => id ? groups.find(g => g.id === id)?.name ?? '—' : 'Sans groupe'
  const COLORS = ['#8B7CF6', '#F472B6', '#38BDF8', '#FBBF24', '#4ADE80', '#A1A1AA']
  const totalG = stats.byGroup.reduce((a, b) => a + b[1], 0)
  const card = (label: string, value: string, series: number[], first = false) => (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, borderLeft: first || narrow ? 'none' : '1px solid rgba(255,255,255,0.06)', borderTop: narrow && !first ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.035em', color: '#EDEDEF', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 11.5, color: '#71717A' }}>{per}</span>
      <Spark values={series} w={220} h={34} />
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Panel theme={theme}>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3,minmax(0,1fr)) minmax(0,1.2fr)' }}>
          {card('Visites', fmtNumber(stats.visits), stats.buckets.map(b => b.visits), true)}
          {card('Visites avec clic', fmtNumber(stats.withClicks), stats.buckets.map(b => b.clicks))}
          {card('Taux de clic', stats.ctr === null ? '—' : `${stats.ctr} %`, stats.buckets.map(b => b.visits ? b.clicks / b.visits : 0))}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderLeft: narrow ? 'none' : '1px solid rgba(255,255,255,0.06)', borderTop: narrow ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Visites par groupe</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <svg width={84} height={84} viewBox="0 0 42 42" aria-hidden style={{ flexShrink: 0 }}>
                <circle cx={21} cy={21} r={15.9} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
                {(() => { let off = 25; return stats.byGroup.slice(0, 6).map(([g, n], i) => { const pct = totalG ? (n / totalG) * 100 : 0; const el = <circle key={String(g)} cx={21} cy={21} r={15.9} fill="none" stroke={COLORS[i]} strokeWidth={5} strokeDasharray={`${Math.max(0, pct - 1)} ${100 - Math.max(0, pct - 1)}`} strokeDashoffset={off} />; off -= pct; return el }) })()}
                <text x={21} y={23} textAnchor="middle" fontSize={7} fontWeight={600} fill="#EDEDEF">{fmtNumber(totalG)}</text>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: 1 }}>
                {stats.byGroup.length === 0 ? <span style={{ fontSize: 12, color: '#71717A' }}>Aucune visite.</span> : stats.byGroup.slice(0, 5).map(([g, n], i) => (
                  <span key={String(g)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: COLORS[i], flexShrink: 0 }} />
                    <span data-no-tr style={{ flex: 1, minWidth: 0, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gName(g)}</span>
                    <span style={{ color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(n)}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1.7fr) minmax(0,1fr)', gap: 12 }}>
        <Panel theme={theme}>
          <PanelHead title="Évolution des visites" sub={per} />
          <div style={{ padding: '12px 16px 14px' }}><AreaChart points={stats.buckets.map(b => ({ ts: b.ts, v: b.visits, c: b.clicks }))} hourly={period === 'today'} /></div>
        </Panel>
        <Panel theme={theme}>
          <PanelHead title="Top liens" sub={per} />
          {top.length === 0 ? <div style={{ padding: '24px 16px', fontSize: 12.5, color: '#8B8B94' }}>Aucune visite sur la période.</div> : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {top.map(({ l, s }, i) => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) 70px 46px', alignItems: 'center', gap: 10, padding: '9px 16px', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <span style={{ fontSize: 11.5, color: '#71717A' }}>{i + 1}</span>
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span data-no-tr style={{ fontSize: 12.5, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label || l.code}</span>
                    <span data-no-tr style={{ fontFamily: MONO, fontSize: 11, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{BASE.replace(/^https?:\/\//, '')}{l.code}</span>
                  </span>
                  <Spark values={s!.trend} w={70} h={22} />
                  <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(s!.visits)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
        <Panel theme={theme}>
          <PanelHead title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>En direct <span style={{ width: 6, height: 6, borderRadius: 99, background: '#4ADE80', animation: 'aPulse 1.6s ease-in-out infinite' }} /></span>} sub="Mis à jour toutes les 30 s" />
          <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 16, padding: 16, alignItems: 'end' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#8B8B94' }}>Visiteurs actifs</span>
              <span style={{ fontSize: 32, fontWeight: 600, color: '#EDEDEF', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{stats.liveNow}</span>
              <span style={{ fontSize: 11.5, color: '#71717A' }}>5 dernières minutes</span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#8B8B94' }}>Événements · 30 dernières minutes</span>
              <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64 }}>
                {stats.perMinute.map((n, i) => { const m = Math.max(1, ...stats.perMinute); return <span key={i} title={`${n}`} style={{ flex: 1, height: `${Math.max(3, (n / m) * 100)}%`, borderRadius: '2px 2px 0 0', background: n ? theme.accent : 'rgba(255,255,255,0.07)' }} /> })}
              </span>
            </span>
          </div>
        </Panel>
        <Panel theme={theme}>
          <PanelHead title="Géographie" sub={`${fmtNumber(stats.visits)} visite(s) · ${stats.countries.length} pays`} />
          {stats.countries.length === 0 ? <div style={{ padding: '24px 16px', fontSize: 12.5, color: '#8B8B94' }}>Aucune visite sur la période.</div> : stats.countries.slice(0, 8).map(([c, n], i) => (
            <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 16px', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: '#EDEDEF' }}>{flag(c)} <span data-no-tr>{countryName(c)}</span></span>
                <span style={{ color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(n)} · {Math.round((n / Math.max(1, stats.visits)) * 100)} %</span>
              </span>
              <span style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(n / stats.countries[0][1]) * 100}%`, background: theme.accent }} /></span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  )
}
const flag = (cc: string) => /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '🌐'
function countryName(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc)) return 'Inconnu'
  try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(cc) ?? cc } catch { return cc }
}

function AreaChart({ points, hourly }: { points: { ts: number; v: number; c: number }[]; hourly: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width)))); ro.observe(el); return () => ro.disconnect() }, [])
  const H = 230, padL = 30, padB = 22, padT = 8
  const max = Math.max(4, ...points.map(p => p.v))
  const nice = (() => { const st = Math.pow(10, Math.floor(Math.log10(max))); const m = Math.ceil(max / st); return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * st })()
  const x = (i: number) => padL + (i / Math.max(1, points.length - 1)) * (w - padL - 8)
  const y = (v: number) => padT + (H - padB - padT) * (1 - v / nice)
  // Courbe lissée (Catmull-Rom → Bézier).
  const P = points.map((p, i) => [x(i), y(p.v)] as [number, number])
  const path = P.map((p, i) => {
    if (i === 0) return `M${p[0]},${p[1]}`
    const p0 = P[i - 2] ?? P[i - 1], p1 = P[i - 1], p3 = P[i + 1] ?? p
    return `C${p1[0] + (p[0] - p0[0]) / 6},${p1[1] + (p[1] - p0[1]) / 6} ${p[0] - (p3[0] - p1[0]) / 6},${p[1] - (p3[1] - p1[1]) / 6} ${p[0]},${p[1]}`
  }).join(' ')
  const lab = (ts: number) => hourly ? new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const every = Math.ceil(points.length / 6)
  return (
    <div ref={ref} style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label="Visites sur la période" style={{ display: 'block' }}
        onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - padL) / (w - padL - 8)) * (points.length - 1)); setHover(Math.max(0, Math.min(points.length - 1, i))) }}>
        {[0, nice / 2, nice].map(t => <g key={t}><line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" /><text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="#71717A">{fmtNumber(t)}</text></g>)}
        {P.length > 1 && <path d={`${path} L${P[P.length - 1][0]},${y(0)} L${P[0][0]},${y(0)} Z`} fill="#8B7CF6" fillOpacity={0.1} />}
        <path d={path} fill="none" stroke="#8B7CF6" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => i % every === 0 || i === points.length - 1 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10.5} fill="#71717A">{lab(p.ts)}</text> : null)}
        {hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="rgba(255,255,255,0.18)" /><circle cx={x(hover)} cy={y(points[hover].v)} r={4.5} fill="#8B7CF6" stroke="#111113" strokeWidth={2} /></g>}
      </svg>
      {hover !== null && (
        <div style={{ position: 'absolute', top: 4, left: Math.min(Math.max(x(hover) - 70, 0), w - 140), width: 140, pointerEvents: 'none', padding: '8px 10px', borderRadius: 8, background: '#18181B', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)', fontSize: 12 }}>
          <div style={{ color: '#A1A1AA', marginBottom: 4 }}>{lab(points[hover].ts)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#A1A1AA' }}>Visites</span><b style={{ color: '#EDEDEF', fontWeight: 600 }}>{fmtNumber(points[hover].v)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#A1A1AA' }}>Clics</span><b style={{ color: '#EDEDEF', fontWeight: 600 }}>{fmtNumber(points[hover].c)}</b></div>
        </div>
      )}
    </div>
  )
}

// ── Liens (par groupe) ───────────────────────────────────────────────────────
function LinksTab({ theme, links, groups, phones, stats, BASE, copy, owner, reload }: {
  theme: Theme; links: TLink[]; groups: Group[]; phones: Phone[]; stats: Stats; BASE: string
  copy: (t: string) => void; owner: Owner; reload: () => void
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const toggle = (k: string) => setClosed(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const ql = q.trim().toLowerCase()
  const shown = links.filter(l => !ql || l.label.toLowerCase().includes(ql) || l.code.includes(ql) || (l.destination ?? '').toLowerCase().includes(ql))
  const sections: { id: string | null; name: string }[] = [...groups.map(g => ({ id: g.id, name: g.name })), { id: null, name: 'Sans groupe' }]
  async function newGroup() {
    const v = await promptDialog({ title: 'Nom du groupe (ex. la modèle)', placeholder: 'Luna' })
    if (!v) return
    const { error } = await supabase.from('link_groups').insert({ name: v, ...owner })
    if (error) toast(`Échec : ${error.message}`, 'bad'); else reload()
  }
  async function saveNotes(l: TLink, notes: string) {
    if (notes === l.notes) return
    const { error } = await supabase.from('tracked_links').update({ notes }).eq('id', l.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else reload()
  }
  async function remove(l: TLink) {
    if (!await confirmDialog({ title: `Supprimer le lien « ${l.label || l.code} » ?`, text: 'Le lien ne fonctionnera plus et ses statistiques seront supprimées.', confirmLabel: 'Supprimer', danger: true })) return
    const { error } = await supabase.from('tracked_links').delete().eq('id', l.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else reload()
  }
  async function deleteGroup(id: string) {
    if (!await confirmDialog({ title: 'Supprimer ce groupe ?', text: 'Les liens ne sont pas supprimés : ils passent dans « Sans groupe ».', confirmLabel: 'Supprimer', danger: true })) return
    const { error } = await supabase.from('link_groups').delete().eq('id', id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else reload()
  }
  const COLS = 'minmax(0,2.2fr) minmax(0,1.2fr) 100px 80px 80px 44px'
  // Pose le lien « page » de chaque compte comme lien de sticker par défaut (onglet Story).
  function useInStories() {
    let n = 0
    for (const p of phones) {
      const l = links.find(x => x.phone_id === p.id && x.kind === 'landing')
      if (!l) continue
      try { localStorage.setItem(`sf-story-link-${p.geelark_id ?? p.id}`, BASE + l.code); n++ } catch { /* ignore */ }
    }
    toast(n ? `${n} compte(s) : lien suivi posé dans les stories` : 'Aucun lien de compte à poser.', n ? 'ok' : 'info')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un lien…" style={{ ...FIELD, maxWidth: 320 }} />
        <span style={{ fontSize: 12, color: '#71717A' }}>{fmtNumber(shown.length)} lien(s)</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Btn theme={theme} sm tone="ghost" label="Utiliser dans les stories" onClick={useInStories} />
          <Btn theme={theme} sm tone="ghost" icon="M12 5v14|M5 12h14" label="Créer un groupe" onClick={newGroup} />
          <Btn theme={theme} sm tone="quiet" label="Tout déplier" onClick={() => setClosed(new Set())} />
          <Btn theme={theme} sm tone="quiet" label="Tout replier" onClick={() => setClosed(new Set(sections.map(s => s.id ?? 'none')))} />
        </span>
      </div>
      {links.length === 0 && <Panel theme={theme}><Empty icon={ICON_LINK} title="Aucun lien" text="Lance la « Création automatique » : une page par compte et ses liens directs (OF, MYM), en une fois." /></Panel>}
      {sections.map(sec => {
        const list = shown.filter(l => (l.group_id ?? null) === sec.id)
        if (!list.length && (sec.id === null || ql)) return null
        const k = sec.id ?? 'none'
        const open = !closed.has(k)
        const week = list.reduce((a, l) => a + (stats.perLink.get(l.id)?.trend.reduce((x, y) => x + y, 0) ?? 0), 0)
        const today = list.reduce((a, l) => a + (stats.perLink.get(l.id)?.today ?? 0), 0)
        const trend = Array.from({ length: 7 }, (_, i) => list.reduce((a, l) => a + (stats.perLink.get(l.id)?.trend[i] ?? 0), 0))
        return (
          <Panel key={k} theme={theme}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap' }} onClick={() => toggle(k)}>
              <span style={{ display: 'flex', color: '#8B8B94', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}><Icon d="M9 18l6-6-6-6" size={14} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span data-no-tr style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF' }}>{sec.name}</span>
                <span style={{ fontSize: 12, color: '#71717A' }}>{list.length} lien(s) · +{fmtNumber(today)} aujourd’hui</span>
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 12, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(week)} · 7 j</span>
                <Spark values={trend} w={90} h={24} />
                {sec.id && <span onClick={e => e.stopPropagation()}><Btn theme={theme} sm tone="quiet" icon={ICON_TRASH} onClick={() => deleteGroup(sec.id!)} /></span>}
              </span>
            </div>
            {open && list.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 780 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '0 16px', height: 32, alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, fontWeight: 500, color: '#71717A' }}>
                    <span>Lien</span><span>Notes</span><span>Tendance</span><span style={{ textAlign: 'right' }}>Aujourd’hui</span><span style={{ textAlign: 'right' }}>Taux de clic</span><span />
                  </div>
                  {list.map(l => {
                    const s = stats.perLink.get(l.id)
                    return (
                      <div key={l.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '8px 16px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span title={l.kind === 'direct' ? 'Lien direct' : 'Page de liens'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: l.kind === 'direct' ? '#F472B6' : theme.accentText }}><Icon d={l.kind === 'direct' ? ICON_LINK : ICON_PAGE} size={13} /></span>
                          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span data-no-tr style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label || l.code}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span data-no-tr style={{ fontFamily: MONO, fontSize: 11, color: '#8B8B94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{BASE.replace(/^https?:\/\//, '')}{l.code}</span>
                              <button type="button" onClick={() => copy(BASE + l.code)} title="Copier" style={{ display: 'flex', padding: 2, border: 'none', background: 'transparent', color: '#71717A', cursor: 'pointer' }}><Icon d={ICON_COPY} size={12} /></button>
                            </span>
                            {l.kind === 'direct' && l.destination && <span data-no-tr style={{ fontFamily: MONO, fontSize: 11, color: '#5A5A63', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {l.destination.replace(/^https?:\/\//, '')}</span>}
                          </span>
                        </span>
                        <input defaultValue={l.notes} placeholder="Ajouter une note…" onBlur={e => saveNotes(l, e.target.value.trim())} style={{ ...FIELD, height: 28, fontSize: 12 }} />
                        <Spark values={s?.trend ?? []} color={l.kind === 'direct' ? '#F472B6' : '#8B7CF6'} w={90} h={22} />
                        <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(s?.today ?? 0)}</span>
                        <span style={{ textAlign: 'right', fontSize: 12.5, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{s?.ctr === null || s?.ctr === undefined ? '—' : `${s.ctr} %`}</span>
                        <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn theme={theme} sm tone="quiet" icon={ICON_TRASH} onClick={() => remove(l)} /></span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Panel>
        )
      })}
    </div>
  )
}

// ── Création automatique (tous les comptes d'un coup) ─────────────────────────
function AutoCreate({ theme, pages, groups, phones, links, owner, BASE, onClose, onDone, onNewPage }: {
  theme: Theme; pages: LinkPage[]; groups: Group[]; phones: Phone[]; links: TLink[]; owner: Owner; BASE: string
  onClose: () => void; onDone: () => void; onNewPage: () => void
}) {
  const [pageId, setPageId] = useState(pages[0]?.id ?? '')
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? '__new__')
  const [groupName, setGroupName] = useState('')
  const [sel, setSel] = useState<Set<string>>(() => new Set(phones.filter(p => !links.some(l => l.phone_id === p.id && l.kind === 'landing')).map(p => p.id)))
  const [of, setOf] = useState<Record<string, string>>({})
  const [mym, setMym] = useState<Record<string, string>>({})
  const [direct, setDirect] = useState(true)
  const [busy, setBusy] = useState(false)
  const chosen = phones.filter(p => sel.has(p.id))
  const pg = pages.find(p => p.id === pageId)
  // Coller une colonne entière (un lien par ligne, dans l'ordre des comptes cochés).
  const pasteCol = (set: (f: (r: Record<string, string>) => Record<string, string>) => void, text: string) => {
    const ls = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    set(r => { const n = { ...r }; chosen.forEach((p, i) => { if (ls[i]) n[p.id] = ls[i] }); return n })
  }
  async function create() {
    if (!pg) { toast('Choisis (ou crée) une page modèle.', 'bad'); return }
    if (!chosen.length) { toast('Coche au moins un compte.', 'bad'); return }
    setBusy(true)
    try {
      let gid: string | null = groupId === '__none__' ? null : groupId
      if (groupId === '__new__') {
        const name = groupName.trim() || pg.title || pg.slug
        const { data, error } = await supabase.from('link_groups').insert({ name, ...owner }).select('id').single()
        if (error) throw error
        gid = (data as { id: string }).id
      }
      const taken = new Set(links.map(l => l.code))
      const iOf = buttonIndexFor(pg.buttons, 'of'), iMym = buttonIndexFor(pg.buttons, 'mym')
      const rows: Record<string, unknown>[] = []
      for (const p of chosen) {
        const name = p.ig_username || p.phone_name
        const ofUrl = (of[p.id] ?? '').trim(), mymUrl = (mym[p.id] ?? '').trim()
        const overrides: Record<string, string> = {}
        if (/^https?:\/\//i.test(ofUrl)) overrides[String(iOf)] = ofUrl
        if (/^https?:\/\//i.test(mymUrl)) overrides[String(iMym)] = mymUrl
        const code = makeCode(name, taken); taken.add(code)
        rows.push({ ...owner, kind: 'landing', page_id: pg.id, phone_id: p.id, group_id: gid, code, label: `IG - ${pg.title || pg.slug} - ${name}`, destination: null, overrides })
        if (direct && overrides[String(iOf)]) { const c = makeCode(`${name}1`, taken); taken.add(c); rows.push({ ...owner, kind: 'direct', page_id: null, phone_id: p.id, group_id: gid, code: c, label: `Lien direct OF → ${name}`, destination: ofUrl, overrides: {} }) }
        if (direct && overrides[String(iMym)]) { const c = makeCode(`${name}2`, taken); taken.add(c); rows.push({ ...owner, kind: 'direct', page_id: null, phone_id: p.id, group_id: gid, code: c, label: `Lien direct MYM → ${name}`, destination: mymUrl, overrides: {} }) }
      }
      const { error } = await supabase.from('tracked_links').insert(rows)
      if (error) throw error
      toast(`${rows.length} lien(s) créé(s)`, 'ok'); onDone()
    } catch (e) { toast(`Échec : ${(e as { message?: string })?.message ?? String(e)}`, 'bad') } finally { setBusy(false) }
  }
  const ROW = '28px minmax(0,1fr) minmax(0,1.4fr) minmax(0,1.4fr)'
  return (
    <Modal theme={theme} title="Création automatique" sub="Une page par compte (avec SES liens OF / MYM) + les liens directs, en une fois." width={880} onClose={onClose}
      footer={<><Btn theme={theme} tone="ghost" label="Annuler" onClick={onClose} /><Btn theme={theme} tone="primary" disabled={busy || !pg || !chosen.length} label={busy ? 'Création…' : `Créer pour ${chosen.length} compte(s)`} onClick={create} /></>}>
      {pages.length === 0 ? (
        <Empty icon={ICON_PAGE} title="Crée d’abord une page modèle" text="La page modèle (photo, bio, boutons OF / MYM) sert de base : chaque compte en reçoit une copie avec ses propres liens." action={<Btn theme={theme} tone="primary" label="Nouvelle page" onClick={onNewPage} />} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Page modèle</span>
              <select value={pageId} onChange={e => setPageId(e.target.value)} style={FIELD}>{pages.map(p => <option key={p.id} value={p.id}>{p.title || p.slug}</option>)}</select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Groupe</span>
              <select value={groupId} onChange={e => setGroupId(e.target.value)} style={FIELD}>
                <option value="__new__">+ Nouveau groupe</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                <option value="__none__">Sans groupe</option>
              </select>
            </label>
            {groupId === '__new__' && <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Nom du nouveau groupe</span>
              <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder={pg?.title || 'Luna'} style={FIELD} />
            </label>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#EDEDEF' }}>
            <Toggle on={direct} onChange={setDirect} /> Créer aussi les liens directs OF / MYM (pour la bio ou les DM)
          </label>
          <div style={{ fontSize: 12, color: '#8B8B94' }}>
            Colle les liens OF / MYM de chaque compte (idéalement ses liens de suivi OnlyFans). Astuce : colle une colonne entière d’un coup, un lien par ligne, dans l’ordre des comptes cochés.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', gap: 10 }}>
            <textarea rows={2} placeholder="Coller tous les liens OF (un par ligne)" onChange={e => pasteCol(setOf, e.target.value)} style={{ ...TEXTAREA, minHeight: 52, fontFamily: MONO, fontSize: 12 }} />
            <textarea rows={2} placeholder="Coller tous les liens MYM (un par ligne)" onChange={e => pasteCol(setMym, e.target.value)} style={{ ...TEXTAREA, minHeight: 52, fontFamily: MONO, fontSize: 12 }} />
          </div>
          <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, maxHeight: 360, overflow: 'auto' }}>
            <div style={{ minWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: ROW, gap: 10, padding: '0 12px', height: 32, alignItems: 'center', fontSize: 11, fontWeight: 500, color: '#71717A', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <input type="checkbox" checked={sel.size === phones.length && phones.length > 0} onChange={e => setSel(e.target.checked ? new Set(phones.map(p => p.id)) : new Set())} />
                <span>Compte</span><span>Lien OF</span><span>Lien MYM</span>
              </div>
              {phones.map(p => {
                const has = links.some(l => l.phone_id === p.id && l.kind === 'landing')
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: ROW, gap: 10, padding: '6px 12px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: sel.has(p.id) ? 1 : 0.5 }}>
                    <input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                      {has && <span style={{ fontSize: 11, color: '#FBBF24' }}>a déjà une page</span>}
                    </span>
                    <input value={of[p.id] ?? ''} placeholder="https://onlyfans.com/…" onChange={e => setOf(r => ({ ...r, [p.id]: e.target.value }))} style={{ ...FIELD, height: 28, fontSize: 12, fontFamily: MONO }} />
                    <input value={mym[p.id] ?? ''} placeholder="https://mym.fans/…" onChange={e => setMym(r => ({ ...r, [p.id]: e.target.value }))} style={{ ...FIELD, height: 28, fontSize: 12, fontFamily: MONO }} />
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#71717A' }}>Adresses créées : <span data-no-tr style={{ fontFamily: MONO }}>{BASE.replace(/^https?:\/\//, '')}&lt;compte&gt;</span> (page), <span data-no-tr style={{ fontFamily: MONO }}>…1</span> (OF direct), <span data-no-tr style={{ fontFamily: MONO }}>…2</span> (MYM direct).</div>
        </div>
      )}
    </Modal>
  )
}

// ── Pages de liens ───────────────────────────────────────────────────────────
function PagesTab({ theme, pages, clicks, BASE, copy, onEdit, onNew, reload }: {
  theme: Theme; pages: LinkPage[]; clicks: Click[]; BASE: string; copy: (t: string) => void
  onEdit: (p: LinkPage) => void; onNew: () => void; reload: () => void
}) {
  const week = (id: string) => clicks.filter(c => c.page_id === id && c.button === null && Date.now() - Date.parse(c.created_at) < 7 * DAY).length
  async function del(p: LinkPage) {
    if (!await confirmDialog({ title: `Supprimer la page « ${p.title || p.slug} » ?`, text: 'Ses liens par compte et ses statistiques seront supprimés aussi.', confirmLabel: 'Supprimer', danger: true })) return
    const { error } = await supabase.from('link_pages').delete().eq('id', p.id)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else reload()
  }
  return (
    <Panel theme={theme}>
      <PanelHead title="Pages de liens" sub="Les pages modèles : chaque compte en reçoit une copie avec ses propres liens." />
      {pages.length === 0 ? <Empty icon={ICON_PAGE} title="Aucune page" text="Crée la page de liens d’une modèle : photo, bio et boutons (OnlyFans, MYM, Telegram…)." action={<Btn theme={theme} tone="primary" label="Nouvelle page" onClick={onNew} />} />
        : pages.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap' }}>
            <span style={{ width: 36, height: 36, borderRadius: 99, overflow: 'hidden', background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>{p.avatar_url && <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
            <span style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span data-no-tr style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{p.title || p.slug}</span>
              <span data-no-tr style={{ fontFamily: MONO, fontSize: 11.5, color: '#8B8B94' }}>{BASE.replace(/^https?:\/\//, '')}{p.slug}</span>
            </span>
            {!p.active && <Chip text="Désactivée" />}
            <span style={{ fontSize: 12, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{fmtNumber(week(p.id))} visite(s) · 7 j</span>
            <Btn theme={theme} sm tone="ghost" icon={ICON_COPY} label="Copier" onClick={() => copy(BASE + p.slug)} />
            <Btn theme={theme} sm tone="quiet" label="Modifier" onClick={() => onEdit(p)} />
            <Btn theme={theme} sm tone="quiet" icon={ICON_TRASH} onClick={() => del(p)} />
          </div>
        ))}
    </Panel>
  )
}

type EditPage = Omit<LinkPage, 'id'> & { id?: string }
function PageEditor({ theme, value: edit, setEdit, BASE, scopeFolder, onSave }: {
  theme: Theme; value: EditPage; setEdit: (v: EditPage | null) => void
  BASE: string; scopeFolder: string; onSave: (row: Record<string, unknown>) => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const tc = (THEMES.find(t => t.k === (edit.theme ?? 'dark')) ?? THEMES[0]).c
  const set = (patch: Partial<LinkPage>) => setEdit({ ...edit, ...patch })
  // Photo envoyée depuis le PC → stockage ScaleFlow, URL signée longue durée (10 ans).
  async function upload(f: File) {
    if (!f.type.startsWith('image/')) { toast('Choisis une image.', 'bad'); return }
    if (f.size > 8 * 1024 * 1024) { toast('Image trop lourde (8 Mo max).', 'bad'); return }
    setUploading(true)
    try {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `videos/${scopeFolder}/linkpic-${Date.now()}.${ext}`
      const up = await supabase.storage.from('content').upload(path, f, { contentType: f.type, upsert: false })
      if (up.error) throw up.error
      const { data, error } = await supabase.storage.from('content').createSignedUrl(path, 10 * 365 * 24 * 3600)
      if (error || !data?.signedUrl) throw error ?? new Error('URL')
      set({ avatar_url: data.signedUrl }); toast('Photo ajoutée', 'ok')
    } catch (e) { toast(`Envoi impossible : ${(e as { message?: string })?.message ?? String(e)}`, 'bad') } finally { setUploading(false) }
  }
  async function save() {
    const slug = slugify(edit.slug || edit.title)
    if (slug.length < 2) { toast('Choisis une adresse (au moins 2 caractères).', 'bad'); return }
    await onSave({ slug, title: edit.title.trim(), bio: edit.bio.trim(), avatar_url: edit.avatar_url?.trim() || null, active: edit.active, theme: edit.theme ?? 'dark',
      buttons: edit.buttons.filter(b => b.label.trim() && /^https?:\/\//i.test(b.url.trim())).map(b => ({ label: b.label.trim(), url: b.url.trim() })) })
  }
  return (
    <Modal theme={theme} title={edit.id ? 'Modifier la page' : 'Nouvelle page de liens'} width={780} onClose={() => setEdit(null)}
      footer={<><Btn theme={theme} tone="ghost" label="Annuler" onClick={() => setEdit(null)} /><Btn theme={theme} tone="primary" label="Enregistrer" onClick={save} /></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Photo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ width: 56, height: 56, borderRadius: 99, overflow: 'hidden', background: '#161618', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>{edit.avatar_url && <img src={edit.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
            <Btn theme={theme} sm tone="ghost" icon="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12" label={uploading ? 'Envoi…' : 'Choisir depuis le PC'} disabled={uploading} onClick={() => fileRef.current?.click()} />
            {edit.avatar_url && <Btn theme={theme} sm tone="quiet" label="Retirer" onClick={() => set({ avatar_url: '' })} />}
          </div>
          {([['Nom affiché', 'title', 'Luna'], ['Adresse', 'slug', 'luna']] as [string, 'title' | 'slug', string][]).map(([l, k, ph]) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{l}</span>
              <input value={edit[k] ?? ''} placeholder={ph} onChange={e => set({ [k]: k === 'slug' ? slugify(e.target.value) : e.target.value } as Partial<LinkPage>)} style={FIELD} />
              {k === 'slug' && <span data-no-tr style={{ fontFamily: MONO, fontSize: 11, color: '#71717A' }}>{BASE}{slugify(edit.slug || edit.title) || '…'}</span>}
            </label>
          ))}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Bio</span>
            <textarea value={edit.bio} rows={3} onChange={e => set({ bio: e.target.value })} style={TEXTAREA} />
          </label>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Boutons</span>
          {edit.buttons.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input value={b.label} placeholder="Texte (ex. Mon OnlyFans)" onChange={e => set({ buttons: edit.buttons.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} style={{ ...FIELD, flex: 1 }} />
              <input value={b.url} placeholder="https://…" onChange={e => set({ buttons: edit.buttons.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} style={{ ...FIELD, flex: 1.4 }} />
              <Btn theme={theme} sm tone="quiet" icon="M18 6L6 18|M6 6l12 12" onClick={() => set({ buttons: edit.buttons.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <span><Btn theme={theme} sm tone="ghost" icon="M12 5v14|M5 12h14" label="Ajouter un bouton" onClick={() => set({ buttons: [...edit.buttons, { label: '', url: '' }] })} /></span>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Thème</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {THEMES.map(t => (
              <button key={t.k} type="button" onClick={() => set({ theme: t.k })} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: '#EDEDEF', background: '#161618', border: `1px solid ${(edit.theme ?? 'dark') === t.k ? theme.accent : 'rgba(255,255,255,0.09)'}` }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: t.c[0], border: `3px solid ${t.c[3]}`, boxSizing: 'border-box' }} />{t.l}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#EDEDEF' }}>
            <Toggle on={edit.active} onChange={on => set({ active: on })} /> Page en ligne
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 260, minHeight: 460, borderRadius: 28, border: '1px solid rgba(255,255,255,0.12)', background: tc[0], padding: '36px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span style={{ width: 72, height: 72, borderRadius: 99, overflow: 'hidden', background: tc[2], border: '1px solid rgba(127,127,127,0.25)' }}>{edit.avatar_url && <img src={edit.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>
            <span data-no-tr style={{ fontSize: 16, fontWeight: 600, color: tc[1] }}>{edit.title || 'Nom affiché'}</span>
            {edit.bio && <span data-no-tr style={{ fontSize: 12, color: tc[1], opacity: 0.7, whiteSpace: 'pre-line' }}>{edit.bio}</span>}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {edit.buttons.filter(b => b.label.trim()).map((b, i) => (
                <span key={i} data-no-tr style={{ padding: '11px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: i === 0 ? tc[3] : tc[2], color: i === 0 ? tc[4] : tc[1], border: '1px solid rgba(127,127,127,0.25)' }}>{b.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#71717A' }}>
        <Icon d="M12 16v-4|M12 8h.01|M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" size={13} />
        Les URL des boutons OF / MYM servent par défaut : la création automatique les remplace par les liens propres à chaque compte.
      </div>
    </Modal>
  )
}

// ── Réglages ─────────────────────────────────────────────────────────────────
function SettingsTab({ theme, domain, setDomain }: { theme: Theme; domain: LinkDomain; setDomain: (d: LinkDomain) => void }) {
  return (
    <Panel theme={theme}>
      <PanelHead title="Domaine des liens" sub="L’adresse utilisée pour les pages et les liens de compte." />
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', gap: 12 }}>
        {([['scaleflow', 'scaleflow.company/l/…', 'Fonctionne tout de suite.'], ['tapmylink', 'tapmylink.fr/…', 'À activer une fois le domaine validé dans Vercel (Settings → Domains).']] as [LinkDomain, string, string][]).map(([k, l, d]) => (
          <button key={k} type="button" onClick={() => setDomain(k)} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 14, borderRadius: 8, textAlign: 'left', cursor: 'pointer', background: domain === k ? 'rgba(255,255,255,0.05)' : '#111113', border: `1px solid ${domain === k ? theme.accent : 'rgba(255,255,255,0.08)'}`, color: 'inherit' }}>
            <span data-no-tr style={{ fontFamily: MONO, fontSize: 13, color: '#EDEDEF' }}>{l}</span>
            <span style={{ fontSize: 12, color: '#8B8B94' }}>{d}</span>
          </button>
        ))}
      </div>
    </Panel>
  )
}
