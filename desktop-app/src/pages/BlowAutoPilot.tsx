// ── iRemoTech — Studio d'automatisation (vrais iPhones) ──────────────────────
// Interface en ONGLETS, propre et user-friendly :
//   • Téléphones : choisir les iPhones + gérer/cocher leurs containers Crane
//   • Posting    : pool de vidéos → chaque container publie un Reel (vision)
//   • Story      : pool de photos + lien CTA par container → Story (vision)
//   • Compte     : création de compte IG (pays UK/USA + numéro/SMS 5sim)
// La sélection téléphones/containers est PARTAGÉE entre les onglets.
import { Fragment, useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { useIremotech, listDevices, fetchUsage, uploadMedia, type IrtDevice, type IrtUsage } from '@/lib/iremotech'
import { selectContainerByVision, postReelByVision, postStoryByVision, airplaneReset, warmupEditsByVision, recalibrateTouch, createInstagramAccountByVision, enterSmsCodeByVision, warmupByVision, completeSignupByVision, requestSmsIfWhatsApp, forceCloseForegroundApp } from '@/lib/iremotechVision'
import { addCreatedAccount, loadCreatedAccounts, removeCreatedAccount, clearCreatedAccounts, type CreatedAccount } from '@/lib/irtCreatedAccounts'
import { addWarmupSession } from '@/lib/irtWarmupHistory'
import { fivesimBuy, fivesimWaitCode, fivesimFinish, fivesimCancel, localPhone } from '@/lib/fivesim'
import { herosmsBuy, herosmsWaitCode, herosmsFinish, herosmsCancel, herosmsPing, herosmsProbe, herosmsOffers } from '@/lib/herosms'
import { smspoolBuy, smspoolWaitCode, smspoolFinish, smspoolCancel, smspoolPing, smspoolPrice } from '@/lib/smspool'
import { loadDevContainers, addDevContainer, removeDevContainer, loadStoryLink, saveStoryLink } from '@/lib/irtContainers'
import { startRun, cancelRun } from '@/lib/runStore'
import BankPicker, { type PickerResult } from '@/components/BankPicker'
import { themeFor } from '@/lib/theme'

const BLOW_THEME = themeFor('blowsome')

// Style « SaaS épuré » : surfaces plates neutres ; l'or iRemoTech reste un accent discret
// (sélection, cases cochées, interrupteurs, petites pastilles).
const GOLD = '#E9C46A', INK = '#EDEDEF', MUTED = '#8B8B94', DIM = '#71717A'
const EDGE = 'rgba(255,255,255,0.07)', FIELD_EDGE = 'rgba(255,255,255,0.09)', FIELD_BG = '#161618'
const MONO = "'JetBrains Mono',monospace"
const SEL_BG = 'rgba(255,255,255,0.07)', SEL_EDGE = 'rgba(233,196,106,0.45)'
type VidRef = { id: string; title: string; storage_path: string | null; file_url: string | null }
export type IrtTab = 'phones' | 'posting' | 'story' | 'warmup' | 'account' | 'comptes'

const card: CSSProperties = { background: '#111113', border: `1px solid ${EDGE}`, borderRadius: 8, padding: 16, marginBottom: 12 }
// Boutons alignés sur <Btn> (lib/ui) : ghost = bordé neutre, `gold` = primaire clair.
const btn: CSSProperties = { height: 32, padding: '0 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: '#E4E4E7', whiteSpace: 'nowrap' }
const gold: CSSProperties = { ...btn, background: '#EDEDEF', color: '#0A0A0B', border: '1px solid #EDEDEF' }
const inp: CSSProperties = { height: 32, padding: '0 10px', borderRadius: 6, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const lbl: CSSProperties = { fontSize: 12, fontWeight: 500, color: MUTED }
const seg: CSSProperties = { display: 'inline-flex', gap: 2, padding: 2, borderRadius: 7, background: '#111113', border: `1px solid ${EDGE}` }
const logBox: CSSProperties = { padding: 10, borderRadius: 6, background: '#0D0D0F', border: `1px solid ${EDGE}`, overflowY: 'auto', fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: '#A1A1AA', whiteSpace: 'pre-wrap' }

function H({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 7px', borderRadius: 4, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: GOLD, fontSize: 11, fontWeight: 500, marginBottom: 10 }}>✦ iRemoTech · Studio</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: INK }}>{title}</h1>
        {sub && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#A1A1AA', lineHeight: 1.55, maxWidth: 720 }}>{sub}</p>}
      </div>
      {right}
    </div>
  )
}
function Toggle({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, background: on ? 'rgba(255,255,255,0.03)' : 'transparent', border: `1px solid ${on ? 'rgba(255,255,255,0.12)' : EDGE}` }}>
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', width: 38, height: 22, padding: 2, borderRadius: 99, background: on ? GOLD : 'rgba(255,255,255,0.12)', transition: 'background .15s' }}>
        <span style={{ width: 18, height: 18, borderRadius: 99, background: '#fff' }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: INK }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>{sub}</span>}
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
  const [smsProvider, setSmsProvider] = useState<'5sim' | 'herosms' | 'smspool'>(() => { try { return (localStorage.getItem('sf-sms-provider') as '5sim' | 'herosms' | 'smspool') || '5sim' } catch { return '5sim' } })
  const [smspoolKey, setSmspoolKey] = useState(() => { try { return localStorage.getItem('sf-smspool-key') ?? '' } catch { return '' } })
  const [smspoolMax, setSmspoolMax] = useState('0.35')          // plafond prix SMSPool ($)
  const [smspoolPriceShown, setSmspoolPriceShown] = useState<string | null>(null)
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
      ? { label: /states/i, countryY: 0.37, simCountry: 'usa', operator: 'textnow', heroCountry: 187, smspoolCountry: 'United States', dial: '1', name: 'United States' }
      : { label: /kingdom/i, countryY: 0.29, simCountry: 'england', operator: 'any', heroCountry: 16, smspoolCountry: 'United Kingdom', dial: '44', name: 'United Kingdom' }

    // Fournisseur SMS actif (clé + fonctions unifiées buy/wait/finish/cancel). order.id peut être
    // un entier (HeroSMS/5sim) ou une chaîne (SMSPool : order_id alphanumérique).
    const usingHero = smsProvider === 'herosms'
    const usingPool = smsProvider === 'smspool'
    const smsKey = usingHero ? heroKey : usingPool ? smspoolKey : sim5Key
    const provName = usingHero ? 'HeroSMS' : usingPool ? 'SMSPool' : '5sim'
    const poolMax = (() => { const n = parseFloat(smspoolMax); return Number.isFinite(n) && n > 0 ? n : undefined })()
    // HeroSMS : prix choisi dans l'UI → palier exact ; sinon le PLUS CHER (pick 'high'). Opérateur
    // = CFG.operator (USA=textnow). SMSPool : achat au prix courant plafonné à « Prix max ».
    const buyNumber = () => usingHero
      ? herosmsBuy(heroKey, { country: CFG.heroCountry, service: 'ig', operator: CFG.operator, priceMin: heroPrice ?? 0.20, priceMax: heroPrice ?? 5.00, pick: 'high', onLog: (m: string) => push(m) })
      : usingPool
        ? smspoolBuy(smspoolKey, { country: CFG.smspoolCountry, service: 'Instagram', maxPrice: poolMax, onLog: (m: string) => push(m) })
        : fivesimBuy(sim5Key, { country: CFG.simCountry, operator: CFG.operator, product: 'instagram' })
    const waitCode = (id: string | number, maxMs: number) => usingHero
      ? herosmsWaitCode(heroKey, Number(id), { onLog: (m: string) => push(m), shouldStop: () => R.isCancelled(), maxMs })
      : usingPool
        ? smspoolWaitCode(smspoolKey, String(id), { onLog: (m: string) => push(m), shouldStop: () => R.isCancelled(), maxMs })
        : fivesimWaitCode(sim5Key, Number(id), { onLog: (m: string) => push(m), shouldStop: () => R.isCancelled(), maxMs })
    const cancelNum = (id: string | number) => usingHero ? herosmsCancel(heroKey, Number(id)) : usingPool ? smspoolCancel(smspoolKey, String(id)) : fivesimCancel(sim5Key, Number(id))
    const finishNum = (id: string | number) => usingHero ? herosmsFinish(heroKey, Number(id)) : usingPool ? smspoolFinish(smspoolKey, String(id)) : fivesimFinish(sim5Key, Number(id))

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
      let resultOrder: { id: string | number; phone: string; price?: number } | null = null
      let creds: { username: string; password: string; fullName: string } | undefined
      for (let cycle = 0; !success && !R.isCancelled(); cycle++) {
        if (cycle > 0) push(`${tag} 🔄 on recommence tout le cycle (essai ${cycle + 1})…`)
        let lastBeat = Date.now(); let stuck = false
        const wd = setInterval(() => { if (Date.now() - lastBeat > 60_000) stuck = true }, 3000)
        const chooks = { log: (m: string) => { push(`${tag} ${m}`); acctLog.push(m); lastBeat = Date.now() }, shouldStop: () => R.isCancelled() || stuck }
        let order: { id: string | number; phone: string; price?: number } | null = null
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
          // avant d'attendre le code. Si IG envoie par WhatsApp → forcer la bascule en SMS.
          await sleep(3000)
          await requestSmsIfWhatsApp(key, dev, chooks)
          const code = await waitCode(order.id, 60_000)
          if (!code) { push(`${tag} ⏱ pas de code sous 60s → fermeture d'Instagram, on recommence de 0`); await forceCloseForegroundApp(key, dev, chooks); continue }
          const okCode = await enterSmsCodeByVision(key, dev, code, chooks)
          try { await finishNum(order.id) } catch { /* noop */ }
          resultOrder = order; order = null // numéro consommé (finishNum) → plus d'annulation
          if (!okCode) { push(`${tag} ⚠ code non validé → on recommence de 0`); continue }
          const done = await completeSignupByVision(key, dev, chooks, { container: c })
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
          : <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>iRemoTech pas encore branché. Colle ta clé API dans <b style={{ color: INK, fontWeight: 600 }}>Phone Farm → ⚙</b>.</div>}
      </div>
    )
  }

  // Sélecteur téléphones + containers, INLINE sur chaque page (choisis et lance sans
  // changer d'onglet, façon GeeLark). Repliable pour gagner de la place.
  const phonePicker = (opts?: { manage?: boolean }) => (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setPhonesOpen(o => !o)}>
        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>📱 Téléphones & containers</span>
        <span style={{ fontSize: 11.5, fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: totalJobs ? GOLD : '#F87171', fontVariantNumeric: 'tabular-nums' }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {devices.map(d => {
              const on = sel.has(d.public_id)
              const list = conts[d.public_id] ?? []
              return (
                <button key={d.public_id} onClick={() => togglePhone(d.public_id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px', borderRadius: 6, cursor: 'pointer', background: on ? SEL_BG : FIELD_BG, color: on ? INK : '#A1A1AA', border: `1px solid ${on ? SEL_EDGE : FIELD_EDGE}`, fontSize: 13, fontWeight: 500 }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 14, height: 14, borderRadius: 4, background: on ? GOLD : 'transparent', color: '#0A0A0B', fontSize: 9.5, fontWeight: 600, border: on ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.18)' }}>{on ? '✓' : ''}</span>
                  {d.name ?? d.public_id}<span style={{ fontSize: 11.5, color: DIM, fontVariantNumeric: 'tabular-nums' }}>· {list.length}c</span>
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
              <div key={devId} style={{ marginTop: 10, padding: 12, borderRadius: 8, background: 'transparent', border: `1px solid ${EDGE}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>📱 {d?.name ?? devId}</span>
                  <span style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{picked.size}/{list.length}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button style={{ ...btn, height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => setSelConts(sc => ({ ...sc, [devId]: new Set(list) }))}>Tout</button>
                    <button style={{ ...btn, height: 28, padding: '0 10px', fontSize: 12 }} onClick={() => setSelConts(sc => ({ ...sc, [devId]: new Set() }))}>Aucun</button>
                  </span>
                </div>
                {list.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 9 }}>
                    {list.map(c => {
                      const cp = picked.has(c)
                      return (
                        <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 6px 0 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: cp ? SEL_BG : FIELD_BG, color: cp ? INK : '#A1A1AA', border: `1px solid ${cp ? SEL_EDGE : FIELD_EDGE}` }}>
                          <span onClick={() => toggleCont(devId, c)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'grid', placeItems: 'center', width: 14, height: 14, borderRadius: 4, background: cp ? GOLD : 'transparent', color: '#0A0A0B', fontSize: 9.5, fontWeight: 600, border: cp ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.18)' }}>{cp ? '✓' : ''}</span>
                            {c}
                          </span>
                          {opts?.manage && <span onClick={() => removeC(devId, c)} title="Retirer" style={{ cursor: 'pointer', color: DIM, fontWeight: 500, fontSize: 15, padding: '0 2px' }}>×</span>}
                        </span>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 7, maxWidth: 380 }}>
                  <input value={newC[devId] ?? ''} onChange={e => setNewC(v => ({ ...v, [devId]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addC(devId) }} placeholder="+ container (ex. 6, Default…)" style={{ ...inp, flex: 1, minWidth: 0 }} />
                  <button style={gold} onClick={() => addC(devId)}>Ajouter</button>
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
        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>Journal</span>
        {running && runId && <button style={{ ...btn, marginLeft: 'auto', background: 'rgba(239,68,68,0.08)', color: '#F87171', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => cancelRun(runId)}>■ Arrêter</button>}
        {!running && logs.length > 0 && <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => setLogs([])}>Effacer</button>}
      </div>
      <div style={{ ...logBox, maxHeight: 320 }}>{logs.join('\n') || 'En cours…'}</div>
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
        right={budget?.budget != null ? <span style={{ fontFamily: MONO, fontSize: 12, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{budget.remaining ?? '—'} / {budget.budget ?? '—'} actions</span> : undefined} />

      {/* Barre d'onglets (mode autonome ; en infra, la nav de gauche gère les onglets) */}
      {!onTab && (
        <div style={{ ...seg, display: 'flex', flexWrap: 'wrap', width: 'fit-content', maxWidth: '100%', marginBottom: 16 }}>
          {TABS.map(t => {
            const on = curTab === t.k
            return (
              <button key={t.k} onClick={() => goTab(t.k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px', borderRadius: 5, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: on ? 'rgba(255,255,255,0.08)' : 'transparent', color: on ? INK : MUTED, border: 'none' }}>
                <span>{t.icon}</span>{t.label}
                {t.k === 'phones' && totalJobs > 0 && <span style={{ fontSize: 11, fontWeight: 500, padding: '0 6px', borderRadius: 4, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{totalJobs}</span>}
              </button>
            )
          })}
        </div>
      )}

      {err &&<div style={{ ...card, color: '#F87171', fontSize: 13, textAlign: 'center' }}>{err}</div>}
      {loading && <div style={{ ...card, color: MUTED, fontSize: 13, textAlign: 'center' }}>Connexion à iRemoTech…</div>}

      {/* ─────────────── ONGLET TÉLÉPHONES (gestion complète) ─────────────── */}
      {curTab === 'phones' && (<>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: MUTED }}>Gère tes iPhones et leurs containers Crane. Tu peux aussi choisir/lancer directement depuis les onglets Posting, Story et Création de compte.</p>
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
          <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>🎬 Posting — Reels</div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED }}>Chaque container coché reçoit une vidéo tirée <b>au hasard</b> du pool et publie un Reel.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <button style={gold} onClick={() => setPicker('reel')}>+ Ajouter des vidéos</button>
            <span style={{ fontSize: 12, color: MUTED }}>{reelPool.length} vidéo(s) dans le pool</span>
            {reelPool.length > 0 && <button style={btn} onClick={() => setReelPool([])}>Vider</button>}
          </div>
          {reelPool.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {reelPool.map(v => (
                <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 5, fontSize: 12, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK }}>
                  🎞 {v.title.slice(0, 26)}
                  <span onClick={() => setReelPool(p => p.filter(x => x.id !== v.id))} title="Retirer" style={{ cursor: 'pointer', color: '#F87171', fontWeight: 500 }}>×</span>
                </span>
              ))}
            </div>
          )}
          <div style={{ ...lbl, margin: '0 0 6px' }}>Légendes (une par ligne, tirées au hasard)</div>
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
          <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>📸 Story — photo + lien</div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED }}>Chaque container reçoit une photo tirée au hasard, avec son lien sticker (CTA).</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <button style={gold} onClick={() => setPicker('story')}>+ Ajouter des photos</button>
            <span style={{ fontSize: 12, color: MUTED }}>{storyPool.length} photo(s) dans le pool</span>
            {storyPool.length > 0 && <button style={btn} onClick={() => setStoryPool([])}>Vider</button>}
          </div>
          {storyPool.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {storyPool.map(v => (
                <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 5, fontSize: 12, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK }}>
                  🖼 {v.title.slice(0, 26)}
                  <span onClick={() => setStoryPool(p => p.filter(x => x.id !== v.id))} title="Retirer" style={{ cursor: 'pointer', color: '#F87171', fontWeight: 500 }}>×</span>
                </span>
              ))}
            </div>
          )}
          <div style={{ ...lbl, margin: '0 0 6px' }}>Lien CTA par défaut</div>
          <input value={storyLink} onChange={e => setStoryLink(e.target.value)} placeholder="https://mon-lien.com" style={{ ...inp, width: '100%', height: 32, marginBottom: 12 }} />
          {totalJobs > 0 && (
            <>
              <div style={{ ...lbl, margin: '0 0 8px' }}>Lien par container (prioritaire sur le défaut)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[...sel].flatMap(dev => [...(selConts[dev] ?? [])].map(c => ({ dev, c }))).map(({ dev, c }) => (
                  <div key={`${dev}::${c}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ minWidth: 130, fontSize: 12.5, fontWeight: 500, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{devices.find(d => d.public_id === dev)?.name ?? dev} · {c}</span>
                    <input value={storyLinks[linkKey(dev, c)] ?? ''} onChange={e => setLink(dev, c, e.target.value)} placeholder={storyLink.trim() ? `défaut : ${storyLink.trim()}` : 'https://…'} style={{ ...inp, flex: 1, height: 32, fontSize: 12 }} />
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ ...lbl, margin: '14px 0 6px' }}>Textes sticker (une par ligne, au hasard — optionnel)</div>
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
          <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>🔥 Warm-up</div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED }}>Active chaque compte façon humaine (scroll Reels, regard, like…), un conteneur après l'autre, avec <b>rotation d'IP entre chaque</b> (mode avion).</p>

          <div style={{ ...lbl, marginBottom: 7 }}>Intensité</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {([['careful', 'Careful', '5–8 min · 2%'], ['balanced', 'Balanced', '8–12 min · 5%'], ['aggressive', 'Aggressive', '12–15 min · 12%'], ['custom', 'Custom', 'sur mesure']] as const).map(([k, l, sub]) => (
              <button key={k} onClick={() => setWPreset(k)} style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', background: wPreset === k ? SEL_BG : FIELD_BG, color: wPreset === k ? INK : '#A1A1AA', border: `1px solid ${wPreset === k ? SEL_EDGE : FIELD_EDGE}` }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{l}</span>
                <span style={{ fontSize: 11.5, color: MUTED }}>{sub}</span>
              </button>
            ))}
          </div>

          {wPreset === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: MUTED }}>Durée min (min)
                <input type="number" min={1} max={15} value={wDurMin} onChange={e => setWDurMin(+e.target.value)} style={{ ...inp, width: '100%', height: 32, marginTop: 4 }} /></label>
              <label style={{ fontSize: 12, color: MUTED }}>Durée max (min)
                <input type="number" min={1} max={15} value={wDurMax} onChange={e => setWDurMax(+e.target.value)} style={{ ...inp, width: '100%', height: 32, marginTop: 4 }} /></label>
              <label style={{ fontSize: 12, color: MUTED }}>Taux de like (%)
                <input type="number" min={0} max={100} value={wLikePct} onChange={e => setWLikePct(+e.target.value)} style={{ ...inp, width: '100%', height: 32, marginTop: 4 }} /></label>
              <label style={{ fontSize: 12, color: MUTED }}>Taux de comment (%)
                <input type="number" min={0} max={100} value={wCommentPct} onChange={e => setWCommentPct(+e.target.value)} style={{ ...inp, width: '100%', height: 32, marginTop: 4 }} /></label>
            </div>
          )}
          {wPreset === 'custom' && (
            <>
              <div style={{ ...lbl, margin: '10px 0 6px' }}>Commentaires (un par ligne, au hasard — laisse vide pour ne pas commenter)</div>
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
          <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 }}>🆕 Création de compte Instagram</div>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: MUTED }}>Ouvre IG sur chaque container « frais » (déconnecté) et crée un compte. Avec un token 5sim : numéro + code SMS automatiques.</p>

          <div style={{ ...lbl, marginBottom: 7 }}>Pays du numéro</div>
          <div style={{ ...seg, marginBottom: 14 }}>
            {(['uk', 'usa'] as const).map(k => (
              <button key={k} onClick={() => setAcctCountry(k)} style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: acctCountry === k ? 'rgba(255,255,255,0.08)' : 'transparent', color: acctCountry === k ? INK : MUTED }}>
                {k === 'uk' ? '🇬🇧 United Kingdom' : '🇺🇸 United States'}
              </button>
            ))}
          </div>

          <div style={{ ...lbl, marginBottom: 7 }}>Fournisseur de numéro</div>
          <div style={{ ...seg, marginBottom: 12 }}>
            {(['herosms', 'smspool', '5sim'] as const).map(p => (
              <button key={p} onClick={() => { setSmsProvider(p); try { localStorage.setItem('sf-sms-provider', p) } catch { /* noop */ } }} style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: smsProvider === p ? 'rgba(255,255,255,0.08)' : 'transparent', color: smsProvider === p ? INK : MUTED }}>
                {p === 'herosms' ? 'HeroSMS' : p === 'smspool' ? 'SMSPool' : '5sim'}
              </button>
            ))}
          </div>

          {smsProvider === 'herosms' ? (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={heroKey} onChange={e => { const v = e.target.value.trim(); setHeroKey(v); try { localStorage.setItem('sf-herosms-key', v) } catch { /* noop */ } }}
                placeholder="Token HeroSMS (numéro + code SMS auto)" type="password"
                style={{ ...inp, flex: 1 }} />
              <button style={{ ...btn, height: 32, padding: '0 14px' }} disabled={!heroKey || running}
                onClick={async () => {
                  setLogs(['🔑 Test d’authentification HeroSMS (matrice)…'])
                  const r = await herosmsProbe(heroKey)
                  for (const x of r.results) push(`${x.good ? '✅' : '✗'} ${x.label} — ${x.status} — ${x.snippet}`)
                  push(r.ok ? '➡️ Une combinaison marche — envoie-moi la ligne ✅.' : '➡️ Aucune combinaison acceptée — clé/compte à vérifier côté HeroSMS.')
                }}>Tester la clé</button>
            </div>
          ) : smsProvider === 'smspool' ? (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={smspoolKey} onChange={e => { const v = e.target.value.trim(); setSmspoolKey(v); try { localStorage.setItem('sf-smspool-key', v) } catch { /* noop */ } }}
                placeholder="Clé API SMSPool (numéro + code SMS auto)" type="password"
                style={{ ...inp, flex: 1 }} />
              <button style={{ ...btn, height: 32, padding: '0 14px' }} disabled={!smspoolKey || running}
                onClick={async () => {
                  setLogs(['🔑 Test de la clé SMSPool…'])
                  const r = await smspoolPing(smspoolKey)
                  push(r.ok ? `✅ Clé OK — solde ${r.balance ?? '?'}$` : `✗ ${r.error ?? 'clé refusée'}`)
                }}>Tester la clé</button>
            </div>
          ) : (
            <input value={sim5Key} onChange={e => { setSim5Key(e.target.value); try { localStorage.setItem('sf-5sim-key', e.target.value) } catch { /* noop */ } }}
              placeholder="Token 5sim (numéro + code SMS auto)" type="password"
              style={{ ...inp, width: '100%', height: 32, marginBottom: 8 }} />
          )}
          {smsProvider === 'smspool' && (
            <div style={{ marginTop: 10, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ ...lbl }}>Prix max $</span>
              <input value={smspoolMax} onChange={e => setSmspoolMax(e.target.value.replace(',', '.'))} inputMode="decimal"
                style={{ ...inp, width: 90, height: 32 }} placeholder="0.35" />
              <button style={{ ...btn, height: 30, padding: '0 12px' }} disabled={!smspoolKey}
                onClick={async () => {
                  setSmspoolPriceShown('…')
                  const p = await smspoolPrice(smspoolKey, acctCountry === 'usa' ? 'United States' : 'United Kingdom', 'Instagram')
                  setSmspoolPriceShown(p != null ? `${p}$` : 'indispo')
                }}>Prix actuel</button>
              {smspoolPriceShown && <span style={{ fontSize: 12, color: smspoolPriceShown === 'indispo' ? '#F87171' : '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>prix actuel : {smspoolPriceShown}</span>}
            </div>
          )}
          {smsProvider === 'herosms' && (
            <div style={{ marginTop: 10, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={{ ...lbl }}>Prix du numéro</span>
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
                <button onClick={() => setHeroPrice(null)} style={{ height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', background: heroPrice === null ? SEL_BG : FIELD_BG, border: `1px solid ${heroPrice === null ? SEL_EDGE : FIELD_EDGE}`, color: heroPrice === null ? INK : '#A1A1AA' }}>Auto (moins cher)</button>
                {heroOffers.filter(o => showAllPrices || o.price >= 0.20).map(o => (
                  <button key={o.price} onClick={() => setHeroPrice(o.price)} style={{ height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', background: heroPrice === o.price ? SEL_BG : FIELD_BG, border: `1px solid ${heroPrice === o.price ? SEL_EDGE : FIELD_EDGE}`, color: heroPrice === o.price ? INK : '#A1A1AA' }}>
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
            {(smsProvider === 'herosms' ? heroKey : smsProvider === 'smspool' ? smspoolKey : sim5Key)
              ? <>✓ {smsProvider === 'herosms' ? 'HeroSMS' : smsProvider === 'smspool' ? 'SMSPool' : '5sim'} branché : achète un numéro {acctCountry === 'usa' ? '🇺🇸' : '🇬🇧'}, le saisit, attend le SMS et rentre le code.</>
              : <>Sans token : le flow va jusqu'au choix du pays (test) puis s'arrête.</>}
          </p>
        </div>
        <OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} accountMode />
        <LaunchBar label={(smsProvider === 'herosms' ? heroKey : smsProvider === 'smspool' ? smspoolKey : sim5Key) ? `Créer ${totalJobs} compte(s)` : `Tester le flow (${totalJobs})`} disabled={!totalJobs || running} running={running} onClick={createAccounts} />
        <LogPanel />
        {createdAccts.length > 0 && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>✅ Comptes créés ({createdAccts.length})</span>
              <button style={{ ...btn, marginLeft: 'auto', height: 28 }} onClick={() => { const t = createdAccts.map(a => `${a.username ?? '?'}\t${a.password ?? ''}\t${a.phone ?? ''}\t${a.deviceName ?? a.device}·${a.container}`).join('\n'); try { navigator.clipboard.writeText(t) } catch { /* noop */ } }}>Copier tout</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {createdAccts.map(a => (
                <div key={a.at} style={{ padding: 10, borderRadius: 6, background: 'transparent', border: `1px solid ${a.ok ? EDGE : 'rgba(248,113,113,0.25)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: a.ok ? INK : '#F87171' }}>@{a.username ?? '—'}</span>
                    <span style={{ fontSize: 12, color: MUTED }}>{a.deviceName ?? a.device} · {a.container}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: DIM, fontVariantNumeric: 'tabular-nums' }}>{a.country}{a.price != null ? ` · ${a.price}$` : ''}</span>
                    <button onClick={() => { removeCreatedAccount(a.at); setCreatedAccts(loadCreatedAccounts()) }} title="Retirer" style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#F87171', fontWeight: 500, fontSize: 15 }}>×</button>
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: MONO, fontSize: 11, color: INK }}>
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
        // Format compact « username:password » (collé) pour copier-coller / import en masse.
        const line = (a: CreatedAccount) => `${a.username ?? ''}:${a.password ?? ''}`
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
              <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>👤 Comptes créés</div>
              <div style={{ display: 'flex', gap: 14, marginLeft: 'auto', fontSize: 12 }}>
                <span style={{ color: MUTED }}>Total <b style={{ color: INK }}>{createdAccts.length}</b></span>
                <span style={{ color: '#4ADE80' }}>Réussis <b>{okN}</b></span>
                <span style={{ color: '#F87171' }}>Échoués <b>{koN}</b></span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={acctSearch} onChange={e => setAcctSearch(e.target.value)} placeholder="Rechercher (username, numéro, conteneur, téléphone…)" style={{ ...inp, flex: 1, minWidth: 220 }} />
              <div style={{ ...seg }}>
                {([['all', 'Tous'], ['ok', 'Réussis'], ['ko', 'Échoués']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setAcctFilter(k)} style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: acctFilter === k ? 'rgba(255,255,255,0.08)' : 'transparent', color: acctFilter === k ? INK : MUTED }}>{l}</button>
                ))}
              </div>
            </div>
            {createdAccts.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button style={{ ...btn, height: 32 }} onClick={copyAll}>Copier tout ({filtered.length})</button>
                <button style={{ ...btn, height: 32 }} onClick={exportCsv}>Exporter CSV</button>
                <button style={{ ...btn, height: 32, background: 'rgba(239,68,68,0.08)', color: '#F87171', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => { if (window.confirm('Vider TOUS les comptes enregistrés ? (irréversible)')) { clearCreatedAccounts(); setCreatedAccts([]) } }}>Vider</button>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>
              {createdAccts.length === 0 ? 'Aucun compte créé pour l’instant — lance une création dans l’onglet « Création de compte ».' : 'Aucun compte ne correspond à ta recherche.'}
            </div>
          ) : (() => {
            const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 500, color: DIM, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }
            const td: React.CSSProperties = { height: 46, padding: '0 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle', whiteSpace: 'nowrap' }
            return (
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={th}>username:password</th>
                      <th style={th}>Statut</th>
                      <th style={th}>Téléphone · Conteneur</th>
                      <th style={th}>Date</th>
                      <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => (
                      <Fragment key={a.at}>
                        <tr>
                          <td style={{ ...td, fontFamily: MONO, fontSize: 12.5, color: INK, cursor: 'pointer' }} title="Cliquer pour copier"
                            onClick={() => { try { navigator.clipboard.writeText(line(a)) } catch { /* noop */ } }}>
                            {(a.username ?? '?')}<span style={{ color: DIM }}>:</span>{(a.password ?? '?')}
                          </td>
                          <td style={td}><span style={{ fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: a.ok ? '#4ADE80' : '#F87171' }}>{a.ok ? 'CRÉÉ' : 'ÉCHEC'}</span></td>
                          <td style={{ ...td, fontSize: 12, color: MUTED }}>{a.deviceName ?? a.device} · {a.container}</td>
                          <td style={{ ...td, fontSize: 12, color: DIM, fontVariantNumeric: 'tabular-nums' }}>{fmt(a.at)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button style={{ ...btn, height: 26, fontSize: 11, padding: '0 10px' }} onClick={() => { try { navigator.clipboard.writeText(line(a)) } catch { /* noop */ } }}>Copier</button>
                              {a.log && a.log.length > 0 && <button style={{ ...btn, height: 26, fontSize: 11, padding: '0 10px' }} onClick={() => setAcctLogOpen(acctLogOpen === a.at ? null : a.at)}>Log</button>}
                              <button style={{ ...btn, height: 26, fontSize: 11, padding: '0 10px', background: 'rgba(239,68,68,0.08)', color: '#F87171', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => { removeCreatedAccount(a.at); setCreatedAccts(loadCreatedAccounts()) }}>×</button>
                            </div>
                          </td>
                        </tr>
                        {acctLogOpen === a.at && a.log && (
                          <tr>
                            <td colSpan={5} style={{ padding: '0 14px 10px' }}>
                              <div style={{ ...logBox, maxHeight: 240 }}>{a.log.join('\n')}</div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
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
      <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 12 }}>Options</div>
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
      <button style={{ ...gold, height: 32, padding: '0 16px', opacity: disabled ? 0.4 : 1 }} disabled={disabled} onClick={onClick}>
        {running ? 'En cours…' : label}
      </button>
    </div>
  )
}
