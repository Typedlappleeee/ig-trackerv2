// Genjutsu (accès Blowsome uniquement) : une vidéo source refaite avec la tête d'une modèle
// (Higgsfield motion control), dans une page ScaleFlow propre :
//   1. la modèle (photo de référence = Element Higgsfield, partagé avec le générateur de l'équipe)
//   2. les liens des reels à refaire
//   3. le rendu (480p par défaut, prompt réglé par quelques options) + spoof auto en X versions
// Au démarrage : écran « Vérification de l'accès Blowsome » (accès, comptes, modèles) — aucun mot de
// passe pour l'utilisateur. Les comptes Higgsfield de l'équipe se connectent depuis la page.
// Moteur et file : src/lib/genjutsuHF.ts (relais /api/hf, mot de passe remis par sf_genjutsu_access,
// gardé en mémoire seulement).
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { Icon, Toggle, Segmented, toast, useNarrow, confirmDialog, promptDialog } from '@/lib/ui'
import { hfBridge, listLocal, addLocal, reconnectLocal, checkLocal, removeLocal, type HfLocalAccount } from '@/lib/hfLocal'
import { IS_WEB } from '@/lib/platform'
import { SPOOF_DEVICES, GPS_CITIES } from '@/lib/studioTools'
import { folderTree, joinPath, normPath, listBankFolders, loadModelFolders, setModelFolder, type BankScope } from '@/lib/bankFolders'
import {
  MAX_RUNNING, TYPICAL_MS, setRelayPassword, relayReady, listAccounts, readCredits, listModels, createModel, deleteModel, hiddenModels, readPromptPresets,
  startAccountLogin, finishAccountLogin, removeAccount, needsReconnect,
  buildPrompt, parseLinks, resolveVideo, cachedSource, isInstagram, enqueue, retryJob, removeJob, clearFinished, respoof,
  getJobs, subscribeJobs, isActive, pump, type HfAccount, type HfModel, type PromptOpts, type GjJob, type SpoofPlan,
} from '@/lib/genjutsuHF'

const ACCENT = '#A855F7', ACCENT_TXT = '#D8B4FE'
const INK = '#EDEDEF', MUTED = '#8B8B94', DIM = '#5A5A63'
const EDGE = 'rgba(255,255,255,0.07)', FIELD_EDGE = 'rgba(255,255,255,0.09)', FIELD_BG = '#161618'
const OK = '#86EFAC', BAD = '#FCA5A5', WARN = '#FBBF24'
const CFG_KEY = 'sf-gj-auto', ACC_KEY = 'sf-gj-account', PICK_KEY = 'sf-gj-picked'

const card: CSSProperties = { background: '#111113', border: `1px solid ${EDGE}`, borderRadius: 12, padding: 16 }
const field: CSSProperties = { height: 32, padding: '0 10px', borderRadius: 8, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const sel: CSSProperties = { ...field, padding: '0 8px', cursor: 'pointer' }
const opt: CSSProperties = { background: FIELD_BG }
const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 8, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: '#E4E4E7', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }

