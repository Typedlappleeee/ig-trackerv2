// ── iRemoTech — Studio d'automatisation (vrais iPhones) ──────────────────────
// Interface en ONGLETS, propre et user-friendly :
//   • Téléphones : choisir les iPhones + gérer/cocher leurs containers Crane
//   • Posting    : pool de vidéos → chaque container publie un Reel (vision)
//   • Story      : pool de photos + lien CTA par container → Story (vision)
//   • Compte     : création de compte IG (pays UK/USA + numéro/SMS 5sim)
// La sélection téléphones/containers est PARTAGÉE entre les onglets.
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
export type IrtTab = 'phones' | 'posting' | 'story' | 'account'

const card: CSSProperties = { background: 'linear-gradient(168deg,rgba(24,20,44,0.5),rgba(12,10,22,0.6))', border: '1px solid rgba(216,180,254,0.12)', borderRadius: 16, padding: 18, marginBottom: 14 }
const btn: CSSProperties = { height: 34, padding: '0 13px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(216,180,254,0.16)', color: INK }
const gold: CSSProperties = { ...btn, background: GOLD, color: '#1a1206', border: 'none', fontWeight: 800 }
const inp: CSSProperties = { height: 34, padding: '0 11px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.14)', color: INK, fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }

function H({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 7, background: 'rgba(233,196,106,0.12)', border: '1px solid rgba(233,196,106,0.35)', color: GOLD, fontSize: 10, fontWeight: 800, marginBottom: 9 }}>✦ iRemoTech · Studio</div>
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

