import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useLicense } from '@/lib/license'
import { useConnections } from '@/lib/connections'
import { loadLastGroup, saveLastGroup } from '@/lib/uiPrefs'
import {
  fetchAllPhones, startPhones, stopPhone, warmupAccountNative, editInstagramProfileNative,
  warmupTikTokNative, editTikTokProfileNative, forceInstagramEnglish, postInstagramStory,
  getPhonePublicIp, waitForPhoneConnectivity, shellExec, type GeelarkPhone,
} from '@/lib/geelark'
import { startRun, setRunPhase, finishRun } from '@/lib/activeRuns'

// Allume le téléphone et attend qu'il réponde — pour les tâches shell brutes
// (les warmup/édition gèrent déjà le démarrage en interne).
async function ensureOn(bearer: string, id: string, log: (m: string) => void): Promise<boolean> {
  await startPhones(bearer, [id]).catch(() => {})
  return waitForPhoneConnectivity(bearer, id, log, { tries: 10 })
}

// ── Bibliothèque d'automatisations ───────────────────────────────────────────
// Superadmin : on choisit des téléphones puis une tâche simple → elle s'exécute
// sur les tels (avec suivi par téléphone). Utilisateurs : écran « Bientôt ».

type FieldType = 'text' | 'number' | 'bool'
interface Field { key: string; label: string; type: FieldType; placeholder?: string; def?: string | number | boolean; required?: boolean }
interface Task {
  key: string; title: string; desc: string; emoji: string; accent: string; grad: string; glow: string
  superOnly?: boolean
  danger?: boolean
  fields?: Field[]
  run: (bearer: string, phoneId: string, cfg: Record<string, string>, log: (m: string) => void) => Promise<{ ok: boolean; error?: string }>
}

const GRAD = {
  green: { grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.45)', accent: '#34D399' },
  slate: { grad: 'linear-gradient(135deg,#64748B,#475569)', glow: 'rgba(148,163,184,0.4)', accent: '#94A3B8' },
  amber: { grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.45)', accent: '#FBBF24' },
  pink:  { grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.5)',  accent: '#F472B6' },
  cyan:  { grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)', glow: 'rgba(34,211,238,0.42)', accent: '#22D3EE' },
  indigo:{ grad: 'linear-gradient(135deg,#6366F1,#8B5CF6)', glow: 'rgba(99,102,241,0.5)',  accent: '#818CF8' },
  violet:{ grad: 'linear-gradient(135deg,#8B5CF6,#6366F1)', glow: 'rgba(167,139,250,0.45)', accent: '#A78BFA' },
}
const IG = 'com.instagram.android'
const TT = 'com.zhiliaoapp.musically'
const openApp = (pkg: string) => `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`
const isOn = (cfg: Record<string, string>, k: string) => cfg[k] === 'true'