interface AutoCfg { on: boolean; count: number; device: string; gps: string }
const readJson = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* bloqué */ } }
const cfgDefaults = (): AutoCfg => ({ on: true, count: 3, device: 'iphone15', gps: 'france' })
const crumbs = (path: string) => path.split('/').join(' › ')
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const reelLabel = (link: string) => link.match(/\/reel\/([\w-]+)/)?.[1] ?? link.replace(/^https?:\/\//, '').slice(0, 42)
type Access = 'loading' | 'ok' | 'nopass' | 'nosql' | 'denied'
type SrcState = { state: 'checking' | 'ok' | 'error'; user?: string | null; error?: string }
type Filter = 'all' | 'active' | 'done' | 'failed'
type CheckState = 'wait' | 'run' | 'ok' | 'fail'

export default function GenjutsuVip({ user, org, isSuperAdmin }: { user: User; org: OrgState; isSuperAdmin: boolean }) {
  const orgId = org.currentOrg?.id ?? null
  const narrow = useNarrow(1100)

  // ── accès : le mot de passe du relais, remis seulement aux comptes Blowsome ──
  // (déjà vérifié pendant cette session → la page s'ouvre directement, sans écran de vérification)
  const [access, setAccess] = useState<Access>(() => relayReady() ? 'ok' : 'loading')
  const [gate, setGate] = useState<'on' | 'granted' | 'off'>(() => relayReady() ? 'off' : 'on')
  const [newPass, setNewPass] = useState('')
  const loadAccess = useCallback(async () => {
    setAccess('loading')
    const { data, error } = await supabase.rpc('sf_genjutsu_access')
    if (error) { setAccess(/function|schema cache/i.test(error.message) ? 'nosql' : 'denied'); return }
    const p = (data as string | null) || null
    if (!p) { setAccess('nopass'); return }
    setRelayPassword(p)
    setAccess('ok')
  }, [])
  useEffect(() => {
    try { localStorage.removeItem('motDePasse') } catch { /* l'ancienne version le gardait dans le navigateur */ }
    if (!relayReady()) void loadAccess()
  }, [loadAccess])
  async function savePass() {
    const { error } = await supabase.rpc('sf_set_secret', { p_name: 'genjutsu_password', p_value: newPass })
    if (error) { toast(error.message, 'bad'); return }
    setNewPass('')
    await loadAccess()
    // test immédiat : le générateur accepte-t-il cette clé ?
    try { await listAccounts(); toast('Clé acceptée par le générateur ✓', 'ok'); void loadAccounts() }
    catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      toast(/mot de passe/i.test(m) ? 'Le générateur refuse cette clé : ce n’est pas son mot de passe actuel.' : `Générateur injoignable : ${m}`, 'bad', 8000)
      void loadAccounts()
    }
  }

  // ── comptes Higgsfield de l'équipe ──
  const [accounts, setAccounts] = useState<HfAccount[] | null>(null)
  const [account, setAccountState] = useState<string>(() => readJson(ACC_KEY, ''))
  const [relayErr, setRelayErr] = useState<string | null>(null)
  const keyRefused = !!relayErr && /mot de passe|clé du générateur|accès enregistré/i.test(relayErr)
  const [credits, setCredits] = useState<Record<string, number | null>>({})
  const [reco, setReco] = useState<Record<string, boolean>>({})        // compte à reconnecter
  const [login, setLogin] = useState<{ name: string; reconnect: boolean } | null>(null)
  const setAccount = (a: string) => { setAccountState(a); writeJson(ACC_KEY, a) }
  const loadAccounts = useCallback(async (select?: string) => {
    setRelayErr(null)
    try {
      const r = await listAccounts()
      if (!r.cloud) { setRelayErr('Le générateur Genjutsu refuse l’accès enregistré : l’administrateur doit le relier à nouveau.'); setAccounts([]); return }
      setAccounts(r.accounts)
      setAccountState(cur => {
        const next = select && r.accounts.some(a => a.name === select) ? select : r.accounts.some(a => a.name === cur) ? cur : (r.accounts[0]?.name ?? '')
        writeJson(ACC_KEY, next)
        return next
      })
    } catch (e) { setRelayErr(e instanceof Error ? e.message : String(e)); setAccounts([]) }
  }, [])
  useEffect(() => { if (access === 'ok') { void loadAccounts(); pump() } }, [access, loadAccounts])
  const refreshCredits = useCallback(async (name: string) => {
    try {
      const c = await readCredits(name)
      setCredits(m => ({ ...m, [name]: c }))
      setReco(m => ({ ...m, [name]: false }))
    } catch (e) { if (needsReconnect(e)) setReco(m => ({ ...m, [name]: true })) }
  }, [])
  useEffect(() => {
    if (!accounts?.length) return
    setCredits(Object.fromEntries(accounts.map(a => [a.name, a.credits])))
    void (async () => { for (const a of accounts) await refreshCredits(a.name) })()
  }, [accounts, refreshCredits])
  async function dropAccount(name: string) {
    if (!await confirmDialog({ title: `Retirer le compte « ${name} » ?`, text: 'Il disparaît aussi du générateur de l’équipe. Ses modèles restent sur Higgsfield.', confirmLabel: 'Retirer', danger: true })) return
    try { await removeAccount(name); toast(`Compte « ${name} » retiré`, 'ok'); await loadAccounts() }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
  }
  const freeName = () => { const taken = new Set((accounts ?? []).map(a => a.name)); for (let i = 1; i < 60; i++) if (!taken.has(`Compte ${i}`)) return `Compte ${i}`; return `Compte ${Date.now()}` }

  // ── modèles (Elements du compte) ──
  const [models, setModels] = useState<HfModel[] | null>(null)
  const [modelsErr, setModelsErr] = useState<string | null>(null)
  const [picked, setPickedState] = useState<string[]>([])
  // mini-dossiers : les tenues d'une même modèle (« Zoe1 », « Zoe 2 »…) sont rangées sous « Zoe »
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  // rangement à la main (glisser une modèle sur un dossier / une autre modèle) : gardé sur ce navigateur
  const [manual, setManualState] = useState<Record<string, string>>(() => readJson('sf-gj-groups', {}))
  const moveTo = (id: string, group: string) => setManualState(g => { const n = { ...g, [id]: group }; writeJson('sf-gj-groups', n); return n })
  const [dragOver, setDragOver] = useState<string | null>(null)
  const autoGroup = (name: string) => name.replace(/[\s_.-]*\d+$/, '').trim() || name
  const groups = useMemo(() => {
    const m = new Map<string, HfModel[]>()
    for (const x of models ?? []) { const k = manual[x.id] ?? autoGroup(x.name); m.set(k, [...(m.get(k) ?? []), x]) }
    return [...m.entries()].map(([name, items]) => ({ name, items }))
  }, [models, manual])
  const shownGroup = openGroup ? groups.find(g => g.name === openGroup && g.items.length > 1) ?? null : null
  const [creating, setCreating] = useState(false)
  const setPicked = (ids: string[]) => { setPickedState(ids); writeJson(`${PICK_KEY}:${account}`, ids) }
  const loadModels = useCallback(async (quiet = false) => {
    if (!account) return
    if (!quiet) { setModels(null); setModelsErr(null) }
    try {
      const hidden = new Set(hiddenModels())
      const l = (await listModels(account)).filter(m => !hidden.has(m.id))
      setModels(l)
      setPickedState(p => p.filter(id => l.some(m => m.id === id)))
    } catch (e) {
      if (needsReconnect(e)) setReco(m => ({ ...m, [account]: true }))
      if (!quiet) { setModelsErr(e instanceof Error ? e.message : String(e)); setModels([]) }
    }
  }, [account])
  useEffect(() => {
    if (access !== 'ok' || !account) return
    setPickedState(readJson<string[]>(`${PICK_KEY}:${account}`, []))
    void loadModels()
  }, [access, account, loadModels])
  // une modèle tout juste créée met quelques secondes à être prête
  useEffect(() => {
    if (!models?.some(m => !m.ready)) return
    const t = setTimeout(() => void loadModels(true), 8000)
    return () => clearTimeout(t)
  }, [models, loadModels])

  // ── vidéos : liens collés, vérifiés tout de suite (3 à la fois) ──
  const [linksText, setLinksText] = useState('')
  const links = useMemo(() => parseLinks(linksText), [linksText])
  const [src, setSrc] = useState<Record<string, SrcState>>({})
  const checking = useRef(new Set<string>())
  useEffect(() => {
    if (access !== 'ok') return
    const todo = links.filter(l => !src[l] && !checking.current.has(l))
    if (!todo.length) return
    const room = Math.max(0, 3 - checking.current.size)
    for (const l of todo.slice(0, room)) {
      const hit = cachedSource(l)
      if (hit) { setSrc(s => ({ ...s, [l]: { state: 'ok', user: hit.user } })); continue }
      checking.current.add(l)
      setSrc(s => ({ ...s, [l]: { state: 'checking' } }))
      resolveVideo(l)
        .then(v => setSrc(s => ({ ...s, [l]: { state: 'ok', user: v.user } })))
        .catch(e => setSrc(s => ({ ...s, [l]: { state: 'error', error: e instanceof Error ? e.message : String(e) } })))
        .finally(() => { checking.current.delete(l); setSrc(s => ({ ...s })) })
    }
  }, [access, links, src])
  const removeLink = (l: string) => setLinksText(t => t.split('\n').filter(line => !parseLinks(line).includes(l)).join('\n'))

  // ── rendu : résolution + prompt ──
  const [res, setRes] = useState<'480p' | '720p' | '1080p'>('480p')
  const [popts, setPopts] = useState<PromptOpts>({ several: false, who: '', keepText: false, outfit: '' })
  const [outfitOn, setOutfitOn] = useState(false)
  const [presets, setPresets] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<string>('auto')          // 'auto' | 'custom' | 'p:<preset>'
  const [custom, setCustom] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  useEffect(() => { if (access === 'ok') void readPromptPresets().then(setPresets) }, [access])
  const autoPrompt = buildPrompt({ ...popts, outfit: outfitOn ? popts.outfit : '' })
  const prompt = mode === 'auto' ? autoPrompt : mode === 'custom' ? custom : (presets[mode.slice(2)] ?? autoPrompt)

  // ── chaque modèle a SON dossier de la Banque (par défaut « Genjutsu › <nom> ») : ses vidéos y vont ──
  const scope: BankScope = useMemo(() => ({ orgId, userId: user.id }), [orgId, user.id])
  const [modelFolders, setModelFolders] = useState<Record<string, string>>({})
  const [folderPickFor, setFolderPickFor] = useState<HfModel | null>(null)
  useEffect(() => { if (access === 'ok') void loadModelFolders(scope).then(setModelFolders).catch(() => undefined) }, [access, scope])
  const folderOf = (m: { id: string; name: string }) => modelFolders[m.id] ?? joinPath('Genjutsu', m.name)
  async function assignFolder(m: { id: string; name: string }, path: string) {
    const p = normPath(path)
    if (!p) return
    setModelFolders(f => ({ ...f, [m.id]: p }))
    try { await setModelFolder(scope, m.id, p) } catch (e) { toast(e instanceof Error ? e.message : String(e), 'bad') }
  }

  // ── spoof automatique des résultats ──
  const [cfg, setCfgState] = useState<AutoCfg>(() => ({ ...cfgDefaults(), ...readJson<Partial<AutoCfg>>(CFG_KEY, {}) }))
  const setCfg = (p: Partial<AutoCfg>) => setCfgState(c => { const n = { ...c, ...p }; writeJson(CFG_KEY, n); return n })
  // spoof coupé → count 0 : la vidéo est rangée telle quelle dans le dossier de la modèle
  const planFor = (m: { id: string; name: string }, forceSpoof = false): SpoofPlan =>
    ({ count: cfg.on || forceSpoof ? Math.max(1, cfg.count) : 0, device: cfg.device, gps: cfg.gps, folder: folderOf(m), orgId })
  const deviceLabel = SPOOF_DEVICES.find(d => d.k === cfg.device)?.label ?? cfg.device
  const gpsLabel = GPS_CITIES.find(c => c.k === cfg.gps)?.label ?? cfg.gps

  // ── lancement ──
  const chosen = (models ?? []).filter(m => picked.includes(m.id) && m.ready && m.mediaId)
  const usable = links.filter(l => src[l]?.state !== 'error')
  const total = usable.length * chosen.length
  const blocker = !account ? 'Aucun compte Higgsfield' : !chosen.length ? 'Choisis au moins une modèle' : !usable.length ? 'Colle au moins un lien de reel' : !prompt.trim() ? 'Le prompt est vide' : null
  function launch() {
    if (blocker) return
    enqueue(usable.flatMap(l => chosen.map(m => ({
      account, source: l, prompt: prompt.trim(), res,
      model: { id: m.id, name: m.name, mediaId: m.mediaId!, photo: m.photo },
      spoof: planFor(m),
    }))))
    // le dossier de chaque modèle est créé (et associé) tout de suite : visible dans la Banque
    for (const m of chosen) if (!modelFolders[m.id]) void assignFolder(m, folderOf(m))
    toast(`${total} Genjutsu ajouté${total > 1 ? 's' : ''} à la file`, 'ok')
    setLinksText(''); setSrc({})
    const acc = account
    setTimeout(() => void refreshCredits(acc), 30_000)
  }

  // ── résultats ──
  const jobs = useSyncExternalStore(subscribeJobs, getJobs)
  const [filter, setFilter] = useState<Filter>('all')
  const [now, setNow] = useState(Date.now())
  const anyActive = jobs.some(j => isActive(j.status) || j.status === 'waiting')
  useEffect(() => {
    if (!anyActive) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [anyActive])
  const counts = {
    all: jobs.length,
    active: jobs.filter(j => isActive(j.status) || j.status === 'waiting').length,
    done: jobs.filter(j => j.status === 'done').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  }
  const shown = jobs.filter(j => filter === 'all' ? true : filter === 'active' ? (isActive(j.status) || j.status === 'waiting') : j.status === filter)

  // ── vérification de l'accès au démarrage (accès Blowsome → générateur → modèles) ──
  const [t0] = useState(() => Date.now())
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (gate !== 'on') return
    const t = setInterval(() => setClock(Date.now()), 120)
    return () => clearInterval(t)
  }, [gate])
  const elapsed = clock - t0
  const raw: CheckState[] = [
    access === 'ok' ? 'ok' : access === 'loading' ? 'run' : 'fail',
    access !== 'ok' ? 'wait' : relayErr ? 'fail' : accounts === null ? 'run' : 'ok',
    // (modèles lents à lire : la page s'ouvre quand même, elles finissent d'arriver dedans)
    access !== 'ok' || relayErr || accounts === null ? 'wait' : !accounts.length || models !== null || reco[account] || clock - t0 > 12_000 ? 'ok' : 'run',
  ]
  // chaque étape validée s'affiche à son tour (≈ 0,45 s d'écart) : la vérification se lit
  const shownChecks = raw.map((st, i) => st === 'ok' && elapsed < 450 * (i + 1) ? 'run' : st)
  const blocked = raw.includes('fail')
  const allOk = shownChecks.every(x => x === 'ok')
  useEffect(() => { if (gate === 'on' && allOk) setGate('granted') }, [gate, allOk])
  useEffect(() => {
    if (gate !== 'granted') return
    const t = setTimeout(() => setGate('off'), 900)
    return () => clearTimeout(t)
  }, [gate])

  if (gate !== 'off') {
    const failure = access === 'denied' ? (
      <span>Genjutsu est réservé aux comptes avec l’accès Blowsome.</span>
    ) : access === 'nosql' ? (
      <span>Colle le SQL <code>20261030b_genjutsu_access.sql</code> dans Supabase pour activer Genjutsu.</span>
    ) : access === 'nopass' ? (isSuperAdmin ? (<>
      <span>Genjutsu n’est pas encore relié au générateur de l’équipe. Une seule fois, pour tout le monde :</span>
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <input value={newPass} onChange={e => setNewPass(e.target.value)} type="password" autoComplete="off" placeholder="Clé du générateur" style={{ ...field, flex: 1 }} />
        <button type="button" disabled={!newPass.trim()} onClick={() => void savePass()} style={{ ...ghostBtn, height: 32, opacity: newPass.trim() ? 1 : 0.5 }}>Relier</button>
      </div>
    </>) : <span>Genjutsu n’est pas encore activé par l’administrateur.</span>
    ) : relayErr && /mot de passe/i.test(relayErr) ? (isSuperAdmin ? (<>
      <span>La clé enregistrée pour le générateur de l’équipe n’est plus la bonne. Colle la clé actuelle (une seule fois, pour tout le monde) :</span>
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <input value={newPass} onChange={e => setNewPass(e.target.value)} type="password" autoComplete="off" placeholder="Clé du générateur" style={{ ...field, flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter' && newPass.trim()) void savePass() }} />
        <button type="button" disabled={!newPass.trim()} onClick={() => void savePass()} style={{ ...ghostBtn, height: 32, opacity: newPass.trim() ? 1 : 0.5 }}>Relier</button>
      </div>
    </>) : <span>Genjutsu doit être relié à nouveau par l’administrateur.</span>
    ) : relayErr ? (<>
      <span>{relayErr}</span>
      <button type="button" onClick={() => void loadAccounts()} style={ghostBtn}>Réessayer</button>
    </>) : null
    return (
      <Gate phase={gate === 'granted' ? 'granted' : blocked ? 'blocked' : 'checking'} denied={access === 'denied'} email={user.email ?? null}
        checks={[
          { label: 'Accès Blowsome', state: shownChecks[0], note: access === 'denied' ? 'refusé' : access === 'nopass' || access === 'nosql' ? 'à activer' : undefined },
          { label: 'Générateur Genjutsu', state: shownChecks[1], note: shownChecks[1] === 'fail' ? 'indisponible' : shownChecks[1] === 'ok' && accounts ? `${accounts.length} compte${accounts.length > 1 ? 's' : ''} Higgsfield` : undefined },
          { label: 'Modèles', state: shownChecks[2], note: shownChecks[2] === 'ok' && models ? `${models.length} prête${models.length > 1 ? 's' : ''}` : undefined },
        ]}
        failure={failure} />
    )
  }

  return (
    <Frame>
      <Header />

      <AccountsBar accounts={accounts ?? []} current={account} credits={credits} reco={reco} canRemove={isSuperAdmin} locked={keyRefused}
        onPick={name => { setAccount(name); void refreshCredits(name) }}
        onAdd={() => setLogin({ name: freeName(), reconnect: false })}
        onReconnect={name => setLogin({ name, reconnect: true })}
        onRemove={name => void dropAccount(name)} />
      <LocalAccounts />
      {relayErr && keyRefused && (
        <div style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, borderColor: 'rgba(251,191,36,0.3)', fontSize: 13, color: '#D4D4D8' }}>
          <span style={{ color: WARN, fontWeight: 700 }}>Comptes de l’équipe bloqués : la clé du générateur est refusée</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>Les comptes Higgsfield de l’équipe passent par le site du générateur (generateur-prompts.vercel.app), qui demande son mot de passe. {isSuperAdmin ? 'Colle-le ici une seule fois :' : 'L’administrateur doit le recoller.'} Sans lui, utilise « Sur ce PC » dans l’appli PC.</span>
          {isSuperAdmin && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newPass} onChange={e => setNewPass(e.target.value)} type="password" autoComplete="off" placeholder="Mot de passe du générateur" style={{ ...field, flex: 1, maxWidth: 360 }}
                onKeyDown={e => { if (e.key === 'Enter' && newPass.trim()) void savePass() }} />
              <button type="button" disabled={!newPass.trim()} onClick={() => void savePass()} style={{ ...ghostBtn, height: 32, opacity: newPass.trim() ? 1 : 0.5 }}>Relier</button>
            </div>
          )}
        </div>
      )}
      {relayErr && !keyRefused && (
        <div style={{ ...card, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderColor: 'rgba(252,165,165,0.25)', color: BAD, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{relayErr}</span>
          <button type="button" onClick={() => void loadAccounts()} style={ghostBtn}>Réessayer</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(420px, 500px) 1fr', gap: 14, alignItems: 'start' }}>
        {/* ── colonne de gauche : les 3 étapes ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Step n={1} title="La modèle" sub="Sa photo de référence remplace la fille de la vidéo. Plusieurs modèles = une version par modèle."
            right={<button type="button" onClick={() => void loadModels()} style={{ ...ghostBtn, height: 26, padding: '0 8px' }} title="Actualiser"><Icon d="M21 12a9 9 0 1 1-3-6.7L21 8|M21 3v5h-5" size={12} /></button>}>
            {modelsErr && <span style={{ fontSize: 12.5, color: BAD }}>{modelsErr}</span>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
              {models === null && Array.from({ length: 4 }, (_, i) => <div key={i} style={{ aspectRatio: '3 / 4', borderRadius: 10, background: '#18181B', animation: 'pulse 1.4s ease-in-out infinite' }} />)}
              {shownGroup && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button" onClick={() => setOpenGroup(null)} title="Dépose une modèle ici pour la sortir du dossier"
                    onDragOver={e => { e.preventDefault(); setDragOver('__out') }} onDragLeave={() => setDragOver(null)}
                    onDrop={e => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/gj-model'); if (id) moveTo(id, `__solo:${id}`) }}
                    style={{ ...ghostBtn, height: 28, padding: '0 10px', outline: dragOver === '__out' ? `1px dashed ${ACCENT}` : 'none' }}>← Toutes</button>
                  <span data-no-tr style={{ fontSize: 13, fontWeight: 700, color: INK }}>{shownGroup.name}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>{`${shownGroup.items.length} tenues`}</span>
                  {(() => {
                    const ids = shownGroup.items.filter(x => x.ready).map(x => x.id), all = ids.every(id => picked.includes(id))
                    return <button type="button" onClick={() => setPicked(all ? picked.filter(id => !ids.includes(id)) : [...picked, ...ids.filter(id => !picked.includes(id))])} style={{ ...ghostBtn, height: 28, padding: '0 10px', marginLeft: 'auto' }}>{all ? 'Tout retirer' : 'Tout choisir'}</button>
                  })()}
                </div>
              )}
              {!shownGroup && groups.filter(g => g.items.length > 1).map(g => {
                const n = g.items.filter(x => picked.includes(x.id)).length
                return (
                  <button key={`g:${g.name}`} type="button" onClick={() => setOpenGroup(g.name)} title={`${g.items.length} tenues`}
                    onDragOver={e => { e.preventDefault(); setDragOver(`g:${g.name}`) }} onDragLeave={() => setDragOver(null)}
                    onDrop={e => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/gj-model'); if (id) moveTo(id, g.name) }}
                    style={{ position: 'relative', padding: 0, border: `2px solid ${dragOver === `g:${g.name}` ? '#FFFFFF' : n ? ACCENT : 'transparent'}`, transform: dragOver === `g:${g.name}` ? 'scale(1.04)' : 'none', transition: 'transform .12s', borderRadius: 11, background: '#18181B', cursor: 'pointer', overflow: 'hidden', textAlign: 'left', boxShadow: '4px 4px 0 -1px #222226, 8px 8px 0 -2px #19191C' }}>
                    <div style={{ aspectRatio: '3 / 4', background: '#0D0D0F' }}>
                      {g.items[0].photo && <img src={g.items[0].photo} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    </div>
                    <span style={{ position: 'absolute', top: 5, left: 5, display: 'flex', padding: 3, borderRadius: 6, background: 'rgba(0,0,0,.6)', color: '#fff' }}><Icon d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" size={11} /></span>
                    <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,.85))', color: '#fff', fontSize: 11.5, fontWeight: 600 }}>
                      <span data-no-tr>{g.name}</span> <span style={{ opacity: .7, fontWeight: 500 }}>{`· ${g.items.length}`}</span>
                    </span>
                    {n > 0 && <span style={{ position: 'absolute', top: 5, right: 5, minWidth: 20, height: 20, padding: '0 5px', boxSizing: 'border-box', borderRadius: 99, background: ACCENT, color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{n}</span>}
                  </button>
                )
              })}
              {(shownGroup ? shownGroup.items : groups.filter(g => g.items.length === 1).map(g => g.items[0])).map(m => {
                const pos = picked.indexOf(m.id)
                return (
                  <button key={m.id} type="button" disabled={!m.ready} onClick={() => setPicked(pos >= 0 ? picked.filter(x => x !== m.id) : [...picked, m.id])}
                    draggable onDragStart={e => { e.dataTransfer.setData('text/gj-model', m.id); e.dataTransfer.effectAllowed = 'move' }}
                    onDragOver={e => { if (!shownGroup) { e.preventDefault(); setDragOver(m.id) } }} onDragLeave={() => setDragOver(null)}
                    onDrop={e => {
                      e.preventDefault(); setDragOver(null)
                      const id = e.dataTransfer.getData('text/gj-model'); if (!id || id === m.id || shownGroup) return
                      const name = autoGroup(m.name)
                      moveTo(m.id, name); moveTo(id, name)
                    }}
                    title={m.ready ? m.name : 'En préparation chez Higgsfield…'}
                    style={{ position: 'relative', padding: 0, border: `2px solid ${pos >= 0 ? ACCENT : 'transparent'}`, borderRadius: 11, background: '#18181B', cursor: m.ready ? 'pointer' : 'wait', overflow: 'hidden', textAlign: 'left', opacity: m.ready ? 1 : 0.55 }}>
                    <div style={{ aspectRatio: '3 / 4', background: '#0D0D0F' }}>
                      {m.photo && <img src={m.photo} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    </div>
                    <span data-no-tr style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,.85))', color: '#fff', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                    {pos >= 0 && <span style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 99, background: ACCENT, color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{pos + 1}</span>}
                    {!m.ready && <span style={{ position: 'absolute', top: 5, left: 5, fontSize: 10, color: WARN }}>…</span>}
                    <span role="button" title="Supprimer cette modèle" className="gj-del"
                      onClick={async e => {
                        e.stopPropagation()
                        if (!await confirmDialog({ title: `Supprimer « ${m.name} » ?`, text: 'Elle disparaît de la liste des modèles. Les vidéos déjà faites restent dans la Banque.', confirmLabel: 'Supprimer', danger: true })) return
                        const r = await deleteModel(account, m.id)
                        setModels(l => (l ?? []).filter(x => x.id !== m.id)); setPicked(picked.filter(x => x !== m.id))
                        toast(r === 'deleted' ? `« ${m.name} » supprimée` : `« ${m.name} » masquée dans ScaleFlow`, 'ok')
                      }}
                      style={{ position: 'absolute', top: 5, left: 5, width: 20, height: 20, borderRadius: 99, background: 'rgba(0,0,0,.65)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                      <Icon d="M18 6L6 18|M6 6l12 12" size={10} />
                    </span>
                  </button>
                )
              })}
              {models !== null && account && (
                <button type="button" onClick={() => setCreating(true)} style={{ aspectRatio: '3 / 4', borderRadius: 11, border: `1.5px dashed ${FIELD_EDGE}`, background: 'transparent', color: MUTED, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11.5, fontWeight: 600 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>＋</span>Nouvelle
                </button>
              )}
            </div>
            {chosen.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '.1em' }}>Dossier de la Banque</span>
                {chosen.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 9, background: '#0D0D0F', border: `1px solid ${EDGE}` }}>
                    {m.photo ? <img src={m.photo} alt="" style={{ width: 24, height: 24, borderRadius: 99, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ width: 24, height: 24, borderRadius: 99, background: '#18181B', flexShrink: 0 }} />}
                    <span data-no-tr style={{ fontSize: 12.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{m.name}</span>
                    <span style={{ color: DIM, fontSize: 12 }}>→</span>
                    <span data-no-tr title={folderOf(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, fontSize: 12.5, color: '#D4D4D8' }}>
                      <span style={{ display: 'flex', color: ACCENT_TXT, flexShrink: 0 }}><Icon d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" size={12} /></span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{crumbs(folderOf(m))}</span>
                    </span>
                    <button type="button" onClick={() => setFolderPickFor(m)} style={{ ...ghostBtn, height: 26, padding: '0 9px', fontSize: 12 }}>Changer</button>
                  </div>
                ))}
              </div>
            )}
          </Step>

          <Step n={2} title="Les vidéos" sub="Les reels à refaire : colle leurs liens, un par ligne.">
            <textarea value={linksText} onChange={e => setLinksText(e.target.value)} rows={4} spellCheck={false}
              placeholder={'https://www.instagram.com/reel/…\nhttps://www.instagram.com/reel/…'}
              style={{ ...field, height: 'auto', minHeight: 92, padding: '9px 10px', lineHeight: 1.5, resize: 'vertical', fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }} />
            {links.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {links.map(l => {
                  const s = src[l]
                  const color = s?.state === 'ok' ? OK : s?.state === 'error' ? BAD : MUTED
                  return (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, background: '#0D0D0F', border: `1px solid ${EDGE}`, fontSize: 12 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0, animation: s?.state === 'checking' ? 'pulse 1.2s ease-in-out infinite' : undefined }} />
                      <a href={l} target="_blank" rel="noreferrer" data-no-tr style={{ color: INK, textDecoration: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>{isInstagram(l) ? reelLabel(l) : l}</a>
                      {s?.user && <span data-no-tr style={{ color: MUTED }}>@{s.user}</span>}
                      <span style={{ marginLeft: 'auto', color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }} title={s?.error}>
                        {s?.state === 'ok' ? 'prête' : s?.state === 'error' ? s.error : 'vérification…'}
                      </span>
                      <button type="button" onClick={() => removeLink(l)} title="Retirer" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', padding: 0, display: 'flex' }}><Icon d="M18 6L6 18|M6 6l12 12" size={12} /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </Step>

          <Step n={3} title="Le rendu">
            <Row label="Résolution"><Segmented sm value={res} onChange={setRes} options={[{ v: '480p', l: '480p' }, { v: '720p', l: '720p' }, { v: '1080p', l: '1080p' }]} /></Row>
            <Row label="Prompt">
              <select value={mode} onChange={e => { const v = e.target.value; if (v === 'custom' && mode !== 'custom') setCustom(prompt); setMode(v) }} style={{ ...sel, maxWidth: 240 }}>
                <option value="auto" style={opt}>Automatique (options ci-dessous)</option>
                {Object.keys(presets).map(k => <option key={k} value={`p:${k}`} style={opt}>{k}</option>)}
                <option value="custom" style={opt}>Personnalisé</option>
              </select>
            </Row>
            {mode === 'auto' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '10px 12px', borderRadius: 10, background: '#0D0D0F', border: `1px solid ${EDGE}` }}>
                <Opt on={popts.several} onChange={v => setPopts(p => ({ ...p, several: v }))} label="Plusieurs filles dans la vidéo" hint="Précise laquelle remplacer.">
                  <input value={popts.who} onChange={e => setPopts(p => ({ ...p, who: e.target.value }))} placeholder="on the left, in the red dress" style={{ ...field, width: '100%' }} />
                </Opt>
                <Opt on={popts.keepText} onChange={v => setPopts(p => ({ ...p, keepText: v }))} label="Garder les textes écrits de la vidéo" hint="Sinon, les textes à l’écran sont retirés." />
                <Opt on={outfitOn} onChange={setOutfitOn} label="Autre tenue que la vidéo" hint="Décris la tenue voulue (en anglais de préférence).">
                  <input value={popts.outfit} onChange={e => setPopts(p => ({ ...p, outfit: e.target.value }))} placeholder="a black satin mini dress" style={{ ...field, width: '100%' }} />
                </Opt>
              </div>
            )}
            <div>
              <button type="button" onClick={() => setShowPrompt(v => !v)} style={{ background: 'none', border: 'none', padding: 0, color: MUTED, fontSize: 12, cursor: 'pointer' }}>
                {showPrompt ? '▾ Masquer le prompt' : '▸ Voir le prompt envoyé'}
              </button>
              {(showPrompt || mode === 'custom') && (
                <textarea value={prompt} rows={6} data-no-tr spellCheck={false}
                  onChange={e => { setCustom(e.target.value); setMode('custom') }}
                  style={{ ...field, marginTop: 6, width: '100%', height: 'auto', padding: '9px 10px', lineHeight: 1.5, resize: 'vertical', fontSize: 12 }} />
              )}
            </div>
            <div style={{ height: 1, background: EDGE, margin: '2px 0' }} />
            <Row label="Spoof auto"><Toggle on={cfg.on} onChange={v => setCfg({ on: v })} label="Spoof auto" /></Row>
            {cfg.on ? (<>
              <Row label="Versions">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <input type="number" min={1} max={10} value={cfg.count} onChange={e => setCfg({ count: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} style={{ ...field, width: 56, textAlign: 'center' }} />
                  <select value={cfg.device} onChange={e => setCfg({ device: e.target.value })} style={sel}>{SPOOF_DEVICES.filter(d => d.k !== 'none').map(d => <option key={d.k} value={d.k} style={opt}>{d.label}</option>)}</select>
                  <select value={cfg.gps} onChange={e => setCfg({ gps: e.target.value })} style={sel}>{GPS_CITIES.map(c => <option key={c.k} value={c.k} style={opt}>{c.label}</option>)}</select>
                </div>
              </Row>
              <span style={{ fontSize: 12, color: MUTED }} data-no-tr>
                {`→ ${cfg.count} version${cfg.count > 1 ? 's' : ''} ${deviceLabel} · ${gpsLabel} par résultat, dans le dossier de chaque modèle`}
              </span>
            </>) : <span style={{ fontSize: 12, color: MUTED }}>→ la vidéo telle quelle, dans le dossier de chaque modèle</span>}
          </Step>

          <button type="button" onClick={launch} disabled={!!blocker}
            style={{ height: 46, borderRadius: 12, border: 'none', cursor: blocker ? 'not-allowed' : 'pointer', fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em',
              background: blocker ? '#1C1C1F' : `linear-gradient(135deg, ${ACCENT}, #7C3AED)`, color: blocker ? DIM : '#fff', boxShadow: blocker ? 'none' : '0 8px 24px -10px rgba(168,85,247,.7)' }}>
            {blocker ?? `Lancer ${total} Genjutsu`}
          </button>
          {!blocker && <span style={{ marginTop: -6, textAlign: 'center', fontSize: 12, color: MUTED }}>
            {`${usable.length} vidéo${usable.length > 1 ? 's' : ''} × ${chosen.length} modèle${chosen.length > 1 ? 's' : ''} · ${res} · ${MAX_RUNNING} à la fois sur le compte`}
          </span>}
        </div>

        {/* ── colonne de droite : les résultats ── */}
        <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>Résultats</span>
            <Segmented sm value={filter} onChange={setFilter} options={[
              { v: 'all', l: 'Tout', n: counts.all }, { v: 'active', l: 'En cours', n: counts.active },
              { v: 'done', l: 'Terminés', n: counts.done }, { v: 'failed', l: 'Échecs', n: counts.failed },
            ]} />
            {(counts.done + counts.failed) > 0 && <button type="button" onClick={clearFinished} style={{ ...ghostBtn, marginLeft: 'auto', height: 26, fontSize: 12, color: MUTED }}>Vider les terminés</button>}
          </div>
          {counts.active > 0 && <span style={{ fontSize: 12, color: MUTED }}>Garde ScaleFlow ouvert pendant la génération (quelques minutes par vidéo) : le suivi reprend tout seul après un rechargement.</span>}
          {shown.length === 0 ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', color: DIM, fontSize: 13, padding: 40 }}>
              <div>
                <div style={{ fontSize: 28, marginBottom: 8, color: '#3F3F46' }}>✦</div>
                {jobs.length ? 'Rien dans ce filtre.' : 'Tes Genjutsu apparaîtront ici. Choisis une modèle, colle des liens et lance.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {shown.map(j => <JobCard key={j.id} job={j} now={now} onRespoof={() => respoof(j.id, planFor(j.model, true))} />)}
            </div>
          )}
        </div>
      </div>

      {login && <AccountLogin initialName={login.name} reconnect={login.reconnect} taken={(accounts ?? []).map(a => a.name)} onClose={() => setLogin(null)}
        onDone={name => { setLogin(null); setReco(m => ({ ...m, [name]: false })); void loadAccounts(name).then(() => loadModels()) }} />}
      {folderPickFor && <FolderPicker scope={scope} model={folderPickFor} current={folderOf(folderPickFor)} onClose={() => setFolderPickFor(null)}
        onPick={path => { void assignFolder(folderPickFor, path); setFolderPickFor(null); toast(`${folderPickFor.name} → « ${crumbs(normPath(path))} »`, 'ok') }} />}
      {creating && account && <NewModel account={account} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void loadModels(true) }} />}
    </Frame>
  )
}

