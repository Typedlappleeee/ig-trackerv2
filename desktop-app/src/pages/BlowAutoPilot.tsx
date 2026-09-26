// ── Pilote Auto (iRemoTech) ──────────────────────────────────────────────────
// Interface propre pour automatiser le posting sur les vrais iPhones iRemoTech :
//   • on choisit des téléphones + leurs containers Crane,
//   • on charge un POOL de vidéos (+ un pool de légendes),
//   • chaque container reçoit une vidéo tirée ALÉATOIREMENT du pool,
//   • exécution par vision (ouverture container → injection → publication du Reel),
//     avec rotation d'IP (mode avion) optionnelle, en série ou en parallèle.
// Conçu pour accueillir d'autres automatisations (Story CTA, Warmup) ensuite.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { useIremotech, listDevices, fetchUsage, uploadMedia, type IrtDevice, type IrtUsage } from '@/lib/iremotech'
import { selectContainerByVision, postReelByVision, postStoryByVision, airplaneReset, warmupEditsByVision, recalibrateTouch, createInstagramAccountByVision, enterSmsCodeByVision } from '@/lib/iremotechVision'
import { fivesimBuy, fivesimWaitCode, fivesimFinish, fivesimCancel, localPhone } from '@/lib/fivesim'
import { loadDevContainers, addDevContainer, removeDevContainer, loadStoryLink, saveStoryLink } from '@/lib/irtContainers'
import { startRun, cancelRun } from '@/lib/runStore'
import BankPicker, { type PickerResult } from '@/components/BankPicker'
import { themeFor } from '@/lib/theme'

const BLOW_THEME = themeFor('blowsome')

const GOLD = '#E9C46A', INK = '#ECE9F5', MUTED = '#A79FBD', DIM = '#6b6478', SERIF = "'Space Grotesk',sans-serif"
type VidRef = { id: string; title: string; storage_path: string | null; file_url: string | null }

const card: CSSProperties = { background: 'linear-gradient(168deg,rgba(24,20,44,0.5),rgba(12,10,22,0.6))', border: '1px solid rgba(216,180,254,0.12)', borderRadius: 16, padding: 18, marginBottom: 14 }
const btn: CSSProperties = { height: 34, padding: '0 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(216,180,254,0.16)', color: INK }
const gold: CSSProperties = { ...btn, background: GOLD, color: '#1a1206', border: 'none', fontWeight: 800 }
const inp: CSSProperties = { height: 34, padding: '0 11px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.14)', color: INK, fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }

