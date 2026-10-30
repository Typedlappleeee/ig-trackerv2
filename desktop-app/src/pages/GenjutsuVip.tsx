// Genjutsu (accès Blowsome uniquement) : une vidéo source refaite avec la tête d'une modèle
// (Higgsfield motion control), dans une page ScaleFlow propre :
//   1. la modèle (photo de référence = Element Higgsfield, partagé avec le générateur de l'équipe)
//   2. les liens des reels à refaire
//   3. le rendu (480p par défaut, prompt réglé par quelques options) + spoof auto en X versions
// Moteur et file : src/lib/genjutsuHF.ts (relais /api/hf, mot de passe remis par sf_genjutsu_access).
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { Icon, Toggle, Segmented, toast, useNarrow } from '@/lib/ui'
import { SPOOF_DEVICES, GPS_CITIES } from '@/lib/studioTools'
import {
  GENERATOR_URL, MAX_RUNNING, TYPICAL_MS, setRelayPassword, listAccounts, readCredits, listModels, createModel, readPromptPresets,
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

interface AutoCfg { on: boolean; count: number; device: string; gps: string; perModel: boolean; folder: string }
const readJson = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* bloqué */ } }
const cfgDefaults = (): AutoCfg => ({ on: true, count: 3, device: 'iphone15', gps: 'france', perModel: true, folder: 'Genjutsu' })
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const reelLabel = (link: string) => link.match(/\/reel\/([\w-]+)/)?.[1] ?? link.replace(/^https?:\/\//, '').slice(0, 42)
type Access = 'loading' | 'ok' | 'nopass' | 'nosql' | 'denied'
type SrcState = { state: 'checking' | 'ok' | 'error'; user?: string | null; error?: string }
type Filter = 'all' | 'active' | 'done' | 'failed'

export default function GenjutsuVip({ user, org, isSuperAdmin }: { user: User; org: OrgState; isSuperAdmin: boolean }) {
  void user
  const orgId = org.currentOrg?.id ?? null
  const narrow = useNarrow(1100)

  // ── accès : le mot de passe du relais, remis seulement aux comptes Blowsome ──
  const [access, setAccess] = useState<Access>('loading')
  const [newPass, setNewPass] = useState('')
  const loadAccess = useCallback(async () => {
    const { data, error } = await supabase.rpc('sf_genjutsu_access')
    if (error) { setAccess(/function|schema cache/i.test(error.message) ? 'nosql' : 'denied'); return }
    const p = (data as string | null) || null
    if (!p) { setAccess('nopass'); return }
    try { localStorage.setItem('motDePasse', p) } catch { /* générateur complet : le demandera */ }
    setRelayPassword(p)
    setAccess('ok')
  }, [])
  useEffect(() => { void loadAccess() }, [loadAccess])
  async function savePass() {
    const { error } = await supabase.rpc('sf_set_secret', { p_name: 'genjutsu_password', p_value: newPass })
    if (error) { toast(error.message, 'bad'); return }
    setNewPass(''); toast('Mot de passe du générateur enregistré ✓', 'ok')
    await loadAccess()
  }

  // ── comptes Higgsfield de l'équipe ──
  const [accounts, setAccounts] = useState<HfAccount[] | null>(null)
  const [account, setAccountState] = useState<string>(() => readJson(ACC_KEY, ''))
  const [relayErr, setRelayErr] = useState<string | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const setAccount = (a: string) => { setAccountState(a); writeJson(ACC_KEY, a) }
  const loadAccounts = useCallback(async () => {
    setRelayErr(null)
    try {
      const r = await listAccounts()
      if (!r.cloud) { setRelayErr('Le relais Genjutsu refuse le mot de passe enregistré : demande à l’administrateur de le mettre à jour.'); setAccounts([]); return }
      setAccounts(r.accounts)
      setAccountState(cur => r.accounts.some(a => a.name === cur) ? cur : (r.accounts[0]?.name ?? ''))
    } catch (e) { setRelayErr(e instanceof Error ? e.message : String(e)); setAccounts([]) }
  }, [])
  useEffect(() => { if (access === 'ok') { void loadAccounts(); pump() } }, [access, loadAccounts])
  const refreshCredits = useCallback(async () => {
    if (!account) return
    try { setCredits(await readCredits(account)) } catch { /* solde indisponible */ }
  }, [account])
  useEffect(() => {
    setCredits(accounts?.find(a => a.name === account)?.credits ?? null)
    if (access === 'ok' && account) void refreshCredits()
  }, [access, account, accounts, refreshCredits])

  // ── modèles (Elements du compte) ──
  const [models, setModels] = useState<HfModel[] | null>(null)
  const [modelsErr, setModelsErr] = useState<string | null>(null)
  const [picked, setPickedState] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const setPicked = (ids: string[]) => { setPickedState(ids); writeJson(`${PICK_KEY}:${account}`, ids) }
  const loadModels = useCallback(async (quiet = false) => {
    if (!account) return
    if (!quiet) { setModels(null); setModelsErr(null) }
    try {
      const l = await listModels(account)
      setModels(l)
      setPickedState(p => p.filter(id => l.some(m => m.id === id)))
    } catch (e) { if (!quiet) { setModelsErr(e instanceof Error ? e.message : String(e)); setModels([]) } }
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

  // ── spoof automatique des résultats ──
  const [cfg, setCfgState] = useState<AutoCfg>(() => ({ ...cfgDefaults(), ...readJson<Partial<AutoCfg>>(CFG_KEY, {}) }))
  const setCfg = (p: Partial<AutoCfg>) => setCfgState(c => { const n = { ...c, ...p }; writeJson(CFG_KEY, n); return n })
  const folderFor = (model: string) => {
    const base = cfg.folder.trim() || 'Genjutsu'
    return cfg.perModel ? `${base} · ${model}` : base
  }
  const planFor = (model: string): SpoofPlan => ({ count: cfg.count, device: cfg.device, gps: cfg.gps, folder: folderFor(model), orgId })
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
      spoof: cfg.on ? planFor(m.name) : null,
    }))))
    toast(`${total} Genjutsu ajouté${total > 1 ? 's' : ''} à la file`, 'ok')
    setLinksText(''); setSrc({})
    setTimeout(() => void refreshCredits(), 30_000)
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

  // ── écrans d'accès ──
  if (access !== 'ok') {
    return (
      <Frame>
        <Header />
        <div style={{ ...card, maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: '#D4D4D8' }}>
          {access === 'loading' && <span style={{ color: MUTED }}>Connexion à Genjutsu…</span>}
          {access === 'nosql' && <span style={{ color: WARN }}>⚠ Colle le SQL <code>20261030b_genjutsu_access.sql</code> dans Supabase pour activer Genjutsu.</span>}
          {access === 'denied' && <span style={{ color: WARN }}>Genjutsu est réservé à l’accès Blowsome.</span>}
          {access === 'nopass' && isSuperAdmin && (<>
            <span>Enregistre une fois le mot de passe du générateur : les comptes Blowsome n’auront jamais à le taper.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newPass} onChange={e => setNewPass(e.target.value)} type="password" autoComplete="off" placeholder="Mot de passe du générateur" style={{ ...field, flex: 1 }} />
              <button type="button" disabled={!newPass.trim()} onClick={() => void savePass()} style={{ ...ghostBtn, height: 32, opacity: newPass.trim() ? 1 : 0.5 }}>Enregistrer</button>
            </div>
          </>)}
          {access === 'nopass' && !isSuperAdmin && <span style={{ color: MUTED }}>Genjutsu n’est pas encore activé par l’administrateur.</span>}
        </div>
      </Frame>
    )
  }

  const credit = credits != null ? `${Math.round(credits).toLocaleString('fr-FR')} crédits` : null
  return (
    <Frame>
      <Header right={<>
        {accounts && accounts.length > 0 && (
          <select value={account} onChange={e => setAccount(e.target.value)} style={sel} title="Compte Higgsfield utilisé" data-no-tr>
            {accounts.map(a => <option key={a.name} value={a.name} style={opt}>{a.name}</option>)}
          </select>
        )}
        {credit && <button type="button" onClick={() => void refreshCredits()} title="Actualiser le solde" style={{ ...ghostBtn, color: ACCENT_TXT }}>{credit}</button>}
        <a href={GENERATOR_URL} target="_blank" rel="noreferrer" style={{ ...ghostBtn, textDecoration: 'none', color: MUTED }} title="Connexion de comptes Higgsfield, sous-titres, traduction…">
          Générateur complet <Icon d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|M15 3h6v6|M10 14L21 3" size={12} />
        </a>
      </>} />

      {relayErr && (
        <div style={{ ...card, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderColor: 'rgba(252,165,165,0.25)', color: BAD, fontSize: 13 }}>
          <span style={{ flex: 1 }}>{relayErr}</span>
          <button type="button" onClick={() => void loadAccounts()} style={ghostBtn}>Réessayer</button>
        </div>
      )}
      {accounts && accounts.length === 0 && !relayErr && (
        <div style={{ ...card, padding: '10px 14px', fontSize: 13, color: WARN }}>
          Aucun compte Higgsfield connecté : ajoute-en un dans le <a href={GENERATOR_URL} target="_blank" rel="noreferrer" style={{ color: ACCENT_TXT }}>générateur complet</a> (« ＋ Compte »), puis reviens ici.
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
              {models?.map(m => {
                const pos = picked.indexOf(m.id)
                return (
                  <button key={m.id} type="button" disabled={!m.ready} onClick={() => setPicked(pos >= 0 ? picked.filter(x => x !== m.id) : [...picked, m.id])}
                    title={m.ready ? m.name : 'En préparation chez Higgsfield…'}
                    style={{ position: 'relative', padding: 0, border: `2px solid ${pos >= 0 ? ACCENT : 'transparent'}`, borderRadius: 11, background: '#18181B', cursor: m.ready ? 'pointer' : 'wait', overflow: 'hidden', textAlign: 'left', opacity: m.ready ? 1 : 0.55 }}>
                    <div style={{ aspectRatio: '3 / 4', background: '#0D0D0F' }}>
                      {m.photo && <img src={m.photo} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    </div>
                    <span data-no-tr style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,.85))', color: '#fff', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                    {pos >= 0 && <span style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 99, background: ACCENT, color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{pos + 1}</span>}
                    {!m.ready && <span style={{ position: 'absolute', top: 5, left: 5, fontSize: 10, color: WARN }}>…</span>}
                  </button>
                )
              })}
              {models !== null && account && (
                <button type="button" onClick={() => setCreating(true)} style={{ aspectRatio: '3 / 4', borderRadius: 11, border: `1.5px dashed ${FIELD_EDGE}`, background: 'transparent', color: MUTED, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11.5, fontWeight: 600 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>＋</span>Nouvelle
                </button>
              )}
            </div>
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
            {cfg.on && (<>
              <Row label="Versions">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <input type="number" min={1} max={10} value={cfg.count} onChange={e => setCfg({ count: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} style={{ ...field, width: 56, textAlign: 'center' }} />
                  <select value={cfg.device} onChange={e => setCfg({ device: e.target.value })} style={sel}>{SPOOF_DEVICES.filter(d => d.k !== 'none').map(d => <option key={d.k} value={d.k} style={opt}>{d.label}</option>)}</select>
                  <select value={cfg.gps} onChange={e => setCfg({ gps: e.target.value })} style={sel}>{GPS_CITIES.map(c => <option key={c.k} value={c.k} style={opt}>{c.label}</option>)}</select>
                </div>
              </Row>
              <Row label="Dossier">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={cfg.folder} onChange={e => setCfg({ folder: e.target.value })} placeholder="Genjutsu" style={{ ...field, width: 130 }} />
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#D4D4D8', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={cfg.perModel} onChange={e => setCfg({ perModel: e.target.checked })} /> un par modèle
                  </label>
                </div>
              </Row>
              <span style={{ fontSize: 12, color: MUTED }} data-no-tr>
                {`→ ${cfg.count} version${cfg.count > 1 ? 's' : ''} ${deviceLabel} · ${gpsLabel} par résultat, dans « ${folderFor(chosen[0]?.name ?? 'Modèle')} »`}
              </span>
            </>)}
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
              {shown.map(j => <JobCard key={j.id} job={j} now={now} onRespoof={() => respoof(j.id, planFor(j.model.name))} />)}
            </div>
          )}
        </div>
      </div>

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
    case 'spoofing': return { text: `Spoof ${j.spoofDone ?? 0}/${j.spoof?.count ?? 0}…`, color: ACCENT_TXT, progress: 98 }
    case 'done': return j.spoof && (j.spoofDone ?? 0) > 0
      ? { text: `✓ ${j.spoofDone} version${(j.spoofDone ?? 0) > 1 ? 's' : ''} dans la Banque`, color: OK, progress: null }
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
          {j.spoofError ? `${j.spoofDone ?? 0}/${j.spoof?.count ?? 0} versions · ${j.spoofError}` : st.text}
        </span>}
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