/* ── morceaux d'interface ── */
function Frame({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 30, animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>{children}</div>
}
function Header({ right }: { right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 5, background: '#18181B', border: `1px solid ${EDGE}`, color: ACCENT_TXT, fontSize: 11.5, fontWeight: 500 }}>✦ Blowsome</span>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: '#F4F4F5', letterSpacing: '-0.02em' }}>Genjutsu</span>
        <span style={{ fontSize: 12.5, color: MUTED }}>Ta modèle à la place de la fille, sur n’importe quel reel — même mouvement, même cadrage.</span>
      </div>
      {right && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{right}</div>}
    </div>
  )
}
function Step({ n, title, sub, right, children }: { n: number; title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ width: 22, height: 22, borderRadius: 99, background: 'rgba(168,85,247,.16)', color: ACCENT_TXT, fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{n}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: '#A1A1AA', fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  )
}
function Opt({ on, onChange, label, hint, children }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Toggle on={on} onChange={onChange} label={label} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 11.5, color: DIM }}>{hint}</span>
        </div>
      </div>
      {on && children && <div style={{ paddingLeft: 46 }}>{children}</div>}
    </div>
  )
}

function statusLine(j: GjJob, now: number): { text: string; color: string; progress: number | null } {
  switch (j.status) {
    case 'waiting': return { text: 'En attente', color: MUTED, progress: null }
    case 'preparing': return { text: 'Préparation de la vidéo…', color: ACCENT_TXT, progress: 3 }
    case 'running': {
      const el = now - (j.startedAt ?? j.createdAt)
      return { text: `Génération · ${mmss(el)}`, color: ACCENT_TXT, progress: Math.min(95, 5 + (el / TYPICAL_MS) * 90) }
    }
    case 'saving': return { text: 'Récupération…', color: ACCENT_TXT, progress: 97 }
    case 'spoofing': return { text: j.spoof?.count ? `Spoof ${j.spoofDone ?? 0}/${j.spoof.count}…` : 'Rangement dans la Banque…', color: ACCENT_TXT, progress: 98 }
    case 'done': return j.spoof && (j.spoofDone ?? 0) > 0
      ? { text: j.spoof.count === 0 ? '✓ Rangée dans la Banque' : `✓ ${j.spoofDone} version${(j.spoofDone ?? 0) > 1 ? 's' : ''} dans la Banque`, color: OK, progress: null }
      : { text: '✓ Terminé', color: OK, progress: null }
    case 'failed': return { text: j.filtered ? 'Refusée par le filtre' : 'Échec', color: BAD, progress: null }
  }
}