export function BlowAutoPilot({ user, org, tab, onTab }: { user: User; org: OrgState; tab?: IrtTab; onTab?: (t: IrtTab) => void }) {
  const { currentOrg } = org
  const irt = useIremotech(user, org)
  // Onglet contrôlé par la nav de l'infra (tab/onTab) ; sinon état interne (mode autonome).
  const [localTab, setLocalTab] = useState<IrtTab>('phones')
  const curTab = onTab ? (tab ?? 'phones') : localTab
  const goTab = (t: IrtTab) => { if (onTab) onTab(t); else setLocalTab(t) }
  const [devices, setDevices] = useState<IrtDevice[]>([])
  const [usage, setUsage] = useState<IrtUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [sel, setSel] = useState<Set<string>>(new Set())            // téléphones sélectionnés
  const [conts, setConts] = useState<Record<string, string[]>>({})   // containers connus par téléphone
  const [selConts, setSelConts] = useState<Record<string, Set<string>>>({}) // containers cochés par téléphone
  const [newC, setNewC] = useState<Record<string, string>>({})       // saisie « ajouter container »

  const [reelPool, setReelPool] = useState<VidRef[]>([])   // pool vidéos (Posting)
  const [storyPool, setStoryPool] = useState<VidRef[]>([]) // pool photos (Story)
  const [picker, setPicker] = useState<null | 'reel' | 'story'>(null)
  const [captionPool, setCaptionPool] = useState('')
  const [storyLink, setStoryLink] = useState('')               // lien CTA par défaut (Story)
  const [storyLinks, setStoryLinks] = useState<Record<string, string>>({}) // lien PAR container : `${dev}::${c}`
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
  const [phonesOpen, setPhonesOpen] = useState(true) // sélecteur téléphones déplié

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
    const which = picker
    setPicker(null)
    if (!which || (r.kind !== 'videos' && r.kind !== 'images') || r.ids.length === 0) return
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await scope(supabase.from('content_bank').select('id,title,storage_path,file_url')).in('id', r.ids)
    const vids = (data ?? []) as VidRef[]
    const set = which === 'story' ? setStoryPool : setReelPool
    set(p => { const ex = new Set(p.map(v => v.id)); return [...p, ...vids.filter(v => !ex.has(v.id))] })
  }
  function mediaFilename(v: VidRef, kind: 'reel' | 'story'): string {
    const src = (v.storage_path ?? v.file_url ?? '').toLowerCase()
    const ext = (src.split('.').pop() || '').replace(/[^a-z0-9]/g, '')
    const good = ['mp4', 'mov', 'jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : (kind === 'story' ? 'jpg' : 'mp4')
    return (v.title || 'media') + '.' + good
  }
  async function signedUrlFor(v: VidRef): Promise<string | undefined> {
    if (v.storage_path) { const { data } = await supabase.storage.from('content').createSignedUrl(v.storage_path, 3600); return data?.signedUrl ?? undefined }
    return v.file_url ?? undefined
  }

  const totalJobs = [...sel].reduce((n, d) => n + (selConts[d]?.size ?? 0), 0)
  const captions = captionPool.split('\n').map(s => s.trim()).filter(Boolean)
  const push = (m: string) => setLogs(l => [...l.slice(-600), m])
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // ── Posting (Reel) / Story — flow unifié ────────────────────────────────────
  async function run(kind: 'reel' | 'story') {
    if (!irt.key || running) return
    const pool = kind === 'story' ? storyPool : reelPool
    if (totalJobs === 0) { setLogs(['⚠ Sélectionne au moins un container (onglet Téléphones).']); return }
    if (pool.length === 0) { setLogs([`⚠ Ajoute au moins ${kind === 'story' ? 'une photo' : 'une vidéo'} au pool.`]); return }
    if (kind === 'story') {
      const missing = [...sel].flatMap(dev => [...(selConts[dev] ?? [])].filter(c => !(storyLinks[linkKey(dev, c)] || storyLink.trim())))
      if (missing.length) { setLogs([`⚠ ${missing.length} container(s) sans lien CTA — mets un lien par container ou un lien par défaut.`]); return }
    }
    setRunning(true); setLogs([])
    const key = irt.key

    const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }
    let vidQueue = uniqueUse ? shuffle(pool) : []
    let capQueue = uniqueUse ? shuffle(captions) : []
    const pickVid = (): VidRef => { if (uniqueUse) { if (!vidQueue.length) vidQueue = shuffle(pool); return vidQueue.pop()! } return pool[Math.floor(Math.random() * pool.length)] }
    const pickCap = (): string => { if (!captions.length) return ''; if (uniqueUse) { if (!capQueue.length) capQueue = shuffle(captions); return capQueue.pop()! } return captions[Math.floor(Math.random() * captions.length)] }

    const byPhone = [...sel].map(dev => ({
      dev,
      name: devices.find(d => d.public_id === dev)?.name ?? dev,
      jobs: [...(selConts[dev] ?? [])].map(container => ({ container, vid: pickVid(), caption: pickCap(), link: storyLinks[linkKey(dev, container)] || storyLink.trim() })),
    })).filter(p => p.jobs.length)

    push(`▶ ${kind === 'story' ? 'Story' : 'Posting'} : ${byPhone.length} iPhone(s) · ${totalJobs} publication(s)${airplaneOn ? ' · rotation avion' : ''}${parallel ? ' · parallèle' : ' · série'}`)
    const R = startRun('farm', `iRemoTech ${kind} · ${byPhone.length} tel × ${totalJobs}`, totalJobs)
    setRunId(R.id)

    const runPhone = async (p: typeof byPhone[number]) => {
      const tag = `[${p.name}]`
      const hooks = (m: string) => push(`${tag} ${m}`)
      await recalibrateTouch(key, p.dev, { log: hooks, shouldStop: () => R.isCancelled() })
      for (const job of p.jobs) {
        if (R.isCancelled()) break
        push(`\n${tag} 📦 container « ${job.container} » · ${job.vid.title}`)
        if (airplaneOn) await airplaneReset(key, p.dev, { log: hooks, shouldStop: () => R.isCancelled() })
        await warmupEditsByVision(key, p.dev, job.container, { log: hooks, shouldStop: () => R.isCancelled() })
        const ok = await selectContainerByVision(key, p.dev, job.container, { log: hooks, shouldStop: () => R.isCancelled() })
        if (!ok) { push(`${tag} ⏭ container « ${job.container} » non atteint → suivant`); R.tick(false); continue }
        await sleep(1200)
        const url = await signedUrlFor(job.vid)
        if (!url) { push(`${tag} ❌ URL média introuvable → suivant`); R.tick(false); continue }
        push(`${tag} ⬆ injection du média…`)
        await uploadMedia(key, p.dev, url, mediaFilename(job.vid, kind))
        push(`${tag} ⏳ 10 s (indexation)…`)
        await sleep(10000)
        const posted = kind === 'story'
          ? await postStoryByVision(key, p.dev, { link: job.link, caption: job.caption }, { log: hooks, shouldStop: () => R.isCancelled() })
          : await postReelByVision(key, p.dev, { caption: job.caption }, { log: hooks, shouldStop: () => R.isCancelled() })
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

  // ── Création de compte (UK/USA + 5sim) ──────────────────────────────────────
  async function createAccounts() {
    const key = irt.key
    if (!key || running) return
    const jobs = [...sel].flatMap(dev => [...(selConts[dev] ?? new Set())].map(c => ({ dev, c })))
    if (jobs.length === 0) { setLogs(['⚠ Coche au moins un container (onglet Téléphones).']); return }
    const CFG = acctCountry === 'usa'
      ? { label: /states/i, countryY: 0.37, simCountry: 'usa', dial: '1', name: 'United States' }
      : { label: /kingdom/i, countryY: 0.29, simCountry: 'england', dial: '44', name: 'United Kingdom' }
    setRunning(true); setLogs([])
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

      if (!sim5Key) {
        const r = await createInstagramAccountByVision(key, dev, { countryLabel: CFG.label, countryY: CFG.countryY }, hooks)
        push(`${tag} ${r.ok ? '✓' : '✗'} étape: ${r.stage}`); R.tick(r.ok); continue
      }

      let order: { id: number; phone: string } | null = null
      try {
        push(`${tag} 🛒 achat d'un numéro ${CFG.name} (5sim)…`)
        order = await fivesimBuy(sim5Key, { country: CFG.simCountry, product: 'instagram' })
        push(`${tag} 📞 numéro : ${order.phone}`)
      } catch (e) { push(`${tag} ✗ achat 5sim: ${e instanceof Error ? e.message : String(e)}`); R.tick(false); continue }

      const num = localPhone(order.phone, CFG.dial)
      const r = await createInstagramAccountByVision(key, dev, { countryLabel: CFG.label, countryY: CFG.countryY, phoneNumber: num }, hooks)
      if (r.stage !== 'number_submitted') {
        push(`${tag} ✗ échec avant SMS (étape ${r.stage}) → annulation du numéro`)
        try { await fivesimCancel(sim5Key, order.id) } catch { /* noop */ }
        R.tick(false); continue
      }
      const code = await fivesimWaitCode(sim5Key, order.id, { onLog: hooks.log, shouldStop: hooks.shouldStop, maxMs: 6 * 60_000 })
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
        <H title="Studio iRemoTech" />
        {irt.loading
          ? <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>Chargement…</div>
          : <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>iRemoTech pas encore branché. Colle ta clé API dans <b style={{ color: GOLD }}>Phone Farm → ⚙</b>.</div>}
      </div>
    )
  }

  // Sélecteur téléphones + containers, INLINE sur chaque page (choisis et lance sans
  // changer d'onglet, façon GeeLark). Repliable pour gagner de la place.
  const phonePicker = (opts?: { manage?: boolean }) => (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setPhonesOpen(o => !o)}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>📱 Téléphones & containers</span>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: totalJobs ? 'rgba(233,196,106,0.16)' : 'rgba(248,113,113,0.14)', color: totalJobs ? GOLD : '#F87171' }}>
          {totalJobs ? `${totalJobs} container(s) · ${sel.size} iPhone(s)` : 'aucune sélection'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {sel.size > 0 && <span onClick={e => { e.stopPropagation(); setSel(new Set()); setSelConts({}) }} style={{ ...btn, height: 28, display: 'inline-flex', alignItems: 'center' }}>Tout désélectionner</span>}
          <span style={{ fontSize: 16, color: MUTED, transform: phonesOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
        </span>
      </div>

      {phonesOpen && (
        <div style={{ marginTop: 12 }}>
          {/* Chips téléphones */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {devices.map(d => {
              const on = sel.has(d.public_id)
              const list = conts[d.public_id] ?? []
              return (
                <button key={d.public_id} onClick={() => togglePhone(d.public_id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 13px', borderRadius: 10, cursor: 'pointer', background: on ? GOLD : 'rgba(255,255,255,0.03)', color: on ? '#1a1206' : INK, border: on ? 'none' : '1px solid rgba(216,180,254,0.16)', fontSize: 13, fontWeight: 700 }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 16, height: 16, borderRadius: 4, background: on ? '#1a1206' : 'transparent', color: GOLD, fontSize: 10, fontWeight: 900, border: on ? 'none' : '1px solid rgba(216,180,254,0.3)' }}>{on ? '✓' : ''}</span>
                  {d.name ?? d.public_id}<span style={{ fontSize: 10.5, opacity: 0.7 }}>· {list.length}c</span>
                </button>
              )
            })}
            {devices.length === 0 && !loading && <span style={{ fontSize: 12.5, color: DIM }}>Aucun iPhone détecté sur ta clé iRemoTech.</span>}
          </div>

          {/* Containers par téléphone sélectionné */}
          {[...sel].map(devId => {
            const d = devices.find(x => x.public_id === devId)
            const list = conts[devId] ?? []
            const picked = selConts[devId] ?? new Set()
            return (
              <div key={devId} style={{ marginTop: 10, padding: 12, borderRadius: 12, background: 'rgba(233,196,106,0.04)', border: '1px solid rgba(233,196,106,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: GOLD }}>📱 {d?.name ?? devId}</span>
                  <span style={{ fontSize: 11.5, color: MUTED }}>{picked.size}/{list.length}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button style={{ ...btn, height: 28 }} onClick={() => setSelConts(sc => ({ ...sc, [devId]: new Set(list) }))}>Tout</button>
                    <button style={{ ...btn, height: 28 }} onClick={() => setSelConts(sc => ({ ...sc, [devId]: new Set() }))}>Aucun</button>
                  </span>
                </div>
                {list.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 9 }}>
                    {list.map(c => {
                      const cp = picked.has(c)
                      return (
                        <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 6px 0 11px', borderRadius: 9, fontSize: 13, fontWeight: 800, background: cp ? GOLD : 'rgba(255,255,255,0.04)', color: cp ? '#1a1206' : INK, border: cp ? 'none' : '1px solid rgba(216,180,254,0.16)' }}>
                          <span onClick={() => toggleCont(devId, c)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'grid', placeItems: 'center', width: 15, height: 15, borderRadius: 4, background: cp ? '#1a1206' : 'transparent', color: GOLD, fontSize: 10, fontWeight: 900, border: cp ? 'none' : '1px solid rgba(216,180,254,0.3)' }}>{cp ? '✓' : ''}</span>
                            {c}
                          </span>
                          {opts?.manage && <span onClick={() => removeC(devId, c)} title="Retirer" style={{ cursor: 'pointer', opacity: 0.5, fontWeight: 900, fontSize: 16, padding: '0 2px' }}>×</span>}
                        </span>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 7, maxWidth: 380 }}>
                  <input value={newC[devId] ?? ''} onChange={e => setNewC(v => ({ ...v, [devId]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addC(devId) }} placeholder="+ container (ex. 6, Default…)" style={{ ...inp, flex: 1, height: 34 }} />
                  <button style={{ ...gold, height: 34, padding: '0 14px' }} onClick={() => addC(devId)}>Ajouter</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const LogPanel = () => (logs.length > 0 || running) ? (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: INK }}>Journal</span>
        {running && runId && <button style={{ ...btn, marginLeft: 'auto', color: '#F87171', borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => cancelRun(runId)}>■ Arrêter</button>}
        {!running && logs.length > 0 && <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => setLogs([])}>Effacer</button>}
      </div>
      <div style={{ padding: 11, borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(216,180,254,0.1)', maxHeight: 320, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.6, color: MUTED, whiteSpace: 'pre-wrap' }}>{logs.join('\n') || 'En cours…'}</div>
    </div>
  ) : null

  const TABS: { k: IrtTab; label: string; icon: string }[] = [
    { k: 'phones', label: 'Téléphones', icon: '📱' },
    { k: 'posting', label: 'Posting', icon: '🎬' },
    { k: 'story', label: 'Story', icon: '📸' },
    { k: 'account', label: 'Création de compte', icon: '🆕' },
  ]

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <H title="Studio iRemoTech" sub="Automatise tes vrais iPhones : gère tes téléphones et containers, publie des Reels et des Stories, et crée des comptes — le tout par vision."
        right={budget?.budget != null ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: GOLD }}>{budget.remaining ?? '—'} / {budget.budget ?? '—'} actions</span> : undefined} />

      {/* Barre d'onglets (mode autonome ; en infra, la nav de gauche gère les onglets) */}
      {!onTab && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {TABS.map(t => {
            const on = curTab === t.k
            return (
              <button key={t.k} onClick={() => goTab(t.k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', borderRadius: 12, cursor: 'pointer', fontSize: 13.5, fontWeight: 800, background: on ? GOLD : 'rgba(255,255,255,0.03)', color: on ? '#1a1206' : MUTED, border: on ? 'none' : '1px solid rgba(216,180,254,0.14)' }}>
                <span>{t.icon}</span>{t.label}
                {t.k === 'phones' && totalJobs > 0 && <span style={{ fontSize: 11, fontWeight: 900, padding: '1px 7px', borderRadius: 99, background: on ? 'rgba(26,18,6,0.2)' : 'rgba(233,196,106,0.2)', color: on ? '#1a1206' : GOLD }}>{totalJobs}</span>}
              </button>
            )
          })}
        </div>
      )}

      {err &&<div style={{ ...card, color: '#F87171', fontSize: 13, textAlign: 'center' }}>{err}</div>}
      {loading && <div style={{ ...card, color: MUTED, fontSize: 13, textAlign: 'center' }}>Connexion à iRemoTech…</div>}

      {/* ─────────────── ONGLET TÉLÉPHONES (gestion complète) ─────────────── */}
      {curTab === 'phones' && (<>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: MUTED }}>Gère tes iPhones et leurs containers Crane. Tu peux aussi choisir/lancer directement depuis les onglets Posting, Story et Création de compte.</p>
        {phonePicker({ manage: true })}
        {sel.size > 0 && (
          <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={gold} onClick={() => goTab('posting')}>🎬 Aller au Posting →</button>
            <button style={btn} onClick={() => goTab('story')}>📸 Aller à Story →</button>
            <button style={btn} onClick={() => goTab('account')}>🆕 Créer des comptes →</button>
          </div>
        )}
      </>)}

      {/* ─────────────── ONGLET POSTING ─────────────── */}
      {curTab === 'posting' && (<>
        {phonePicker()}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 3 }}>🎬 Posting — Reels</div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED }}>Chaque container coché reçoit une vidéo tirée <b>au hasard</b> du pool et publie un Reel.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <button style={gold} onClick={() => setPicker('reel')}>+ Ajouter des vidéos</button>
            <span style={{ fontSize: 12, color: MUTED }}>{reelPool.length} vidéo(s) dans le pool</span>
            {reelPool.length > 0 && <button style={btn} onClick={() => setReelPool([])}>Vider</button>}
          </div>
          {reelPool.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {reelPool.map(v => (
                <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 8, fontSize: 11.5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.14)', color: INK }}>
                  🎞 {v.title.slice(0, 26)}
                  <span onClick={() => setReelPool(p => p.filter(x => x.id !== v.id))} title="Retirer" style={{ cursor: 'pointer', color: '#F87171', fontWeight: 900 }}>×</span>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, margin: '0 0 6px' }}>Légendes (une par ligne, tirées au hasard)</div>
          <textarea value={captionPool} onChange={e => setCaptionPool(e.target.value)} rows={3} placeholder={'Ma légende 1\nMa légende 2\n…'} style={{ ...inp, width: '100%', height: 'auto', minHeight: 60, padding: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
        </div>
        <OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} />
        <LaunchBar label={`Lancer ${totalJobs} Reel(s)`} disabled={!totalJobs || !reelPool.length || running} running={running} onClick={() => run('reel')} />
        <LogPanel />
      </>)}

      {/* ─────────────── ONGLET STORY ─────────────── */}
      {curTab === 'story' && (<>
        {phonePicker()}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 3 }}>📸 Story — photo + lien</div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED }}>Chaque container reçoit une photo tirée au hasard, avec son lien sticker (CTA).</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <button style={gold} onClick={() => setPicker('story')}>+ Ajouter des photos</button>
            <span style={{ fontSize: 12, color: MUTED }}>{storyPool.length} photo(s) dans le pool</span>
            {storyPool.length > 0 && <button style={btn} onClick={() => setStoryPool([])}>Vider</button>}
          </div>
          {storyPool.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {storyPool.map(v => (
                <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 8, fontSize: 11.5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(216,180,254,0.14)', color: INK }}>
                  🖼 {v.title.slice(0, 26)}
                  <span onClick={() => setStoryPool(p => p.filter(x => x.id !== v.id))} title="Retirer" style={{ cursor: 'pointer', color: '#F87171', fontWeight: 900 }}>×</span>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, margin: '0 0 6px' }}>Lien CTA par défaut</div>
          <input value={storyLink} onChange={e => setStoryLink(e.target.value)} placeholder="https://mon-lien.com" style={{ ...inp, width: '100%', height: 38, marginBottom: 12 }} />
          {totalJobs > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, margin: '0 0 8px' }}>Lien par container (prioritaire sur le défaut)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[...sel].flatMap(dev => [...(selConts[dev] ?? [])].map(c => ({ dev, c }))).map(({ dev, c }) => (
                  <div key={`${dev}::${c}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ minWidth: 130, fontSize: 12, fontWeight: 700, color: GOLD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{devices.find(d => d.public_id === dev)?.name ?? dev} · {c}</span>
                    <input value={storyLinks[linkKey(dev, c)] ?? ''} onChange={e => setLink(dev, c, e.target.value)} placeholder={storyLink.trim() ? `défaut : ${storyLink.trim()}` : 'https://…'} style={{ ...inp, flex: 1, height: 34, fontSize: 12 }} />
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, margin: '14px 0 6px' }}>Textes sticker (une par ligne, au hasard — optionnel)</div>
          <textarea value={captionPool} onChange={e => setCaptionPool(e.target.value)} rows={2} placeholder={'Texte 1\nTexte 2\n…'} style={{ ...inp, width: '100%', height: 'auto', minHeight: 46, padding: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
        </div>
        <OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} />
        <LaunchBar label={`Lancer ${totalJobs} Story(s)`} disabled={!totalJobs || !storyPool.length || running} running={running} onClick={() => run('story')} />
        <LogPanel />
      </>)}

      {/* ─────────────── ONGLET CRÉATION DE COMPTE ─────────────── */}
      {curTab === 'account' && (<>
        {phonePicker()}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 3 }}>🆕 Création de compte Instagram</div>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: MUTED }}>Ouvre IG sur chaque container « frais » (déconnecté) et crée un compte. Avec un token 5sim : numéro + code SMS automatiques.</p>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, marginBottom: 7 }}>Pays du numéro</div>
          <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 10, background: 'rgba(0,0,0,0.3)', marginBottom: 14 }}>
            {(['uk', 'usa'] as const).map(k => (
              <button key={k} onClick={() => setAcctCountry(k)} style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800, background: acctCountry === k ? GOLD : 'transparent', color: acctCountry === k ? '#1a1206' : MUTED }}>
                {k === 'uk' ? '🇬🇧 United Kingdom' : '🇺🇸 United States'}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, marginBottom: 7 }}>Token 5sim (optionnel)</div>
          <input value={sim5Key} onChange={e => { setSim5Key(e.target.value); try { localStorage.setItem('sf-5sim-key', e.target.value) } catch { /* noop */ } }}
            placeholder="Colle ton token 5sim pour l'achat de numéro + code SMS auto" type="password"
            style={{ ...inp, width: '100%', height: 40, marginBottom: 8 }} />
          <p style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
            {sim5Key
              ? <>✓ 5sim branché : achète un numéro {acctCountry === 'usa' ? '🇺🇸' : '🇬🇧'}, le saisit, attend le SMS et rentre le code.</>
              : <>Sans token : le flow va jusqu'au choix du pays (test) puis s'arrête.</>}
          </p>
        </div>
        <OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} accountMode />
        <LaunchBar label={sim5Key ? `Créer ${totalJobs} compte(s)` : `Tester le flow (${totalJobs})`} disabled={!totalJobs || running} running={running} onClick={createAccounts} />
        <LogPanel />
      </>)}

      {picker && (
        <BankPicker theme={BLOW_THEME} user={user} org={org} kind={picker === 'story' ? 'images' : 'videos'} multi
          title={picker === 'story' ? 'Ajouter des photos au pool' : 'Ajouter des vidéos au pool'} onClose={() => setPicker(null)} onApply={applyPicker} />
      )}
    </div>
  )
}

// Carte « Options » réutilisée par chaque onglet d'action.
function OptionsCard({ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel, accountMode }: {
  airplaneOn: boolean; setAirplaneOn: (f: (v: boolean) => boolean) => void
  uniqueUse: boolean; setUniqueUse: (f: (v: boolean) => boolean) => void
  parallel: boolean; setParallel: (f: (v: boolean) => boolean) => void
  accountMode?: boolean
}) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 12 }}>Options</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
        <Toggle on={airplaneOn} onClick={() => setAirplaneOn(v => !v)} label="Rotation d'IP (mode avion)" sub="Cycle avion entre chaque container" />
        {!accountMode && <Toggle on={uniqueUse} onClick={() => setUniqueUse(v => !v)} label="Usage unique" sub="Pas de doublon tant que le pool n'est pas épuisé" />}
        <Toggle on={parallel} onClick={() => setParallel(v => !v)} label="Téléphones en parallèle" sub="Plus rapide (lecture d'écran sérialisée)" />
      </div>
    </div>
  )
}

// Barre de lancement réutilisée.
function LaunchBar({ label, disabled, running, onClick }: { label: string; disabled: boolean; running: boolean; onClick: () => void }) {
  return (
    <div style={{ ...card, display: 'flex', justifyContent: 'flex-end' }}>
      <button style={{ ...gold, height: 46, padding: '0 26px', fontSize: 14.5, opacity: disabled ? 0.5 : 1 }} disabled={disabled} onClick={onClick}>
        {running ? 'En cours…' : label}
      </button>
    </div>
  )
}
