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
import { selectContainerByVision, postReelByVision, postStoryByVision, airplaneReset, warmupEditsByVision, recalibrateTouch, createInstagramAccountByVision, enterSmsCodeByVision, warmupByVision, completeSignupByVision } from '@/lib/iremotechVision'
import { addCreatedAccount, loadCreatedAccounts, removeCreatedAccount, clearCreatedAccounts, type CreatedAccount } from '@/lib/irtCreatedAccounts'
import { addWarmupSession } from '@/lib/irtWarmupHistory'
import { fivesimBuy, fivesimWaitCode, fivesimFinish, fivesimCancel, localPhone } from '@/lib/fivesim'
import { herosmsBuy, herosmsWaitCode, herosmsFinish, herosmsCancel, herosmsPing, herosmsProbe, herosmsOffers } from '@/lib/herosms'
import { loadDevContainers, addDevContainer, removeDevContainer, loadStoryLink, saveStoryLink } from '@/lib/irtContainers'
import { startRun, cancelRun } from '@/lib/runStore'
import BankPicker, { type PickerResult } from '@/components/BankPicker'
import { themeFor } from '@/lib/theme'

const BLOW_THEME = themeFor('blowsome')

const GOLD = '#E9C46A', INK = '#ECE9F5', MUTED = '#A79FBD', DIM = '#6b6478', SERIF = "'Space Grotesk',sans-serif"
type VidRef = { id: string; title: string; storage_path: string | null; file_url: string | null }
export type IrtTab = 'phones' | 'posting' | 'story' | 'warmup' | 'account' | 'comptes'

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
  const [heroKey, setHeroKey] = useState(() => { try { return localStorage.getItem('sf-herosms-key') ?? '' } catch { return '' } })
  const [smsProvider, setSmsProvider] = useState<'5sim' | 'herosms'>(() => { try { return (localStorage.getItem('sf-sms-provider') as '5sim' | 'herosms') || '5sim' } catch { return '5sim' } })
  const [acctCountry, setAcctCountry] = useState<'uk' | 'usa'>('usa')
  const [heroOffers, setHeroOffers] = useState<{ price: number; count: number }[]>([]) // paliers de prix HeroSMS
  const [heroPrice, setHeroPrice] = useState<number | null>(null)                       // prix exact choisi (null = auto)
  const [offersLoading, setOffersLoading] = useState(false)
  const [showAllPrices, setShowAllPrices] = useState(false)
  // Warm-up
  const [wPreset, setWPreset] = useState<'careful' | 'balanced' | 'aggressive' | 'custom'>('balanced')
  const [wDurMin, setWDurMin] = useState(8)     // minutes (custom)
  const [wDurMax, setWDurMax] = useState(12)
  const [wLikePct, setWLikePct] = useState(5)   // %
  const [wCommentPct, setWCommentPct] = useState(0)
  const [wComments, setWComments] = useState('')
  const [createdAccts, setCreatedAccts] = useState<CreatedAccount[]>(() => loadCreatedAccounts())
  const [acctSearch, setAcctSearch] = useState('')
  const [acctFilter, setAcctFilter] = useState<'all' | 'ok' | 'ko'>('all')
  const [acctLogOpen, setAcctLogOpen] = useState<number | null>(null)

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
    // Config pays : identifiants propres à chaque fournisseur SMS.
    //  - 5sim : simCountry (nom), operator ; HeroSMS : heroCountry (id SMS-Activate : USA=187, UK=16).
    //  - USA : opérateur « textnow » (priorisé), on prend le numéro le PLUS CHER dispo.
    const CFG = acctCountry === 'usa'
      ? { label: /states/i, countryY: 0.37, simCountry: 'usa', operator: 'textnow', heroCountry: 187, dial: '1', name: 'United States' }
      : { label: /kingdom/i, countryY: 0.29, simCountry: 'england', operator: 'any', heroCountry: 16, dial: '44', name: 'United Kingdom' }

    // Fournisseur SMS actif (clé + fonctions unifiées buy/wait/finish/cancel).
    const usingHero = smsProvider === 'herosms'
    const smsKey = usingHero ? heroKey : sim5Key
    const provName = usingHero ? 'HeroSMS' : '5sim'
    // HeroSMS : si un prix est choisi dans l'UI → achat à ce palier exact ; sinon on prend le
    // PLUS CHER dispo (pick 'high') dans une large tranche. Opérateur = CFG.operator (USA=textnow).
    const buyNumber = () => usingHero
      ? herosmsBuy(heroKey, { country: CFG.heroCountry, service: 'ig', operator: CFG.operator, priceMin: heroPrice ?? 0.20, priceMax: heroPrice ?? 5.00, pick: 'high', onLog: (m: string) => push(m) })
      : fivesimBuy(sim5Key, { country: CFG.simCountry, operator: CFG.operator, product: 'instagram' })
    const waitCode = (id: number, maxMs: number) => usingHero
      ? herosmsWaitCode(heroKey, id, { onLog: (m: string) => push(m), shouldStop: () => R.isCancelled(), maxMs })
      : fivesimWaitCode(sim5Key, id, { onLog: (m: string) => push(m), shouldStop: () => R.isCancelled(), maxMs })
    const cancelNum = (id: number) => usingHero ? herosmsCancel(heroKey, id) : fivesimCancel(sim5Key, id)
    const finishNum = (id: number) => usingHero ? herosmsFinish(heroKey, id) : fivesimFinish(sim5Key, id)

    setRunning(true); setLogs([])
    const R = startRun('farm', `Création compte ${CFG.name} · ${jobs.length}`, jobs.length); setRunId(R.id)
    push(`▶ Création de compte (${CFG.name})${smsKey ? ` + numéro ${provName}` : ' (test, sans numéro)'} : ${jobs.length} container(s)`)
    for (const { dev, c } of jobs) {
      if (R.isCancelled()) break
      const devName = devices.find(d => d.public_id === dev)?.name ?? dev
      const tag = `[${devName}·${c}]`
      const acctLog: string[] = []
      const hooks = { log: (m: string) => { push(`${tag} ${m}`); acctLog.push(m) }, shouldStop: () => R.isCancelled() }
      // Sans numéro (test) : cycle unique.
      if (!smsKey) {
        await recalibrateTouch(key, dev, hooks)
        if (airplaneOn) await airplaneReset(key, dev, hooks)
        const opened = await selectContainerByVision(key, dev, c, hooks)
        if (!opened) { push(`${tag} ⏭ container non atteint`); R.tick(false); continue }
        await sleep(1500)
        const r = await createInstagramAccountByVision(key, dev, { countryLabel: CFG.label, countryY: CFG.countryY }, hooks)
        push(`${tag} ${r.ok ? '✓' : '✗'} étape: ${r.stage}`); R.tick(r.ok); continue
      }

      // Avec numéro : CYCLE COMPLET (conteneur → numéro → inscription entière), en ILLIMITÉ
      // jusqu'à réussite (ou arrêt manuel). Un WATCHDOG « bloqué > 60s » (aucun log de progression
      // = écran figé) OU l'absence de code sous 60s OU un échec d'étape → on ANNULE le numéro et on
      // RECOMMENCE TOUT DE 0. Chaque numéro non finalisé est annulé (finally) → remboursé.
      let success = false
      let resultOrder: { id: number; phone: string; price?: number } | null = null
      let creds: { username: string; password: string; fullName: string } | undefined
      for (let cycle = 0; !success && !R.isCancelled(); cycle++) {
        if (cycle > 0) push(`${tag} 🔄 on recommence tout le cycle (essai ${cycle + 1})…`)
        let lastBeat = Date.now(); let stuck = false
        const wd = setInterval(() => { if (Date.now() - lastBeat > 60_000) stuck = true }, 3000)
        const chooks = { log: (m: string) => { push(`${tag} ${m}`); acctLog.push(m); lastBeat = Date.now() }, shouldStop: () => R.isCancelled() || stuck }
        let order: { id: number; phone: string; price?: number } | null = null
        try {
          await recalibrateTouch(key, dev, chooks)
          if (airplaneOn) await airplaneReset(key, dev, chooks)
          const opened = await selectContainerByVision(key, dev, c, chooks)
          if (!opened) { push(`${tag} ⏭ container non atteint → on recommence de 0`); continue }
          await sleep(1500)
          push(`${tag} 🛒 achat d'un numéro ${CFG.name} (${provName})…`)
          order = await buyNumber()
          push(`${tag} 📞 numéro : ${order.phone}${order.price != null ? ` · ${order.price}$` : ''}${usingHero && acctCountry === 'usa' ? ' · textnow' : ''}`)
          const num = localPhone(order.phone, CFG.dial)
          const r = await createInstagramAccountByVision(key, dev, { countryLabel: CFG.label, countryY: CFG.countryY, phoneNumber: num }, chooks)
          if (stuck) { push(`${tag} ⏱ bloqué > 60s → on recommence de 0`); continue }
          if (r.stage !== 'number_submitted') { push(`${tag} ✗ échec avant SMS (étape ${r.stage}) → on recommence de 0`); continue }
          // Numéro soumis : on laisse un peu de temps à IG (bascule écran code + envoi du SMS)
          // avant d'attendre le code.
          await sleep(3000)
          const code = await waitCode(order.id, 60_000)
          if (!code) { push(`${tag} ⏱ pas de code sous 60s → on recommence de 0`); continue }
          const okCode = await enterSmsCodeByVision(key, dev, code, chooks)
          try { await finishNum(order.id) } catch { /* noop */ }
          resultOrder = order; order = null // numéro consommé (finishNum) → plus d'annulation
          if (!okCode) { push(`${tag} ⚠ code non validé → on recommence de 0`); continue }
          const done = await completeSignupByVision(key, dev, chooks)
          creds = done.creds
          if (stuck) { push(`${tag} ⏱ bloqué > 60s pendant l'inscription → on recommence de 0`); continue }
          if (done.ok) { success = true; push(`${tag} ✅ compte créé`) }
          else push(`${tag} ⚠ inscription incomplète → on recommence de 0`)
        } catch (e) {
          push(`${tag} ⚠ ${stuck ? 'bloqué > 60s' : (e instanceof Error ? e.message : String(e))} → on recommence de 0`)
        } finally {
          clearInterval(wd)
          if (order) { try { await cancelNum(order.id) } catch { /* noop */ } } // numéro acheté non finalisé → annuler
        }
      }
      if (!success) push(`${tag} ✗ compte non créé (arrêté)`)
      R.tick(success)
      // Enregistre le compte (identifiants + numéro + logs) → catégorie « Comptes créés ».
      addCreatedAccount({ at: Date.now(), device: dev, deviceName: devName, container: c, username: creds?.username, password: creds?.password, fullName: creds?.fullName, phone: resultOrder?.phone, provider: provName, price: resultOrder?.price, country: CFG.name, ok: success, log: acctLog })
      setCreatedAccts(loadCreatedAccounts())
    }
    R.finish(); push(R.isCancelled() ? '⏹ Arrêté.' : '✔ Terminé.'); setRunning(false); setRunId(null)
  }

  // Réglages warm-up dérivés du preset (comme l'outil : Careful/Balanced/Aggressive).
  function warmupCfg(): { minMs: number; maxMs: number; likeRate: number; commentRate: number; comments: string[] } {
    const comments = wComments.split('\n').map(s => s.trim()).filter(Boolean)
    if (wPreset === 'careful')    return { minMs: 5 * 60_000, maxMs: 8 * 60_000, likeRate: 0.02, commentRate: 0, comments }
    if (wPreset === 'balanced')   return { minMs: 8 * 60_000, maxMs: 12 * 60_000, likeRate: 0.05, commentRate: 0, comments }
    if (wPreset === 'aggressive') return { minMs: 12 * 60_000, maxMs: 15 * 60_000, likeRate: 0.12, commentRate: 0, comments }
    // custom
    const lo = Math.max(1, Math.min(15, wDurMin)), hi = Math.max(lo, Math.min(15, wDurMax))
    return { minMs: lo * 60_000, maxMs: hi * 60_000, likeRate: wLikePct / 100, commentRate: (comments.length ? wCommentPct : 0) / 100, comments }
  }

  // Warm-up par conteneur, avec rotation d'IP (mode avion) entre chaque — ce que
  // l'outil externe ne fait pas.
  async function runWarmup() {
    if (!irt.key || running) return
    const key = irt.key
    const cfg = warmupCfg()
    const byPhone = [...sel].map(dev => ({
      dev, name: devices.find(d => d.public_id === dev)?.name ?? dev,
      conts: [...(selConts[dev] ?? new Set())],
    })).filter(p => p.conts.length)
    if (byPhone.length === 0) { setLogs(['⚠ Coche au moins un conteneur (sélecteur en haut).']); return }
    setRunning(true); setLogs([])
    const total = byPhone.reduce((n, p) => n + p.conts.length, 0)
    const R = startRun('farm', `Warm-up iRemoTech · ${total} compte(s)`, total); setRunId(R.id)
    push(`▶ Warm-up (${wPreset}) : ${byPhone.length} iPhone(s) · ${total} compte(s)${airplaneOn ? ' · rotation avion' : ''}${parallel ? ' · parallèle' : ' · série'}`)

    const runPhone = async (p: typeof byPhone[number]) => {
      const tag = `[${p.name}]`
      const hooks = { log: (m: string) => push(`${tag} ${m}`), shouldStop: () => R.isCancelled() }
      await recalibrateTouch(key, p.dev, hooks)
      for (const c of p.conts) {
        if (R.isCancelled()) break
        push(`\n${tag} 🔥 conteneur « ${c} »`)
        if (airplaneOn) await airplaneReset(key, p.dev, hooks)
        const opened = await selectContainerByVision(key, p.dev, c, hooks)
        if (!opened) { push(`${tag} ⏭ conteneur non atteint`); R.tick(false); continue }
        await sleep(1200)
        const started = Date.now()
        let res
        try { res = await warmupByVision(key, p.dev, cfg, hooks) } catch (e) { push(`${tag} ✗ ${e instanceof Error ? e.message : String(e)}`) }
        const durationSec = Math.round((Date.now() - started) / 1000)
        const result: 'completed' | 'stopped' | 'failed' = res?.ok ? (R.isCancelled() ? 'stopped' : 'completed') : 'failed'
        addWarmupSession({ at: Date.now(), device: p.dev, deviceName: p.name, container: c, durationSec, reels: res?.reels ?? 0, likes: res?.likes ?? 0, comments: res?.comments ?? 0, result })
        R.tick(!!res?.ok)
      }
    }

    if (parallel) await Promise.all(byPhone.map(runPhone))
    else for (const p of byPhone) { if (R.isCancelled()) break; await runPhone(p) }
    R.finish(); push(R.isCancelled() ? '⏹ Arrêté.' : '✔ Warm-up terminé.'); setRunning(false); setRunId(null)
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
    { k: 'warmup', label: 'Warm-up', icon: '🔥' },
    { k: 'account', label: 'Création de compte', icon: '🆕' },
    { k: 'comptes', label: 'Comptes', icon: '👤' },
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

      {/* ─────────────── ONGLET WARM-UP ─────────────── */}
      {curTab === 'warmup' && (<>
        {phonePicker()}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 3 }}>🔥 Warm-up</div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED }}>Active chaque compte façon humaine (scroll Reels, regard, like…), un conteneur après l'autre, avec <b>rotation d'IP entre chaque</b> (mode avion).</p>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, marginBottom: 7 }}>Intensité</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {([['careful', 'Careful', '5–8 min · 2%'], ['balanced', 'Balanced', '8–12 min · 5%'], ['aggressive', 'Aggressive', '12–15 min · 12%'], ['custom', 'Custom', 'sur mesure']] as const).map(([k, l, sub]) => (
              <button key={k} onClick={() => setWPreset(k)} style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', padding: '8px 14px', border: 'none', borderRadius: 10, cursor: 'pointer', background: wPreset === k ? GOLD : 'rgba(255,255,255,0.03)', color: wPreset === k ? '#1a1206' : INK, boxShadow: wPreset === k ? 'none' : 'inset 0 0 0 1px rgba(216,180,254,0.16)' }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{l}</span>
                <span style={{ fontSize: 10.5, opacity: 0.8 }}>{sub}</span>
              </button>
            ))}
          </div>

          {wPreset === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: MUTED }}>Durée min (min)
                <input type="number" min={1} max={15} value={wDurMin} onChange={e => setWDurMin(+e.target.value)} style={{ ...inp, width: '100%', height: 34, marginTop: 4 }} /></label>
              <label style={{ fontSize: 12, color: MUTED }}>Durée max (min)
                <input type="number" min={1} max={15} value={wDurMax} onChange={e => setWDurMax(+e.target.value)} style={{ ...inp, width: '100%', height: 34, marginTop: 4 }} /></label>
              <label style={{ fontSize: 12, color: MUTED }}>Taux de like (%)
                <input type="number" min={0} max={100} value={wLikePct} onChange={e => setWLikePct(+e.target.value)} style={{ ...inp, width: '100%', height: 34, marginTop: 4 }} /></label>
              <label style={{ fontSize: 12, color: MUTED }}>Taux de comment (%)
                <input type="number" min={0} max={100} value={wCommentPct} onChange={e => setWCommentPct(+e.target.value)} style={{ ...inp, width: '100%', height: 34, marginTop: 4 }} /></label>
            </div>
          )}
          {wPreset === 'custom' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, margin: '10px 0 6px' }}>Commentaires (un par ligne, au hasard — laisse vide pour ne pas commenter)</div>
              <textarea value={wComments} onChange={e => setWComments(e.target.value)} rows={2} placeholder={'🔥\ntrop bien\n😍'} style={{ ...inp, width: '100%', height: 'auto', minHeight: 46, padding: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
            </>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 11, color: DIM }}>Chaque session est aléatoire (durée, temps de visionnage, reels likés) pour rester crédible.</p>
        </div>
        <OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} accountMode />
        <LaunchBar label={`Lancer le warm-up (${totalJobs})`} disabled={!totalJobs || running} running={running} onClick={runWarmup} />
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

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM, marginBottom: 7 }}>Fournisseur de numéro</div>
          <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 10, background: 'rgba(0,0,0,0.3)', marginBottom: 12 }}>
            {(['herosms', '5sim'] as const).map(p => (
              <button key={p} onClick={() => { setSmsProvider(p); try { localStorage.setItem('sf-sms-provider', p) } catch { /* noop */ } }} style={{ height: 32, padding: '0 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 800, background: smsProvider === p ? GOLD : 'transparent', color: smsProvider === p ? '#1a1206' : MUTED }}>
                {p === 'herosms' ? 'HeroSMS' : '5sim'}
              </button>
            ))}
          </div>

          {smsProvider === 'herosms' ? (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={heroKey} onChange={e => { const v = e.target.value.trim(); setHeroKey(v); try { localStorage.setItem('sf-herosms-key', v) } catch { /* noop */ } }}
                placeholder="Token HeroSMS (numéro + code SMS auto)" type="password"
                style={{ ...inp, flex: 1, height: 40 }} />
              <button style={{ ...btn, height: 40, padding: '0 14px' }} disabled={!heroKey || running}
                onClick={async () => {
                  setLogs(['🔑 Test d’authentification HeroSMS (matrice)…'])
                  const r = await herosmsProbe(heroKey)
                  for (const x of r.results) push(`${x.good ? '✅' : '✗'} ${x.label} — ${x.status} — ${x.snippet}`)
                  push(r.ok ? '➡️ Une combinaison marche — envoie-moi la ligne ✅.' : '➡️ Aucune combinaison acceptée — clé/compte à vérifier côté HeroSMS.')
                }}>Tester la clé</button>
            </div>
          ) : (
            <input value={sim5Key} onChange={e => { setSim5Key(e.target.value); try { localStorage.setItem('sf-5sim-key', e.target.value) } catch { /* noop */ } }}
              placeholder="Token 5sim (numéro + code SMS auto)" type="password"
              style={{ ...inp, width: '100%', height: 40, marginBottom: 8 }} />
          )}
          {smsProvider === 'herosms' && (
            <div style={{ marginTop: 10, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: DIM }}>Prix du numéro</span>
                <button style={{ ...btn, height: 28, padding: '0 12px' }} disabled={!heroKey || offersLoading}
                  onClick={async () => {
                    setOffersLoading(true)
                    try {
                      const list = await herosmsOffers(heroKey, acctCountry === 'usa' ? 187 : 16)
                      setHeroOffers(list)
                      if (!list.length) push('⚠ Aucun prix renvoyé par HeroSMS (liste dispo côté web).')
                    } finally { setOffersLoading(false) }
                  }}>{offersLoading ? 'Chargement…' : 'Charger les prix'}</button>
                {heroOffers.length > 0 && (
                  <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: MUTED, cursor: 'pointer' }}>
                    <input type="checkbox" checked={showAllPrices} onChange={e => setShowAllPrices(e.target.checked)} /> tout voir
                  </label>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button onClick={() => setHeroPrice(null)} style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, background: heroPrice === null ? GOLD : 'rgba(0,0,0,0.3)', color: heroPrice === null ? '#1a1206' : MUTED }}>Auto (moins cher)</button>
                {heroOffers.filter(o => showAllPrices || o.price >= 0.20).map(o => (
                  <button key={o.price} onClick={() => setHeroPrice(o.price)} style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, background: heroPrice === o.price ? GOLD : 'rgba(0,0,0,0.3)', color: heroPrice === o.price ? '#1a1206' : INK }}>
                    {o.price.toFixed(2)}$ · {o.count} dispo
                  </button>
                ))}
                {heroOffers.length > 0 && !showAllPrices && !heroOffers.some(o => o.price >= 0.20) && (
                  <span style={{ fontSize: 11.5, color: MUTED, alignSelf: 'center' }}>Aucun palier ≥ 0,20 $ — coche « tout voir ».</span>
                )}
              </div>
            </div>
          )}
          <p style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
            {(smsProvider === 'herosms' ? heroKey : sim5Key)
              ? <>✓ {smsProvider === 'herosms' ? 'HeroSMS' : '5sim'} branché : achète un numéro {acctCountry === 'usa' ? '🇺🇸' : '🇬🇧'}, le saisit, attend le SMS et rentre le code.</>
              : <>Sans token : le flow va jusqu'au choix du pays (test) puis s'arrête.</>}
          </p>
        </div>
        <OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} accountMode />
        <LaunchBar label={(smsProvider === 'herosms' ? heroKey : sim5Key) ? `Créer ${totalJobs} compte(s)` : `Tester le flow (${totalJobs})`} disabled={!totalJobs || running} running={running} onClick={createAccounts} />
        <LogPanel />
        {createdAccts.length > 0 && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>✅ Comptes créés ({createdAccts.length})</span>
              <button style={{ ...btn, marginLeft: 'auto', height: 28 }} onClick={() => { const t = createdAccts.map(a => `${a.username ?? '?'}\t${a.password ?? ''}\t${a.phone ?? ''}\t${a.deviceName ?? a.device}·${a.container}`).join('\n'); try { navigator.clipboard.writeText(t) } catch { /* noop */ } }}>Copier tout</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {createdAccts.map(a => (
                <div key={a.at} style={{ padding: 11, borderRadius: 10, background: a.ok ? 'rgba(233,196,106,0.05)' : 'rgba(248,113,113,0.06)', border: `1px solid ${a.ok ? 'rgba(233,196,106,0.2)' : 'rgba(248,113,113,0.25)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: a.ok ? GOLD : '#F87171' }}>@{a.username ?? '—'}</span>
                    <span style={{ fontSize: 11.5, color: MUTED }}>{a.deviceName ?? a.device} · {a.container}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, color: DIM }}>{a.country}{a.price != null ? ` · ${a.price}$` : ''}</span>
                    <button onClick={() => { removeCreatedAccount(a.at); setCreatedAccts(loadCreatedAccounts()) }} title="Retirer" style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#F87171', fontWeight: 900, fontSize: 16 }}>×</button>
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: INK }}>
                    <span>🔑 {a.password ?? '—'}</span>
                    <span>📞 {a.phone ?? '—'}</span>
                    {a.fullName && <span style={{ color: MUTED }}>{a.fullName}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}

      {curTab === 'comptes' && (() => {
        const q = acctSearch.trim().toLowerCase()
        const filtered = createdAccts.filter(a => {
          if (acctFilter === 'ok' && !a.ok) return false
          if (acctFilter === 'ko' && a.ok) return false
          if (!q) return true
          return [a.username, a.phone, a.container, a.deviceName, a.device, a.fullName, a.country].some(v => (v ?? '').toString().toLowerCase().includes(q))
        })
        const okN = createdAccts.filter(a => a.ok).length
        const koN = createdAccts.length - okN
        const fmt = (t: number) => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
        const line = (a: CreatedAccount) => [a.username ?? '', a.password ?? '', a.phone ?? '', `${a.deviceName ?? a.device}·${a.container}`, a.country ?? '', a.ok ? 'ok' : 'echec'].join('\t')
        const copyAll = () => { try { navigator.clipboard.writeText(filtered.map(line).join('\n')) } catch { /* noop */ } }
        const exportCsv = () => {
          const head = ['username', 'password', 'fullName', 'phone', 'provider', 'price', 'country', 'device', 'container', 'statut', 'date']
          const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
          const rows = filtered.map(a => [a.username, a.password, a.fullName, a.phone, a.provider, a.price, a.country, a.deviceName ?? a.device, a.container, a.ok ? 'cree' : 'echec', new Date(a.at).toISOString()].map(esc).join(','))
          const csv = head.join(',') + '\n' + rows.join('\n')
          const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
          const el = document.createElement('a'); el.href = url; el.download = `comptes-ig-${new Date().toISOString().slice(0, 10)}.csv`; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
        return (<>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>👤 Comptes créés</div>
              <div style={{ display: 'flex', gap: 14, marginLeft: 'auto', fontSize: 12 }}>
                <span style={{ color: MUTED }}>Total <b style={{ color: INK }}>{createdAccts.length}</b></span>
                <span style={{ color: '#34D399' }}>Réussis <b>{okN}</b></span>
                <span style={{ color: '#F87171' }}>Échoués <b>{koN}</b></span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={acctSearch} onChange={e => setAcctSearch(e.target.value)} placeholder="Rechercher (username, numéro, conteneur, téléphone…)" style={{ ...inp, flex: 1, minWidth: 220, height: 38 }} />
              <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 10, background: 'rgba(0,0,0,0.3)' }}>
                {([['all', 'Tous'], ['ok', 'Réussis'], ['ko', 'Échoués']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setAcctFilter(k)} style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, background: acctFilter === k ? GOLD : 'transparent', color: acctFilter === k ? '#1a1206' : MUTED }}>{l}</button>
                ))}
              </div>
            </div>
            {createdAccts.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button style={{ ...btn, height: 32 }} onClick={copyAll}>Copier tout ({filtered.length})</button>
                <button style={{ ...btn, height: 32 }} onClick={exportCsv}>Exporter CSV</button>
                <button style={{ ...btn, height: 32, color: '#F87171', borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => { if (window.confirm('Vider TOUS les comptes enregistrés ? (irréversible)')) { clearCreatedAccounts(); setCreatedAccts([]) } }}>Vider</button>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>
              {createdAccts.length === 0 ? 'Aucun compte créé pour l’instant — lance une création dans l’onglet « Création de compte ».' : 'Aucun compte ne correspond à ta recherche.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(a => (
                <div key={a.at} style={{ padding: 12, borderRadius: 10, background: a.ok ? 'rgba(52,211,153,0.05)' : 'rgba(248,113,113,0.06)', border: `1px solid ${a.ok ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.25)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: a.ok ? '#34D399' : '#F87171' }}>@{a.username ?? '—'}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 99, background: a.ok ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)', color: a.ok ? '#34D399' : '#F87171' }}>{a.ok ? 'CRÉÉ' : 'ÉCHEC'}</span>
                    <span style={{ fontSize: 11.5, color: MUTED }}>{a.deviceName ?? a.device} · {a.container}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, color: DIM }}>{a.country ?? ''}{a.price != null ? ` · ${a.price}$` : ''}{a.provider ? ` · ${a.provider}` : ''} · {fmt(a.at)}</span>
                  </div>
                  <div style={{ marginTop: 5, display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: INK }}>
                    <span>🔑 {a.password ?? '—'}</span>
                    <span>📞 {a.phone ?? '—'}</span>
                    {a.fullName && <span style={{ color: MUTED }}>{a.fullName}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button style={{ ...btn, height: 26, fontSize: 11 }} onClick={() => { try { navigator.clipboard.writeText(line(a)) } catch { /* noop */ } }}>Copier</button>
                    {a.log && a.log.length > 0 && <button style={{ ...btn, height: 26, fontSize: 11 }} onClick={() => setAcctLogOpen(acctLogOpen === a.at ? null : a.at)}>{acctLogOpen === a.at ? 'Masquer le log' : 'Voir le log'}</button>}
                    <button style={{ ...btn, height: 26, fontSize: 11, marginLeft: 'auto', color: '#F87171', borderColor: 'rgba(248,113,113,0.4)' }} onClick={() => { removeCreatedAccount(a.at); setCreatedAccts(loadCreatedAccounts()) }}>Supprimer</button>
                  </div>
                  {acctLogOpen === a.at && a.log && (
                    <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(216,180,254,0.1)', maxHeight: 220, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, lineHeight: 1.6, color: MUTED, whiteSpace: 'pre-wrap' }}>{a.log.join('\n')}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>)
      })()}

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