function H({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 7, background: 'rgba(233,196,106,0.12)', border: '1px solid rgba(233,196,106,0.35)', color: GOLD, fontSize: 10, fontWeight: 800, marginBottom: 9 }}>✦ iRemoTech · Pilote Auto</div>
        <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: INK }}>{title}</h1>
        {sub && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.55, maxWidth: 720 }}>{sub}</p>}
      </div>
      {right}
    </div>
  )
}
function Toggle({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer', padding: '10px 12px', borderRadius: 11, background: on ? 'rgba(233,196,106,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? 'rgba(233,196,106,0.28)' : 'rgba(216,180,254,0.12)'}` }}>
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', width: 38, height: 22, padding: 2, borderRadius: 99, background: on ? GOLD : 'rgba(255,255,255,0.12)', transition: 'background .15s' }}>
        <span style={{ width: 18, height: 18, borderRadius: 99, background: '#fff' }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: INK }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, color: DIM, marginTop: 1 }}>{sub}</span>}
      </span>
    </div>
  )
}

export function BlowAutoPilot({ user, org }: { user: User; org: OrgState }) {
  const { currentOrg } = org
  const irt = useIremotech(user, org)
  const [devices, setDevices] = useState<IrtDevice[]>([])
  const [usage, setUsage] = useState<IrtUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [sel, setSel] = useState<Set<string>>(new Set())            // téléphones sélectionnés
  const [conts, setConts] = useState<Record<string, string[]>>({})   // containers connus par téléphone
  const [selConts, setSelConts] = useState<Record<string, Set<string>>>({}) // containers cochés par téléphone
  const [newC, setNewC] = useState<Record<string, string>>({})       // saisie « ajouter container »

  const [videoPool, setVideoPool] = useState<VidRef[]>([])
  const [captionPool, setCaptionPool] = useState('')
  const [picker, setPicker] = useState(false)
  const [mode, setMode] = useState<'reel' | 'story'>('reel')  // type d'automatisation
  const [storyLink, setStoryLink] = useState('')               // lien CTA par défaut (mode story)
  const [storyLinks, setStoryLinks] = useState<Record<string, string>>({}) // lien PAR container : clé `${dev}::${c}`
  const linkKey = (dev: string, c: string) => `${dev}::${c}`
  const setLink = (dev: string, c: string, url: string) => { setStoryLinks(m => ({ ...m, [linkKey(dev, c)]: url })); saveStoryLink(dev, c, url) }

  const [airplaneOn, setAirplaneOn] = useState(true)
  const [uniqueUse, setUniqueUse] = useState(false)
  const [parallel, setParallel] = useState(false)
  const [sim5Key, setSim5Key] = useState(() => { try { return localStorage.getItem('sf-5sim-key') ?? '' } catch { return '' } })
  const [acctCountry, setAcctCountry] = useState<'uk' | 'usa'>('uk')

  const [running, setRunning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  const load = useCallback(() => {
    if (!irt.key) return
    setLoading(true); setErr(null)
    Promise.all([listDevices(irt.key), fetchUsage(irt.key)])
      .then(([d, u]) => {
        setDevices(d); setUsage(u)
        const c: Record<string, string[]> = {}
        const sl: Record<string, string> = {}
        for (const dev of d) {
          const list = loadDevContainers(dev.public_id)
          c[dev.public_id] = list
          for (const name of list) { const v = loadStoryLink(dev.public_id, name); if (v) sl[`${dev.public_id}::${name}`] = v }
        }
        setConts(c); setStoryLinks(sl)
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Connexion iRemoTech échouée'))
      .finally(() => setLoading(false))
  }, [irt.key])
  useEffect(() => { load() }, [load])

  const budget = usage?.actions ?? { remaining: usage?.remaining, budget: usage?.budget }

  const togglePhone = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else { n.add(id); setSelConts(sc => sc[id] ? sc : { ...sc, [id]: new Set() }) } return n })
  const toggleCont = (dev: string, name: string) => setSelConts(sc => { const cur = new Set(sc[dev] ?? []); if (cur.has(name)) cur.delete(name); else cur.add(name); return { ...sc, [dev]: cur } })
  const addC = (dev: string) => {
    const name = (newC[dev] ?? '').trim(); if (!name) return
    const list = addDevContainer(dev, name)
    setConts(c => ({ ...c, [dev]: list }))
    setSelConts(sc => ({ ...sc, [dev]: new Set([...(sc[dev] ?? []), name]) }))
    setNewC(v => ({ ...v, [dev]: '' }))
  }
  const removeC = (dev: string, name: string) => {
    const list = removeDevContainer(dev, name)
    setConts(c => ({ ...c, [dev]: list }))
    setSelConts(sc => { const cur = new Set(sc[dev] ?? []); cur.delete(name); return { ...sc, [dev]: cur } })
  }

  async function applyPicker(r: PickerResult) {
    setPicker(false)
    if ((r.kind !== 'videos' && r.kind !== 'images') || r.ids.length === 0) return
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await scope(supabase.from('content_bank').select('id,title,storage_path,file_url')).in('id', r.ids)
    const vids = (data ?? []) as VidRef[]
    setVideoPool(p => { const ex = new Set(p.map(v => v.id)); return [...p, ...vids.filter(v => !ex.has(v.id))] })
  }
  // Nom de fichier avec la vraie extension (mp4 pour reels, jpg/png pour story photo).
  function mediaFilename(v: VidRef): string {
    const src = (v.storage_path ?? v.file_url ?? '').toLowerCase()
    const ext = (src.split('.').pop() || '').replace(/[^a-z0-9]/g, '')
    const good = ['mp4', 'mov', 'jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : (mode === 'story' ? 'jpg' : 'mp4')
    return (v.title || 'media') + '.' + good
  }
  async function signedUrlFor(v: VidRef): Promise<string | undefined> {
    if (v.storage_path) { const { data } = await supabase.storage.from('content').createSignedUrl(v.storage_path, 3600); return data?.signedUrl ?? undefined }
    return v.file_url ?? undefined
  }

  // Total de containers cochés (= nb de publications).
  const totalJobs = [...sel].reduce((n, d) => n + (selConts[d]?.size ?? 0), 0)
  const captions = captionPool.split('\n').map(s => s.trim()).filter(Boolean)

  async function run() {
    if (!irt.key || running) return
    if (totalJobs === 0) { setLogs(['⚠ Sélectionne au moins un container.']); return }
    if (videoPool.length === 0) { setLogs(['⚠ Ajoute au moins un média au pool.']); return }
    if (mode === 'story') {
      const missing = [...sel].flatMap(dev => [...(selConts[dev] ?? [])].filter(c => !(storyLinks[linkKey(dev, c)] || storyLink.trim())))
      if (missing.length) { setLogs([`⚠ ${missing.length} container(s) sans lien CTA — mets un lien par container ou un lien par défaut.`]); return }
    }
    setRunning(true); setLogs([])
    const key = irt.key
    const push = (m: string) => setLogs(l => [...l.slice(-600), m])
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    // Tirage aléatoire (avec ou sans doublon selon « usage unique »).
    const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }
    let vidQueue = uniqueUse ? shuffle(videoPool) : []
    let capQueue = uniqueUse ? shuffle(captions) : []
    const pickVid = (): VidRef => { if (uniqueUse) { if (!vidQueue.length) vidQueue = shuffle(videoPool); return vidQueue.pop()! } return videoPool[Math.floor(Math.random() * videoPool.length)] }
    const pickCap = (): string => { if (!captions.length) return ''; if (uniqueUse) { if (!capQueue.length) capQueue = shuffle(captions); return capQueue.pop()! } return captions[Math.floor(Math.random() * captions.length)] }

    // Construit les jobs par téléphone (une vidéo aléatoire par container).
    const byPhone = [...sel].map(dev => ({
      dev,
      name: devices.find(d => d.public_id === dev)?.name ?? dev,
      jobs: [...(selConts[dev] ?? [])].map(container => ({ container, vid: pickVid(), caption: pickCap(), link: storyLinks[linkKey(dev, container)] || storyLink.trim() })),
    })).filter(p => p.jobs.length)

    push(`▶ Pilote Auto : ${byPhone.length} iPhone(s) · ${totalJobs} publication(s) · pool ${videoPool.length} vidéo(s)${airplaneOn ? ' · rotation avion' : ''}${parallel ? ' · parallèle' : ' · série'}`)
    const R = startRun('farm', `Pilote Auto · ${byPhone.length} tel × ${totalJobs}`, totalJobs)
    setRunId(R.id)

    const runPhone = async (p: typeof byPhone[number]) => {
      const tag = `[${p.name}]`
      // Recalibrage du clic au tout début de l'automatisation de ce téléphone.
      await recalibrateTouch(key, p.dev, { log: (m) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() })
      for (const job of p.jobs) {
        if (R.isCancelled()) break
        push(`\n${tag} 📦 container « ${job.container} » · ${job.vid.title}`)
        if (airplaneOn) await airplaneReset(key, p.dev, { log: (m) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() })
        await warmupEditsByVision(key, p.dev, job.container, { log: (m) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() })
        const ok = await selectContainerByVision(key, p.dev, job.container, { log: (m) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() })
        if (!ok) { push(`${tag} ⏭ container « ${job.container} » non atteint → suivant`); R.tick(false); continue }
        await sleep(1200)
        const url = await signedUrlFor(job.vid)
        if (!url) { push(`${tag} ❌ URL vidéo introuvable → suivant`); R.tick(false); continue }
        push(`${tag} ⬆ injection de la vidéo…`)
        await uploadMedia(key, p.dev, url, mediaFilename(job.vid))
        push(`${tag} ⏳ 10 s (indexation)…`)
        await sleep(10000)
        const posted = mode === 'story'
          ? await postStoryByVision(key, p.dev, { link: job.link, caption: job.caption }, { log: (m) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() })
          : await postReelByVision(key, p.dev, { caption: job.caption }, { log: (m) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() })
        push(posted ? `${tag} ✅ « ${job.container} » publié` : `${tag} ⚠ « ${job.container} » interrompu`)
        R.tick(posted)
      }
    }

    if (parallel) await Promise.all(byPhone.map(runPhone))
    else for (const p of byPhone) { if (R.isCancelled()) break; await runPhone(p) }

    R.finish()
    push(R.isCancelled() ? '⏹ Arrêté.' : '✔ Terminé — toutes les publications traitées.')
    setRunning(false); setRunId(null)
  }

  // Création de compte : ouvre IG sur chaque container coché → Get started → Change →
  // pays choisi (UK ou USA). Si une clé 5sim est fournie : achète un numéro, le saisit,
  // attend le SMS et rentre le code. Sinon on s'arrête après le choix du pays (test).
  async function createAccounts() {
    const key = irt.key
    if (!key) return
    const jobs = [...sel].flatMap(dev => [...(selConts[dev] ?? new Set())].map(c => ({ dev, c })))
    if (jobs.length === 0) { setLogs(['⚠ Coche au moins un container sur un téléphone.']); return }
    const CFG = acctCountry === 'usa'
      ? { label: /united\s*states/i, simCountry: 'usa', dial: '1', name: 'United States' }
      : { label: /united\s*kingdom/i, simCountry: 'england', dial: '44', name: 'United Kingdom' }
    setRunning(true); setLogs([])
    const push = (m: string) => setLogs(l => [...l.slice(-400), m])
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    const R = startRun('farm', `Création compte ${CFG.name} · ${jobs.length}`, jobs.length); setRunId(R.id)
    push(`▶ Création de compte (${CFG.name})${sim5Key ? ' + numéro 5sim' : ' (test, sans numéro)'} : ${jobs.length} container(s)`)
    for (const { dev, c } of jobs) {
      if (R.isCancelled()) break
      const tag = `[${devices.find(d => d.public_id === dev)?.name ?? dev}·${c}]`
      const hooks = { log: (m: string) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() }
      await recalibrateTouch(key, dev, hooks)
      if (airplaneOn) await airplaneReset(key, dev, hooks)
      const opened = await selectContainerByVision(key, dev, c, hooks)
      if (!opened) { push(`${tag} ⏭ container non atteint`); R.tick(false); continue }
      await sleep(1500)

      // Sans clé 5sim → on va juste jusqu'au choix du pays (test).
      if (!sim5Key) {
        const r = await createInstagramAccountByVision(key, dev, { countryLabel: CFG.label }, hooks)
        push(`${tag} ${r.ok ? '✓' : '✗'} étape: ${r.stage}`); R.tick(r.ok); continue
      }

      // Avec 5sim : achète un numéro AVANT de saisir (fenêtre d'activation 15 min).
      let order: { id: number; phone: string } | null = null
      try {
        push(`${tag} 🛒 achat d'un numéro ${CFG.name} (5sim)…`)
        order = await fivesimBuy(sim5Key, { country: CFG.simCountry, product: 'instagram' })
        push(`${tag} 📞 numéro : ${order.phone}`)
      } catch (e) { push(`${tag} ✗ achat 5sim: ${e instanceof Error ? e.message : String(e)}`); R.tick(false); continue }

      const num = localPhone(order.phone, CFG.dial)
      const r = await createInstagramAccountByVision(key, dev, { countryLabel: CFG.label, phoneNumber: num }, hooks)
      if (r.stage !== 'number_submitted') {
        push(`${tag} ✗ échec avant SMS (étape ${r.stage}) → annulation du numéro`)
        try { await fivesimCancel(sim5Key, order.id) } catch { /* noop */ }
        R.tick(false); continue
      }
      // Attend le code SMS puis le saisit.
      const code = await fivesimWaitCode(sim5Key, order.id, { onLog: hooks.log, shouldStop: hooks.shouldStop, maxMs: 8 * 60_000 })
      if (!code) { push(`${tag} ✗ pas de code SMS reçu → annulation`); try { await fivesimCancel(sim5Key, order.id) } catch { /* noop */ } R.tick(false); continue }
      const okCode = await enterSmsCodeByVision(key, dev, code, hooks)
      try { await fivesimFinish(sim5Key, order.id) } catch { /* noop */ }
      push(`${tag} ${okCode ? '✓ compte : code saisi' : '⚠ code non validé (à vérifier)'}`)
      R.tick(okCode)
    }
    R.finish(); push(R.isCancelled() ? '⏹ Arrêté.' : '✔ Terminé.'); setRunning(false); setRunId(null)
  }

  if (!irt.key) {
    return (
      <div>
        <H title="Pilote Auto" />
        {irt.loading
          ? <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>Chargement…</div>
          : <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>iRemoTech pas encore branché. Colle ta clé API dans <b style={{ color: GOLD }}>Phone Farm → ⚙</b>.</div>}
      </div>
    )
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <H title="Pilote Auto" sub="Choisis tes iPhones et leurs containers, charge un pool de vidéos : chaque container reçoit une vidéo tirée au hasard et publie un Reel (vision), avec rotation d'IP optionnelle."
        right={budget?.budget != null ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: GOLD }}>{budget.remaining ?? '—'} / {budget.budget ?? '—'} actions</span> : undefined} />

      {err && <div style={{ ...card, color: '#F87171', fontSize: 13, textAlign: 'center' }}>{err}</div>}
      {loading && <div style={{ ...card, color: MUTED, fontSize: 13, textAlign: 'center' }}>Connexion à iRemoTech…</div>}

      {/* 1 · Téléphones & containers */}
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginBottom: 3 }}>1 · Téléphones & containers</div>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: MUTED }}>Coche les iPhones, puis choisis les containers à publier sur chacun ({totalJobs} sélectionné{totalJobs > 1 ? 's' : ''}).</p>

        {/* Sélection des téléphones (compact) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {devices.map(d => {
            const on = sel.has(d.public_id)
            const list = conts[d.public_id] ?? []
            return (
              <button key={d.public_id} onClick={() => togglePhone(d.public_id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 15px', borderRadius: 11, cursor: 'pointer', background: on ? GOLD : 'rgba(255,255,255,0.03)', color: on ? '#1a1206' : INK, border: on ? 'none' : '1px solid rgba(216,180,254,0.16)', fontSize: 13.5, fontWeight: 700 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 5, background: on ? '#1a1206' : 'transparent', color: GOLD, fontSize: 11, fontWeight: 900, border: on ? 'none' : '1px solid rgba(216,180,254,0.3)' }}>{on ? '✓' : ''}</span>
                {d.name ?? d.public_id}
                <span style={{ fontSize: 11, opacity: 0.7 }}>· {list.length}c</span>
              </button>
            )
          })}
        </div>

        {/* Zone containers — spacieuse, une par téléphone sélectionné */}
        {[...sel].map(devId => {
          const d = devices.find(x => x.public_id === devId)
          const list = conts[devId] ?? []
          const picked = selConts[devId] ?? new Set()
          return (
            <div key={devId} style={{ marginTop: 14, padding: 16, borderRadius: 14, background: 'rgba(233,196,106,0.04)', border: '1px solid rgba(233,196,106,0.22)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>📱 {d?.name ?? devId}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{picked.size}/{list.length} container(s) coché(s)</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button style={btn} onClick={() => setSelConts(sc => ({ ...sc, [devId]: new Set(list) }))}>Tout cocher</button>
                  <button style={btn} onClick={() => setSelConts(sc => ({ ...sc, [devId]: new Set() }))}>Aucun</button>
                </span>
              </div>
              {list.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 12 }}>
                  {list.map(c => {
                    const cp = picked.has(c)
                    return (
                      <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 8px 0 14px', borderRadius: 11, fontSize: 15, fontWeight: 800, background: cp ? GOLD : 'rgba(255,255,255,0.04)', color: cp ? '#1a1206' : INK, border: cp ? 'none' : '1px solid rgba(216,180,254,0.16)' }}>
                        <span onClick={() => toggleCont(devId, c)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 5, background: cp ? '#1a1206' : 'transparent', color: GOLD, fontSize: 11, fontWeight: 900, border: cp ? 'none' : '1px solid rgba(216,180,254,0.3)' }}>{cp ? '✓' : ''}</span>
                          {c}
                        </span>
                        <span onClick={() => removeC(devId, c)} title="Retirer ce container" style={{ cursor: 'pointer', opacity: 0.55, fontWeight: 900, fontSize: 18, padding: '0 4px' }}>×</span>
                      </span>
                    )
                  })}
                </div>
              ) : <p style={{ margin: '0 0 12px', fontSize: 12.5, color: DIM }}>Aucun container pour cet iPhone — ajoute-les ci-dessous.</p>}
              <div style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
                <input value={newC[devId] ?? ''} onChange={e => setNewC(v => ({ ...v, [devId]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addC(devId) }} placeholder="Nom du container (ex. 6, Default…)" style={{ ...inp, flex: 1, height: 40, fontSize: 13.5 }} />
                <button style={{ ...gold, height: 40, padding: '0 18px' }} onClick={() => addC(devId)}>+ Ajouter</button>
              </div>
              {/* Lien CTA par container (mode story) */}
              {mode === 'story' && picked.size > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(233,196,106,0.18)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM }}>Lien du sticker par container</span>
                  {[...picked].map(c => (
                    <div key={c} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ minWidth: 54, fontSize: 12.5, fontWeight: 800, color: GOLD }}>{c}</span>
                      <input value={storyLinks[linkKey(devId, c)] ?? ''} onChange={e => setLink(devId, c, e.target.value)} placeholder={storyLink.trim() ? `défaut : ${storyLink.trim()}` : 'https://…'} style={{ ...inp, flex: 1, height: 34, fontSize: 12 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 2 · Pool de contenu */}
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginBottom: 3 }}>2 · Type, pool de vidéos & textes</div>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: MUTED }}>Chaque container reçoit un média tiré <b>au hasard</b> de ce pool.</p>

        {/* Type d'automatisation */}
        <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 11, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(216,180,254,0.14)', width: 'fit-content', marginBottom: 12 }}>
          {([['reel', 'Reel'], ['story', 'Story + lien']] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setVideoPool([]) }} style={{ height: 30, padding: '0 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 800, background: mode === k ? GOLD : 'transparent', color: mode === k ? '#1a1206' : MUTED }}>{l}</button>
          ))}
        </div>

        {mode === 'story' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, margin: '0 0 6px' }}>Lien CTA par défaut (si un container n'a pas son propre lien)</div>
            <input value={storyLink} onChange={e => setStoryLink(e.target.value)} placeholder="https://mon-lien.com" style={{ ...inp, width: '100%', height: 38 }} />
            <p style={{ margin: '6px 0 0', fontSize: 11, color: DIM }}>Astuce : mets un lien précis par container dans la section 1 (mémorisé).</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <button style={gold} onClick={() => setPicker(true)}>+ Ajouter des {mode === 'story' ? 'photos' : 'vidéos'}</button>
          <span style={{ fontSize: 12, color: MUTED }}>{videoPool.length} {mode === 'story' ? 'photo(s)' : 'vidéo(s)'} dans le pool</span>
          {videoPool.length > 0 && <button style={btn} onClick={() => setVideoPool([])}>Vider</button>}
        </div>
        {videoPool.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {videoPool.map(v => (
              <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 8, fontSize: 11.5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.14)', color: INK }}>
                🎞 {v.title.slice(0, 26)}
                <span onClick={() => setVideoPool(p => p.filter(x => x.id !== v.id))} title="Retirer" style={{ cursor: 'pointer', color: '#F87171', fontWeight: 900 }}>×</span>
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, margin: '0 0 6px' }}>Légendes (une par ligne, tirées au hasard)</div>
        <textarea value={captionPool} onChange={e => setCaptionPool(e.target.value)} rows={3} placeholder={'Ma légende 1\nMa légende 2\n…'} style={{ ...inp, width: '100%', height: 'auto', minHeight: 60, padding: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
      </div>

      {/* 3 · Options */}
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginBottom: 12 }}>3 · Options</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          <Toggle on={airplaneOn} onClick={() => setAirplaneOn(v => !v)} label="Rotation d'IP (mode avion)" sub="Cycle avion entre chaque container" />
          <Toggle on={uniqueUse} onClick={() => setUniqueUse(v => !v)} label="Usage unique" sub="Pas de doublon tant que le pool n'est pas épuisé" />
          <Toggle on={parallel} onClick={() => setParallel(v => !v)} label="Téléphones en parallèle" sub="Plus rapide (lecture d'écran sérialisée)" />
        </div>
      </div>

      {/* 3bis · Création de compte (5sim) */}
      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginBottom: 8 }}>🆕 Création de compte Instagram</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 9, background: 'rgba(0,0,0,0.3)' }}>
            {(['uk', 'usa'] as const).map(k => (
              <button key={k} onClick={() => setAcctCountry(k)} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 800, background: acctCountry === k ? GOLD : 'transparent', color: acctCountry === k ? '#1a1206' : MUTED }}>
                {k === 'uk' ? '🇬🇧 United Kingdom' : '🇺🇸 United States'}
              </button>
            ))}
          </div>
          <input value={sim5Key} onChange={e => { setSim5Key(e.target.value); try { localStorage.setItem('sf-5sim-key', e.target.value) } catch { /* noop */ } }}
            placeholder="Token 5sim (numéro + code SMS auto)" type="password"
            style={{ flex: 1, minWidth: 200, height: 40, padding: '0 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.16)', color: INK, fontSize: 13 }} />
          <button style={{ ...btn, height: 44, padding: '0 18px', opacity: running ? 0.5 : 1 }} disabled={running} onClick={createAccounts}
            title="Ouvre IG sur chaque container coché et crée un compte (numéro + code SMS via 5sim si le token est renseigné)">
            {running ? 'En cours…' : sim5Key ? '🆕 Créer les comptes' : '🆕 Tester le flow (sans numéro)'}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, color: MUTED }}>
          Sans token 5sim : va jusqu'au choix du pays (test). Avec token : achète un numéro {acctCountry === 'usa' ? '🇺🇸' : '🇬🇧'}, le saisit, attend le SMS et rentre le code. Containers « frais » (déconnectés) requis.
        </div>
      </div>

      {/* 4 · Lancer */}
      <div style={card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: MUTED }}>{totalJobs} publication(s) · {videoPool.length} {mode === 'story' ? 'photo(s)' : 'vidéo(s)'} · {captions.length} {mode === 'story' ? 'texte(s)' : 'légende(s)'}</span>
          {running && runId && <button style={{ ...btn, marginLeft: 'auto', color: '#F87171', borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => cancelRun(runId)}>■ Arrêter</button>}
          <button style={{ ...gold, height: 44, padding: '0 22px', marginLeft: running ? 0 : 'auto', fontSize: 14, opacity: totalJobs && videoPool.length && !running ? 1 : 0.5 }} disabled={!totalJobs || !videoPool.length || running} onClick={run}>
            {running ? 'En cours…' : `Lancer ${totalJobs} publication(s)`}
          </button>
        </div>
        {logs.length > 0 && <div style={{ marginTop: 14, padding: 11, borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(216,180,254,0.1)', maxHeight: 300, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.6, color: MUTED, whiteSpace: 'pre-wrap' }}>{logs.join('\n')}</div>}
      </div>

      {picker && (
        <BankPicker theme={BLOW_THEME} user={user} org={org} kind={mode === 'story' ? 'images' : 'videos'} multi
          title={mode === 'story' ? 'Ajouter des photos au pool' : 'Ajouter des vidéos au pool'} onClose={() => setPicker(false)} onApply={applyPicker} />
      )}
    </div>
  )
}
