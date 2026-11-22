// ── iRemoTech — Studio d'automatisation (vrais iPhones) ──────────────────────
// Chaque onglet suit les mêmes étapes numérotées : 1 · Où ? (cartes iPhones + containers, « Détecter »)
// → 2 · Quoi ? (contenu / numéro) → n · Lancer (résumé, options, bouton), puis une progression par container.
//   • Téléphones : choisir les iPhones + gérer/cocher leurs containers Crane
//   • Posting    : pool de vidéos → chaque container publie un Reel (vision)
//   • Story      : pool de photos + lien CTA par container → Story (vision)
//   • Compte     : création de compte IG (pays UK/USA + numéro/SMS 5sim)
// La sélection téléphones/containers est PARTAGÉE entre les onglets.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { OrgState } from '@/lib/data'
import { useIremotech, listDevices, fetchUsage, uploadMedia, isDeviceOn, deviceLabel, launchAutomation, type IrtDevice, type IrtUsage } from '@/lib/iremotech'
import { selectContainerByVision, openTargetByVision, detectAccountsByVision, sameUsername, postReelByVision, postStoryByVision, postCarouselByVision, CAROUSEL_MAX, disableAutoCorrect, airplaneReset, warmupEditsByVision, recalibrateTouch, createInstagramAccountByVision, isSignupScreen, detectContainersByVision, enterSmsCodeByVision, warmupByVision, completeSignupByVision, requestSmsIfWhatsApp, forceCloseForegroundApp, logoutToSignupByVision, containerAccountByVision } from '@/lib/iremotechVision'
import { addCreatedAccount, loadCreatedAccounts, removeCreatedAccount, clearCreatedAccounts, type CreatedAccount } from '@/lib/irtCreatedAccounts'
import { addWarmupSession } from '@/lib/irtWarmupHistory'
import { loadContStates, setContState, containersToFill, type ContStateMap } from '@/lib/irtContState'
import { fivesimBuy, fivesimWaitCode, fivesimFinish, fivesimCancel, localPhone } from '@/lib/fivesim'
import { herosmsBuy, herosmsWaitCode, herosmsFinish, herosmsCancel, herosmsPing, herosmsProbe, herosmsOffers } from '@/lib/herosms'
import { smspoolBuy, smspoolWaitCode, smspoolFinish, smspoolCancel, smspoolPing, smspoolPrice } from '@/lib/smspool'
import IrtAccounts from '@/components/IrtAccounts'
import { isJunkUsername, deviceAccounts, irtScannedAccounts, reconcileWithIrt, autoChecksFor } from '@/lib/irtAccounts'
import { setVisionBrain } from '@/lib/visionBrain'
import { MARKETS, DEFAULT_PROMPTS, marketPrompt, saveMarketPrompt, generateMarketCaptions, loadTargetMarket, saveTargetMarket, countByMarket, pickCity, type Market } from '@/lib/captionMarkets'
import { useConnections } from '@/lib/connections'
import { listJobs, type IrtJob } from '@/lib/iremotech'
import { loadDevContainers, saveDevContainers, addDevContainer, removeDevContainer, loadStoryLink, saveStoryLink, setContainerScope, pullContainers, subscribeContainers } from '@/lib/irtContainers'
import { startRun, cancelRun } from '@/lib/runStore'
import { folderMedia, loadBankSummary, type BankSummary } from '@/lib/flowEngine'
import BankPicker, { type PickerResult } from '@/components/BankPicker'
import { themeFor } from '@/lib/theme'
import { confirmDialog, toast } from '@/lib/ui'
import IrtKeyForm from '@/components/IrtKeyForm'
import { UnderlineTabs } from '@/components/Kit'

const BLOW_THEME = themeFor('blowsome')

// Style « SaaS épuré » : surfaces plates neutres ; l'or iRemoTech reste un accent discret
// (sélection, cases cochées, interrupteurs, petites pastilles).
const GOLD = '#E9C46A', INK = '#EDEDEF', MUTED = '#8B8B94', DIM = '#7C7C86'
const EDGE = 'rgba(255,255,255,0.07)', FIELD_EDGE = 'rgba(255,255,255,0.09)', FIELD_BG = '#161618'
const MONO = "'JetBrains Mono',monospace"
const SEL_BG = 'rgba(255,255,255,0.07)', SEL_EDGE = 'rgba(233,196,106,0.45)'
type VidRef = { id: string; title: string; storage_path: string | null; file_url: string | null; used_count?: number }
export type IrtTab = 'home' | 'phones' | 'igaccounts' | 'posting' | 'story' | 'warmup' | 'account' | 'comptes'