function JobCard({ job: j, now, onRespoof }: { job: GjJob; now: number; onRespoof: () => void }) {
  const v = useRef<HTMLVideoElement>(null)
  const st = statusLine(j, now)
  const done = j.status === 'done' && !!j.resultUrl
  const media = done ? j.resultUrl : j.sourceUrl ? `${j.sourceUrl}#t=0.5` : null
  const canRespoof = done && (!j.spoof || !j.spoofDone || !!j.spoofError)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 11, overflow: 'hidden', background: '#0D0D0F', border: `1px solid ${j.status === 'failed' ? 'rgba(252,165,165,.22)' : EDGE}` }}>
      <div style={{ position: 'relative', aspectRatio: '9 / 16', background: '#0A0A0B', overflow: 'hidden' }}
        onMouseEnter={() => { if (done) void v.current?.play().catch(() => undefined) }} onMouseLeave={() => { if (done && v.current) { v.current.pause() } }}>
        {!done && j.model.photo && <img src={j.model.photo} alt="" style={{ position: 'absolute', inset: -12, width: 'calc(100% + 24px)', height: 'calc(100% + 24px)', objectFit: 'cover', filter: 'blur(14px) brightness(.35)' }} />}
        {media && <video ref={v} src={media} muted loop playsInline preload="metadata"
          style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: done ? 'none' : 'blur(5px) brightness(.45)', mixBlendMode: done ? 'normal' : 'luminosity' }} />}
        <div style={{ position: 'absolute', top: 6, left: 6, right: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          {j.model.photo && <img src={j.model.photo} alt="" style={{ width: 22, height: 22, borderRadius: 99, objectFit: 'cover', border: '1.5px solid rgba(255,255,255,.7)' }} />}
          <span data-no-tr style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.model.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,.75)', textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>{j.res}</span>
        </div>
        {!done && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: st.color }}>{st.text}</span>
            {st.progress != null && (
              <div style={{ width: '80%', height: 4, borderRadius: 99, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
                <div style={{ width: `${st.progress}%`, height: '100%', background: ACCENT, transition: 'width 1s linear' }} />
              </div>
            )}
            {j.status === 'failed' && j.error && <span data-no-tr style={{ fontSize: 11, lineHeight: 1.4, color: '#E4E4E7', display: '-webkit-box', WebkitLineClamp: 7, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{j.error}</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '7px 8px' }}>
        {done && <span style={{ fontSize: 11.5, fontWeight: 600, color: j.spoofError ? WARN : st.color }} title={j.spoofError ?? j.spoof?.folder}>
          {j.spoofError ? (j.spoof?.count ? `${j.spoofDone ?? 0}/${j.spoof.count} versions · ${j.spoofError}` : j.spoofError) : st.text}
        </span>}
        {done && j.spoof?.folder && <span data-no-tr title={j.spoof.folder} style={{ marginTop: -3, fontSize: 11, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`📁 ${crumbs(j.spoof.folder)}`}</span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <a href={j.source} target="_blank" rel="noreferrer" data-no-tr title={j.source}
            style={{ fontSize: 11, color: MUTED, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
            {j.sourceUser ? `@${j.sourceUser}` : reelLabel(j.source)}
          </a>
          {done && <IconBtn title="Ouvrir la vidéo" href={j.resultUrl!} d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|M15 3h6v6|M10 14L21 3" />}
          {canRespoof && <IconBtn title="Spoofer (versions dans la Banque)" onClick={onRespoof} d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />}
          {j.status === 'failed' && <IconBtn title="Relancer" onClick={() => retryJob(j.id)} d="M21 12a9 9 0 1 1-3-6.7L21 8|M21 3v5h-5" />}
          {!isActive(j.status) && <IconBtn title="Retirer" onClick={() => removeJob(j.id)} d="M18 6L6 18|M6 6l12 12" />}
        </div>
      </div>
    </div>
  )
}
function IconBtn({ title, d, onClick, href }: { title: string; d: string; onClick?: () => void; href?: string }) {
  const s: CSSProperties = { width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: '#D4D4D8', cursor: 'pointer', flexShrink: 0, padding: 0 }
  return href
    ? <a href={href} target="_blank" rel="noreferrer" title={title} style={s}><Icon d={d} size={11} /></a>
    : <button type="button" title={title} onClick={onClick} style={s}><Icon d={d} size={11} /></button>
}

function NewModel({ account, onClose, onCreated }: { account: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews])
  const add = (l: FileList | null) => {
    const picked = [...(l ?? [])].filter(x => x.type.startsWith('image/'))    // copié avant que la liste soit vidée
    setFiles(f => [...f, ...picked].slice(0, 4))
  }
  async function create() {
    if (!name.trim() || !files.length) return
    setBusy(true); setErr(null)
    try { await createModel(account, name.trim(), files); toast(`Modèle « ${name.trim()} » créée ✓`, 'ok'); onCreated() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  return (
    <div onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, width: 'min(440px, 100%)', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>Nouvelle modèle</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>1 à 4 photos : visage net, de face, bien éclairé. Elle sera aussi disponible dans le générateur.</div>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Prénom de la modèle" autoFocus style={field} />
        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); add(e.dataTransfer.files) }} onClick={() => input.current?.click()}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: 10, borderRadius: 10, border: `1.5px dashed ${FIELD_EDGE}`, cursor: 'pointer', minHeight: 110 }}>
          {previews.map((u, i) => <img key={u} src={u} alt="" title="Retirer" onClick={e => { e.stopPropagation(); setFiles(f => f.filter((_, k) => k !== i)) }} style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 7 }} />)}
          {files.length < 4 && <div style={{ aspectRatio: '3 / 4', borderRadius: 7, background: '#0D0D0F', display: 'grid', placeItems: 'center', color: DIM, fontSize: 11.5, textAlign: 'center' }}>＋ Photo</div>}
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { add(e.target.files); e.target.value = '' }} />
        {err && <span style={{ fontSize: 12.5, color: BAD }}>{err}</span>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>Annuler</button>
          <button type="button" onClick={() => void create()} disabled={busy || !name.trim() || !files.length}
            style={{ ...ghostBtn, background: '#EDEDEF', color: '#0A0A0B', border: '1px solid #EDEDEF', opacity: busy || !name.trim() || !files.length ? 0.5 : 1 }}>
            {busy ? 'Création…' : 'Créer la modèle'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── démarrage : vérification de l'accès Blowsome ── */
const GATE_CSS = `
@keyframes gjSpin{to{transform:rotate(360deg)}}
@keyframes gjIn{from{opacity:0;transform:translateY(10px)}}
@keyframes gjPulse{0%{box-shadow:0 0 0 0 rgba(134,239,172,.45)}100%{box-shadow:0 0 0 22px rgba(134,239,172,0)}}
@keyframes gjGlow{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes gjPop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1)}}
@keyframes gjFade{to{opacity:0;transform:scale(.985)}}
`
interface Check { label: string; state: CheckState; note?: string }
function CheckIcon({ state }: { state: CheckState }) {
  const box: CSSProperties = { width: 18, height: 18, borderRadius: 99, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }
  if (state === 'run') return <span style={{ ...box, border: '2px solid rgba(168,85,247,.22)', borderTopColor: ACCENT, animation: 'gjSpin .8s linear infinite' }} />
  if (state === 'ok') return <span style={{ ...box, background: 'rgba(134,239,172,.16)', color: OK, animation: 'gjPop .35s cubic-bezier(.2,.9,.3,1.3) both' }}>✓</span>
  if (state === 'fail') return <span style={{ ...box, background: 'rgba(248,113,113,.16)', color: BAD, animation: 'gjPop .35s both' }}>✕</span>
  return <span style={{ ...box, border: `1.5px solid ${FIELD_EDGE}` }} />
}
function Gate({ phase, denied, email, checks, failure }: { phase: 'checking' | 'granted' | 'blocked'; denied: boolean; email: string | null; checks: Check[]; failure: ReactNode }) {
  const color = phase === 'blocked' ? '#F87171' : phase === 'granted' ? OK : ACCENT
  const title = phase === 'granted' ? 'Accès Blowsome confirmé' : phase === 'blocked' ? (denied ? 'Accès Blowsome requis' : 'Genjutsu indisponible') : 'Vérification de l’accès Blowsome…'
  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 150px)', display: 'grid', placeItems: 'center', borderRadius: 18, overflow: 'hidden', background: '#0B0B0D', border: `1px solid ${EDGE}`, animation: phase === 'granted' ? 'gjFade .35s ease .55s forwards' : undefined }}>
      <style>{GATE_CSS}</style>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(620px 400px at 50% 36%, ${phase === 'blocked' ? 'rgba(248,113,113,.10)' : phase === 'granted' ? 'rgba(134,239,172,.10)' : 'rgba(168,85,247,.17)'}, transparent 70%)`, animation: 'gjGlow 3s ease-in-out infinite', transition: 'background .4s' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px)', backgroundSize: '34px 34px', maskImage: 'radial-gradient(circle at 50% 40%, #000, transparent 68%)', WebkitMaskImage: 'radial-gradient(circle at 50% 40%, #000, transparent 68%)' }} />
      <div style={{ position: 'relative', width: 'min(400px, calc(100% - 32px))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '32px 0', animation: 'gjIn .5s cubic-bezier(.16,1,.3,1) both' }}>
        <div style={{ position: 'relative', width: 108, height: 108 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `conic-gradient(from 0deg, transparent 0 52%, ${ACCENT} 88%, transparent)`, animation: 'gjSpin 1.1s linear infinite', opacity: phase === 'checking' ? 1 : 0, transition: 'opacity .3s' }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1.5px solid ${phase === 'checking' ? 'rgba(168,85,247,.22)' : color}`, transition: 'border-color .3s' }} />
          <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: 'radial-gradient(circle at 50% 30%, #1E1529, #0E0E11 72%)', display: 'grid', placeItems: 'center', animation: phase === 'granted' ? 'gjPulse .9s ease-out' : undefined }}>
            <span key={phase} style={{ fontSize: 36, lineHeight: 1, color, animation: 'gjPop .45s cubic-bezier(.2,.9,.3,1.3) both' }}>{phase === 'granted' ? '✓' : phase === 'blocked' ? '✕' : '✦'}</span>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: ACCENT_TXT, fontWeight: 600 }}>Blowsome · Genjutsu</div>
          <div style={{ fontSize: 21, fontWeight: 700, color: '#F4F4F5', marginTop: 8, letterSpacing: '-0.02em' }}>{title}</div>
          {email && <div data-no-tr style={{ fontSize: 12.5, color: MUTED, marginTop: 5 }}>{email}</div>}
        </div>
        <div style={{ width: '100%', borderRadius: 12, background: 'rgba(17,17,19,.85)', border: `1px solid ${EDGE}`, padding: '4px 14px', backdropFilter: 'blur(6px)' }}>
          {checks.map((c, i) => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderTop: i ? `1px solid ${EDGE}` : 'none', opacity: c.state === 'wait' ? 0.38 : 1, transition: 'opacity .3s' }}>
              <CheckIcon state={c.state} />
              <span style={{ fontSize: 13, color: INK, fontWeight: 600 }}>{c.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: c.state === 'fail' ? BAD : c.state === 'ok' ? OK : MUTED }}>
                {c.state === 'ok' ? (c.note ?? 'vérifié') : c.state === 'run' ? 'vérification…' : c.state === 'fail' ? (c.note ?? 'refusé') : ''}
              </span>
            </div>
          ))}
        </div>
        {phase === 'blocked' && failure && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: '#D4D4D8', animation: 'gjIn .4s both' }}>{failure}</div>
        )}
      </div>
    </div>
  )
}

