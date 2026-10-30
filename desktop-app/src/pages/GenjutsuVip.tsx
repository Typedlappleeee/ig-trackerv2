// Genjutsu (accès Blowsome uniquement) : le générateur Genjutsu — le mouvement d'une vidéo transféré
// sur une référence, via Higgsfield — affiché DANS ScaleFlow.
// • Servi par l'adresse de ScaleFlow (/genjutsu/, relais Vercel vers generateur-prompts.vercel.app) :
//   même origine que l'app → ScaleFlow lui donne son mot de passe (gardé en secret, remis seulement
//   aux comptes Blowsome par sf_genjutsu_access) : pas d'écran de mot de passe.
// • Spoof automatique : chaque génération terminée (lue dans « genJobs » du générateur) est
//   déclinée en X versions uniques (preset iPhone 15 · France par défaut) via /api/v1/tools/spoof,
//   rangées dans la Banque — d'où le CRM les répartit.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { IS_WEB } from '@/lib/platform'
import { Icon, toast } from '@/lib/ui'
import { SPOOF_DEVICES, GPS_CITIES } from '@/lib/studioTools'

const ORIGIN = IS_WEB && typeof window !== 'undefined' && /^https?:/.test(window.location.origin) ? window.location.origin : 'https://scaleflow.company'
export const GENJUTSU_URL = `${ORIGIN}/genjutsu/?seul=genjutsu`
const ACCENT = '#C4B5FD'
const CFG_KEY = 'sf-gj-auto', DONE_KEY = 'sf-gj-spoofed'

interface AutoCfg { on: boolean; count: number; device: string; gps: string; perModel: boolean; folder: string; since: number }
interface GenJob { job_id: string; url?: string | null; fin?: number; element?: string | null; compte?: string; kind?: string }
interface LogLine { at: number; text: string; ok: boolean }