const TASKS: Task[] = [
  // ── Cycle de vie ──
  { key: 'power_on', title: 'Allumer', desc: 'Démarre les téléphones sélectionnés.', emoji: '🔌', ...GRAD.green,
    run: async (bearer, id) => { const n = await startPhones(bearer, [id]); return { ok: n > 0, error: n > 0 ? undefined : 'démarrage refusé' } } },
  { key: 'power_off', title: 'Éteindre', desc: 'Stoppe les téléphones (libère le proxy).', emoji: '⏻', ...GRAD.slate,
    run: async (bearer, id) => { await stopPhone(bearer, id); return { ok: true } } },
  { key: 'reboot', title: 'Redémarrer', desc: 'Éteint puis rallume le téléphone.', emoji: '🔁', ...GRAD.slate,
    run: async (bearer, id, _c, log) => { await stopPhone(bearer, id); log('éteint, rallumage…'); await new Promise(r => setTimeout(r, 4000)); const on = await ensureOn(bearer, id, log); return { ok: on, error: on ? undefined : 'ne répond pas' } } },

  // ── Warmup ──
  { key: 'warmup_ig', title: 'Warmup Instagram', desc: 'Navigation IA naturelle dans le feed pour chauffer le compte.', emoji: '🔥', ...GRAD.amber,
    fields: [
      { key: 'browseVideo', label: 'Nombre de vidéos à parcourir', type: 'number', def: 15 },
      { key: 'keyword', label: 'Mot-clé (optionnel)', type: 'text', placeholder: 'ex. fitness' },
    ],
    run: (bearer, id, cfg, log) => warmupAccountNative(bearer, id, { browseVideo: Number(cfg.browseVideo) || 15, keyword: cfg.keyword?.trim() || undefined }, log) },
  { key: 'warmup_tt', title: 'Warmup TikTok', desc: 'Parcourt le feed TikTok + like/follow/commentaires IA optionnels.', emoji: '🎵', ...GRAD.cyan,
    fields: [
      { key: 'durationMin', label: 'Durée (minutes)', type: 'number', def: 10 },
      { key: 'keyword', label: 'Mot-clé (optionnel)', type: 'text', placeholder: 'ex. gym' },
      { key: 'like', label: 'Liker aléatoirement', type: 'bool', def: true },
      { key: 'follow', label: 'Suivre aléatoirement', type: 'bool', def: false },
      { key: 'comment', label: 'Commenter (IA)', type: 'bool', def: false },
    ],
    run: (bearer, id, cfg, log) => warmupTikTokNative(bearer, id, { durationMin: Number(cfg.durationMin) || 10, keyword: cfg.keyword?.trim() || undefined, like: isOn(cfg, 'like'), follow: isOn(cfg, 'follow'), comment: isOn(cfg, 'comment') }, log) },

  // ── Profil ──
  { key: 'edit_ig', title: 'Éditer profil IG', desc: 'Change nom, bio, lien et photo du profil Instagram.', emoji: '✏️', ...GRAD.pink,
    fields: [
      { key: 'nickname', label: 'Nom affiché', type: 'text', placeholder: 'laisser vide = inchangé' },
      { key: 'biography', label: 'Bio', type: 'text', placeholder: 'laisser vide = inchangé' },
      { key: 'linkURL', label: 'Lien', type: 'text', placeholder: 'https://…' },
      { key: 'avatarUrl', label: 'Photo de profil (URL)', type: 'text', placeholder: 'https://…/photo.jpg' },
    ],
    run: (bearer, id, cfg, log) => editInstagramProfileNative(bearer, id, { nickname: cfg.nickname?.trim() || undefined, biography: cfg.biography?.trim() || undefined, linkURL: cfg.linkURL?.trim() || undefined, avatarUrl: cfg.avatarUrl?.trim() || undefined }, log) },
  { key: 'edit_tt', title: 'Éditer profil TikTok', desc: 'Change nom, bio, site et photo du profil TikTok.', emoji: '🎬', ...GRAD.pink,
    fields: [
      { key: 'nickName', label: 'Nom affiché', type: 'text', placeholder: 'laisser vide = inchangé' },
      { key: 'bio', label: 'Bio', type: 'text', placeholder: 'laisser vide = inchangé' },
      { key: 'site', label: 'Site', type: 'text', placeholder: 'https://…' },
      { key: 'avatarUrl', label: 'Photo de profil (URL)', type: 'text', placeholder: 'https://…/photo.jpg' },
    ],
    run: (bearer, id, cfg, log) => editTikTokProfileNative(bearer, id, { nickName: cfg.nickName?.trim() || undefined, bio: cfg.bio?.trim() || undefined, site: cfg.site?.trim() || undefined, avatarUrl: cfg.avatarUrl?.trim() || undefined }, log) },

  // ── Publication ──
  { key: 'story', title: 'Poster une story', desc: 'Publie une image en story Instagram avec un sticker lien cliquable.', emoji: '📖', ...GRAD.amber,
    fields: [
      { key: 'imageUrl', label: 'Image (URL publique)', type: 'text', placeholder: 'https://…/image.jpg', required: true },
      { key: 'linkUrl', label: 'Lien du sticker', type: 'text', placeholder: 'https://…', required: true },
      { key: 'linkText', label: 'Texte du sticker (optionnel)', type: 'text', placeholder: 'ex. Voir plus' },
    ],
    run: (bearer, id, cfg, log) => {
      const imageUrl = cfg.imageUrl?.trim(), linkUrl = cfg.linkUrl?.trim()
      if (!imageUrl || !linkUrl) return Promise.resolve({ ok: false, error: 'image + lien requis' })
      return postInstagramStory(bearer, id, { imageUrl, linkUrl, linkText: cfg.linkText?.trim() || undefined }, log)
    } },

  // ── Apps ──
  { key: 'open_ig', title: 'Ouvrir Instagram', desc: 'Lance l\'app Instagram sur le téléphone.', emoji: '📸', ...GRAD.indigo,
    run: async (bearer, id, _c, log) => { if (!await ensureOn(bearer, id, log)) return { ok: false, error: 'téléphone injoignable' }; await shellExec(bearer, id, openApp(IG)); return { ok: true } } },
  { key: 'open_tt', title: 'Ouvrir TikTok', desc: 'Lance l\'app TikTok sur le téléphone.', emoji: '🎶', ...GRAD.indigo,
    run: async (bearer, id, _c, log) => { if (!await ensureOn(bearer, id, log)) return { ok: false, error: 'téléphone injoignable' }; await shellExec(bearer, id, openApp(TT)); return { ok: true } } },
  { key: 'restart_ig', title: 'Redémarrer Instagram', desc: 'Ferme puis relance Instagram (débloque l\'app figée).', emoji: '♻️', ...GRAD.indigo,
    run: async (bearer, id, _c, log) => { if (!await ensureOn(bearer, id, log)) return { ok: false, error: 'téléphone injoignable' }; await shellExec(bearer, id, `am force-stop ${IG}`); await new Promise(r => setTimeout(r, 1500)); await shellExec(bearer, id, openApp(IG)); return { ok: true } } },
  { key: 'restart_tt', title: 'Redémarrer TikTok', desc: 'Ferme puis relance TikTok (débloque l\'app figée).', emoji: '🔂', ...GRAD.indigo,
    run: async (bearer, id, _c, log) => { if (!await ensureOn(bearer, id, log)) return { ok: false, error: 'téléphone injoignable' }; await shellExec(bearer, id, `am force-stop ${TT}`); await new Promise(r => setTimeout(r, 1500)); await shellExec(bearer, id, openApp(TT)); return { ok: true } } },
  { key: 'ig_english', title: 'Instagram en anglais', desc: 'Force la langue d\'Instagram en anglais (RPA plus fiable).', emoji: '🇬🇧', ...GRAD.violet,
    run: async (bearer, id, _c, log) => { if (!await ensureOn(bearer, id, log)) return { ok: false, error: 'téléphone injoignable' }; await forceInstagramEnglish(bearer, id); log('langue forcée en anglais'); return { ok: true } } },

  // ── Diagnostic ──
  { key: 'check_ip', title: 'Vérifier l\'IP', desc: 'Affiche l\'IP publique actuelle du téléphone (proxy).', emoji: '🌍', ...GRAD.green,
    run: async (bearer, id, _c, log) => { if (!await ensureOn(bearer, id, log)) return { ok: false, error: 'téléphone injoignable' }; const ip = await getPhonePublicIp(bearer, id); log(ip ? `IP : ${ip}` : 'IP introuvable'); return { ok: !!ip, error: ip ? undefined : 'IP introuvable' } } },

  // ── Avancé (superadmin) ──
  { key: 'clear_ig', title: 'Vider le cache IG', desc: 'Efface les données d\'Instagram (⚠ déconnecte le compte).', emoji: '🗑️', ...GRAD.slate, superOnly: true, danger: true,
    run: async (bearer, id, _c, log) => { if (!await ensureOn(bearer, id, log)) return { ok: false, error: 'téléphone injoignable' }; await shellExec(bearer, id, `pm clear ${IG}`); log('données Instagram effacées'); return { ok: true } } },
  { key: 'clear_tt', title: 'Vider le cache TikTok', desc: 'Efface les données de TikTok (⚠ déconnecte le compte).', emoji: '🧽', ...GRAD.slate, superOnly: true, danger: true,
    run: async (bearer, id, _c, log) => { if (!await ensureOn(bearer, id, log)) return { ok: false, error: 'téléphone injoignable' }; await shellExec(bearer, id, `pm clear ${TT}`); log('données TikTok effacées'); return { ok: true } } },
  { key: 'shell', title: 'Commande ADB', desc: 'Exécute une commande Android brute (avancé).', emoji: '⌨️', ...GRAD.cyan, superOnly: true, danger: true,
    fields: [{ key: 'cmd', label: 'Commande shell', type: 'text', placeholder: 'ex. input keyevent 3', required: true }],
    run: async (bearer, id, cfg, log) => {
      const cmd = cfg.cmd?.trim()
      if (!cmd) return { ok: false, error: 'commande vide' }
      if (!await ensureOn(bearer, id, log)) return { ok: false, error: 'téléphone injoignable' }
      const r = await shellExec(bearer, id, cmd)
      log(`↳ ${(r.output || '(vide)').slice(0, 300)}`)
      return { ok: true }
    } },
]