const card: CSSProperties = { background: '#111113', border: `1px solid ${EDGE}`, borderRadius: 8, padding: 16, marginBottom: 12 }
// Boutons alignés sur <Btn> (lib/ui) : ghost = bordé neutre, `gold` = primaire clair.
const btn: CSSProperties = { height: 32, padding: '0 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: '#E4E4E7', whiteSpace: 'nowrap' }
const gold: CSSProperties = { ...btn, background: '#EDEDEF', color: '#0A0A0B', border: '1px solid #EDEDEF' }
const inp: CSSProperties = { height: 32, padding: '0 10px', borderRadius: 6, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const lbl: CSSProperties = { fontSize: 12, fontWeight: 500, color: MUTED }
const seg: CSSProperties = { display: 'inline-flex', gap: 2, padding: 2, borderRadius: 7, background: '#111113', border: `1px solid ${EDGE}` }
const pill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 11px', borderRadius: 99, background: '#141416', border: `1px solid ${EDGE}`, fontSize: 12.5, color: '#C4C4CC', fontVariantNumeric: 'tabular-nums' }
const logBox: CSSProperties = { padding: 10, borderRadius: 6, background: '#0D0D0F', border: `1px solid ${EDGE}`, overflowY: 'auto', fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: '#A1A1AA', whiteSpace: 'pre-wrap' }

/** Lignes de progression tirées du journal : `[iPhone·container] message` → statut + dernière étape. */
export function progressRows(logs: string[]): { tag: string; state: 'run' | 'ok' | 'fail' | 'skip'; last: string }[] {
  const m = new Map<string, { state: 'run' | 'ok' | 'fail' | 'skip'; last: string }>()
  for (const raw of logs) {
    const line = raw.replace(/^\n+/, '')
    const t = line.match(/^\[([^\]]+)\]\s*(.*)$/)
    if (!t) continue
    const [, tag, msg] = t
    const retry = /nouvel essai|on recommence|→ page suivante/i.test(msg)
    const state = retry ? 'run' : /✅|✓/.test(msg) ? 'ok' : /⏭.*(passé|déjà connecté)/i.test(msg) ? 'skip' : /✗|❌/.test(msg) ? 'fail' : (m.get(tag)?.state === 'run' || !m.has(tag) ? 'run' : m.get(tag)!.state)
    m.set(tag, { state, last: msg.replace(/^[^\p{L}\d«(]+/u, '').slice(0, 140) })
  }
  return [...m.entries()].map(([tag, v]) => ({ tag, ...v }))
}

function H({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 7px', borderRadius: 4, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: GOLD, fontSize: 11.5, fontWeight: 600, marginBottom: 10 }}>iRemoTech · Studio</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 3.2vw, 38px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: '#F4F4F5' }}>{title}</h1>
        {sub && <p style={{ margin: '8px 0 0', fontSize: 14.5, color: '#8B8B94', lineHeight: 1.5, maxWidth: 720 }}>{sub}</p>}
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
  setContainerScope(currentOrg?.id ?? null, user.id)   // containers partagés de l'espace courant
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
  const [photoPool, setPhotoPool] = useState<VidRef[]>([]) // pool photos (Posting › Carrousel)
  const [picker, setPicker] = useState<null | 'reel' | 'story' | 'photo'>(null)
  // Posting : Reel (vidéo) ou Carrousel photo (post feed de N photos)
  // Posting = un seul onglet, sous-onglets Reels / Carrousel / Story CTA (comme le Posting GeeLark)
  const [storySub, setStorySub] = useState(false)
  const [postType, setPostTypeS] = useState<'reel' | 'carousel'>(() => { try { return localStorage.getItem('sf-irt-post-type') === 'carousel' ? 'carousel' : 'reel' } catch { return 'reel' } })
  const setPostType = (v: 'reel' | 'carousel') => { setPostTypeS(v); try { localStorage.setItem('sf-irt-post-type', v) } catch { /* ignore */ } }
  const [carCount, setCarCountS] = useState<number>(() => { try { const n = Number(localStorage.getItem('sf-irt-car-count')); return n >= 2 && n <= CAROUSEL_MAX ? n : 3 } catch { return 3 } })
  const setCarCount = (n: number) => { setCarCountS(n); try { localStorage.setItem('sf-irt-car-count', String(n)) } catch { /* ignore */ } }
  const [carMusic, setCarMusicS] = useState<boolean>(() => { try { return localStorage.getItem('sf-irt-car-music') !== '0' } catch { return true } })
  const setCarMusic = (v: boolean) => { setCarMusicS(v); try { localStorage.setItem('sf-irt-car-music', v ? '1' : '0') } catch { /* ignore */ } }
  // Source des médias : choix à la main (pool) ou un DOSSIER de la Banque, lu au lancement
  // (les vidéos ajoutées depuis sont prises). Retenu par onglet.
  type Src = { mode: 'pick' | 'folder'; folder: string }
  type SrcKey = 'reel' | 'story' | 'photo'
  const loadSrc = (k: SrcKey): Src => {
    try { const v = JSON.parse(localStorage.getItem(`sf-irt-src-${k}`) ?? 'null'); if (v && (v.mode === 'pick' || v.mode === 'folder')) return { mode: v.mode, folder: String(v.folder ?? '') } } catch { /* ignore */ }
    return { mode: 'pick', folder: '' }
  }
  const [reelSrc, setReelSrc] = useState<Src>(() => loadSrc('reel'))
  const [storySrc, setStorySrc] = useState<Src>(() => loadSrc('story'))
  const [photoSrc, setPhotoSrc] = useState<Src>(() => loadSrc('photo'))
  const setSrc = (k: SrcKey, v: Src) => { (k === 'story' ? setStorySrc : k === 'photo' ? setPhotoSrc : setReelSrc)(v); try { localStorage.setItem(`sf-irt-src-${k}`, JSON.stringify(v)) } catch { /* ignore */ } }
  const [bankSum, setBankSum] = useState<BankSummary | null>(null)
  const [captionPool, setCaptionPool] = useState('')
  // Description : mes légendes (une par ligne) OU générées par l'IA selon le marché (prompt FR / US / DE)
  const [capMode, setCapMode] = useState<'pool' | 'ai'>(() => { try { return localStorage.getItem('sf-irt-cap-mode') === 'ai' ? 'ai' : 'pool' } catch { return 'pool' } })
  const [capMarket, setCapMarket] = useState<Market>(() => { try { const v = localStorage.getItem('sf-irt-cap-market'); return v === 'us' || v === 'de' ? v : 'fr' } catch { return 'fr' } })
  const [capPreview, setCapPreview] = useState<string[]>([])
  const [capBusy, setCapBusy] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  // localisation selon le marché du compte (une grande ville du pays, au hasard) sur les Reels / carrousels
  // Session de publication par iPhone : N posts max, et au moins X min entre deux posts passées à scroller
  // (enchaîner les posts sans activité = comportement de robot)
  const [sessMax, setSessMax] = useState(() => { try { return Math.max(1, Math.min(50, Number(localStorage.getItem('sf-irt-sess-max')) || 8)) } catch { return 8 } })
  const [gapMin, setGapMin] = useState(() => { try { return Math.max(1, Math.min(30, Number(localStorage.getItem('sf-irt-gap-min')) || 1)) } catch { return 1 } })
  const [gapScroll, setGapScroll] = useState(() => { try { return localStorage.getItem('sf-irt-gap-scroll') !== '0' } catch { return true } })
  const [capLocation, setCapLocation] = useState(() => { try { return localStorage.getItem('sf-irt-cap-location') !== '0' } catch { return true } })
  // marché de chaque compte (`${dev}::${cible}`) ; absent = marché par défaut (capMarket)
  const [targetMarkets, setTargetMarkets] = useState<Record<string, Market | null>>({})
  const marketOf = (dev: string, c: string): Market => targetMarkets[`${dev}::${c}`] ?? loadTargetMarket(dev, c) ?? capMarket
  const setTargetMarket = (dev: string, c: string, m: Market | null) => { saveTargetMarket(dev, c, m); setTargetMarkets(t => ({ ...t, [`${dev}::${c}`]: m })) }
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
  const [smspoolMax, setSmspoolMax] = useState('1')             // plafond prix SMSPool ($) — USA ≈ 0,42 $
  const [smspoolPriceShown, setSmspoolPriceShown] = useState<string | null>(null)
  const [acctCountry, setAcctCountry] = useState<'uk' | 'usa'>('usa')
  // création « tout auto » : détecter les containers des iPhones choisis puis remplir ceux sans compte
  const [autoDetect, setAutoDetect] = useState(() => { try { return localStorage.getItem('sf-irt-auto-detect') !== '0' } catch { return true } })
  const [detecting, setDetecting] = useState<string | null>(null)
  // essais max par container avant de passer au suivant (le numéro d'un essai raté est annulé → remboursé)
  const [acctTries, setAcctTries] = useState(() => { try { return Math.max(1, Math.min(10, Number(localStorage.getItem('sf-irt-acct-tries')) || 3)) } catch { return 3 } })
  // Boucle (iPhones JB) : dans un container, compte créé → déconnexion → nouveau compte, avec garde-fous
  const lsNum = (k: string, d: number, lo: number, hi: number) => { try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v >= lo && v <= hi && localStorage.getItem(k) !== null ? v : d } catch { return d } }
  const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* noop */ } }
  const [acctLoop, setAcctLoop] = useState(() => { try { return localStorage.getItem('sf-irt-acct-loop') === '1' } catch { return false } })
  const [loopMax, setLoopMax] = useState(() => lsNum('sf-irt-loop-max', 3, 1, 20))           // comptes max par container
  const [loopPause, setLoopPause] = useState(() => lsNum('sf-irt-loop-pause', 5, 1, 60))     // minutes entre deux comptes
  const [loopBudget, setLoopBudget] = useState(() => { try { return localStorage.getItem('sf-irt-loop-budget') ?? '' } catch { return '' } }) // $ max de numéros
  const [loopLogoutExisting, setLoopLogoutExisting] = useState(() => { try { return localStorage.getItem('sf-irt-loop-logout-existing') === '1' } catch { return false } })
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
  const [contStates, setContStates] = useState<ContStateMap>(() => loadContStates()) // ce qu'il y a VRAIMENT dans chaque container (lu à l'écran)
  const [checking, setChecking] = useState(false)
  const [acctSearch, setAcctSearch] = useState('')
  const [acctFilter, setAcctFilter] = useState<'all' | 'ok' | 'ko'>('all')
  const [acctLogOpen, setAcctLogOpen] = useState<number | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [pickQ, setPickQ] = useState('')
  const [irtJobs, setIrtJobs] = useState<Record<string, IrtJob[]>>({})
  // Cerveau vision des automatisations = clé Groq de l'espace (Réglages › IA)
  const conns = useConnections(user, org)
  useEffect(() => { setVisionBrain(conns.groq) }, [conns.groq])
  const [showEmptyPhones, setShowEmptyPhones] = useState(false)
  const [importText, setImportText] = useState('')
  const [showLog, setShowLog] = useState(false)   // journal détaillé déplié
  const [keyOpen, setKeyOpen] = useState(false)   // formulaire de la clé iRemoTech

  const [running, setRunning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  // iPhones + containers. `quiet` = actualisation automatique (pas d'écran de chargement).
  // Les containers viennent de Supabase (partagés dans l'agence) ; null = SQL pas passé.
  const [syncOff, setSyncOff] = useState(false)
  const load = useCallback((quiet = false) => {
    if (!irt.key) return
    if (!quiet) { setLoading(true); setErr(null) }
    Promise.all([listDevices(irt.key), quiet ? Promise.resolve(undefined) : fetchUsage(irt.key)])
      .then(async ([d, u]) => {
        setDevices(d); if (u !== undefined) setUsage(u)
        const remote = await pullContainers(d.map(x => x.public_id)).catch(() => null)
        setSyncOff(remote === null)
        const c: Record<string, string[]> = {}
        const sl: Record<string, string> = {}
        for (const dev of d) {
          const list = remote?.[dev.public_id] ?? loadDevContainers(dev.public_id)
          c[dev.public_id] = list
          for (const name of list) { const v = loadStoryLink(dev.public_id, name); if (v) sl[`${dev.public_id}::${name}`] = v }
        }
        setConts(c); setStoryLinks(prev => quiet ? { ...sl, ...prev } : sl)
      })
      .catch(e => { if (!quiet) setErr(e instanceof Error ? e.message : 'Connexion iRemoTech échouée') })
      .finally(() => { if (!quiet) setLoading(false) })
  }, [irt.key, currentOrg?.id, user.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  // TEMPS RÉEL : containers modifiés ailleurs (autre PC, autre membre) → mis à jour aussitôt.
  useEffect(() => subscribeContainers((dev, list) => setConts(c => ({ ...c, [dev]: list }))), [currentOrg?.id, user.id])
  // Liste et état des iPhones actualisés toutes les 15 s (page visible), et au retour sur
  // l'onglet — en pause pendant une automatisation (débit iRemoTech réservé aux actions).
  const runningRef = useRef(false)
  runningRef.current = running
  useEffect(() => {
    if (!irt.key) return
    const tick = () => { if (document.visibilityState === 'visible' && !runningRef.current) load(true) }
    const t = setInterval(tick, 15_000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(t); window.removeEventListener('focus', tick) }
  }, [irt.key, load])
  const bankScope = { orgId: currentOrg?.id ?? null, userId: user.id }
  useEffect(() => {
    if ((curTab === 'posting' && !storySub && (postType === 'carousel' ? photoSrc : reelSrc).mode === 'folder') || ((curTab === 'story' || storySub) && storySrc.mode === 'folder'))
      loadBankSummary(bankScope).then(setBankSum).catch(() => setBankSum(null))
  }, [curTab, storySub, reelSrc.mode, storySrc.mode, photoSrc.mode, postType, currentOrg?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Après une publication réussie : +1 au compteur du média (« Jamais publiées » / tri
  // « Moins publiées » de la Banque ; le mode dossier prend ainsi des vidéos fraîches).
  async function bumpUsed(id: string) {
    try {
      const { data } = await supabase.from('content_bank').select('used_count').eq('id', id).maybeSingle()
      await supabase.from('content_bank').update({ used_count: ((data as { used_count: number | null } | null)?.used_count ?? 0) + 1 }).eq('id', id)
    } catch { /* best-effort */ }
  }
  // Choix de la source (à la main / dossier de la Banque) pour Posting et Story.
  const sourceRow = (k: SrcKey) => {
    const src = k === 'story' ? storySrc : k === 'photo' ? photoSrc : reelSrc
    const img = k !== 'reel'
    const folders = (bankSum?.folders ?? []).filter(f => (img ? f.image : f.video) > 0 || f.name === src.folder)
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'inline-flex', padding: 2, borderRadius: 7, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}` }}>
          {(['pick', 'folder'] as const).map(m => (
            <button key={m} type="button" onClick={() => setSrc(k, { ...src, mode: m })}
              style={{ height: 26, padding: '0 10px', borderRadius: 5, border: src.mode === m ? `1px solid ${SEL_EDGE}` : '1px solid transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: src.mode === m ? SEL_BG : 'transparent', color: src.mode === m ? INK : MUTED }}>
              {m === 'pick' ? 'À la main' : 'Dossier de la Banque'}
            </button>
          ))}
        </div>
        {src.mode === 'folder' && (
          <select value={src.folder} onChange={e => setSrc(k, { mode: 'folder', folder: e.target.value })} style={{ ...inp, height: 30, minWidth: 220, cursor: 'pointer' }}>
            <option value="" style={{ background: FIELD_BG }}>{bankSum ? 'Choisir un dossier…' : 'Chargement des dossiers…'}</option>
            {folders.map(f => <option key={f.name} value={f.name} data-no-tr style={{ background: FIELD_BG }}>{`${f.name} · ${img ? f.image : f.video}`}</option>)}
          </select>
        )}
      </div>
    )
  }

  const budget = usage?.actions ?? { remaining: usage?.remaining, budget: usage?.budget }

  const togglePhone = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) { n.delete(id); setSelConts(sc => ({ ...sc, [id]: new Set() })) } else { n.add(id); setSelConts(sc => ({ ...sc, [id]: new Set(conts[id] ?? []) })) } return n })
  // Faux comptes (« @e1notification », « @e3likesand4more »… = lignes sous un compte) : retirés et réenregistrés
  useEffect(() => {
    for (const [dev, list] of Object.entries(conts)) {
      const clean = list.filter(c => !(c.startsWith('@') && isJunkUsername(c)))
      if (clean.length !== list.length) {
        saveDevContainers(dev, clean); setConts(cc => ({ ...cc, [dev]: clean }))
        setSelConts(sc => sc[dev] ? { ...sc, [dev]: new Set([...sc[dev]].filter(c => clean.includes(c))) } : sc)
      }
    }
  }, [conts])
  // Comptes déjà lus par iRemoTech (list_accounts) → cibles « @nom » de l'iPhone, sans passer par la vision.
  // Corrige aussi les listes douteuses (faux « Jailbreak ») ; un jailbreak vérifié (« Default ») n'est jamais touché.
  useEffect(() => {
    for (const [dev, jobs] of Object.entries(irtJobs)) {
      const next = reconcileWithIrt(conts[dev] ?? [], irtScannedAccounts(jobs))
      if (!next) continue
      saveDevContainers(dev, next); setConts(c => ({ ...c, [dev]: next }))
      setSelConts(sc => sc[dev] ? { ...sc, [dev]: new Set([...sc[dev]].filter(c => next.includes(c))) } : sc)
    }
  }, [irtJobs]) // eslint-disable-line react-hooks/exhaustive-deps
  // Statut AUTOMATIQUE : ScaleFlow fait vérifier par iRemoTech (gratuit, 1 action du quota par lancement) la liste
  // des comptes de chaque iPhone et le statut de chaque compte, toutes les 24 h, puis l'affiche. L'API ne montre pas
  // les vérifications lancées depuis le tableau de bord iRemoTech : c'est la seule façon d'avoir le statut ici.
  // Jamais pendant une automatisation ScaleFlow (utiliser l'iPhone interromprait le job iRemoTech).
  const [autoStatus, setAutoStatus] = useState(() => { try { return localStorage.getItem('sf-irt-autostatus') !== '0' } catch { return true } })
  const jobsRef = useRef(irtJobs); jobsRef.current = irtJobs
  const contsRef = useRef(conts); contsRef.current = conts
  useEffect(() => {
    if (!irt.key || !autoStatus || !devices.length) return
    const key = irt.key
    let alive = true
    const tick = async () => {
      if (runningRef.current) return
      const left = usage?.actions?.remaining ?? usage?.remaining
      if (typeof left === 'number' && left < 50) return // quota d'actions presque épuisé : on garde le reste pour les publications
      for (const d of devices) {
        if (!alive || runningRef.current) return
        const dev = d.public_id
        if (phoneKind(contsRef.current[dev]) === 'jb') continue // jailbreak : iRemoTech ne voit que le container ouvert
        const jobs = jobsRef.current[dev]
        if (!jobs) continue
        const tk = `sf-irt-autostatus:${dev}`
        let tried: Record<string, number> = {}
        try { tried = JSON.parse(localStorage.getItem(tk) ?? '{}') } catch { /* noop */ }
        const known = (contsRef.current[dev] ?? []).filter(c => c.startsWith('@'))
        const plan = autoChecksFor(jobs, known, Date.now(), tried)
        const todo: { k: string; a: Parameters<typeof launchAutomation>[2] }[] = [
          ...(plan.scan ? [{ k: '#scan', a: { type: 'list_accounts' as const } }] : []),
          ...plan.accounts.slice(0, 8).map(u => ({ k: u, a: { type: 'account_status' as const, account: u } })),
        ]
        if (!todo.length) continue
        for (const t of todo) {
          if (!alive || runningRef.current) return
          await launchAutomation(key, dev, t.a).catch(() => null) // refus (compte inconnu, déjà en cours…) : réessayé dans 24 h
          tried[t.k] = Date.now()
          await sleep(7000) // ≤ 10 lancements / min / iPhone côté iRemoTech
        }
        try { localStorage.setItem(tk, JSON.stringify(tried)) } catch { /* noop */ }
        const fresh = await listJobs(key, dev, 100).catch(() => null)
        if (fresh && alive) setIrtJobs(m => ({ ...m, [dev]: fresh }))
      }
    }
    const first = setTimeout(() => void tick(), 45_000)
    const t = setInterval(() => void tick(), 15 * 60_000)
    return () => { alive = false; clearTimeout(first); clearInterval(t) }
  }, [irt.key, autoStatus, devices, usage]) // eslint-disable-line react-hooks/exhaustive-deps
  // Statut Instagram des comptes (historique iRemoTech) → « ! » rouge sur les comptes signalés
  useEffect(() => {
    if (!irt.key || !devices.length) return
    let alive = true
    const key = irt.key
    const pull = async () => { for (const d of devices) { if (!alive) return; const j = await listJobs(key, d.public_id, 100); if (alive) setIrtJobs(m => ({ ...m, [d.public_id]: j })); await sleep(150) } }
    void pull()
    const t = setInterval(() => void pull(), 120_000)
    return () => { alive = false; clearInterval(t) }
  }, [irt.key, devices.map(d => d.public_id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const flagOf = (dev: string, target: string): string[] | null => {
    if (!target.startsWith('@')) return null
    const a = deviceAccounts(irtJobs[dev] ?? []).accounts.find(x => x.username === target.slice(1).toLowerCase())
    return a?.health.level === 'warn' ? a.health.issues : null
  }

  // Détecte les containers Crane d'un iPhone (sélecteur lu à l'écran) et remplace sa liste.
  const detectConts = async (dev: string, log: (m: string) => void, stop?: () => boolean): Promise<string[] | null> => {
    if (!irt.key) return null
    const key = irt.key
    const readAccounts = async () => {
      const accts = await detectAccountsByVision(key, dev, { log, shouldStop: stop })
      // orthographe exacte reprise des « Comptes créés » quand l'OCR a mal lu un caractère (5↔s, 0↔o…)
      const known = loadCreatedAccounts().map(a => a.username).filter((u): u is string => !!u)
      return accts ? accts.map(u => '@' + (known.find(k => sameUsername(k, u)) ?? u)) : null
    }
    // Type déjà connu → directement la bonne méthode ; sinon (1re détection) containers Crane puis comptes.
    const kind = phoneKind(conts[dev])
    let list: string[] | null
    if (kind === 'normal') { log('📱 iPhone normal : lecture des comptes Instagram connectés…'); list = await readAccounts() }
    else {
      list = await detectContainersByVision(key, dev, { log, shouldStop: stop })
      if (!list) { log('↪ Pas de sélecteur Crane : iPhone normal → lecture des comptes Instagram connectés…'); list = await readAccounts() }
    }
    if (list?.length) { saveDevContainers(dev, list); setConts(c => ({ ...c, [dev]: list })); setSelConts(sc => ({ ...sc, [dev]: new Set(list) })) }
    return list
  }
  const detectOne = async (dev: string) => {
    if (running || detecting) return
    const name = (() => { const x = devices.find(d => d.public_id === dev); return x ? deviceLabel(x) : dev })()
    setDetecting(dev); setLogs([])
    const list = await detectConts(dev, m => push(`[${name}] ${m}`)).catch(e => { push(`[${name}] ⚠ ${e instanceof Error ? e.message : String(e)}`); return null })
    if (!list) push(`[${name}] ✗ ni containers ni comptes détectés`)
    setDetecting(null)
  }
  // Ouvre chaque container et lit ce qu'il contient VRAIMENT (vide / @compte / bloqué) : la liste « Comptes créés »
  // ne dit que ce que ScaleFlow a créé (un compte peut avoir été déconnecté ou ajouté à la main).
  const scanContainers = async (dev: string, list: string[], log: (m: string) => void, stop?: () => boolean): Promise<ContStateMap[string]> => {
    const key = irt.key
    const out: ContStateMap[string] = {}
    if (!key) return out
    const known = loadCreatedAccounts().map(a => a.username).filter((u): u is string => !!u)
    for (const c of list.filter(x => !x.startsWith('@'))) {
      if (stop?.()) break
      const look = () => containerAccountByVision(key, dev, c, known, { log: () => { /* détails masqués */ }, shouldStop: stop }).catch(() => ({ state: 'unknown' as const }))
      let r = await look()
      if (r.state === 'unknown' && !stop?.()) r = await look() // icône / profil mal lus une fois → 2e essai
      const all = setContState(dev, c, r); setContStates(all); out[c] = all[dev][c]
      log(`   container ${c} : ${r.state === 'account' ? `@${r.username ?? '?'}` : r.state === 'empty' ? 'vide' : r.state === 'blocked' ? '🤖 bloqué (vérification humaine)' : 'illisible'}`)
    }
    return out
  }
  const checkPhones = async () => {
    if (running || detecting || checking) return
    const devs = [...sel].filter(d => phoneKind(conts[d]) !== 'normal' && (conts[d] ?? []).length)
    if (!devs.length) { setLogs(['⚠ Choisis au moins un iPhone jailbreaké dont les containers sont détectés.']); return }
    setChecking(true); setLogs([])
    for (const dev of devs) {
      const name = (() => { const x = devices.find(d => d.public_id === dev); return x ? deviceLabel(x) : dev })()
      push(`🔎 [${name}] vérification des containers à l’écran…`)
      const r = await scanContainers(dev, conts[dev] ?? [], m => push(`[${name}]${m}`))
      const v = Object.values(r)
      push(`[${name}] ✔ ${v.filter(x => x.state === 'account').length} avec un compte · ${v.filter(x => x.state === 'empty').length} vide(s)${v.some(x => x.state === 'blocked') ? ` · ${v.filter(x => x.state === 'blocked').length} bloqué(s)` : ''}`)
    }
    setChecking(false)
  }
  const toggleCont = (dev: string, name: string) => {
    const cur = new Set(sel.has(dev) ? (selConts[dev] ?? []) : [])
    if (cur.has(name)) cur.delete(name); else cur.add(name)
    setSelConts(sc => ({ ...sc, [dev]: cur }))
    setSel(s => { const n = new Set(s); if (cur.size) n.add(dev); else n.delete(dev); return n })
  }
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
    const set = which === 'story' ? setStoryPool : which === 'photo' ? setPhotoPool : setReelPool
    set(p => { const ex = new Set(p.map(v => v.id)); return [...p, ...vids.filter(v => !ex.has(v.id))] })
  }
  function mediaFilename(v: VidRef, kind: 'reel' | 'story' | 'carousel'): string {
    const src = (v.storage_path ?? v.file_url ?? '').toLowerCase()
    const ext = (src.split('.').pop() || '').replace(/[^a-z0-9]/g, '')
    const good = ['mp4', 'mov', 'jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : (kind === 'reel' ? 'mp4' : 'jpg')
    return (v.title || 'media') + '.' + good
  }
  async function signedUrlFor(v: VidRef): Promise<string | undefined> {
    if (v.storage_path) { const { data } = await supabase.storage.from('content').createSignedUrl(v.storage_path, 3600); return data?.signedUrl ?? undefined }
    return v.file_url ?? undefined
  }

  // Container supprimé ailleurs (temps réel) → retiré de la sélection.
  useEffect(() => setSelConts(sc => {
    let changed = false
    const n: typeof sc = {}
    for (const [dev, set] of Object.entries(sc)) {
      const list = conts[dev]
      const ok = list ? new Set([...set].filter(c => list.includes(c))) : set
      if (ok.size !== set.size) changed = true
      n[dev] = ok
    }
    return changed ? n : sc
  }), [conts])
  const totalJobs = [...sel].reduce((n, d) => n + (selConts[d]?.size ?? 0), 0)
  const captions = captionPool.split('\n').map(s => s.trim()).filter(Boolean)
  const push = (m: string) => setLogs(l => [...l.slice(-600), m])
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // ── Posting (Reel) / Story — flow unifié ────────────────────────────────────
  async function run(kind: 'reel' | 'story' | 'carousel') {
    if (!irt.key || running) return
    const src = kind === 'story' ? storySrc : kind === 'carousel' ? photoSrc : reelSrc
    let pool: VidRef[] = kind === 'story' ? storyPool : kind === 'carousel' ? photoPool : reelPool
    const isImg = kind !== 'reel'
    const perPost = kind === 'carousel' ? carCount : 1
    if (totalJobs === 0) { setLogs(['⚠ Sélectionne au moins un container (onglet Téléphones).']); return }
    if (src.mode === 'folder' && !src.folder) { setLogs(['⚠ Choisis un dossier de la Banque.']); return }
    if (src.mode === 'pick' && pool.length === 0) { setLogs([`⚠ Ajoute au moins ${isImg ? 'une photo' : 'une vidéo'} au pool.`]); return }
    if (src.mode === 'pick' && pool.length < perPost) { setLogs([`⚠ Un carrousel de ${perPost} photos demande au moins ${perPost} photos dans le pool (${pool.length} actuellement).`]); return }
    if (kind === 'story') {
      const missing = [...sel].flatMap(dev => [...(selConts[dev] ?? [])].filter(c => !(storyLinks[linkKey(dev, c)] || storyLink.trim())))
      if (missing.length) { setLogs([`⚠ ${missing.length} container(s) sans lien CTA — mets un lien par container ou un lien par défaut.`]); return }
    }
    setRunning(true); setLogs([])
    const key = irt.key
    if (src.mode === 'folder') {
      try { pool = await folderMedia(bankScope, src.folder, isImg ? 'image' : 'video') }
      catch (e) { setLogs([`⚠ Banque : ${e instanceof Error ? e.message : String(e)}`]); setRunning(false); return }
      if (!pool.length) { setLogs([isImg ? `⚠ Le dossier « ${src.folder} » ne contient aucune photo.` : `⚠ Le dossier « ${src.folder} » ne contient aucune vidéo.`]); setRunning(false); return }
      if (pool.length < perPost) { setLogs([`⚠ Le dossier « ${src.folder} » n’a que ${pool.length} photo(s) : il en faut ${perPost} par carrousel.`]); setRunning(false); return }
    }

    const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[b[i], b[j]] = [b[j], b[i]] } return b }
    // Dossier : les MOINS publiées d'abord (au hasard entre égales), sans doublon tant que le
    // dossier n'est pas épuisé. Pool manuel : comme avant (Usage unique ou hasard).
    const byUse = () => shuffle(pool).sort((x, y) => (y.used_count ?? 0) - (x.used_count ?? 0))   // pop() → la moins publiée
    const queued = src.mode === 'folder' || uniqueUse
    let vidQueue = src.mode === 'folder' ? byUse() : uniqueUse ? shuffle(pool) : []
    let capQueue = uniqueUse ? shuffle(captions) : []
    // Description auto par marché : une description DIFFÉRENTE par publication, générée avant le lancement.
    // Chaque compte a son marché (FR / US / DE) → descriptions générées par marché, puis distribuées compte par compte.
    const aiCaps: Record<Market, string[]> = { fr: [], us: [], de: [] }
    if (kind !== 'story' && capMode === 'ai') {
      const need = countByMarket([...sel].flatMap(dev => [...(selConts[dev] ?? [])].map(c => marketOf(dev, c))), capMarket)
      for (const m of MARKETS.map(x => x.k)) {
        if (!need[m]) continue
        const label = MARKETS.find(x => x.k === m)?.label ?? m
        push(`✍️ Génération de ${need[m]} description(s) — ${label}…`)
        try { aiCaps[m] = shuffle(await generateMarketCaptions(conns.groq, m, need[m], msg => push(msg))) }
        catch (e) { push(`⚠ Descriptions ${label} : ${e instanceof Error ? e.message : String(e)} → rien n’est lancé.`); setRunning(false); return }
        if (aiCaps[m].length < need[m]) push(`⚠ ${label} : ${aiCaps[m].length} description(s) reçue(s) pour ${need[m]} publication(s), certaines seront réutilisées.`)
      }
    }
    const aiAll: Record<Market, string[]> = { fr: [...aiCaps.fr], us: [...aiCaps.us], de: [...aiCaps.de] }
    const pickVid = (): VidRef => { if (queued) { if (!vidQueue.length) vidQueue = src.mode === 'folder' ? byUse() : shuffle(pool); return vidQueue.pop()! } return pool[Math.floor(Math.random() * pool.length)] }
    // Carrousel : N photos DIFFÉRENTES par post (dans l'ordre du tirage)
    const pickSet = (n: number): VidRef[] => {
      const out: VidRef[] = []
      for (let guard = 0; out.length < n && guard < n * 20; guard++) { const v = pickVid(); if (!out.some(x => x.id === v.id)) out.push(v) }
      return out
    }
    const pickCap = (dev: string, c: string): string => {
      if (kind !== 'story' && capMode === 'ai') { const m = marketOf(dev, c); if (!aiCaps[m].length) aiCaps[m] = shuffle(aiAll[m]); return aiCaps[m].pop() ?? '' }
      if (!captions.length) return ''
      if (uniqueUse) { if (!capQueue.length) capQueue = shuffle(captions); return capQueue.pop()! }
      return captions[Math.floor(Math.random() * captions.length)]
    }

    const byPhone = [...sel].map(dev => ({
      dev,
      name: (() => { const x = devices.find(d => d.public_id === dev); return x ? deviceLabel(x) : dev })(),
      jobs: [...(selConts[dev] ?? [])].map(container => { const vids = pickSet(perPost); return { container, vid: vids[0], vids, caption: pickCap(dev, container), location: kind !== 'story' && capMode === 'ai' && capLocation ? pickCity(marketOf(dev, container)) : undefined, link: storyLinks[linkKey(dev, container)] || storyLink.trim() } }),
    })).filter(p => p.jobs.length)

    push(`▶ ${kind === 'story' ? 'Story' : kind === 'carousel' ? `Carrousel (${perPost} photos)` : 'Posting'} : ${byPhone.length} iPhone(s) · ${totalJobs} publication(s)${airplaneOn ? ' · rotation avion' : ''}${parallel ? ' · parallèle' : ' · série'}`)
    if (src.mode === 'folder') push(isImg ? `📁 « ${src.folder} » : ${pool.length} photo(s)` : `📁 « ${src.folder} » : ${pool.length} vidéo(s)`)
    const R = startRun('farm', `iRemoTech ${kind} · ${byPhone.length} tel × ${totalJobs}`, totalJobs)
    setRunId(R.id)

    const runPhone = async (p: typeof byPhone[number]) => {
      const tag = `[${p.name}]`
      const hooks = (m: string) => push(`${tag} ${m}`)
      await recalibrateTouch(key, p.dev, { log: hooks, shouldStop: () => R.isCancelled() })
      // Correction automatique du clavier iOS coupée une fois par iPhone (sinon légendes / textes français déformés)
      const acKey = `sf-irt-kbclean2-${p.dev}` // v2 : correction + majuscule automatiques
      let acDone = false
      try { acDone = localStorage.getItem(acKey) === '1' } catch { /* ignore */ }
      if (!acDone && await disableAutoCorrect(key, p.dev, { log: hooks, shouldStop: () => R.isCancelled() })) { try { localStorage.setItem(acKey, '1') } catch { /* ignore */ } }
      const sess = p.jobs.slice(0, sessMax)
      if (p.jobs.length > sess.length) push(`${tag} ⏭ session limitée à ${sessMax} post(s) : ${p.jobs.length - sess.length} compte(s) non publiés cette fois`)
      for (const [ji, job] of sess.entries()) {
        if (R.isCancelled()) break
        push(`\n${tag} 📦 container « ${job.container} » · ${job.vids.map(v => v.title).join(' + ')}`)
        if (airplaneOn) await airplaneReset(key, p.dev, { log: hooks, shouldStop: () => R.isCancelled() })
        // « @nom » = compte d'un iPhone non jailbreaké (bascule de compte) ; sinon container Crane (+ échauffement Edits)
        if (!job.container.startsWith('@')) await warmupEditsByVision(key, p.dev, job.container, { log: hooks, shouldStop: () => R.isCancelled() })
        const ok = await openTargetByVision(key, p.dev, job.container, { log: hooks, shouldStop: () => R.isCancelled() })
        if (!ok) { push(`${tag} ⏭ container « ${job.container} » non atteint → suivant`); R.tick(false); continue }
        await sleep(1200)
        // Entre deux posts : au moins `gapMin` min, passées à scroller sur CE compte (activité naturelle avant de poster)
        if (ji > 0) {
          const ms = gapMin * 60_000 * (1 + Math.random() * 0.3)
          if (gapScroll) {
            push(`${tag} 📱 ${Math.round(ms / 6000) / 10} min de scroll avant le post…`)
            try { await warmupByVision(key, p.dev, { minMs: ms, maxMs: ms, likeRate: 0.03, commentRate: 0 }, { log: () => { /* silencieux */ }, shouldStop: () => R.isCancelled() }) } catch { /* noop */ }
          } else { push(`${tag} ⏳ pause ${Math.round(ms / 6000) / 10} min avant le post…`); const end = Date.now() + ms; while (Date.now() < end && !R.isCancelled()) await sleep(1000) }
          if (R.isCancelled()) break
        }
        // Carrousel : photos injectées dans l'ordre INVERSE (la 1re du carrousel = la plus récente, pré-cochée n°1)
        let injected = true
        for (const [i, v] of [...job.vids].reverse().entries()) {
          const url = await signedUrlFor(v)
          if (!url) { injected = false; break }
          push(`${tag} ⬆ injection ${job.vids.length > 1 ? `de la photo ${job.vids.length - i}/${job.vids.length}` : 'du média'}…`)
          if (!await uploadMedia(key, p.dev, url, mediaFilename(v, kind))) { injected = false; break }
          if (job.vids.length > 1) await sleep(2500) // dates distinctes → ordre de la galerie garanti
        }
        if (!injected) { push(`${tag} ❌ média introuvable ou injection refusée → suivant`); R.tick(false); continue }
        push(`${tag} ⏳ 10 s (indexation)…`)
        await sleep(10000)
        const vh = { log: hooks, shouldStop: () => R.isCancelled() }
        const posted = kind === 'story'
          ? await postStoryByVision(key, p.dev, { link: job.link, caption: job.caption }, vh)
          : kind === 'carousel'
            ? await postCarouselByVision(key, p.dev, { count: job.vids.length, caption: job.caption, music: carMusic, location: job.location }, vh)
            : await postReelByVision(key, p.dev, { caption: job.caption, location: job.location }, vh)
        push(posted ? `${tag} ✅ « ${job.container} » publié` : `${tag} ⚠ « ${job.container} » interrompu`)
        if (posted) for (const v of job.vids) void bumpUsed(v.id)
        R.tick(posted)
      }
    }

    if (parallel) await Promise.all(byPhone.map(runPhone))
    else for (const p of byPhone) { if (R.isCancelled()) break; await runPhone(p) }
    R.finish()
    push(R.isCancelled() ? '⏹ Arrêté.' : '✔ Terminé — toutes les publications traitées.')
    setRunning(false); setRunId(null)
    void fetchUsage(key).then(u => { if (u) setUsage(u) }) // crédits iRemoTech restants à jour
  }

  // ── Création de compte (UK/USA + 5sim) ──────────────────────────────────────
  async function createAccounts() {
    const key = irt.key
    if (!key || running) return
    let jobs = [...sel].flatMap(dev => [...(selConts[dev] ?? new Set())].filter(c => !c.startsWith('@')).map(c => ({ dev, c })))
    if (!autoDetect && jobs.length === 0) { setLogs(['⚠ Coche au moins un container (onglet Téléphones).']); return }
    if (autoDetect && !sel.size) { setLogs(['⚠ Choisis au moins un iPhone.']); return }
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

    // Boucle : seulement avec un fournisseur SMS (sans numéro, le flow s'arrête au choix du pays).
    const loopOn = acctLoop && !!smsKey
    const perCont = loopOn ? loopMax : 1
    const budget = (() => { const n = parseFloat(loopBudget.replace(',', '.')); return loopOn && Number.isFinite(n) && n > 0 ? n : null })()
    let spent = 0 // $ des numéros consommés (les numéros annulés sont remboursés)
    setRunning(true); setLogs([])
    // Tout auto : on lit les containers de chaque iPhone, on VÉRIFIE à l'écran ce que chacun contient, puis on remplit les vides.
    if (autoDetect) {
      const next: { dev: string; c: string }[] = []
      for (const dev of sel) {
        const name = (() => { const x = devices.find(d => d.public_id === dev); return x ? deviceLabel(x) : dev })()
        push(`🔍 [${name}] détection des containers…`)
        const list = await detectConts(dev, m => push(`[${name}] ${m}`)).catch(() => null) ?? (conts[dev] ?? [])
        if (list.some(c => c.startsWith('@'))) { push(`[${name}] ⏭ iPhone non jailbreaké (comptes, pas de containers) : pas de création ici`); continue }
        // On VÉRIFIE à l'écran chaque container (pas la liste « Comptes créés », qui peut être périmée).
        push(`[${name}] 🔎 vérification à l’écran de ${list.length} container(s)…`)
        const seen = await scanContainers(dev, list, m => push(`[${name}]${m}`))
        const todo = containersToFill(list, seen, loopOn && loopLogoutExisting)
        push(`[${name}] ${list.length} container(s) : ${Object.values(seen).filter(x => x.state === 'account').length} avec un compte, ${Object.values(seen).filter(x => x.state === 'empty').length} vide(s) → ${todo.length} à remplir`)
        next.push(...todo.map(c => ({ dev, c })))
      }
      jobs = next
      if (!jobs.length) { push('✔ Rien à faire : tous les containers ont déjà un compte.'); setRunning(false); return }
    }
    const R = startRun('farm', `Création compte ${CFG.name} · ${jobs.length * perCont}`, jobs.length * perCont); setRunId(R.id)
    const byPhone = [...new Set(jobs.map(j => j.dev))].map(dev => ({ dev, conts: jobs.filter(j => j.dev === dev).map(j => j.c) }))
    push(`▶ Création de compte (${CFG.name})${smsKey ? ` + numéro ${provName}` : ' (test, sans numéro)'} : ${jobs.length} container(s) sur ${byPhone.length} iPhone(s)${parallel && byPhone.length > 1 ? ' · iPhones en parallèle' : ''} · ${acctTries} essai(s) max par container`)
    if (loopOn) push(`🔁 Boucle : jusqu’à ${loopMax} compte(s) par container (déconnexion entre chaque) · pause ~${loopPause} min${budget != null ? ` · budget numéros ${budget}$` : ''}${loopLogoutExisting ? ' · le compte déjà présent est aussi déconnecté' : ''} · arrêt de l’iPhone au 1er refus ou captcha`)
    const tally = { ok: 0, skip: 0, fail: 0 }

    // Un container : vérifie qu'il est vierge AVANT d'acheter un numéro, puis jusqu'à `acctTries` cycles complets.
    // logoutFirst : container déjà connecté → déconnexion puis « Create new account » (mode boucle).
    // halt : refus / captcha d'Instagram ou budget atteint → la boucle s'arrête sur cet iPhone.
    const createOne = async (dev: string, c: string, logoutFirst = false): Promise<{ r: 'ok' | 'skip' | 'fail'; halt?: 'captcha' | 'refused' | 'budget' }> => {
      const devName = (() => { const x = devices.find(d => d.public_id === dev); return x ? deviceLabel(x) : dev })()
      const tag = `[${devName}·${c}]`
      const acctLog: string[] = []
      const hooks = { log: (m: string) => { push(`${tag} ${m}`); acctLog.push(m) }, shouldStop: () => R.isCancelled() }
      // Sans numéro (test) : cycle unique.
      if (!smsKey) {
        await recalibrateTouch(key, dev, hooks)
        await airplaneReset(key, dev, hooks) // toujours : nouvelle IP avant CHAQUE container (création de comptes)
        const opened = await selectContainerByVision(key, dev, c, hooks)
        if (!opened) { push(`${tag} ⏭ container non atteint`); return { r: 'fail' } }
        await sleep(1500)
        const r = await createInstagramAccountByVision(key, dev, { countryLabel: CFG.label, countryY: CFG.countryY }, hooks)
        push(`${tag} ${r.ok ? '✓' : '✗'} étape: ${r.stage}`); return { r: r.ok ? 'ok' : 'fail' }
      }

      // Avec numéro : CYCLE COMPLET (container → vérif « vierge » → numéro → inscription entière), au plus
      // `acctTries` fois. Un WATCHDOG « bloqué > 60s » (aucun log de progression = écran figé) OU l'absence de
      // code sous 60s OU un échec d'étape → on ANNULE le numéro (remboursé) et on recommence de 0.
      let success = false
      let resultOrder: { id: string | number; phone: string; price?: number } | null = null
      let creds: { username: string; password: string; fullName: string } | undefined
      let halt: 'captcha' | 'refused' | 'budget' | undefined
      for (let cycle = 0; !success && cycle < acctTries && !R.isCancelled(); cycle++) {
        if (cycle > 0) push(`${tag} 🔄 nouvel essai (${cycle + 1}/${acctTries})…`)
        let lastBeat = Date.now(); let stuck = false
        const wd = setInterval(() => { if (Date.now() - lastBeat > 60_000) stuck = true }, 3000)
        const chooks = { log: (m: string) => { push(`${tag} ${m}`); acctLog.push(m); lastBeat = Date.now() }, shouldStop: () => R.isCancelled() || stuck }
        let order: { id: string | number; phone: string; price?: number } | null = null
        try {
          await recalibrateTouch(key, dev, chooks)
          await airplaneReset(key, dev, chooks) // toujours, avant chaque container
          const opened = await selectContainerByVision(key, dev, c, chooks)
          if (!opened) { push(`${tag} ⏭ container non atteint → nouvel essai`); continue }
          await sleep(1500)
          // Jamais de numéro acheté pour un container qui n'est pas sur l'écran d'inscription.
          if (!await isSignupScreen(key, dev, chooks)) {
            if (logoutFirst) {
              if (!await logoutToSignupByVision(key, dev, chooks)) { push(`${tag} ⚠ déconnexion / « Create new account » non abouti → nouvel essai`); continue }
            } else if (cycle === 0) { push(`${tag} ⏭ pas d'écran « Join Instagram » : container déjà connecté → passé (aucun numéro acheté)`); if (contStates[dev]?.[c]?.state !== 'account') setContStates(setContState(dev, c, { state: 'account' })); return { r: 'skip' } }
            else { push(`${tag} ⚠ écran d'inscription introuvable → nouvel essai`); continue }
          }
          if (budget != null && spent >= budget) { push(`${tag} 💰 budget numéros atteint (${spent.toFixed(2)}$ / ${budget}$) → arrêt`); halt = 'budget'; break }
          push(`${tag} 🛒 achat d'un numéro ${CFG.name} (${provName})…`)
          order = await buyNumber()
          push(`${tag} 📞 numéro : ${order.phone}${order.price != null ? ` · ${order.price}$` : ''}${usingHero && acctCountry === 'usa' ? ' · textnow' : ''}`)
          const num = localPhone(order.phone, CFG.dial)
          const r = await createInstagramAccountByVision(key, dev, { countryLabel: CFG.label, countryY: CFG.countryY, phoneNumber: num }, chooks)
          if (stuck) { push(`${tag} ⏱ bloqué > 60s → nouvel essai`); continue }
          if (r.stage !== 'number_submitted') { push(`${tag} ✗ échec avant SMS (étape ${r.stage}) → nouvel essai`); continue }
          // Numéro soumis : on laisse un peu de temps à IG (bascule écran code + envoi du SMS)
          // avant d'attendre le code. Si IG envoie par WhatsApp → forcer la bascule en SMS.
          await sleep(3000)
          await requestSmsIfWhatsApp(key, dev, chooks)
          const code = await waitCode(order.id, 60_000)
          if (!code) { push(`${tag} ⏱ pas de code sous 60s → fermeture d'Instagram, nouvel essai`); await forceCloseForegroundApp(key, dev, chooks); continue }
          const okCode = await enterSmsCodeByVision(key, dev, code, chooks)
          try { await finishNum(order.id) } catch { /* noop */ }
          spent += order.price ?? 0
          resultOrder = order; order = null // numéro consommé (finishNum) → plus d'annulation
          if (!okCode) { push(`${tag} ⚠ code non validé → nouvel essai`); continue }
          const done = await completeSignupByVision(key, dev, chooks, { container: c })
          creds = done.creds
          if (stuck) { push(`${tag} ⏱ bloqué > 60s pendant l'inscription → nouvel essai`); continue }
          if (done.ok) { success = true; push(`${tag} ✅ compte créé`) }
          else if (done.captcha) { push(`${tag} 🤖 vérification humaine demandée par Instagram (compte @${done.creds?.username ?? '?'} en attente) → container suivant`); halt = 'captcha'; break }
          else if (done.refused) { push(`${tag} ⛔ refus d'Instagram : pas de nouvel essai sur ce container (un autre numéro serait gaspillé) → container suivant`); halt = 'refused'; break }
          else push(`${tag} ⚠ inscription incomplète → nouvel essai`)
        } catch (e) {
          push(`${tag} ⚠ ${stuck ? 'bloqué > 60s' : (e instanceof Error ? e.message : String(e))} → nouvel essai`)
        } finally {
          clearInterval(wd)
          if (order) { try { await cancelNum(order.id) } catch { /* noop */ } } // numéro acheté non finalisé → annuler
        }
      }
      if (halt === 'budget') return { r: 'fail', halt }
      if (!success) push(`${tag} ✗ compte non créé${R.isCancelled() ? ' (arrêté)' : halt ? '' : ` après ${acctTries} essai(s) → container suivant`}`)
      // Enregistre le compte (identifiants + numéro + logs) → catégorie « Comptes créés ».
      addCreatedAccount({ at: Date.now(), device: dev, deviceName: devName, container: c, username: creds?.username, password: creds?.password, fullName: creds?.fullName, phone: resultOrder?.phone, provider: provName, price: resultOrder?.price, country: CFG.name, ok: success, log: acctLog })
      setCreatedAccts(loadCreatedAccounts())
      if (success) setContStates(setContState(dev, c, { state: 'account', username: creds?.username }))
      else if (halt === 'captcha') setContStates(setContState(dev, c, { state: 'blocked', username: creds?.username }))
      return { r: success ? 'ok' : 'fail', halt }
    }

    // Chaque iPhone enchaîne SES containers ; les iPhones tournent en même temps si « en parallèle ».
    let budgetHit = false
    const pause = async (min: number) => { const end = Date.now() + min * 60_000; while (Date.now() < end && !R.isCancelled()) await sleep(1000) }
    const runPhone = async (p: { dev: string; conts: string[] }) => {
      const devName = (() => { const x = devices.find(d => d.public_id === p.dev); return x ? deviceLabel(x) : p.dev })()
      phone: for (const c of p.conts) {
        for (let n = 0; n < perCont; n++) {
          if (R.isCancelled() || budgetHit) break phone
          if (n > 0) push(`[${devName}·${c}] 🔁 compte ${n + 1}/${perCont} dans ce container`)
          const { r, halt } = await createOne(p.dev, c, loopOn && (n > 0 || loopLogoutExisting))
          tally[r]++; R.tick(r !== 'fail')
          if (halt === 'budget') { budgetHit = true; break phone }
          if (halt) { push(`[${devName}] ⏹ ${halt === 'captcha' ? 'captcha' : 'refus'} d’Instagram : cet iPhone est repéré → boucle arrêtée sur cet iPhone`); break phone }
          if (r !== 'ok') break // container passé ou échec : on ne réessaie pas en boucle
          if (n < perCont - 1) {
            const m = Math.round(loopPause * (0.7 + Math.random() * 0.6) * 10) / 10
            push(`[${devName}·${c}] ⏳ pause ${m} min avant le compte suivant…`)
            await pause(m)
          }
        }
      }
    }
    if (parallel) await Promise.all(byPhone.map(runPhone))
    else for (const p of byPhone) { if (R.isCancelled()) break; await runPhone(p) }
    push(`\n📊 ${tally.ok} compte(s) créé(s) · ${tally.skip} container(s) déjà connecté(s) · ${tally.fail} échec(s)${loopOn ? ` · ${spent.toFixed(2)}$ de numéros` : ''}`)
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
      dev, name: (() => { const x = devices.find(d => d.public_id === dev); return x ? deviceLabel(x) : dev })(),
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
        const opened = await openTargetByVision(key, p.dev, c, hooks)
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
          : <div style={card}><div style={{ fontSize: 15, fontWeight: 700, color: INK, marginBottom: 10 }}>Relier iRemoTech</div><IrtKeyForm orgId={currentOrg?.id ?? null} userId={user.id} onSaved={irt.reload} /></div>}
      </div>
    )
  }

  // Étape 1 de chaque onglet : les iPhones en CARTES (statut, containers à cocher, Détecter/Tout/Aucun).
  // Cocher un iPhone coche tous ses containers ; on décoche ensuite ceux qu'on ne veut pas.
  const onlineN = devices.filter(isDeviceOn).length
  const phonePicker = (opts?: { manage?: boolean; jbOnly?: boolean }) => (
    <Step n={1} title="Où ?" sub={totalJobs ? `${sel.size} iPhone${sel.size > 1 ? 's' : ''} · ${targetsSummary([...sel].flatMap(d => [...(selConts[d] ?? [])]))} sélectionné(s)` : 'Choisis les iPhones et leurs comptes / containers'}
      right={<span style={{ display: 'flex', gap: 6 }}>
        <button style={{ ...btn, height: 28, fontSize: 12 }} onClick={() => setKeyOpen(o => !o)}>⚙ Clé iRemoTech</button>
        <button style={{ ...btn, height: 28, fontSize: 12 }} disabled={loading} title={`Clé iRemoTech utilisée : …${(irt.key ?? '').slice(-4)}`} onClick={() => load(false)}>{loading ? 'Actualisation…' : `↻ Actualiser (${devices.length})`}</button>
        <button style={{ ...btn, height: 28, fontSize: 12 }} disabled={!devices.length} onClick={() => { const on = devices.filter(isDeviceOn).map(d => d.public_id); setSel(new Set(on)); setSelConts(sc => { const n = { ...sc }; for (const id of on) n[id] = new Set(conts[id] ?? []); return n }) }}>Tous les iPhones en ligne</button>
        {sel.size > 0 && <button style={{ ...btn, height: 28, fontSize: 12 }} onClick={() => { setSel(new Set()); setSelConts({}) }}>Effacer</button>}
      </span>}>
      {keyOpen && <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: `1px solid ${EDGE}`, background: '#0E0E10' }}><IrtKeyForm orgId={currentOrg?.id ?? null} userId={user.id} current={irt.key} onSaved={() => { setKeyOpen(false); irt.reload() }} onCancel={() => setKeyOpen(false)} /></div>}
      {devices.length === 0 && !loading && <div style={{ fontSize: 13, color: MUTED }}>Aucun iPhone trouvé sur ta clé iRemoTech.</div>}
      <div style={{ marginBottom: 10, fontSize: 12, color: DIM }}>
        {devices.length} iPhone{devices.length > 1 ? 's' : ''} sur la clé iRemoTech <span data-no-tr style={{ fontFamily: MONO }}>…{(irt.key ?? '').slice(-4)}</span> · liste actualisée toutes les 15 s. Un iPhone manque ? Vérifie qu’il est rattaché à cette clé dans le tableau de bord iRemoTech (API Access), ou mets une clé plus récente avec « ⚙ Clé iRemoTech ».
      </div>
      {syncOff && devices.length > 0 && (
        <div style={{ marginBottom: 10, fontSize: 12, color: '#FBBF24', lineHeight: 1.5 }}>
          ⚠ Containers enregistrés sur ce navigateur seulement : colle le SQL <code>20261028_irt_containers.sql</code> dans Supabase pour les partager en temps réel.
        </div>
      )}
      {(() => {
        const base = devices.filter(d => !opts?.jbOnly || phoneKind(conts[d.public_id]) !== 'normal')
        const qq = pickQ.trim().toLowerCase().replace(/^@/, '')
        const hit = (d: IrtDevice) => !qq || deviceLabel(d).toLowerCase().includes(qq) || (conts[d.public_id] ?? []).some(c => c.toLowerCase().replace(/^@/, '').includes(qq))
        const filled = base.filter(d => (conts[d.public_id] ?? []).length > 0 && hit(d))
        const emptyN = base.filter(d => !(conts[d.public_id] ?? []).length).length
        const list = [...filled, ...(showEmptyPhones || opts?.manage ? base.filter(d => !(conts[d.public_id] ?? []).length && hit(d)) : [])]
        return (<>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={pickQ} onChange={e => setPickQ(e.target.value)} placeholder="Rechercher un iPhone ou un compte…" style={{ ...inp, flex: '1 1 220px', minWidth: 0 }} />
            {!opts?.manage && emptyN > 0 && <button style={{ ...btn, height: 32, fontSize: 12 }} onClick={() => setShowEmptyPhones(v => !v)}>{showEmptyPhones ? 'Masquer' : 'Afficher'} les iPhones pas encore détectés ({emptyN})</button>}
          </div>
          {!list.length && <div style={{ fontSize: 13, color: MUTED, padding: '6px 2px' }}>{base.length ? 'Aucun iPhone ne correspond. Détecte les comptes / containers dans « Téléphones » ou « Comptes Instagram ».' : 'Aucun iPhone.'}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, border: list.length ? `1px solid ${EDGE}` : 'none', overflow: 'hidden' }}>
        {list.map(d => {
          const id = d.public_id, on = sel.has(id), live = isDeviceOn(d)
          const list = conts[id] ?? [], picked = selConts[id] ?? new Set<string>()
          const kind = phoneKind(list), unit = kind === 'normal' ? 'compte' : 'container'
          return (
            <div key={id} style={{ borderTop: `1px solid ${EDGE}`, background: on ? 'rgba(233,196,106,0.04)' : '#0E0E10', padding: '10px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 8, opacity: live || on ? 1 : 0.6 }}>
              <div onClick={() => togglePhone(id)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: '0 1 280px', minWidth: 200 }}>
                <span title={on ? 'Tout décocher' : 'Tout cocher'} style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 5, background: on ? GOLD : 'transparent', color: '#0A0A0B', fontSize: 11, fontWeight: 700, border: on ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.2)', flex: 'none' }}>{on ? (list.length && picked.size < list.length ? '–' : '✓') : ''}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deviceLabel(d)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: live ? '#22C55E' : '#EF4444', boxShadow: live ? '0 0 6px rgba(34,197,94,.55)' : 'none' }} />
                    {live ? 'En ligne' : 'Hors ligne'} · {list.length ? `${picked.size}/${list.length} ${unit}${list.length > 1 ? 's' : ''}` : 'pas encore détecté'}
                  </span>
                </span>
                {!kind && list.length > 0 && <span title="Type pas sûr (ancienne détection ou saisie à la main) : clique ↻ pour relire l’iPhone" style={{ flex: 'none', height: 22, padding: '0 8px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, background: 'rgba(251,191,36,0.1)', color: '#FCD34D', border: '1px solid rgba(251,191,36,0.3)' }}>❓ À vérifier</span>}
                {kind && <span title={kind === 'normal' ? 'iPhone normal : plusieurs comptes connectés dans Instagram' : 'iPhone jailbreaké : un compte par container Crane'} style={{ flex: 'none', height: 22, padding: '0 8px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, background: kind === 'normal' ? 'rgba(96,165,250,0.12)' : 'rgba(233,196,106,0.12)', color: kind === 'normal' ? '#93C5FD' : GOLD, border: `1px solid ${kind === 'normal' ? 'rgba(96,165,250,0.3)' : 'rgba(233,196,106,0.3)'}` }}>{kind === 'normal' ? '📱 iPhone normal' : '🔓 Jailbreak'}</span>}
              </div>
              {list.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: '1 1 320px', minWidth: 0 }}>
                  {list.map(c => {
                    const cp = on && picked.has(c)
                    return (
                      <span key={c} style={{ display: 'inline-flex', alignItems: 'center', height: 28, borderRadius: 7, fontSize: 12.5, fontWeight: 600, background: cp ? 'rgba(233,196,106,0.14)' : FIELD_BG, color: cp ? GOLD : '#A1A1AA', border: `1px solid ${cp ? 'rgba(233,196,106,0.45)' : FIELD_EDGE}`, fontVariantNumeric: 'tabular-nums' }}>
                        <span onClick={() => toggleCont(id, c)} title={flagOf(id, c)?.join(' · ')} style={{ cursor: 'pointer', padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }} data-no-tr>
                          {flagOf(id, c) && <span style={{ display: 'grid', placeItems: 'center', width: 15, height: 15, borderRadius: 99, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800 }}>!</span>}
                          {cp && on ? <span style={{ fontSize: 10 }}>✓</span> : null}{c}
                          {(() => { const cs = contStates[id]?.[c]; if (!cs || c.startsWith('@')) return null
                            return <span title={`Vérifié à l’écran le ${new Date(cs.at).toLocaleString()}`} style={{ fontSize: 11, fontWeight: 500, color: cs.state === 'account' ? '#86EFAC' : cs.state === 'empty' ? DIM : cs.state === 'blocked' ? '#F87171' : DIM }}>
                              {cs.state === 'account' ? `· @${cs.username ?? '?'}` : cs.state === 'empty' ? '· vide' : cs.state === 'blocked' ? '· 🤖' : '· ?'}
                            </span> })()}
                        </span>
                        {opts?.manage && <span onClick={() => removeC(id, c)} title="Retirer" style={{ cursor: 'pointer', color: DIM, padding: '0 8px 0 0', fontSize: 14 }}>×</span>}
                      </span>
                    )
                  })}
                </div>
              ) : <div style={{ fontSize: 12.5, color: MUTED, flex: '1 1 320px' }}>Pas encore détecté : « 🔍 Détecter » lit les containers (jailbreak) ou les comptes Instagram (iPhone normal).</div>}
              {!opts?.manage && list.length > 0 && (
                <button style={{ ...btn, height: 28, fontSize: 13, padding: '0 9px', marginLeft: 'auto' }} disabled={running || !!detecting || !live} title="Relire les comptes / containers de cet iPhone (un compte ajouté ? clique ici)" onClick={() => void detectOne(id)}>{detecting === id ? '…' : '↻'}</button>
              )}
              {(opts?.manage || !list.length) && (
                <button style={{ ...btn, height: 28, fontSize: 12, padding: '0 10px', marginLeft: 'auto' }} disabled={running || !!detecting || !live} title={kind === 'normal' ? 'Ouvre Instagram → Profil → liste des comptes, et lit les comptes connectés' : 'Lit les containers Crane (ou, sur un iPhone normal, les comptes Instagram connectés)'} onClick={() => void detectOne(id)}>{detecting === id ? 'Détection…' : '🔍 Détecter'}</button>
              )}
              {opts?.manage && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newC[id] ?? ''} onChange={e => setNewC(v => ({ ...v, [id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addC(id) }} placeholder={kind === 'normal' ? 'Ajouter à la main (ex. @compte)' : 'Ajouter à la main (ex. 6, ou @compte)'} style={{ ...inp, height: 28, flex: 1, minWidth: 0, fontSize: 12 }} />
                  <button style={{ ...btn, height: 28, fontSize: 12 }} onClick={() => addC(id)}>Ajouter</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
        </>)
      })()}
    </Step>
  )

  // Progression : une ligne par iPhone/container (statut + dernière étape), journal détaillé repliable.
  const LogPanel = () => {
    if (!logs.length && !running) return null
    const rows = progressRows(logs)
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: rows.length ? 12 : 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{running ? 'En cours' : 'Terminé'}</span>
          {rows.length > 0 && <span style={{ fontSize: 12.5, color: MUTED }}>{rows.filter(r => r.state === 'ok').length} réussi(s) · {rows.filter(r => r.state === 'fail').length} échec(s){rows.some(r => r.state === 'skip') ? ` · ${rows.filter(r => r.state === 'skip').length} passé(s)` : ''}</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button style={{ ...btn, height: 28, fontSize: 12 }} onClick={() => setShowLog(v => !v)}>{showLog ? 'Masquer le journal' : 'Journal détaillé'}</button>
            {running && runId && <button style={{ ...btn, height: 28, fontSize: 12, background: 'rgba(239,68,68,0.08)', color: '#F87171', borderColor: 'rgba(239,68,68,0.2)' }} onClick={() => cancelRun(runId)}>■ Arrêter</button>}
            {!running && <button style={{ ...btn, height: 28, fontSize: 12 }} onClick={() => setLogs([])}>Effacer</button>}
          </span>
        </div>
        {rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(r => (
              <div key={r.tag} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: '#0D0D0F', border: `1px solid ${EDGE}` }}>
                <span style={{ flex: 'none', width: 9, height: 9, borderRadius: 99, background: r.state === 'ok' ? '#22C55E' : r.state === 'fail' ? '#EF4444' : r.state === 'skip' ? '#7C7C86' : GOLD, animation: r.state === 'run' && running ? 'aPulse 1.4s ease-in-out infinite' : 'none' }} />
                <span data-no-tr style={{ flex: 'none', minWidth: 130, fontSize: 13, fontWeight: 600, color: INK }}>{r.tag}</span>
                <span data-no-tr style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.last}</span>
              </div>
            ))}
          </div>
        )}
        {(showLog || !rows.length) && <div data-no-tr style={{ ...logBox, maxHeight: 320, marginTop: rows.length ? 10 : 0 }}>{logs.join('\n') || 'En cours…'}</div>}
      </div>
    )
  }

  const TAB_TITLE: Record<IrtTab, { title: string; sub: string }> = {
    home: { title: 'Accueil', sub: 'Tes crédits iRemoTech, tes iPhones et tes comptes en un coup d’œil.' },
    phones: { title: 'Mes iPhones', sub: 'Tes iPhones iRemoTech : containers Crane (jailbreak) ou comptes Instagram connectés (iPhone normal). « Détecter » les lit directement sur l’iPhone.' },
    posting: { title: 'Posting', sub: 'Reels, carrousels photo ou Story CTA : choisis où, quoi, et lance. Chaque compte publie à son tour.' },
    story: { title: 'Posting', sub: 'Reels, carrousels photo ou Story CTA : choisis où, quoi, et lance. Chaque compte publie à son tour.' },
    warmup: { title: 'Warm-up', sub: 'Fais vivre tes comptes comme un humain, container par container.' },
    account: { title: 'Créer des comptes', sub: 'Un compte Instagram dans chaque container vide, numéro et code SMS automatiques.' },
    igaccounts: { title: 'Comptes Instagram', sub: 'Tous les comptes de tes iPhones, relus depuis iRemoTech : statut, publications, abonnés, warm-ups. Vérifie et chauffe en un clic.' },
    comptes: { title: 'Comptes créés', sub: 'Identifiants, numéros et historique des comptes créés depuis ScaleFlow.' },
  }
  const TABS: { k: IrtTab; label: string; icon: string }[] = [
    { k: 'home', label: 'Accueil', icon: '🏠' },
    { k: 'phones', label: 'Téléphones', icon: '📱' },
    { k: 'igaccounts', label: 'Comptes', icon: '👥' },
    { k: 'posting', label: 'Posting', icon: '🎬' },
    { k: 'warmup', label: 'Warm-up', icon: '🔥' },
    { k: 'account', label: 'Création de compte', icon: '🆕' },
    { k: 'comptes', label: 'Comptes créés', icon: '🆕' },
  ]

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <H title={TAB_TITLE[curTab].title} sub={TAB_TITLE[curTab].sub}
        right={<span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={pill}><span style={{ width: 7, height: 7, borderRadius: 99, background: onlineN ? '#22C55E' : '#EF4444' }} />{onlineN}/{devices.length} iPhone{devices.length > 1 ? 's' : ''} en ligne</span>
          {usage?.billing?.free_remaining_today?.actions != null && <span style={pill} title="Actions gratuites restantes aujourd’hui (iRemoTech)">⚡ {usage.billing.free_remaining_today.actions.toLocaleString('fr-FR')} actions gratuites</span>}
          {usage?.billing?.cap_micros != null && <span style={pill} title="Dépensé ce mois / plafond (iRemoTech)">💳 {((usage.billing.spent_micros ?? 0) / 1e6).toFixed(2)} / {(usage.billing.cap_micros / 1e6).toFixed(0)} $</span>}
          {budget?.budget != null && <span style={pill} title="Quota iRemoTech du jour">{budget.remaining ?? '—'} / {budget.budget} actions restantes</span>}
        </span>} />

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
      {curTab === 'home' && (() => {
        const accs = devices.flatMap(d => deviceAccounts(irtJobs[d.public_id] ?? [], (conts[d.public_id] ?? []).filter(c => c.startsWith('@'))).accounts)
        const stat = (label: string, v: number | string, go?: IrtTab) => (
          <div key={label} onClick={go ? () => goTab(go) : undefined} style={{ ...card, margin: 0, cursor: go ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 12, color: MUTED }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: INK, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        )
        const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }
        return (<>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, margin: '4px 0 10px' }}>Crédits iRemoTech{usage?.billing?.period ? <span style={{ color: DIM, fontWeight: 500 }}> · {usage.billing.period}</span> : null}</div>
          {(() => {
            const bl = usage?.billing, free = bl?.free_remaining_today
            const $ = (m?: number) => m == null ? '—' : `${(m / 1e6).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
            const n = (v?: number) => v == null ? '—' : v.toLocaleString('fr-FR')
            const gb = (v?: number) => v == null ? '—' : `${(v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`
            const capPct = bl?.cap_micros ? Math.max(0, Math.min(100, (((bl.spent_micros ?? 0) + (bl.reserved_micros ?? 0)) / bl.cap_micros) * 100)) : null
            const used = (b?: { used?: number; budget?: number | null; remaining?: number | null; unlimited?: boolean }) => !b ? '—' : b.unlimited || b.budget == null ? `${n(b.used)} utilisées` : `${n(b.remaining ?? (b.budget - (b.used ?? 0)))} / ${n(b.budget)}`
            const box = (label: string, big: string, small?: string, pct?: number | null) => (
              <div key={label} style={{ ...card, margin: 0 }}>
                <div style={{ fontSize: 12, color: MUTED }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: pct != null && pct > 85 ? '#F87171' : INK, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{big}</div>
                {small && <div style={{ fontSize: 11.5, color: DIM, marginTop: 2 }}>{small}</div>}
                {pct != null && <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.07)', marginTop: 8, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? '#F87171' : GOLD }} /></div>}
              </div>
            )
            if (!usage) return <div style={{ ...card, color: MUTED, fontSize: 12.5 }}>Crédits indisponibles pour le moment.</div>
            return (<>
              <div style={grid}>
                {bl && box('💳 Dépensé ce mois', $(bl.spent_micros), `plafond ${$(bl.cap_micros)}${bl.reserved_micros ? ` · ${$(bl.reserved_micros)} réservés` : ''}${bl.resets_at ? ` · repart le ${new Date(bl.resets_at).toLocaleDateString('fr-FR')}` : ''}`, capPct)}
                {free && box('⚡ Actions gratuites restantes', n(free.actions), 'aujourd’hui')}
                {free && box('🎞 Images gratuites restantes', n(free.frames), 'captures + vidéo en direct, aujourd’hui')}
                {free && box('⬆ Envois gratuits restants', gb(free.upload_bytes), 'aujourd’hui')}
                {(() => {
                  // Jetons : l'API iRemoTech ne donne pas le solde → warm-ups lancés via l'API ce mois-ci (ce qui consomme les jetons)
                  const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0)
                  const wu = Object.values(irtJobs).flat().filter(j => j.type === 'warm_up' && j.status === 'completed' && Date.parse(j.created_at) >= m0.getTime())
                  const sec = wu.reduce((t, j) => t + (Number(j.result?.session_duration_s) || 0), 0)
                  return box('🪙 Warm-ups (jetons) ce mois', String(wu.length), `${Math.round(sec / 60)} min de session · solde de jetons : voir le tableau de bord iRemoTech (pas dans l’API)`)
                })()}
              </div>
              <div style={{ fontSize: 12, color: DIM, margin: '-6px 0 18px' }}>
                Utilisé aujourd’hui : {used(usage.actions)} actions · {used(usage.snapshots)} captures · {used(usage.active_minutes)} minutes · {used(usage.uploads)} envois{usage.resets_at ? ` · compteurs remis à zéro à ${new Date(usage.resets_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </div>
            </>)
          })()}
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, margin: '4px 0 10px' }}>iPhones et comptes</div>
          <div style={grid}>
            {stat('iPhones en ligne', `${onlineN} / ${devices.length}`, 'phones')}
            {stat('Comptes Instagram', accs.length, 'igaccounts')}
            {stat('Comptes sains', accs.filter(a => a.health.level === 'ok').length, 'igaccounts')}
            {stat('À surveiller', accs.filter(a => a.health.level === 'warn').length, 'igaccounts')}
            {stat('Éligibles Trial', accs.filter(a => a.trial === true).length, 'igaccounts')}
            {stat('Comptes créés', createdAccts.filter(a => a.ok).length, 'comptes')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...btn, height: 34 }} onClick={() => goTab('posting')}>🎬 Posting</button>
            <button style={{ ...btn, height: 34 }} onClick={() => goTab('warmup')}>🔥 Warm-up</button>
            <button style={{ ...btn, height: 34 }} onClick={() => goTab('account')}>🆕 Création de compte</button>
            <button style={{ ...btn, height: 34 }} onClick={() => irt.key && void fetchUsage(irt.key).then(u => { if (u) setUsage(u) })}>↻ Actualiser les crédits</button>
          </div>
        </>)
      })()}
      {curTab === 'phones' && (<>
        {phonePicker({ manage: true })}
        {sel.size > 0 && (
          <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: MUTED, alignSelf: 'center', marginRight: 'auto' }}>Ta sélection te suit dans chaque onglet.</span>
            <button style={gold} onClick={() => goTab('posting')}>Publier des Reels →</button>
            <button style={btn} onClick={() => goTab('story')}>Stories →</button>
            <button style={btn} onClick={() => goTab('warmup')}>Warm-up →</button>
            <button style={btn} onClick={() => goTab('account')}>Créer des comptes →</button>
          </div>
        )}
      </>)}

      {/* ─────────────── ONGLET POSTING ─────────────── */}
      {curTab === 'igaccounts' && irt.key && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px', padding: '10px 12px', borderRadius: 10, border: `1px solid ${EDGE}`, background: '#0E0E10' }}>
          <Toggle on={autoStatus} onClick={() => { const v = !autoStatus; setAutoStatus(v); try { localStorage.setItem('sf-irt-autostatus', v ? '1' : '0') } catch { /* noop */ } }}
            label="Statut iRemoTech automatique" sub="ScaleFlow fait lire les comptes de chaque iPhone et vérifier le statut de chaque compte par iRemoTech toutes les 24 h, puis l’affiche ici. Gratuit (1 action du quota par vérification), jamais pendant une publication, seulement quand ScaleFlow est ouvert." />
        </div>
      )}
      {curTab === 'igaccounts' && irt.key && (
        <IrtAccounts apiKey={irt.key} devices={devices} known={conts}
          onScanned={(dev, accs) => {
            // iPhone normal (ou pas encore détecté) : les comptes trouvés par iRemoTech deviennent ses cibles « @nom »
            if (phoneKind(conts[dev]) === 'jb') return
            const list = [...new Set([...(conts[dev] ?? []).filter(c => c.startsWith('@')), ...accs.filter(u => !isJunkUsername(u)).map(u => '@' + u.toLowerCase())])]
            saveDevContainers(dev, list); setConts(c => ({ ...c, [dev]: list }))
          }} />
      )}
      {(curTab === 'posting' || curTab === 'story') && (
        <UnderlineTabs<'reel' | 'carousel' | 'story'> value={curTab === 'story' || storySub ? 'story' : postType}
          onChange={k => { if (running) return; if (k === 'story') setStorySub(true); else { setStorySub(false); setPostType(k); if (curTab === 'story') goTab('posting') } }}
          items={[{ k: 'reel', l: '🎬 Reels' }, { k: 'carousel', l: '🖼 Carrousel' }, { k: 'story', l: '📸 Story CTA' }]} />
      )}
      {curTab === 'posting' && !storySub && (<>
        {phonePicker()}
        <div style={card}>
          <StepHead n={2} title={postType === 'carousel' ? 'Quelles photos ?' : 'Quelles vidéos ?'} sub={postType === 'carousel' ? `Chaque container coché publie un carrousel de ${carCount} photos différentes, et une légende de la liste.` : 'Chaque container coché publie un Reel avec une vidéo tirée au hasard, et une légende de la liste.'} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            {postType === 'carousel' && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: INK }}>
                Photos par post
                <select value={carCount} onChange={e => setCarCount(Number(e.target.value))} style={{ ...inp, height: 30, width: 64, cursor: 'pointer' }}>
                  {Array.from({ length: CAROUSEL_MAX - 1 }, (_, i) => i + 2).map(n => <option key={n} value={n} style={{ background: FIELD_BG }}>{n}</option>)}
                </select>
              </label>
            )}
            {postType === 'carousel' && (
              <label title="Musique suggérée par Instagram (sinon un des 1ers morceaux « Pour toi »). Si aucune musique ne peut être ajoutée, le post n’est pas publié." style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: INK, cursor: 'pointer' }}>
                <input type="checkbox" checked={carMusic} onChange={e => setCarMusic(e.target.checked)} />
                🎵 Musique (obligatoire)
              </label>
            )}
          </div>
          {postType === 'carousel' ? (<>
            {sourceRow('photo')}
            {photoSrc.mode === 'folder' && <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED }}>Au lancement, toutes les photos du dossier sont prises (y compris les nouvelles) : les moins publiées passent en premier, sans doublon.</p>}
            {photoSrc.mode === 'pick' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <button style={gold} onClick={() => setPicker('photo')}>+ Ajouter des photos</button>
              <span style={{ fontSize: 12, color: MUTED }}>{photoPool.length} photo(s) dans le pool</span>
              {photoPool.length > 0 && <button style={btn} onClick={() => setPhotoPool([])}>Vider</button>}
            </div>}
            {photoSrc.mode === 'pick' && photoPool.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {photoPool.map(v => (
                  <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 5, fontSize: 12, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK }}>
                    🖼 {v.title.slice(0, 26)}
                    <span onClick={() => setPhotoPool(p => p.filter(x => x.id !== v.id))} title="Retirer" style={{ cursor: 'pointer', color: '#F87171', fontWeight: 500 }}>×</span>
                  </span>
                ))}
              </div>
            )}
          </>) : (<>
            {sourceRow('reel')}
            {reelSrc.mode === 'folder' && <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED }}>Au lancement, toutes les vidéos du dossier sont prises (y compris les nouvelles) : les moins publiées passent en premier, sans doublon.</p>}
            {reelSrc.mode === 'pick' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <button style={gold} onClick={() => setPicker('reel')}>+ Ajouter des vidéos</button>
              <span style={{ fontSize: 12, color: MUTED }}>{reelPool.length} vidéo(s) dans le pool</span>
              {reelPool.length > 0 && <button style={btn} onClick={() => setReelPool([])}>Vider</button>}
            </div>}
            {reelSrc.mode === 'pick' && reelPool.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {reelPool.map(v => (
                  <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 5, fontSize: 12, background: FIELD_BG, border: `1px solid ${FIELD_EDGE}`, color: INK }}>
                    🎞 {v.title.slice(0, 26)}
                    <span onClick={() => setReelPool(p => p.filter(x => x.id !== v.id))} title="Retirer" style={{ cursor: 'pointer', color: '#F87171', fontWeight: 500 }}>×</span>
                  </span>
                ))}
              </div>
            )}
          </>)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 8px' }}>
            <span style={{ ...lbl, margin: 0 }}>Description</span>
            <div style={{ ...seg }}>
              {([['pool', '✍️ Mes légendes'], ['ai', '🤖 Auto par marché']] as const).map(([k, l]) => (
                <button key={k} disabled={running} onClick={() => { setCapMode(k); try { localStorage.setItem('sf-irt-cap-mode', k) } catch { /* noop */ } }} style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: capMode === k ? 'rgba(255,255,255,0.08)' : 'transparent', color: capMode === k ? INK : MUTED }}>{l}</button>
              ))}
            </div>
          </div>
          {capMode === 'pool' ? (<>
            <div style={{ fontSize: 11.5, color: DIM, margin: '0 0 6px' }}>Une par ligne, tirées au hasard.</div>
            <textarea value={captionPool} onChange={e => setCaptionPool(e.target.value)} rows={3} placeholder={'Ma légende 1\nMa légende 2\n…'} style={{ ...inp, width: '100%', height: 'auto', minHeight: 60, padding: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
          </>) : (<>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: MUTED }}>Marché par défaut</span>
              {MARKETS.map(m => (
                <button key={m.k} disabled={running} onClick={() => { setCapMarket(m.k); setCapPreview([]); setPromptOpen(false); try { localStorage.setItem('sf-irt-cap-market', m.k) } catch { /* noop */ } }}
                  style={{ ...btn, height: 32, background: capMarket === m.k ? 'rgba(233,196,106,0.14)' : FIELD_BG, color: capMarket === m.k ? GOLD : INK, borderColor: capMarket === m.k ? 'rgba(233,196,106,0.45)' : FIELD_EDGE }}>{m.label}</button>
              ))}
              <button style={{ ...btn, height: 32, marginLeft: 'auto' }} disabled={capBusy || !conns.groq} onClick={async () => {
                setCapBusy(true)
                try { setCapPreview(await generateMarketCaptions(conns.groq, capMarket, 5)) } catch (e) { toast(`Descriptions : ${e instanceof Error ? e.message : String(e)}`, 'bad') }
                setCapBusy(false)
              }}>{capBusy ? 'Génération…' : '👀 Aperçu (5)'}</button>
              <button style={{ ...btn, height: 32 }} onClick={() => { setPromptDraft(marketPrompt(capMarket)); setPromptOpen(o => !o) }}>✏️ Prompt</button>
            </div>
            <div style={{ fontSize: 11.5, color: conns.groq ? DIM : '#FCD34D', margin: '8px 0 0' }}>
              {conns.groq ? 'Au lancement, chaque compte reçoit une description de Reel différente, générée avec le prompt de SON marché (sinon le marché par défaut).' : 'Il faut une clé Groq (Réglages › Intégrations) pour générer les descriptions.'}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, color: INK, cursor: 'pointer' }}>
              <input type="checkbox" checked={capLocation} disabled={running} onChange={e => { setCapLocation(e.target.checked); try { localStorage.setItem('sf-irt-cap-location', e.target.checked ? '1' : '0') } catch { /* noop */ } }} />
              📍 Localisation selon le marché <span style={{ color: DIM, fontSize: 11.5 }}>(une grande ville du pays du compte, au hasard : Paris, Lyon… · Miami, Los Angeles… · Berlin, Munich…)</span>
            </label>
            {totalJobs > 0 && (
              <div style={{ marginTop: 10, borderRadius: 8, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#111113', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>Marché de chaque compte</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: DIM }}>Tous en</span>
                  {MARKETS.map(m => <button key={m.k} disabled={running} onClick={() => { for (const dev of sel) for (const c of selConts[dev] ?? []) setTargetMarket(dev, c, m.k) }} style={{ ...btn, height: 26, fontSize: 11.5, padding: '0 8px' }}>{m.label.split(' ')[0]}</button>)}
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {[...sel].flatMap(dev => [...(selConts[dev] ?? [])].map(c => ({ dev, c }))).map(({ dev, c }) => {
                    const own = targetMarkets[`${dev}::${c}`] !== undefined ? targetMarkets[`${dev}::${c}`] : loadTargetMarket(dev, c)
                    const name = (() => { const x = devices.find(d => d.public_id === dev); return x ? deviceLabel(x) : dev })()
                    return (
                      <div key={`${dev}::${c}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderTop: `1px solid ${EDGE}` }}>
                        <span data-no-tr style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}<span style={{ color: DIM }}> · {name}</span></span>
                        {MARKETS.map(m => {
                          const on = (own ?? capMarket) === m.k
                          return <button key={m.k} disabled={running} title={own ? m.label : `${m.label}${on ? ' (défaut)' : ''}`} onClick={() => setTargetMarket(dev, c, own === m.k ? null : m.k)}
                            style={{ height: 26, width: 34, borderRadius: 6, cursor: 'pointer', fontSize: 14, border: `1px solid ${on ? (own ? 'rgba(233,196,106,0.55)' : 'rgba(255,255,255,0.18)') : 'transparent'}`, background: on ? (own ? 'rgba(233,196,106,0.14)' : 'rgba(255,255,255,0.05)') : 'transparent', opacity: on ? 1 : 0.45 }}>{m.label.split(' ')[0]}</button>
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {promptOpen && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea data-no-tr value={promptDraft} onChange={e => setPromptDraft(e.target.value)} rows={10} style={{ ...inp, width: '100%', height: 'auto', padding: 10, resize: 'vertical', fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...btn, height: 30, background: GOLD, color: '#0A0A0B', border: 'none', fontWeight: 600 }} onClick={() => { saveMarketPrompt(capMarket, promptDraft); setPromptOpen(false); setCapPreview([]); toast('Prompt enregistré pour ce marché', 'ok') }}>Enregistrer</button>
                  <button style={{ ...btn, height: 30 }} onClick={() => { setPromptDraft(DEFAULT_PROMPTS[capMarket]); saveMarketPrompt(capMarket, null); toast('Prompt d’origine remis', 'ok') }}>Remettre l’original</button>
                </div>
              </div>
            )}
            {capPreview.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {capPreview.map((c, i) => <div key={i} data-no-tr style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.5, color: '#D4D4D8', padding: '8px 10px', borderRadius: 7, background: '#111113', border: `1px solid ${EDGE}` }}>{c}</div>)}
              </div>
            )}
          </>)}
        </div>
        <div style={{ ...card, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>⏱ Session</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}>Posts max par iPhone
            <input type="number" min={1} max={50} value={sessMax} disabled={running} onChange={e => { const v = Math.max(1, Math.min(50, Number(e.target.value) || 1)); setSessMax(v); try { localStorage.setItem('sf-irt-sess-max', String(v)) } catch { /* noop */ } }} style={{ width: 56, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: '#0D0D0F', color: INK, textAlign: 'center' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}>Minutes entre 2 posts (min 1)
            <input type="number" min={1} max={30} value={gapMin} disabled={running} onChange={e => { const v = Math.max(1, Math.min(30, Number(e.target.value) || 1)); setGapMin(v); try { localStorage.setItem('sf-irt-gap-min', String(v)) } catch { /* noop */ } }} style={{ width: 56, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: '#0D0D0F', color: INK, textAlign: 'center' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: INK, cursor: 'pointer' }}>
            <input type="checkbox" checked={gapScroll} disabled={running} onChange={e => { setGapScroll(e.target.checked); try { localStorage.setItem('sf-irt-gap-scroll', e.target.checked ? '1' : '0') } catch { /* noop */ } }} />
            📱 Scroller pendant la pause <span style={{ color: DIM, fontSize: 11.5 }}>(activité naturelle sur le compte avant son post, évite le flag robot)</span>
          </label>
        </div>
        <LaunchBar n={3} summary={totalJobs ? `${totalJobs} ${postType === 'carousel' ? `carrousel${totalJobs > 1 ? 's' : ''} de ${carCount} photos` : `Reel${totalJobs > 1 ? 's' : ''}`} (${targetsSummary([...sel].flatMap(d => [...(selConts[d] ?? [])]))}) sur ${sel.size} iPhone${sel.size > 1 ? 's' : ''}` : 'Choisis des comptes ou containers à l’étape 1'} options={<OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} />} label={postType === 'carousel' ? `Lancer ${totalJobs} carrousel(s)` : `Lancer ${totalJobs} Reel(s)`} disabled={!totalJobs || (postType === 'carousel' ? (photoSrc.mode === 'folder' ? !photoSrc.folder : photoPool.length < carCount) : (reelSrc.mode === 'folder' ? !reelSrc.folder : !reelPool.length)) || running} running={running} onClick={() => run(postType === 'carousel' ? 'carousel' : 'reel')} />
        <LogPanel />
      </>)}

      {/* ─────────────── ONGLET STORY ─────────────── */}
      {(curTab === 'story' || (curTab === 'posting' && storySub)) && (<>
        {phonePicker()}
        <div style={card}>
          <StepHead n={2} title="Quelles photos et quel lien ?" sub="Chaque container publie une Story avec une photo tirée au hasard et son lien sticker." />
          {sourceRow('story')}
          {storySrc.mode === 'folder' && <p style={{ margin: '0 0 12px', fontSize: 12, color: MUTED }}>Au lancement, toutes les photos du dossier sont prises (y compris les nouvelles) : les moins publiées passent en premier, sans doublon.</p>}
          {storySrc.mode === 'pick' && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <button style={gold} onClick={() => setPicker('story')}>+ Ajouter des photos</button>
            <span style={{ fontSize: 12, color: MUTED }}>{storyPool.length} photo(s) dans le pool</span>
            {storyPool.length > 0 && <button style={btn} onClick={() => setStoryPool([])}>Vider</button>}
          </div>}
          {storySrc.mode === 'pick' && storyPool.length > 0 && (
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
                    <span style={{ minWidth: 130, fontSize: 12.5, fontWeight: 500, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(() => { const x = devices.find(d => d.public_id === dev); return x ? deviceLabel(x) : dev })()} · {c}</span>
                    <input value={storyLinks[linkKey(dev, c)] ?? ''} onChange={e => setLink(dev, c, e.target.value)} placeholder={storyLink.trim() ? `défaut : ${storyLink.trim()}` : 'https://…'} style={{ ...inp, flex: 1, height: 32, fontSize: 12 }} />
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ ...lbl, margin: '14px 0 6px' }}>Textes sticker (une par ligne, au hasard — optionnel)</div>
          <textarea value={captionPool} onChange={e => setCaptionPool(e.target.value)} rows={2} placeholder={'Texte 1\nTexte 2\n…'} style={{ ...inp, width: '100%', height: 'auto', minHeight: 46, padding: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
        </div>
        <LaunchBar n={3} summary={totalJobs ? `${totalJobs} Stor${totalJobs > 1 ? 'ies' : 'y'} sur ${sel.size} iPhone${sel.size > 1 ? 's' : ''}` : 'Choisis des comptes ou containers à l’étape 1'} options={<OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} />} label={`Lancer ${totalJobs} Story(s)`} disabled={!totalJobs || (storySrc.mode === 'folder' ? !storySrc.folder : !storyPool.length) || running} running={running} onClick={() => run('story')} />
        <LogPanel />
      </>)}

      {/* ─────────────── ONGLET WARM-UP ─────────────── */}
      {curTab === 'warmup' && (<>
        {phonePicker()}
        <div style={card}>
          <StepHead n={2} title="Quel warm-up ?" sub="Chaque compte scrolle des Reels comme un humain (regarde, like parfois), un container après l’autre." />

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
        <LaunchBar n={3} summary={totalJobs ? `${totalJobs} compte${totalJobs > 1 ? 's' : ''} à chauffer sur ${sel.size} iPhone${sel.size > 1 ? 's' : ''}` : 'Choisis des comptes ou containers à l’étape 1'} options={<OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} accountMode />} label={`Lancer le warm-up (${totalJobs})`} disabled={!totalJobs || running} running={running} onClick={runWarmup} />
        <LogPanel />
      </>)}

      {/* ─────────────── ONGLET CRÉATION DE COMPTE ─────────────── */}
      {curTab === 'account' && (<>
        {phonePicker({ jbOnly: true })}
        <div style={card}>
          <StepHead n={2} title="Quel numéro ?" sub="Pour chaque container vierge : un numéro acheté, le code SMS saisi tout seul, puis le compte rempli jusqu’au bout." />

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
                style={{ ...inp, width: 90, height: 32 }} placeholder="1" />
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
        <div style={card}>
          <StepHead n={3} title="Quels containers ?" sub="Chaque iPhone jailbreaké enchaîne ses containers : un compte, puis le suivant, jusqu’au dernier. Un container déjà connecté est passé sans acheter de numéro. Les iPhones normaux (comptes) ne servent pas à la création." />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 320px' }}>
              <Toggle on={autoDetect} onClick={() => { if (running) return; const v = !autoDetect; setAutoDetect(v); try { localStorage.setItem('sf-irt-auto-detect', v ? '1' : '0') } catch { /* noop */ } }}
                label="Tout auto (recommandé)" sub="ScaleFlow détecte les containers de chaque iPhone puis remplit ceux qui n’ont pas de compte" />
            </div>
            {!autoDetect && <button style={{ ...btn, height: 30, padding: '0 12px' }} disabled={running || !sel.size} onClick={() => {
              setSelConts(sc => { const n = { ...sc }; for (const d of sel) n[d] = new Set(containersToFill((conts[d] ?? []).filter(c => !c.startsWith('@')), contStates[d], false)); return n })
            }} title="D’après la dernière vérification à l’écran (🔎 Vérifier)">Cocher les containers vides</button>}
            <button style={{ ...btn, height: 30, padding: '0 12px' }} disabled={running || checking || !!detecting || !sel.size} onClick={() => void checkPhones()}
              title="Ouvre chaque container des iPhones choisis et lit ce qu’il contient vraiment (vide / @compte), sans rien acheter">{checking ? 'Vérification…' : '🔎 Vérifier les containers'}</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}>
              Essais max par container
              <input type="number" min={1} max={10} value={acctTries} disabled={running} onChange={e => { const v = Math.max(1, Math.min(10, Number(e.target.value) || 1)); setAcctTries(v); try { localStorage.setItem('sf-irt-acct-tries', String(v)) } catch { /* noop */ } }}
                style={{ width: 56, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: '#0D0D0F', color: INK, textAlign: 'center' }} />
            </label>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${EDGE}` }}>
            <Toggle on={acctLoop} onClick={() => { if (running) return; const v = !acctLoop; setAcctLoop(v); lsSet('sf-irt-acct-loop', v ? '1' : '0') }}
              label="🔁 Boucle : créer → se déconnecter → recréer" sub="Dans chaque container : un compte, déconnexion (Profil › ☰ › Log out), « Create new account », compte suivant. S’arrête seul sur l’iPhone au premier refus ou captcha d’Instagram." />
            {acctLoop && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}>
                  Comptes max par container
                  <input type="number" min={1} max={20} value={loopMax} disabled={running} onChange={e => { const v = Math.max(1, Math.min(20, Number(e.target.value) || 1)); setLoopMax(v); lsSet('sf-irt-loop-max', String(v)) }} style={{ width: 56, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: '#0D0D0F', color: INK, textAlign: 'center' }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}>
                  Pause entre deux comptes (min)
                  <input type="number" min={1} max={60} value={loopPause} disabled={running} onChange={e => { const v = Math.max(1, Math.min(60, Number(e.target.value) || 1)); setLoopPause(v); lsSet('sf-irt-loop-pause', String(v)) }} style={{ width: 56, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: '#0D0D0F', color: INK, textAlign: 'center' }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: MUTED }}>
                  Budget numéros max ($)
                  <input type="text" inputMode="decimal" placeholder="illimité" value={loopBudget} disabled={running} onChange={e => { setLoopBudget(e.target.value); lsSet('sf-irt-loop-budget', e.target.value) }} style={{ width: 80, height: 30, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: '#0D0D0F', color: INK, textAlign: 'center' }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: MUTED, cursor: 'pointer' }}>
                  <input type="checkbox" checked={loopLogoutExisting} disabled={running} onChange={e => { setLoopLogoutExisting(e.target.checked); lsSet('sf-irt-loop-logout-existing', e.target.checked ? '1' : '0') }} />
                  Déconnecter aussi le compte déjà présent
                </label>
                <p style={{ margin: 0, fontSize: 11.5, color: DIM, flexBasis: '100%' }}>Chaque compte est rangé dans « Comptes créés » (identifiant + mot de passe) avant d’être déconnecté. Mode avion (nouvelle IP) avant chaque compte.{loopLogoutExisting ? ' ⚠ Le compte déjà connecté dans un container sera déconnecté : vérifie que tu as ses identifiants.' : ''}</p>
              </div>
            )}
          </div>
        </div>
        <LaunchBar n={4} summary={autoDetect ? (sel.size ? `${sel.size} iPhone${sel.size > 1 ? 's' : ''} : détection des containers puis un compte dans chaque container vide` : 'Choisis des iPhones à l’étape 1') : totalJobs ? `${totalJobs} compte${totalJobs > 1 ? 's' : ''} à créer` : 'Choisis des comptes ou containers à l’étape 1'} options={<OptionsCard {...{ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel }} accountMode forceAirplane />} label={autoDetect ? `Détecter et remplir les containers (${sel.size} iPhone${sel.size > 1 ? 's' : ''})${acctLoop && (smsProvider === 'herosms' ? heroKey : smsProvider === 'smspool' ? smspoolKey : sim5Key) ? ` · boucle ×${loopMax}` : ''}` : (smsProvider === 'herosms' ? heroKey : smsProvider === 'smspool' ? smspoolKey : sim5Key) ? (acctLoop ? `Créer jusqu’à ${totalJobs * loopMax} compte(s) en boucle` : `Créer ${totalJobs} compte(s)`) : `Tester le flow (${totalJobs})`} disabled={(autoDetect ? !sel.size : !totalJobs) || running || !!detecting} running={running} onClick={createAccounts} />
        <LogPanel />
        {createdAccts.length > 0 && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>✅ Comptes créés ({createdAccts.length})</span>
              <button style={{ ...btn, marginLeft: 'auto', height: 28 }} onClick={() => { const t = createdAccts.map(a => `${a.username ?? '?'}\t${a.password ?? ''}\t${a.phone ?? ''}`).join('\n'); try { navigator.clipboard.writeText(t) } catch { /* noop */ } }}>Copier tout</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {createdAccts.map(a => (
                <div key={a.at} style={{ padding: 10, borderRadius: 6, background: 'transparent', border: `1px solid ${a.ok ? EDGE : 'rgba(248,113,113,0.25)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: a.ok ? INK : '#F87171' }}>@{a.username ?? '—'}</span>
                    <span style={{ fontSize: 12, color: DIM, fontVariantNumeric: 'tabular-nums' }}>{new Date(a.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
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
          return [a.username, a.phone, a.fullName, a.country].some(v => (v ?? '').toString().toLowerCase().includes(q))
        })
        const okN = createdAccts.filter(a => a.ok).length
        const koN = createdAccts.length - okN
        const fmt = (t: number) => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
        // Format compact « username:password[:2fa] » (collé) pour copier-coller / import en masse.
        const line = (a: CreatedAccount) => `${a.username ?? ''}:${a.password ?? ''}${a.twofa ? `:${a.twofa}` : ''}`
        const copyAll = () => { try { navigator.clipboard.writeText(filtered.map(line).join('\n')) } catch { /* noop */ } }
        const exportCsv = () => {
          const head = ['username', 'password', '2fa', 'fullName', 'phone', 'provider', 'price', 'country', 'statut', 'date']
          const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
          const rows = filtered.map(a => [a.username, a.password, a.twofa, a.fullName, a.phone, a.provider, a.price, a.country, a.ok ? 'cree' : 'echec', new Date(a.at).toISOString()].map(esc).join(','))
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
              <input value={acctSearch} onChange={e => setAcctSearch(e.target.value)} placeholder="Rechercher (identifiant, numéro, nom…)" style={{ ...inp, flex: 1, minWidth: 220 }} />
              <div style={{ ...seg }}>
                {([['all', 'Tous'], ['ok', 'Réussis'], ['ko', 'Échoués']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setAcctFilter(k)} style={{ height: 28, padding: '0 12px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: acctFilter === k ? 'rgba(255,255,255,0.08)' : 'transparent', color: acctFilter === k ? INK : MUTED }}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button style={{ ...btn, height: 32 }} onClick={() => setImportOpen(o => !o)}>＋ Importer des comptes</button>
            {createdAccts.length > 0 && (<>
                <button style={{ ...btn, height: 32 }} onClick={copyAll}>Copier tout ({filtered.length})</button>
                <button style={{ ...btn, height: 32 }} onClick={exportCsv}>Exporter CSV</button>
                <button style={{ ...btn, height: 32, background: 'rgba(239,68,68,0.08)', color: '#F87171', borderColor: 'rgba(239,68,68,0.2)' }} onClick={async () => { if (await confirmDialog({ title: 'Vider TOUS les comptes enregistrés ? (irréversible)', confirmLabel: 'Vider', danger: true })) { clearCreatedAccounts(); setCreatedAccts([]) } }}>Vider</button>
            </>)}
            </div>
            {importOpen && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={4} placeholder={'Un compte par ligne : identifiant:motdepasse (ou identifiant:motdepasse:clé2FA)'} style={{ ...inp, height: 'auto', padding: 10, fontFamily: MONO, fontSize: 12.5, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...btn, height: 32, background: GOLD, color: '#0A0A0B', border: 'none', fontWeight: 600 }} onClick={() => {
                    const rows = parseAccountLines(importText)
                    rows.forEach((r, i) => addCreatedAccount({ at: Date.now() + i, device: '', deviceName: 'Importé', container: '—', username: r.username, password: r.password, twofa: r.twofa, ok: true }))
                    setCreatedAccts(loadCreatedAccounts()); setImportText(''); setImportOpen(false)
                    toast(rows.length ? `${rows.length} compte(s) importé(s)` : 'Aucune ligne valide (identifiant:motdepasse)', rows.length ? 'ok' : 'bad')
                  }}>Importer</button>
                  <button style={{ ...btn, height: 32 }} onClick={() => setImportOpen(false)}>Annuler</button>
                </div>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: MUTED, fontSize: 13 }}>
              {createdAccts.length === 0 ? <>Aucun compte créé pour l’instant.{' '}<button style={{ ...btn, height: 28, fontSize: 12, marginLeft: 8 }} onClick={() => goTab('account')}>Créer des comptes →</button></> : 'Aucun compte ne correspond à ta recherche.'}
            </div>
          ) : (() => {
            const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 500, color: DIM, borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }
            const td: React.CSSProperties = { height: 46, padding: '0 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle', whiteSpace: 'nowrap' }
            return (
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={th}>Identifiant</th>
                      <th style={th}>Mot de passe</th>
                      <th style={th}>Statut</th>
                      <th style={th}>Numéro</th>
                      <th style={th}>Date</th>
                      <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => (
                      <Fragment key={a.at}>
                        <tr>
                          <td data-no-tr style={{ ...td, fontSize: 13, fontWeight: 600, color: INK, cursor: 'pointer' }} title="Cliquer pour copier l’identifiant"
                            onClick={() => { try { navigator.clipboard.writeText(a.username ?? ''); toast('Identifiant copié', 'ok') } catch { /* noop */ } }}>
                            @{a.username ?? '?'}
                          </td>
                          <td data-no-tr style={{ ...td, fontFamily: MONO, fontSize: 12.5, color: '#D4D4D8', cursor: 'pointer' }} title="Cliquer pour copier le mot de passe"
                            onClick={() => { try { navigator.clipboard.writeText(a.password ?? ''); toast('Mot de passe copié', 'ok') } catch { /* noop */ } }}>
                            {a.password ?? '?'}{a.twofa ? <span style={{ marginLeft: 8, fontSize: 10.5, color: GOLD }} title={`Clé 2FA : ${a.twofa}`}>2FA</span> : null}
                          </td>
                          <td style={td}><span style={{ fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: a.ok ? '#4ADE80' : '#F87171' }}>{a.ok ? 'CRÉÉ' : 'ÉCHEC'}</span></td>
                          <td data-no-tr style={{ ...td, fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{a.phone ?? '—'}{a.country ? <span style={{ color: DIM }}> · {a.country}{a.price != null ? ` · ${a.price}$` : ''}</span> : null}</td>
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
                            <td colSpan={6} style={{ padding: '0 14px 10px' }}>
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
        <BankPicker theme={BLOW_THEME} user={user} org={org} kind={picker === 'reel' ? 'videos' : 'images'} multi
          title={picker === 'reel' ? 'Ajouter des vidéos au pool' : 'Ajouter des photos au pool'} onClose={() => setPicker(null)} onApply={applyPicker} />
      )}
    </div>
  )
}

// Options d'un lancement : interrupteurs compacts, posés dans la barre « Lancer ».
/** Lignes « identifiant:motdepasse[:clé2FA] » → comptes (lignes invalides ignorées, @ retiré). */
export function parseAccountLines(text: string): { username: string; password: string; twofa?: string }[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).flatMap(l => {
    const [u, p, ...rest] = l.split(':')
    const username = (u ?? '').trim().replace(/^@/, '').toLowerCase()
    const password = (p ?? '').trim()
    if (!/^[a-z0-9._]{1,30}$/.test(username) || !password) return []
    const twofa = rest.join(':').replace(/\s+/g, '').toUpperCase()
    return [{ username, password, ...(twofa ? { twofa } : {}) }]
  })
}

/** Type d'iPhone déduit des cibles détectées : comptes « @nom » = iPhone normal, containers Crane = jailbreak. */
/** Type d'iPhone d'après sa liste : « @comptes » = normal ; « Default » présent = jailbreak (le sélecteur Crane a
 *  VRAIMENT été lu : il a toujours « Default »). Des noms sans « @ » ni « Default » (vieille détection, saisie à la
 *  main) ne prouvent rien → null (« À vérifier »), au lieu d'un faux « Jailbreak ». */
export function phoneKind(list: string[] | undefined): 'normal' | 'jb' | null {
  if (!list?.length) return null
  if (list.every(c => c.startsWith('@'))) return 'normal'
  return list.some(c => /^default$/i.test(c.trim())) ? 'jb' : null
}
/** « 3 containers · 2 comptes » selon les cibles cochées. */
export function targetsSummary(targets: string[]): string {
  const acc = targets.filter(c => c.startsWith('@')).length, ct = targets.length - acc
  const parts = [ct ? `${ct} container${ct > 1 ? 's' : ''}` : '', acc ? `${acc} compte${acc > 1 ? 's' : ''}` : ''].filter(Boolean)
  return parts.join(' · ')
}

function OptionsCard({ airplaneOn, setAirplaneOn, uniqueUse, setUniqueUse, parallel, setParallel, accountMode, forceAirplane }: {
  airplaneOn: boolean; setAirplaneOn: (f: (v: boolean) => boolean) => void
  uniqueUse: boolean; setUniqueUse: (f: (v: boolean) => boolean) => void
  parallel: boolean; setParallel: (f: (v: boolean) => boolean) => void
  accountMode?: boolean
  forceAirplane?: boolean
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8 }}>
      <Toggle on={parallel} onClick={() => setParallel(v => !v)} label="iPhones en même temps" sub="Beaucoup plus rapide avec plusieurs iPhones" />
      {forceAirplane
        ? <Toggle on onClick={() => {}} label="Nouvelle IP avant chaque container" sub="Mode avion toujours activé pour la création" />
        : <Toggle on={airplaneOn} onClick={() => setAirplaneOn(v => !v)} label="Nouvelle IP entre chaque compte" sub="Mode avion entre deux containers" />}
      {!accountMode && <Toggle on={uniqueUse} onClick={() => setUniqueUse(v => !v)} label="Chaque média une seule fois" sub="Pas de doublon tant qu’il en reste" />}
    </div>
  )
}

// Étape finale : résumé + options + gros bouton.
function LaunchBar({ n, summary, options, label, disabled, running, onClick }: { n: number; summary: string; options?: ReactNode; label: string; disabled: boolean; running: boolean; onClick: () => void }) {
  return (
    <div style={{ ...card, border: '1px solid rgba(233,196,106,0.25)', background: '#121214' }}>
      <StepHead n={n} title="Lancer" sub={summary} />
      {options}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button style={{ ...gold, height: 40, padding: '0 22px', fontSize: 14, fontWeight: 600, background: disabled ? '#2A2A2E' : GOLD, borderColor: disabled ? '#2A2A2E' : GOLD, color: disabled ? MUTED : '#0A0A0B' }} disabled={disabled} onClick={onClick}>
          {running ? 'En cours…' : `▶ ${label}`}
        </button>
      </div>
    </div>
  )
}

function StepHead({ n, title, sub, right }: { n: number; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
      <span style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 99, background: 'rgba(233,196,106,0.14)', color: GOLD, fontSize: 13, fontWeight: 700, border: '1px solid rgba(233,196,106,0.35)' }}>{n}</span>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: INK, letterSpacing: '-0.01em' }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}
function Step({ n, title, sub, right, children }: { n: number; title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return <div style={card}><StepHead n={n} title={title} sub={sub} right={right} />{children}</div>
}