const readJson = <T,>(k: string, d: T, store: Storage | null = safeLocal()): T => { try { const v = store?.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
function safeLocal(): Storage | null { try { return window.localStorage } catch { return null } }
const defaults = (): AutoCfg => ({ on: true, count: 3, device: 'iphone15', gps: 'france', perModel: false, folder: 'Genjutsu', since: Date.now() })

export default function GenjutsuVip({ user, org, isSuperAdmin }: { user: User; org: OrgState; isSuperAdmin: boolean }) {
  void user
  const orgId = org.currentOrg?.id ?? null
  const frame = useRef<HTMLIFrameElement>(null)
  const [pass, setPass] = useState<string | null | undefined>(undefined)     // undefined = lecture en cours
  const [sqlMissing, setSqlMissing] = useState(false)
  const [newPass, setNewPass] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [cfg, setCfgState] = useState<AutoCfg>(() => ({ ...defaults(), ...readJson<Partial<AutoCfg>>(CFG_KEY, {}) }))
  const [log, setLog] = useState<LogLine[]>([])
  const busy = useRef(false)

  const setCfg = (patch: Partial<AutoCfg>) => setCfgState(c => {
    const n = { ...c, ...patch, ...(patch.on && !c.on ? { since: Date.now() } : {}) }   // réactivé → seulement les nouvelles
    try { localStorage.setItem(CFG_KEY, JSON.stringify(n)) } catch { /* ignore */ }
    return n
  })

  // 1) Mot de passe du générateur, remis seulement à l'accès Blowsome → posé avant d'afficher la page.
  const loadPass = useCallback(async () => {
    const { data, error } = await supabase.rpc('sf_genjutsu_access')
    if (error) { setSqlMissing(/function|schema cache/i.test(error.message)); setPass(null); return }
    const p = (data as string | null) || null
    if (p) { try { localStorage.setItem('motDePasse', p) } catch { /* ignore */ } }
    setPass(p)
  }, [])
  useEffect(() => { void loadPass() }, [loadPass])
  async function savePass() {
    const { error } = await supabase.rpc('sf_set_secret', { p_name: 'genjutsu_password', p_value: newPass })
    if (error) { toast(error.message, 'bad'); return }
    setNewPass(''); toast('Mot de passe du générateur enregistré ✓', 'ok')
    await loadPass(); setLoaded(false); if (frame.current) frame.current.src = GENJUTSU_URL
  }
  // App de bureau : la page est sur une autre adresse → on tente d'y poser le mot de passe (sans effet sinon).
  function onFrameLoad() {
    setLoaded(true)
    if (IS_WEB || !pass) return
    try {
      const w = frame.current?.contentWindow
      if (w && w.localStorage.getItem('motDePasse') !== pass) { w.localStorage.setItem('motDePasse', pass); w.location.reload() }
    } catch { /* origine différente : le générateur demandera son mot de passe */ }
  }

  // 2) Spoof automatique des générations terminées.
  const push = (text: string, ok = true) => setLog(l => [{ at: Date.now(), text, ok }, ...l].slice(0, 12))
  const tick = useCallback(async () => {
    if (!cfg.on || busy.current) return
    let jobs: GenJob[] = []
    try {
      const store = IS_WEB ? safeLocal() : frame.current?.contentWindow?.localStorage ?? null
      jobs = readJson<GenJob[]>('genJobs', [], store)
    } catch { return }
    const done = new Set(readJson<string[]>(DONE_KEY, []))
    const todo = jobs.filter(j => j.url && j.fin && j.fin >= cfg.since && !done.has(j.job_id)).reverse()
    if (!todo.length) return
    busy.current = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      for (const j of todo) {
        done.add(j.job_id)                                    // noté AVANT : jamais spoofé deux fois
        try { localStorage.setItem(DONE_KEY, JSON.stringify([...done].slice(-400))) } catch { /* ignore */ }
        const model = (j.element || '').trim()
        const folder = cfg.perModel && model ? model : (cfg.folder.trim() || 'Genjutsu')
        const base = `Genjutsu ${model ? model + ' ' : ''}${j.job_id.slice(0, 6)}`
        const n = Math.max(1, Math.min(10, cfg.count))
        const t0 = Date.now()
        const res = await Promise.all(Array.from({ length: n }, (_, i) => fetch(`${ORIGIN}/api/v1/tools/spoof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ url: j.url, org_id: orgId, device: cfg.device, gps: cfg.gps, intensity: 'normal', folder, title: `${base} v${i + 1}` }),
        }).then(r => r.json()).catch(e => ({ ok: false, error: String(e?.message || e) }))))
        const ok = res.filter(r => r && r.ok).length
        const err = res.find(r => !r || !r.ok)?.error
        push(ok === n ? `${base} → ${ok} version(s) spoofée(s) dans « ${folder} » (${Math.round((Date.now() - t0) / 1000)} s)` : `${base} → ${ok}/${n} version(s) · ${err ?? 'échec'}`, ok === n)
      }
    } finally { busy.current = false }
  }, [cfg, orgId])
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void tick() }, 8000)
    return () => clearInterval(t)
  }, [tick])

  const sel = { height: 30, padding: '0 8px', borderRadius: 8, background: '#141416', border: '1px solid rgba(255,255,255,0.09)', color: '#EDEDEF', fontSize: 12.5 } as const
  const opt = { background: '#161618' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100vh - 132px)', minHeight: 600, animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: ACCENT, fontSize: 11.5, fontWeight: 500 }}>✦ Blowsome</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#F4F4F5', letterSpacing: '-0.02em' }}>Genjutsu</span>
        <span style={{ fontSize: 12.5, color: '#8B8B94' }}>Le mouvement d’une vidéo transféré sur ta référence (Higgsfield). Mêmes comptes, presets et résultats que le générateur.</span>
        <a href={GENJUTSU_URL} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: ACCENT, textDecoration: 'none' }}>
          Ouvrir en plein écran <Icon d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|M15 3h6v6|M10 14L21 3" size={13} />
        </a>
      </div>

      {/* Spoof automatique des résultats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 10, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', fontSize: 12.5, color: '#D4D4D8' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
          <input type="checkbox" checked={cfg.on} onChange={e => setCfg({ on: e.target.checked })} /> Spoof auto des résultats
        </label>
        <input type="number" min={1} max={10} value={cfg.count} onChange={e => setCfg({ count: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} style={{ ...sel, width: 52, textAlign: 'center' }} />
        <span>version(s)</span>
        <select value={cfg.device} onChange={e => setCfg({ device: e.target.value })} style={sel}>{SPOOF_DEVICES.filter(d => d.k !== 'none').map(d => <option key={d.k} value={d.k} style={opt}>{d.label}</option>)}</select>
        <select value={cfg.gps} onChange={e => setCfg({ gps: e.target.value })} style={sel}>{GPS_CITIES.map(c => <option key={c.k} value={c.k} style={opt}>{c.label}</option>)}</select>
        <span>→ dossier</span>
        <input value={cfg.folder} onChange={e => setCfg({ folder: e.target.value })} disabled={cfg.perModel} placeholder="Genjutsu" style={{ ...sel, width: 140, opacity: cfg.perModel ? 0.5 : 1 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="Dossier = nom de l’Element (la modèle) choisi dans Genjutsu">
          <input type="checkbox" checked={cfg.perModel} onChange={e => setCfg({ perModel: e.target.checked })} /> un dossier par modèle
        </label>
        {log[0] && <span data-no-tr style={{ flexBasis: '100%', fontSize: 12, color: log[0].ok ? '#86EFAC' : '#FCA5A5' }}>{`${new Date(log[0].at).toLocaleTimeString('fr-FR')} · ${log[0].text}`}</span>}
      </div>

      {sqlMissing && <span style={{ fontSize: 12.5, color: '#FBBF24' }}>⚠ Colle le SQL <code>20261030b_genjutsu_access.sql</code> dans Supabase pour ouvrir Genjutsu sans mot de passe.</span>}
      {pass === null && !sqlMissing && isSuperAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: '#FBBF24' }}>
          Enregistre une fois le mot de passe du générateur : les comptes Blowsome n’auront plus à le taper.
          <input value={newPass} onChange={e => setNewPass(e.target.value)} type="password" autoComplete="off" placeholder="Mot de passe du générateur" style={{ ...sel, width: 220 }} />
          <button type="button" disabled={!newPass.trim()} onClick={() => void savePass()} style={{ ...sel, cursor: 'pointer', fontWeight: 600, opacity: newPass.trim() ? 1 : 0.5 }}>Enregistrer</button>
        </div>
      )}
      {pass === null && !sqlMissing && !isSuperAdmin && <span style={{ fontSize: 12.5, color: '#A1A1AA' }}>Le mot de passe du générateur n’est pas encore enregistré par l’administrateur : il te sera demandé une fois.</span>}

      <div style={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: 14, overflow: 'hidden', background: '#0B0B0D', border: '1px solid rgba(255,255,255,0.08)' }}>
        {!loaded && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#8B8B94', fontSize: 13 }}>Chargement de Genjutsu…</div>}
        {pass !== undefined && (
          <iframe ref={frame} src={GENJUTSU_URL} title="Genjutsu" onLoad={onFrameLoad} allow="clipboard-read; clipboard-write; fullscreen"
            style={{ position: 'relative', width: '100%', height: '100%', border: 0, display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity .2s ease' }} />
        )}
      </div>
    </div>
  )
}