/* ── comptes Higgsfield de l'équipe : choisir, ajouter, reconnecter ── */
function AccountsBar({ accounts, current, credits, reco, canRemove, locked, onPick, onAdd, onReconnect, onRemove }: {
  accounts: HfAccount[]; current: string; credits: Record<string, number | null>; reco: Record<string, boolean>; canRemove: boolean; locked: boolean
  onPick: (name: string) => void; onAdd: () => void; onReconnect: (name: string) => void; onRemove: (name: string) => void
}) {
  const mini: CSSProperties = { height: 34, padding: '0 9px', background: 'none', border: 'none', borderLeft: `1px solid ${FIELD_EDGE}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600 }
  return (
    <section style={{ ...card, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', marginRight: 4, textTransform: 'uppercase', letterSpacing: '.1em' }}>Compte Higgsfield</span>
      {accounts.map(a => {
        const on = a.name === current, needs = !!reco[a.name], cr = credits[a.name]
        return (
          <div key={a.name} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 10, border: `1.5px solid ${on ? ACCENT : FIELD_EDGE}`, background: on ? 'rgba(168,85,247,.10)' : FIELD_BG, overflow: 'hidden', transition: 'border-color .15s, background .15s' }}>
            <button type="button" onClick={() => onPick(a.name)} title={on ? 'Compte utilisé · clic pour actualiser le solde' : 'Utiliser ce compte'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', background: 'none', border: 'none', cursor: 'pointer', color: INK }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: needs ? WARN : OK, boxShadow: `0 0 8px ${needs ? WARN : OK}` }} />
              <span data-no-tr style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</span>
              <span style={{ fontSize: 11.5, color: on ? ACCENT_TXT : MUTED, fontVariantNumeric: 'tabular-nums' }}>{cr != null ? `${Math.round(cr).toLocaleString('fr-FR')} cr.` : '…'}</span>
            </button>
            {needs && <button type="button" onClick={() => onReconnect(a.name)} title="La connexion de ce compte a expiré" style={{ ...mini, color: WARN }}>↻ Reconnecter</button>}
            {canRemove && <button type="button" onClick={() => onRemove(a.name)} title="Retirer ce compte" style={{ ...mini, color: DIM }}><Icon d="M18 6L6 18|M6 6l12 12" size={11} /></button>}
          </div>
        )
      })}
      <button type="button" onClick={onAdd} disabled={locked} title={locked ? 'Il faut d’abord la clé du générateur (voir ci-dessous)' : undefined}
        style={{ ...ghostBtn, height: 37, borderStyle: 'dashed', color: ACCENT_TXT, opacity: locked ? 0.45 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}>＋ Ajouter un compte</button>
      {!accounts.length && !locked && <span style={{ fontSize: 12.5, color: WARN }}>Aucun compte connecté : ajoute un compte Higgsfield pour lancer des Genjutsu.</span>}
    </section>
  )
}

function AccountLogin({ initialName, reconnect, taken, onClose, onDone }: { initialName: string; reconnect: boolean; taken: string[]; onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState(initialName)
  const [link, setLink] = useState<string | null>(null)
  const [redirect, setRedirect] = useState('')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const nameTaken = !reconnect && taken.includes(name.trim())
  async function open() {
    if (!name.trim() || nameTaken) return
    setBusy(true); setErr(null)
    // onglet ouvert tout de suite (sinon le navigateur le bloque comme une fenêtre surgissante)
    const w = IS_WEB ? window.open('about:blank', '_blank') : null
    try {
      const r = await startAccountLogin(name.trim())
      setLink(r.url); setRedirect(r.redirect)
      if (w) { w.opener = null; w.location.href = r.url } else window.open(r.url, '_blank')
    } catch (e) { w?.close(); setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  async function finish(v: string) {
    if (!v.trim() || busy) return
    setBusy(true); setErr(null)
    try { const n = await finishAccountLogin(v); toast(reconnect ? `« ${n} » est reconnecté ✓` : `Compte « ${n} » ajouté ✓`, 'ok'); onDone(n) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const num = (n: number, on: boolean) => <span style={{ width: 20, height: 20, borderRadius: 99, flexShrink: 0, background: on ? 'rgba(168,85,247,.18)' : '#18181B', color: on ? ACCENT_TXT : DIM, fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{n}</span>
  return (
    <div onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{reconnect ? `Reconnecter « ${name} »` : 'Ajouter un compte Higgsfield'}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>Le compte sert à toute l’équipe (il apparaît aussi dans le générateur). Sa connexion reste sur le serveur.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {num(1, !link)}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>{reconnect ? 'Ouvre Higgsfield et connecte-toi avec ce compte' : 'Donne-lui un nom, puis ouvre Higgsfield'}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={name} onChange={e => setName(e.target.value)} disabled={reconnect || !!link} placeholder="Nom du compte" style={{ ...field, flex: 1, opacity: reconnect || link ? 0.6 : 1 }} />
              <button type="button" onClick={() => void open()} disabled={busy || !name.trim() || nameTaken}
                style={{ ...ghostBtn, height: 32, background: link ? FIELD_BG : '#EDEDEF', color: link ? '#E4E4E7' : '#0A0A0B', border: link ? `1px solid ${FIELD_EDGE}` : '1px solid #EDEDEF', opacity: busy || !name.trim() || nameTaken ? 0.5 : 1 }}>
                {link ? 'Rouvrir' : 'Ouvrir Higgsfield'} <Icon d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|M15 3h6v6|M10 14L21 3" size={11} />
              </button>
            </div>
            {nameTaken && <span style={{ fontSize: 12, color: WARN }}>Ce nom est déjà pris par un autre compte.</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: link ? 1 : 0.45, transition: 'opacity .2s' }}>
          {num(2, !!link)}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>Colle l’adresse de la page de retour</span>
            <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>Sur Higgsfield, connecte-toi et autorise l’accès. Tu arrives sur une page qui ne se charge pas : c’est normal. Copie son adresse et colle-la ici.</span>
            <input value={pasted} disabled={!link || busy} onChange={e => setPasted(e.target.value)} placeholder={redirect ? `${redirect}?code=…` : 'http://127.0.0.1…/callback?code=…'} data-no-tr
              onPaste={e => { const v = e.clipboardData.getData('text'); setTimeout(() => void finish(v), 0) }}
              style={{ ...field, fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5 }} />
            {link && <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: DIM }}>La page Higgsfield ne s’est pas ouverte ? Clique ici.</a>}
          </div>
        </div>
        {err && <span style={{ fontSize: 12.5, color: BAD }}>{err}</span>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>Annuler</button>
          <button type="button" onClick={() => void finish(pasted)} disabled={busy || !link || !pasted.trim()}
            style={{ ...ghostBtn, background: '#EDEDEF', color: '#0A0A0B', border: '1px solid #EDEDEF', opacity: busy || !link || !pasted.trim() ? 0.5 : 1 }}>
            {busy && link ? 'Validation…' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── le dossier de la Banque d'une modèle (sous-dossiers compris) ── */
function FolderPicker({ scope, model, current, onPick, onClose }: { scope: BankScope; model: { name: string }; current: string; onPick: (path: string) => void; onClose: () => void }) {
  const [paths, setPaths] = useState<string[] | null>(null)
  const [parent, setParent] = useState<string>(() => current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : '')
  const [name, setName] = useState('')
  useEffect(() => { void listBankFolders(scope).then(setPaths).catch(() => setPaths([])) }, [scope])
  const tree = useMemo(() => folderTree([...(paths ?? []), current]), [paths, current])
  const suggestion = joinPath('Genjutsu', model.name)
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, width: 'min(460px, 100%)', maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }} data-no-tr>{`Dossier de ${model.name}`}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>Ses vidéos Genjutsu iront directement dans ce dossier de la Banque.</div>
        </div>
        <div style={{ flex: 1, minHeight: 120, maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, padding: 6, borderRadius: 10, background: '#0D0D0F', border: `1px solid ${EDGE}` }}>
          {paths === null && <span style={{ fontSize: 12.5, color: MUTED, padding: 6 }}>Chargement des dossiers…</span>}
          {paths !== null && tree.map(n => {
            const on = n.path === current
            return (
              <button key={n.path} type="button" onClick={() => onPick(n.path)} title={n.path}
                style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: `0 10px 0 ${10 + n.depth * 16}px`, borderRadius: 7, border: 'none', cursor: 'pointer', textAlign: 'left', background: on ? 'rgba(168,85,247,.14)' : 'transparent', color: on ? ACCENT_TXT : '#D4D4D8', fontSize: 13, fontWeight: on ? 700 : 500, flexShrink: 0 }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }} onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ display: 'flex', color: on ? ACCENT_TXT : '#71717A' }}><Icon d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" size={13} /></span>
                <span data-no-tr style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</span>
                {on && <span style={{ marginLeft: 'auto', fontSize: 11 }}>✓</span>}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>Ou un nouveau dossier</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={parent} onChange={e => setParent(e.target.value)} style={{ ...sel, width: 150, flexShrink: 0 }} title="Dossier parent">
              <option value="" style={opt}>— Dossier principal</option>
              {tree.map(n => <option key={n.path} value={n.path} style={opt}>{`${'   '.repeat(n.depth)}${n.name}`}</option>)}
            </select>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du dossier" style={{ ...field, flex: 1, minWidth: 0 }}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onPick(joinPath(parent || null, name)) }} />
            <button type="button" disabled={!name.trim()} onClick={() => onPick(joinPath(parent || null, name))} style={{ ...ghostBtn, height: 32, opacity: name.trim() ? 1 : 0.5 }}>Créer</button>
          </div>
          {name.trim() && <span style={{ fontSize: 12, color: DIM }} data-no-tr>{`→ ${crumbs(joinPath(parent || null, name))}`}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          {current !== suggestion ? <button type="button" onClick={() => onPick(suggestion)} style={{ ...ghostBtn, color: MUTED }} data-no-tr>{`Par défaut : ${crumbs(suggestion)}`}</button> : <span />}
          <button type="button" onClick={onClose} style={ghostBtn}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

/* ── Higgsfield sur ce PC (appli PC) : sessions locales, connexion avec 2FA dans la vraie page ── */
function LocalAccounts() {
  const bridge = hfBridge()
  const [list, setList] = useState<HfLocalAccount[]>(listLocal)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    if (!bridge) return
    void (async () => { for (const a of listLocal()) setList(await checkLocal(a.id)) })()
  }, [bridge])
  if (!bridge) return <span style={{ marginTop: -6, fontSize: 11.5, color: DIM }}>Connexion locale des comptes Higgsfield (2FA, session gardée sur ton PC) : dans l’appli PC ScaleFlow.</span>
  const err = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'bad')
  async function add() {
    const name = await promptDialog({ title: 'Connecter un compte Higgsfield', text: 'Une fenêtre Higgsfield va s’ouvrir : connecte-toi (email, mot de passe, code 2FA), puis ferme-la. La session reste sur ce PC.', placeholder: 'Nom du compte (ex. Compte 3)', confirmLabel: 'Ouvrir Higgsfield' })
    if (name === null) return
    setBusy('new')
    try {
      const r = await addLocal(name)
      setList(r.list)
      if (r.status.loggedIn) toast(`Connecté ✓ ${r.status.email ?? ''}`, 'ok')
      else toast('Pas connecté : la fenêtre a été fermée avant la fin de la connexion.', 'bad')
    } catch (e) { err(e) } finally { setBusy(null) }
  }
  async function open(a: HfLocalAccount, record: boolean) {
    setBusy(a.id)
    try {
      const r = await reconnectLocal(a.id, record)
      setList(r.list)
      if (record) toast(r.status.recordFile ? `Calibrage enregistré (${r.status.recorded} appels) : envoie le fichier « ${r.status.recordFile.split(/[\\/]/).pop()} » (dans Téléchargements).` : 'Rien d’enregistré : lance une génération dans la fenêtre avant de la fermer.', r.status.recordFile ? 'ok' : 'bad', 9000)
      else toast(r.status.loggedIn ? `Connecté ✓ ${r.status.email ?? ''}` : 'Pas connecté.', r.status.loggedIn ? 'ok' : 'bad')
    } catch (e) { err(e) } finally { setBusy(null) }
  }
  async function remove(a: HfLocalAccount) {
    if (!await confirmDialog({ title: `Retirer « ${a.name} » de ce PC ?`, text: 'Sa session Higgsfield est effacée de ce PC. Le compte Higgsfield lui-même n’est pas touché.', confirmLabel: 'Retirer', danger: true })) return
    setList(await removeLocal(a.id))
  }
  const mini: CSSProperties = { height: 34, padding: '0 9px', background: 'none', border: 'none', borderLeft: `1px solid ${FIELD_EDGE}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600 }
  return (
    <section style={{ ...card, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, marginTop: -6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#A1A1AA', marginRight: 4, textTransform: 'uppercase', letterSpacing: '.1em' }}>Sur ce PC</span>
        {list.map(a => {
          const dot = a.loggedIn === null ? DIM : a.loggedIn ? OK : WARN
          return (
            <div key={a.id} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 10, border: `1.5px solid ${FIELD_EDGE}`, background: FIELD_BG, overflow: 'hidden', opacity: busy === a.id ? 0.6 : 1 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px' }} title={a.email ?? undefined}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: dot, boxShadow: `0 0 8px ${dot}` }} />
                <span data-no-tr style={{ fontSize: 13, fontWeight: 600, color: INK }}>{a.name}</span>
                {a.email && <span data-no-tr style={{ fontSize: 11.5, color: MUTED }}>{a.email}</span>}
              </span>
              {a.loggedIn === false
                ? <button type="button" disabled={!!busy} onClick={() => void open(a, false)} style={{ ...mini, color: WARN }}>Se connecter</button>
                : <button type="button" disabled={!!busy} onClick={() => void open(a, true)} title="Ouvre Higgsfield et enregistre les appels du site pendant que tu fais une génération à la main" style={{ ...mini, color: ACCENT_TXT }}>Calibrer</button>}
              <button type="button" disabled={!!busy} onClick={() => void remove(a)} title="Retirer de ce PC" style={{ ...mini, color: DIM }}><Icon d="M18 6L6 18|M6 6l12 12" size={11} /></button>
            </div>
          )
        })}
        <button type="button" disabled={!!busy} onClick={() => void add()} style={{ ...ghostBtn, height: 37, borderStyle: 'dashed', color: ACCENT_TXT }}>{busy === 'new' ? 'Fenêtre Higgsfield ouverte…' : '＋ Connecter un compte'}</button>
      </div>
      <span style={{ fontSize: 11.5, color: DIM, lineHeight: 1.5 }}>
        Chaque compte se connecte une fois dans la vraie page Higgsfield (code 2FA compris) ; la session reste sur ce PC. Génération en local : en cours de calage — clique « Calibrer », fais UNE génération Motion Control à la main dans la fenêtre, ferme-la, puis envoie le fichier « higgsfield-calibrage-… » de Téléchargements.
      </span>
    </section>
  )
}