const CSS = `
@keyframes lib-rise { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes lib-pulse { 0%,100%{opacity:.45} 50%{opacity:1} }
@keyframes lib-float-a { 0%,100%{transform:translate(0,0)} 50%{transform:translate(38px,26px)} }
@keyframes lib-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,36px)} }
.libtask { transition: transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s, border-color .25s; }
.libtask:hover:not(:disabled) { transform: translateY(-3px); }
`

type JobStatus = 'idle' | 'running' | 'done' | 'error'
interface Job { status: JobStatus; detail?: string }

const MAX_CONCURRENCY = 5
async function pLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const item = items[cursor++]; await worker(item) }
  })
  await Promise.all(runners)
}
const phoneName = (p: GeelarkPhone) => p.serialName ?? p.name ?? p.serialNo ?? p.id.slice(-6)

// ── Écran « Bientôt » (utilisateurs non-admin) ───────────────────────────────
const TEASERS = [
  { emoji: '🔌', title: 'Allumer / Éteindre', desc: 'Démarre et arrête tes cloud phones en un clic.', grad: 'linear-gradient(135deg,#10B981,#059669)', glow: 'rgba(16,185,129,0.45)', accent: '#34D399' },
  { emoji: '🔥', title: 'Warmup automatique', desc: 'Chauffe les comptes de façon naturelle avant de publier.', grad: 'linear-gradient(135deg,#F59E0B,#EF4444)', glow: 'rgba(245,158,11,0.45)', accent: '#FBBF24' },
  { emoji: '✏️', title: 'Édition de profil', desc: 'Nom, bio et lien mis à jour en masse sur tous les comptes.', grad: 'linear-gradient(135deg,#EC4899,#8B5CF6)', glow: 'rgba(236,72,153,0.5)', accent: '#F472B6' },
  { emoji: '🔄', title: 'Séquences complètes', desc: 'Enchaîner warmup, édition et posting dans un workflow.', grad: 'linear-gradient(135deg,#06B6D4,#3B82F6)', glow: 'rgba(34,211,238,0.45)', accent: '#22D3EE' },
]
function ComingSoon() {
  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 980, margin: '0 auto', paddingTop: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 18, fontSize: 11, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#818CF8' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#818CF8', animation: 'lib-pulse 2s ease-in-out infinite' }} />
          Bibliothèque · Bientôt
        </div>
        <h1 style={{ margin: '0 0 14px', fontSize: 'clamp(34px, 5.6vw, 58px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.0, color: '#fff' }}>Une bibliothèque d'automatisations</h1>
        <p style={{ margin: '0 auto', maxWidth: 560, fontSize: 15.5, color: 'rgba(233,234,240,0.6)', lineHeight: 1.65 }}>
          Bientôt : lance des tâches sur tes téléphones en un clic — allumage, warmup, édition de profil et plus.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {TEASERS.map((t, i) => (
          <div key={i} style={{ position: 'relative', overflow: 'hidden', padding: 22, borderRadius: 18, minHeight: 150, background: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012))', border: `1px solid ${t.accent}26`, animation: `lib-rise .5s ease both ${i * 0.07}s`, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: t.grad, boxShadow: `0 10px 24px -8px ${t.glow}` }}>{t.emoji}</div>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>{t.title}</h4>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'rgba(233,234,240,0.55)' }}>{t.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Lanceur (superadmin) ─────────────────────────────────────────────────────
function GeelarkLauncher({ user }: { user: User }) {
  const { bearer } = useConnections(user)
  const isSuper = useLicense()?.isSuperAdmin === true

  const [phones, setPhones] = useState<GeelarkPhone[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupFilter, _setGroup] = useState(loadLastGroup)
  const setGroup = (g: string) => { _setGroup(g); saveLastGroup(g) }
  const [search, setSearch] = useState('')

  const [modalTask, setModalTask] = useState<Task | null>(null)
  const [cfgVals, setCfgVals] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [jobs, setJobs] = useState<Record<string, Job>>({})
  const [logs, setLogs] = useState<string[]>([])

  async function loadPhones() {
    if (!bearer) return
    setLoading(true); setErr(null)
    try { setPhones(await fetchAllPhones(bearer)) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }
  useEffect(() => { if (bearer) loadPhones() }, [bearer])

  const groups = ['Tous', ...[...new Set(phones.map(p => p.group?.name ?? p.groupName).filter(Boolean) as string[])].sort()]
  const visible = phones.filter(p => {
    const g = p.group?.name ?? p.groupName ?? null
    if (groupFilter !== 'Tous' && g !== groupFilter) return false
    if (search && !phoneName(p).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const tasks = TASKS.filter(t => !t.superOnly || isSuper)

  function openTask(t: Task) {
    if (!selected.size) return
    setModalTask(t)
    const init: Record<string, string> = {}
    for (const f of t.fields ?? []) init[f.key] = f.def != null ? String(f.def) : ''
    setCfgVals(init)
  }

  async function launch() {
    const task = modalTask
    if (!task || !bearer) return
    const targets = phones.filter(p => selected.has(p.id))
    if (!targets.length) return
    setModalTask(null); setRunning(true); setLogs([])
    setJobs(Object.fromEntries(targets.map(p => [p.id, { status: 'idle' as JobStatus }])))
    const addLog = (m: string) => setLogs(l => [...l.slice(-200), m])

    const runId = `lib-${Date.now()}`
    startRun({
      id: runId, type: 'warmup', label: `${task.emoji} ${task.title} · ${targets.length} tél.`,
      proxyKeys: [], done: 0, total: targets.length, page: 'library',
      phones: targets.map(p => ({ id: p.id, name: phoneName(p), status: 'idle' })),
    })

    let ok = 0
    await pLimit(targets, MAX_CONCURRENCY, async phone => {
      setJobs(j => ({ ...j, [phone.id]: { status: 'running' } }))
      setRunPhase(runId, phone.id, 'running')
      try {
        const r = await task.run(bearer, phone.id, cfgVals, m => addLog(`${phoneName(phone)}: ${m}`))
        if (r.ok) { ok++; setJobs(j => ({ ...j, [phone.id]: { status: 'done' } })); setRunPhase(runId, phone.id, 'done') }
        else { setJobs(j => ({ ...j, [phone.id]: { status: 'error', detail: r.error } })); setRunPhase(runId, phone.id, 'error') }
      } catch (e) {
        setJobs(j => ({ ...j, [phone.id]: { status: 'error', detail: e instanceof Error ? e.message : String(e) } }))
        setRunPhase(runId, phone.id, 'error')
      }
    })
    finishRun(runId)
    setRunning(false)
    addLog(`✓ Terminé — ${ok}/${targets.length} réussi(s)`)
  }

  const doneN = Object.values(jobs).filter(j => j.status === 'done').length
  const errN = Object.values(jobs).filter(j => j.status === 'error').length
  const totalJobs = Object.keys(jobs).length

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 12, fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(233,234,240,0.42)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399' }} />
          Bibliothèque d'automatisations
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(28px, 4.4vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff' }}>Lance une tâche sur tes téléphones</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: 'rgba(233,234,240,0.55)', maxWidth: 640, lineHeight: 1.6 }}>
          Sélectionne des téléphones, choisis une action, et elle s'exécute sur chacun. Le suivi apparaît en direct (et dans le widget « en cours »).
        </p>
      </div>

      {!bearer ? (
        <div className="sf-card" style={{ padding: 24, maxWidth: 480 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--warn)', margin: '0 0 6px' }}>Connexion GéeLark manquante</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Ajoute ton token GéeLark dans les Réglages pour lancer des tâches.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 20, alignItems: 'start' }}>
          {/* Colonne gauche : téléphones */}
          <div className="sf-card" style={{ overflow: 'hidden', padding: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Téléphones {phones.length > 0 && <span className="sf-badge sf-badge-accent">{phones.length}</span>}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setSelected(new Set(visible.map(p => p.id)))} className="sf-btn sf-btn-secondary sf-btn-sm cursor-pointer">Tout</button>
                <button onClick={() => setSelected(new Set())} disabled={!selected.size} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer" style={{ opacity: selected.size ? 1 : 0.4 }}>Aucun</button>
                <button onClick={loadPhones} className="sf-btn sf-btn-ghost sf-btn-sm cursor-pointer">↻</button>
              </div>
            </div>
            <div style={{ padding: '8px 12px', display: 'flex', gap: 8, borderBottom: '1px solid var(--border)' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="sf-input" style={{ flex: 1, height: 30, fontSize: 12 }} />
              {groups.length > 1 && (
                <select value={groupFilter} onChange={e => setGroup(e.target.value)} className="sf-input cursor-pointer" style={{ width: 'auto', height: 30, fontSize: 12 }}>
                  {groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
            </div>
            <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
              {loading ? <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-3)' }}>Chargement…</div>
                : err ? <div style={{ padding: 16, fontSize: 12.5, color: 'var(--err)' }}>{err}</div>
                : visible.length === 0 ? <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-4)' }}>Aucun téléphone.</div>
                : visible.map(p => {
                  const sel = selected.has(p.id)
                  const online = p.status === 0 || p.status === 2
                  const job = jobs[p.id]
                  return (
                    <div key={p.id} onClick={() => toggle(p.id)} className="cursor-pointer" style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', background: sel ? 'rgba(99,102,241,0.09)' : 'transparent' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${sel ? 'var(--accent)' : 'rgba(99,102,241,0.3)'}`, background: sel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2"><path d="M20 6 9 17l-5-5" /></svg>}
                      </div>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: online ? 'var(--ok)' : '#3f3f46' }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneName(p)}</span>
                      {job && job.status !== 'idle' && (
                        <span style={{ fontSize: 11, color: job.status === 'done' ? 'var(--ok)' : job.status === 'error' ? 'var(--err)' : 'var(--accent-l)' }}>
                          {job.status === 'done' ? '✓' : job.status === 'error' ? '✕' : '⧗'}
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Colonne droite : actions + suivi */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selected.size === 0 && (
              <div className="sf-card" style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-3)' }}>
                👈 Sélectionne un ou plusieurs téléphones pour activer les actions.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
              {tasks.map(t => (
                <button key={t.key} onClick={() => openTask(t)} disabled={!selected.size || running} className="libtask cursor-pointer" style={{
                  textAlign: 'left', padding: 16, borderRadius: 16, minHeight: 128,
                  background: 'linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012))',
                  border: `1px solid ${t.danger ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.09)'}`,
                  opacity: (!selected.size || running) ? 0.5 : 1, cursor: (!selected.size || running) ? 'not-allowed' : 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 9,
                }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, background: t.grad, boxShadow: `0 10px 22px -8px ${t.glow}` }}>{t.emoji}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#fff' }}>{t.title}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(233,234,240,0.55)', flex: 1 }}>{t.desc}</div>
                  {selected.size > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: t.accent }}>Lancer sur {selected.size} tél. →</div>}
                </button>
              ))}
            </div>

            {/* Suivi */}
            {(running || totalJobs > 0) && (
              <div className="sf-card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{running ? 'En cours…' : 'Terminé'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>✓ {doneN} · ✕ {errN} · {totalJobs} total</span>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {logs.length === 0 ? <span style={{ color: 'var(--text-4)' }}>…</span> : logs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de config + lancement */}
      {modalTask && (
        <div className="sf-modal-bg" onClick={() => setModalTask(null)} style={{ zIndex: 9000 }}>
          <div className="sf-modal anim-scale-in" onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 94vw)' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: modalTask.grad }}>{modalTask.emoji}</div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{modalTask.title}</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>Sur {selected.size} téléphone{selected.size > 1 ? 's' : ''}</p>
              </div>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(modalTask.fields ?? []).map(f => f.type === 'bool' ? (
                <label key={f.key} className="cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-2)' }}>
                  <input type="checkbox" checked={cfgVals[f.key] === 'true'} onChange={e => setCfgVals(v => ({ ...v, [f.key]: e.target.checked ? 'true' : 'false' }))} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                  {f.label}
                </label>
              ) : (
                <div key={f.key}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                  <input type={f.type} value={cfgVals[f.key] ?? ''} onChange={e => setCfgVals(v => ({ ...v, [f.key]: e.target.value }))} placeholder={f.placeholder} className="sf-input" style={{ width: '100%', height: 36 }} />
                </div>
              ))}
              {modalTask.danger && <p style={{ fontSize: 11.5, color: 'var(--warn)', margin: 0 }}>⚠ Commande brute exécutée telle quelle sur chaque téléphone.</p>}
              {!modalTask.fields?.length && <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Aucun réglage — clique pour lancer.</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button onClick={() => setModalTask(null)} className="sf-btn sf-btn-ghost cursor-pointer">Annuler</button>
                <button onClick={launch} className="sf-btn sf-btn-primary cursor-pointer">Lancer sur {selected.size} tél.</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function Library({ user }: { user: User }) {
  const isSuperAdmin = useLicense()?.isSuperAdmin === true
  return (
    <div style={{ minHeight: '100%', background: 'var(--base)', padding: '32px 32px 90px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
      <style>{CSS}</style>
      <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: -140, left: '10%', width: 540, height: 540, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)', filter: 'blur(46px)', animation: 'lib-float-a 20s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: 40, right: '4%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.1), transparent 70%)', filter: 'blur(46px)', animation: 'lib-float-b 24s ease-in-out infinite' }} />
      </div>
      {isSuperAdmin ? <GeelarkLauncher user={user} /> : <ComingSoon />}
    </div>
  )
}
