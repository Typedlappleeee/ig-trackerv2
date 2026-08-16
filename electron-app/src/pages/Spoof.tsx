import { useState, useEffect, useRef, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { BankPicker } from '@/pages/Bank'
import { useOrg } from '@/lib/orgContext'
import { BankFolderSelect } from '@/components/BankFolderSelect'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { useTr } from '@/lib/i18n'
import { nextScaleflowNumber, scaleflowName } from '@/lib/bankNaming'

const PRESETS: Record<string, string> = {
  iphone17pro: 'iPhone 17 Pro',
  iphone16pro: 'iPhone 16 Pro',
  iphone16:    'iPhone 16',
  iphone15pro: 'iPhone 15 Pro',
  iphone15:    'iPhone 15',
  s24ultra:    'Galaxy S24 Ultra',
  s23ultra:    'Galaxy S23 Ultra',
  pixel8pro:   'Pixel 8 Pro',
  pixel9pro:   'Pixel 9 Pro',
}

// International locations grouped by country (label includes a flag).
// `id` sert de clé stable pour l'option « 🎲 Aléatoire <région> ».
const GPS_GROUPS: { id: string; country: string; cities: Record<string, string> }[] = [
  { id: 'france', country: '🇫🇷 France', cities: {
    paris: 'Paris', marseille: 'Marseille', lyon: 'Lyon', toulouse: 'Toulouse', nice: 'Nice', bordeaux: 'Bordeaux',
  }},
  { id: 'uk', country: '🇬🇧 Royaume-Uni / 🇮🇪 Irlande', cities: {
    london: 'Londres', manchester: 'Manchester', dublin: 'Dublin',
  }},
  { id: 'iberia', country: '🇪🇸 Espagne / 🇵🇹 Portugal', cities: {
    madrid: 'Madrid', barcelona: 'Barcelone', lisbon: 'Lisbonne',
  }},
  { id: 'italy', country: '🇮🇹 Italie', cities: {
    rome: 'Rome', milan: 'Milan',
  }},
  { id: 'central-eu', country: '🇩🇪 Europe centrale', cities: {
    berlin: 'Berlin', munich: 'Munich', amsterdam: 'Amsterdam', brussels: 'Bruxelles', zurich: 'Zurich', geneva: 'Genève',
  }},
  { id: 'usa', country: '🇺🇸 États-Unis', cities: {
    newyork: 'New York', losangeles: 'Los Angeles', chicago: 'Chicago', miami: 'Miami', houston: 'Houston', phoenix: 'Phoenix', dallas: 'Dallas', atlanta: 'Atlanta', lasvegas: 'Las Vegas', seattle: 'Seattle', denver: 'Denver', boston: 'Boston', sanfrancisco: 'San Francisco', sandiego: 'San Diego', austin: 'Austin', washington: 'Washington',
  }},
  { id: 'americas', country: '🌎 Amériques', cities: {
    toronto: 'Toronto', montreal: 'Montréal', mexico: 'Mexico', saopaulo: 'São Paulo',
  }},
  { id: 'asia', country: '🌏 Asie / Moyen-Orient / Océanie', cities: {
    dubai: 'Dubaï', istanbul: 'Istanbul', tokyo: 'Tokyo', singapore: 'Singapour', sydney: 'Sydney',
  }},
]

const GPS_CITY_KEYS = GPS_GROUPS.flatMap(g => Object.keys(g.cities))
const FRANCE_CITY_KEYS = Object.keys(GPS_GROUPS[0].cities) // GPS_GROUPS[0] is France
// Villes par région → clé « random_region:<id> » pour un aléatoire limité à une région.
const REGION_CITY_KEYS: Record<string, string[]> = Object.fromEntries(
  GPS_GROUPS.map(g => [`random_region:${g.id}`, Object.keys(g.cities)]),
)
const PRESET_KEYS = Object.keys(PRESETS)
const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

// Résout une sélection de ville (éventuellement aléatoire) en une ville concrète.
function resolveCity(sel: string): string {
  if (sel === 'random') return pickRandom(GPS_CITY_KEYS)
  // 'random_usa' est résolu CÔTÉ SERVEUR (jitter large réparti sur tout le pays)
  // → on le laisse passer tel quel plutôt que de figer une ville ici.
  if (sel === 'random_usa') return 'random_usa'
  if (sel === 'random_france') return pickRandom(FRANCE_CITY_KEYS)
  if (REGION_CITY_KEYS[sel]) return pickRandom(REGION_CITY_KEYS[sel])
  return sel
}

// Journal discret (jamais affiché dans l'UI) : anneau borné en localStorage +
// console.debug. Sert à diagnostiquer les erreurs de spoof après coup sans rien
// montrer à l'utilisateur. Récupérable via window.spoofLogs() dans la console.
function spoofLog(evt: string, data?: unknown) {
  try {
    const KEY = 'sf-spoof-log'
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown[]
    arr.push({ t: new Date().toISOString(), evt, data })
    while (arr.length > 200) arr.shift()
    localStorage.setItem(KEY, JSON.stringify(arr))
    console.debug('[spoof]', evt, data ?? '')
  } catch { /* le logging ne doit jamais casser le flow */ }
}
if (typeof window !== 'undefined') {
  ;(window as unknown as { spoofLogs?: () => unknown }).spoofLogs = () => {
    try { return JSON.parse(localStorage.getItem('sf-spoof-log') || '[]') } catch { return [] }
  }
}

type JobStatus = 'queued' | 'processing' | 'done' | 'error'

interface AppliedMeta {
  make: string; model: string; software: string; city: string
  gps: string; altitude: string; creationDate: string; timezone: string
  cameraId: string; lens: string; iso: number; exposure: string; aperture: string; focal: string
  encoder: string; crf: number; audioBitrate: string; gopSize: number; colorSpace: string
}

interface SpoofJob {
  id: string
  name: string
  url: string
  status: JobStatus
  outputUrl?: string
  storagePath?: string
  error?: string
  meta?: AppliedMeta
  savedToBank?: boolean
}

interface SelectedVideo { url: string; name: string }

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function Spoof({ user }: { user: User }) {
  const tr = useTr()
  const credits = useCredits()
  const { currentOrg } = useOrg()

  const [showBank, setShowBank]           = useState(false)
  const [saveFolder, setSaveFolder]       = useState<string | null>(null)
  const [savingAll, setSavingAll]         = useState(false)
  const [selectedVideos, setSelectedVideos] = useState<SelectedVideo[]>([])
  const [preset, setPreset]               = useState('random')
  const [gpsCity, setGpsCity]             = useState('random')
  const [showCustomize, setShowCustomize] = useState(false)
  const [customDate, setCustomDate]       = useState(todayStr)
  const [showAdjustments, setShowAdjustments] = useState(false)
  const [brightness, setBrightness]       = useState(0)
  const [saturation, setSaturation]       = useState(0)
  const [contrast, setContrast]           = useState(0)
  const [noise, setNoise]                 = useState(0)
  const [vignette, setVignette]           = useState(false)
  const [flipH, setFlipH]                 = useState(false)
  const [zoomPct, setZoomPct]             = useState(0)
  const [copies, setCopies]               = useState(1)
  const [jobs, setJobs]                   = useState<SpoofJob[]>([])
  const [running, setRunning]             = useState(false)
  const cancelRef                         = useRef(false)   // « Annuler » : stoppe le traitement en cours
  // Compteur de nommage « scaleflowN.mp4 ». Réservé avant le lot puis incrémenté
  // à chaque sauvegarde : JS est mono-thread → pas de doublon entre les workers.
  const bankNum                           = useRef(1)
  const [cancelling, setCancelling]       = useState(false)
  const [autoMode, setAutoMode]           = useState(true)
  const [randomDate, setRandomDate]       = useState(false)
  const [randomDateDays, setRandomDateDays] = useState(30) // fenêtre (jours) pour la date aléatoire
  const [showDebug, setShowDebug]         = useState(false)
  const [debugLogs, setDebugLogs]         = useState<unknown[]>([])

  // Panneau debug caché : Ctrl+Shift+D affiche les logs discrets (aucune trace UI).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault()
        try { setDebugLogs(JSON.parse(localStorage.getItem('sf-spoof-log') || '[]')) } catch { setDebugLogs([]) }
        setShowDebug(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Tire une date aléatoire dans les `days` derniers jours, au format YYYY-MM-DD.
  const randomDateStr = (days: number) => {
    const d = new Date(Date.now() - Math.floor(Math.random() * days) * 86400000)
    return d.toISOString().slice(0, 10)
  }

  // Réglages aléatoires (modérés) générés PAR VIDÉO en mode automatique.
  // Objectif : un max de petits détails uniques entre chaque vidéo SANS jamais
  // toucher la lisibilité du texte à l'écran → donc PAS de flip horizontal
  // (le miroir inverse le texte). Tout le reste reste imperceptible à l'œil.
  const randInt   = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
  const randFloat = (min: number, max: number, d = 3) => +(Math.random() * (max - min) + min).toFixed(d)
  const randomAdjustments = () => ({
    brightness: randInt(-10, 10),
    saturation: randInt(-12, 12),
    contrast:   randInt(-10, 10),
    gamma:      randFloat(0.92, 1.08),   // gamma léger
    hue:        randInt(-6, 6),          // teinte ±6°
    noise:      randInt(4, 12),          // grain/pixels
    sharpen:    randFloat(0, 0.5, 2),    // netteté subtile
    zoomPct:    randInt(2, 7),           // léger zoom
    panX:       randInt(-20, 20),        // recadrage horizontal (% de la marge)
    panY:       randInt(-20, 20),        // recadrage vertical
    speed:      randFloat(0.97, 1.03),   // micro-vitesse
    vignette:   Math.random() < 0.35,
    flipH:      false,                   // JAMAIS — le miroir casse le texte
  })

  function updateJob(id: string, patch: Partial<SpoofJob>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }

  async function saveJobToBank(job: SpoofJob): Promise<boolean> {
    if (!job.storagePath || job.savedToBank) return false
    const n = await nextScaleflowNumber(user.id, currentOrg?.id ?? null)
    const { error } = await supabase.from('content_bank').insert({
      user_id: user.id, org_id: currentOrg?.id ?? null,
      title: scaleflowName(n),
      file_url: null,
      storage_path: job.storagePath,
      thumbnail_path: null,
      folder: saveFolder,
      tags: ['spoof', ...(job.meta ? [job.meta.model, job.meta.city].filter(Boolean) : [])],
      notes: '',
    })
    if (error) { alert(tr('Échec de l\'enregistrement : ', 'Save failed: ') + error.message); return false }
    updateJob(job.id, { savedToBank: true })
    return true
  }

  async function saveAllToBank() {
    setSavingAll(true)
    try {
      for (const job of jobs.filter(j => j.status === 'done' && j.storagePath && !j.savedToBank)) {
        await saveJobToBank(job)
      }
    } finally {
      setSavingAll(false)
    }
  }

  // Annule la tâche en cours : on arrête de lancer de nouveaux spoofs.
  function cancelSpoof() { cancelRef.current = true; setCancelling(true) }

  async function runSpoof() {
    if (!selectedVideos.length || running) return
    cancelRef.current = false; setCancelling(false)
    bankNum.current = await nextScaleflowNumber(user.id, currentOrg?.id ?? null)   // numérotation du lot

    const totalOutputs = selectedVideos.length * copies
    const creditCost = totalOutputs * CREDIT_COSTS.clone_vid
    if (creditCost > 0) {
      const creditRes = await checkAndDeductCredits(credits.ownerId, creditCost)
      if (!creditRes.ok) {
        const balance = creditRes.balance ?? credits.balance
        alert(tr(`Crédits insuffisants — ${creditCost} crédits requis. Solde: ${balance}`, `Insufficient credits — ${creditCost} credits required. Balance: ${balance}`))
        return
      }
      if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)
    }

    // Each source video produces `copies` independent spoofed outputs — every
    // copy gets its own unique metadata (GPS, date, camera id, encoding…).
    const initialJobs: SpoofJob[] = selectedVideos.flatMap((v, vi) =>
      Array.from({ length: copies }, (_, c) => ({
        id: `${Date.now()}_${vi}_${c}`,
        name: copies > 1 ? tr(`${v.name} (copie ${c + 1}/${copies})`, `${v.name} (copy ${c + 1}/${copies})`) : v.name,
        url: v.url,
        status: 'queued' as JobStatus,
      })),
    )
    setJobs(initialJobs)
    setRunning(true)

    const { data: { session } } = await supabase.auth.getSession()
    spoofLog('run:start', { jobs: initialJobs.length, preset, gpsCity, autoMode, copies })

    // Traite UN job (1 vidéo → 1 sortie spoofée) avec auto-retry.
    const processJob = async (job: SpoofJob) => {
      updateJob(job.id, { status: 'processing' })

      // Mode automatique : chaque vidéo/copie reçoit ses propres réglages aléatoires.
      const adj = autoMode ? randomAdjustments() : { brightness, saturation, contrast, noise, vignette, flipH, zoomPct }
      // Résolution PAR JOB : téléphone + ville peuvent être aléatoires → chaque
      // sortie a un device et une localisation différents (empreinte plus variée).
      const resolvedPreset = preset === 'random' ? pickRandom(PRESET_KEYS) : preset
      const resolvedCity   = resolveCity(gpsCity)
      // Date : fixe (customDate) ou aléatoire dans les N derniers jours, PAR job.
      const resolvedDate   = randomDate ? randomDateStr(randomDateDays) : customDate
      spoofLog('job:start', { id: job.id, name: job.name, resolvedPreset, resolvedCity, resolvedDate })

      // Auto-retry : les échecs du spoof sont surtout transitoires (timeout 60s
      // Vercel + cold start, hoquet réseau) → re-tenter suffit presque toujours.
      // Jusqu'à 3 tentatives avec backoff. Pas de risque de double débit (le
      // spoof est gratuit) ; une tentative qui a timeout n'a rien enregistré en
      // banque côté client, donc on ne crée pas de doublon.
      const MAX_TRIES = 3
      let lastErr = tr('Erreur inconnue', 'Unknown error')
      let succeeded = false
      for (let attempt = 1; attempt <= MAX_TRIES && !succeeded; attempt++) {
        try {
          const res = await fetch('/api/repurpose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceUrl: job.url,
              userId: user.id,
              mode: 'spoof',
              preset: resolvedPreset,
              gpsCity: resolvedCity,
              customDate: resolvedDate.replace(/-/g, ':'),
              adjustments: adj,
              supabaseToken: session?.access_token,
              supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            }),
          })
          const data = await res.json().catch(() => ({ ok: false, error: tr(`Réponse serveur invalide (HTTP ${res.status})`, `Invalid server response (HTTP ${res.status})`) }))
          if (data.ok) {
            // Auto-enregistrement dans la banque dès qu'une vidéo est prête
            // (dossier choisi, ou racine si aucun) — plus besoin de cliquer.
            let savedOk = false
            if (data.storagePath) {
              const { error: bankErr } = await supabase.from('content_bank').insert({
                user_id: user.id, org_id: currentOrg?.id ?? null,
                title: scaleflowName(bankNum.current++),
                file_url: null, storage_path: data.storagePath, thumbnail_path: null,
                folder: saveFolder,
                // meta dans les tags (pas dans notes, qui sert de description/légende).
                tags: ['spoof', ...(data.appliedMeta ? [data.appliedMeta.model, data.appliedMeta.city].filter(Boolean) : [])],
                notes: '',
              })
              savedOk = !bankErr
              if (bankErr) { console.error('[Spoof] auto-save bank failed', bankErr); spoofLog('job:bank-error', { id: job.id, error: bankErr.message }) }
            }
            updateJob(job.id, { status: 'done', outputUrl: data.url, storagePath: data.storagePath, meta: data.appliedMeta, savedToBank: savedOk })
            succeeded = true
            spoofLog('job:done', { id: job.id, attempt, savedOk })
          } else {
            lastErr = data.error ?? tr('Erreur inconnue', 'Unknown error')
          }
        } catch (err) {
          lastErr = String(err)
        }
        if (!succeeded && attempt < MAX_TRIES) {
          spoofLog('job:retry', { id: job.id, attempt, error: lastErr })
          updateJob(job.id, { status: 'processing', error: tr(`nouvelle tentative ${attempt + 1}/${MAX_TRIES}…`, `retry ${attempt + 1}/${MAX_TRIES}…`) })
          await new Promise(r => setTimeout(r, 2500 * attempt))
        }
      }
      if (!succeeded) { updateJob(job.id, { status: 'error', error: lastErr }); spoofLog('job:error', { id: job.id, error: lastErr }) }
    }

    try {
      // Parallélisme borné. ⚠ Vercel « Fluid Compute » peut router plusieurs
      // requêtes sur LA MÊME instance → elles partagent le même /tmp (~512 Mo).
      // Trop de spoofs en parallèle = fichiers temp cumulés > 512 Mo → « ENOSPC:
      // no space left on device ». On limite à 2 pour que le pic de /tmp tienne.
      const CONCURRENCY = Math.min(2, initialJobs.length)
      let cursor = 0
      const worker = async () => {
        while (cursor < initialJobs.length) {
          if (cancelRef.current) break   // annulé → on ne lance plus de nouveaux jobs
          const job = initialJobs[cursor++]
          await processJob(job)
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
      if (cancelRef.current) setJobs(prev => prev.map(j => (j.status === 'queued' || j.status === 'processing') ? { ...j, status: 'error', error: 'annulé' } : j))
      spoofLog('run:end', { jobs: initialJobs.length })
    } finally {
      setRunning(false); setCancelling(false)
    }
  }

  function removeVideo(i: number) {
    setSelectedVideos(prev => prev.filter((_, idx) => idx !== i))
    setJobs([])
  }

  const doneCount = jobs.filter(j => j.status === 'done').length
  const totalOutputs = selectedVideos.length * copies
  const creditCost = totalOutputs * CREDIT_COSTS.clone_vid

  return (
    <div className="sf-page anim-page" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--base)' }}>
      {showBank && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const newVids = paths.map((url, i) => ({ url, name: titles?.[i] ?? 'video' }))
            setSelectedVideos(prev => [...prev, ...newVids])
            setJobs([])
            setShowBank(false)
          }}
          onClose={() => setShowBank(false)}
        />
      )}

      {/* ── Panneau debug caché (Ctrl+Shift+D) — diagnostic des erreurs de spoof ── */}
      {showDebug && (
        <div
          onClick={() => setShowDebug(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="sf-card"
            style={{ width: 'min(720px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 16, gap: 10 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13, color: 'var(--ivory)' }}>{tr('🕵️ Journal spoof (debug)', '🕵️ Spoof log (debug)')}</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="sf-btn sf-btn-secondary cursor-pointer" style={{ fontSize: 11 }}
                  onClick={() => { try { navigator.clipboard?.writeText(JSON.stringify(debugLogs, null, 2)) } catch { /* noop */ } }}
                >{tr('Copier', 'Copy')}</button>
                <button
                  className="sf-btn sf-btn-secondary cursor-pointer" style={{ fontSize: 11 }}
                  onClick={() => { localStorage.removeItem('sf-spoof-log'); setDebugLogs([]) }}
                >{tr('Vider', 'Clear')}</button>
                <button className="sf-btn sf-btn-ghost cursor-pointer" style={{ fontSize: 11 }} onClick={() => setShowDebug(false)}>✕</button>
              </div>
            </div>
            <div style={{ overflow: 'auto', background: '#0b0b12', borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 11, color: '#c8c8e0', whiteSpace: 'pre-wrap', flex: 1 }}>
              {debugLogs.length === 0
                ? tr('Aucun log pour le moment.', 'No logs yet.')
                : (debugLogs as { t: string; evt: string; data?: unknown }[]).slice().reverse().map((l, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <span style={{ color: '#6b7280' }}>{(l.t || '').slice(11, 19)}</span>{' '}
                      <span style={{ color: l.evt?.includes('error') ? '#f87171' : l.evt?.includes('done') ? '#34d399' : '#818cf8' }}>{l.evt}</span>{' '}
                      {l.data ? JSON.stringify(l.data) : ''}
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="sf-page-header" style={{ background: 'rgba(7,7,12,0.96)', backdropFilter: 'var(--blur-md)' }}>
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" style={{ '--icon-grad': 'linear-gradient(135deg,#10B981,#059669)', boxShadow: '0 10px 24px -8px rgba(16,185,129,0.5), inset 0 1px 0 0 rgba(255,255,255,0.35)' } as CSSProperties}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title">Spoof</h1>
            <p className="sf-page-sub">{tr('Métadonnées iPhone authentiques + GPS multi-pays · chaque export est unique', 'Authentic iPhone metadata + multi-country GPS · every export is unique')}</p>
          </div>
        </div>
        {running && (
          <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
            <span className="sf-status-chip">
              <span className="sf-status-dot" />
              {tr('Traitement…', 'Processing…')}
            </span>
          </div>
        )}
      </header>

      {/* ── Spoof body ── */}
      {(
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

          {/* ── Left panel ── */}
          <div className="anim-stagger" style={{ width: 290, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Source videos */}
            <div style={{ padding: '16px 16px 0' }}>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Vidéos source', 'Source videos')}</div>

              <button
                onClick={() => setShowBank(true)}
                disabled={running}
                className="sf-btn sf-btn-secondary cursor-pointer"
                style={{ width: '100%', justifyContent: 'center', marginBottom: selectedVideos.length ? 8 : 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8h20M4 8V6a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8M10 12h4"/></svg>
                {selectedVideos.length
                  ? tr(`${selectedVideos.length} vidéo${selectedVideos.length > 1 ? 's' : ''} · Ajouter`, `${selectedVideos.length} video${selectedVideos.length > 1 ? 's' : ''} · Add`)
                  : tr('Ajouter vidéos', 'Add videos')}
              </button>

              {selectedVideos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selectedVideos.map((v, i) => (
                    <div key={i} className="sf-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.7)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
                      <span style={{ flex: 1, fontSize: 11, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.name.slice(0, 22)}{v.name.length > 22 ? '…' : ''}
                      </span>
                      {!running && (
                        <button onClick={() => removeVideo(i)}
                          className="sf-btn sf-btn-ghost sf-btn-icon cursor-pointer"
                          style={{ width: 20, height: 20, minWidth: 0 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sf-divider" style={{ margin: '16px 0' }} />

            {/* Mode automatique — contrôle principal, tout le reste est optionnel */}
            <div style={{ padding: '0 16px' }}>
              <button onClick={() => setAutoMode(v => !v)} disabled={running} className="cursor-pointer"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderRadius: 11, background: autoMode ? 'rgba(99,102,241,0.12)' : 'var(--surface-2)', border: `1px solid ${autoMode ? 'rgba(99,102,241,0.35)' : 'var(--border)'}` }}>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{tr('⚡ Automatique', '⚡ Automatic')}</p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-4)', margin: '2px 0 0' }}>{tr('Recommandé · chaque vidéo unique, réglé pour toi', 'Recommended · every video unique, tuned for you')}</p>
                </div>
                <span className={`sf-toggle-track ${autoMode ? 'on' : 'off'}`} style={{ flexShrink: 0 }}>
                  <span className="sf-toggle-thumb" />
                </span>
              </button>
            </div>

            <div className="sf-divider" style={{ margin: '16px 0' }} />

            {/* Personnaliser (device, lieu, date) — replié par défaut pour rester épuré */}
            <div style={{ padding: '0 16px' }}>
              <button
                onClick={() => setShowCustomize(v => !v)}
                className="cursor-pointer"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', textAlign: 'left',
                  background: showCustomize ? 'rgba(99,102,241,0.1)' : 'var(--surface-2)',
                  color: showCustomize ? '#6366F1' : 'var(--text-2)',
                  outline: showCustomize ? '1px solid rgba(99,102,241,0.25)' : '1px solid var(--border)',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                {tr('Personnaliser (appareil, lieu, date)', 'Customize (device, location, date)')}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ marginLeft: 'auto', transform: showCustomize ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {!showCustomize && (
                <p style={{ fontSize: 10.5, color: 'var(--muted)', margin: '6px 2px 0' }}>
                  {tr('Par défaut : appareil + lieu aléatoires. Ouvre pour fixer un modèle précis.', 'Default: random device + location. Open to pin a specific one.')}
                </p>
              )}
            </div>

            {showCustomize && (<>

            <div className="sf-divider" style={{ margin: '16px 0' }} />

            {/* Device model */}
            <div style={{ padding: '0 16px' }}>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Appareil', 'Device')}</div>
              <div className="sf-segment" style={{ flexWrap: 'wrap' }}>
                <button
                  onClick={() => setPreset('random')}
                  disabled={running}
                  className={`sf-segment-item cursor-pointer${preset === 'random' ? ' is-active' : ''}`}
                >
                  {tr('🎲 Aléatoire', '🎲 Random')}
                </button>
                {Object.entries(PRESETS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPreset(key)}
                    disabled={running}
                    className={`sf-segment-item cursor-pointer${preset === key ? ' is-active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {preset === 'random' && (
                <p style={{ fontSize: 10.5, color: 'var(--muted)', margin: '6px 2px 0' }}>
                  {tr('Chaque vidéo reçoit un modèle différent au hasard (iPhone + Android).', 'Each video gets a different random model (iPhone + Android).')}
                </p>
              )}
            </div>

            <div className="sf-divider" style={{ margin: '16px 0' }} />

            {/* GPS location */}
            <div style={{ padding: '0 16px' }}>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('🏙 Localisation GPS', '🏙 GPS location')}</div>
              <select
                value={gpsCity}
                onChange={e => setGpsCity(e.target.value)}
                disabled={running}
                className="sf-input"
                style={{ width: '100%', fontSize: 12, color: '#e8e8f0', background: '#1a1a2e' }}
              >
                <option value="random" style={{ color: '#e8e8f0', background: '#1a1a2e' }}>{tr('🎲 Aléatoire (tous pays)', '🎲 Random (all countries)')}</option>
                <option value="random_usa" style={{ color: '#e8e8f0', background: '#1a1a2e' }}>{tr('🇺🇸 Aléatoire USA (tout le pays)', '🇺🇸 Random USA (whole country)')}</option>
                <optgroup label={tr('🎲 Aléatoire par région', '🎲 Random by region')} style={{ color: '#a0a0c0', background: '#0f0f1e', fontWeight: 600 }}>
                  {GPS_GROUPS.map(group => (
                    <option key={`rnd-${group.id}`} value={`random_region:${group.id}`} style={{ color: '#e8e8f0', background: '#1a1a2e' }}>
                      {tr('🎲 ', '🎲 ')}{group.country}
                    </option>
                  ))}
                </optgroup>
                {GPS_GROUPS.map(group => (
                  <optgroup key={group.country} label={group.country} style={{ color: '#a0a0c0', background: '#0f0f1e', fontWeight: 600 }}>
                    {Object.entries(group.cities).map(([key, label]) => (
                      <option key={key} value={key} style={{ color: '#e8e8f0', background: '#1a1a2e' }}>{label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="sf-divider" style={{ margin: '16px 0' }} />

            {/* Custom date */}
            <div style={{ padding: '0 16px' }}>
              <div className="sf-section-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{tr('Date de création', 'Creation date')}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--muted)', cursor: running ? 'default' : 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                  <input type="checkbox" checked={randomDate} disabled={running} onChange={e => setRandomDate(e.target.checked)} style={{ cursor: 'inherit' }} />
                  {tr('🎲 Aléatoire', '🎲 Random')}
                </label>
              </div>
              {randomDate ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min={1} max={365} value={randomDateDays}
                    onChange={e => setRandomDateDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                    disabled={running}
                    className="sf-input"
                    style={{ width: 72, fontSize: 12 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {tr(`derniers jours (date tirée au hasard par vidéo)`, `last days (random date per video)`)}
                  </span>
                </div>
              ) : (
                <input
                  type="date"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  disabled={running}
                  className="sf-input"
                  style={{ width: '100%', fontSize: 12 }}
                />
              )}
            </div>

            </>)}

            <div className="sf-divider" style={{ margin: '16px 0' }} />

            {/* Copies per video */}
            <div style={{ padding: '0 16px' }}>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>
                {tr('Copies par vidéo', 'Copies per video')}
                <span style={{ fontWeight: 400, color: 'var(--text-4)', marginLeft: 6 }}>{tr('chaque copie = métadonnées uniques', 'each copy = unique metadata')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setCopies(c => Math.max(1, c - 1))}
                  disabled={running || copies <= 1}
                  className="sf-btn cursor-pointer"
                  style={{ width: 34, height: 34, fontSize: 18, lineHeight: 1, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: copies <= 1 ? 0.5 : 1 }}
                >−</button>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#818CF8', fontVariantNumeric: 'tabular-nums' }}>{copies}</div>
                <button
                  onClick={() => setCopies(c => Math.min(20, c + 1))}
                  disabled={running || copies >= 20}
                  className="sf-btn cursor-pointer"
                  style={{ width: 34, height: 34, fontSize: 18, lineHeight: 1, borderRadius: 8, background: 'rgba(99,102,241,0.1)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: copies >= 20 ? 0.5 : 1 }}
                >+</button>
              </div>
              {selectedVideos.length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 6, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {selectedVideos.length} {tr(`vidéo${selectedVideos.length > 1 ? 's' : ''}`, `video${selectedVideos.length > 1 ? 's' : ''}`)} × {copies} = <b style={{ color: '#818CF8' }}>{totalOutputs}</b> {tr(`export${totalOutputs > 1 ? 's' : ''}`, `export${totalOutputs > 1 ? 's' : ''}`)}
                </div>
              )}
            </div>

            <div className="sf-divider" style={{ margin: '16px 0' }} />

            {/* Bank destination */}
            <div style={{ padding: '0 16px' }}>
              <BankFolderSelect value={saveFolder} onChange={setSaveFolder} userId={user.id} orgId={currentOrg?.id} label={tr('Dossier de destination', 'Destination folder')} />
            </div>

            <div className="sf-divider" style={{ margin: '16px 0' }} />

            {/* Visual adjustments collapsible */}
            <div style={{ padding: '0 16px' }}>
              <button
                onClick={() => setShowAdjustments(v => !v)}
                className="cursor-pointer"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', textAlign: 'left',
                  background: showAdjustments ? 'rgba(99,102,241,0.1)' : 'var(--surface-2)',
                  color: showAdjustments ? '#6366F1' : 'var(--text-2)',
                  outline: showAdjustments ? '1px solid rgba(99,102,241,0.25)' : '1px solid var(--border)',
                  transition: 'all 0.15s',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
                {tr('Réglages manuels (avancé)', 'Manual settings (advanced)')}
                <svg
                  width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ marginLeft: 'auto', transform: showAdjustments ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {showAdjustments && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {autoMode && (
                    <div className="sf-banner is-accent" style={{ fontSize: 11, lineHeight: 1.5 }}>
                      {tr("Mode Automatique actif → ces réglages manuels sont ignorés. Désactive l'Automatique en haut pour les utiliser.", 'Automatic mode is on → these manual settings are ignored. Turn off Automatic at the top to use them.')}
                    </div>
                  )}

                  {/* Sliders */}
                  {([
                    { label: tr('Luminosité', 'Brightness'), value: brightness, set: setBrightness, min: -50, max: 50 },
                    { label: tr('Saturation', 'Saturation'), value: saturation, set: setSaturation, min: -50, max: 50 },
                    { label: tr('Contraste', 'Contrast'),  value: contrast,   set: setContrast,   min: -50, max: 50 },
                    { label: tr('Grain/Bruit', 'Grain/Noise'), value: noise,     set: setNoise,      min: 0,   max: 30 },
                    { label: tr('Zoom (%)', 'Zoom (%)'),   value: zoomPct,    set: setZoomPct,    min: 0,   max: 15 },
                  ] as const).map(({ label, value, set, min, max }) => (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: 11, color: '#6366F1', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={value}
                        disabled={running || autoMode}
                        onChange={e => (set as (v: number) => void)(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#6366F1', cursor: 'pointer' }}
                      />
                    </div>
                  ))}

                  {/* Toggles */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([
                      { label: tr('Flip H', 'Flip H'), value: flipH, set: setFlipH },
                      { label: tr('Vignette', 'Vignette'), value: vignette, set: setVignette },
                    ] as const).map(({ label, value, set }) => (
                      <button
                        key={label}
                        onClick={() => (set as (v: boolean) => void)(!value)}
                        disabled={running || autoMode}
                        className={`sf-btn sf-btn-sm cursor-pointer ${value ? 'sf-btn-primary' : 'sf-btn-secondary'}`}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Credits + Run button */}
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
              {selectedVideos.length > 0 && !running && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span className="sf-badge sf-badge-accent" style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                    {creditCost} {tr(`crédit${creditCost > 1 ? 's' : ''}`, `credit${creditCost > 1 ? 's' : ''}`)} · {totalOutputs} {tr(`export${totalOutputs > 1 ? 's' : ''}`, `export${totalOutputs > 1 ? 's' : ''}`)}
                  </span>
                </div>
              )}
              <button
                onClick={runSpoof}
                disabled={!selectedVideos.length || running}
                className={`sf-btn sf-btn-lg cursor-pointer ${running ? 'sf-btn-danger' : 'sf-btn-primary'}`}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {running ? (
                  <>
                    <span className="sf-spinner" />
                    <span className="sf-tabular">{tr(`Traitement ${doneCount}/${totalOutputs}…`, `Processing ${doneCount}/${totalOutputs}…`)}</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    {tr('Spoofing', 'Spoofing')} {totalOutputs > 0 ? `(${totalOutputs})` : ''}
                  </>
                )}
              </button>
              {running && (
                <button onClick={cancelSpoof} disabled={cancelling} className="sf-btn cursor-pointer"
                  style={{ width: '100%', justifyContent: 'center', background: 'rgba(248,113,113,0.14)', border: '1px solid rgba(248,113,113,0.4)', color: '#F87171', fontWeight: 700 }}>
                  {cancelling ? tr('Annulation…', 'Cancelling…') : tr('Annuler', 'Cancel')}
                </button>
              )}
            </div>
          </div>

          {/* ── Right panel: job results ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', background: 'var(--base)' }}>
            {jobs.length === 0 ? (
              <div className="sf-empty anim-stagger" style={{ height: '100%' }}>
                <div style={{ position: 'relative', width: 76, height: 76, margin: '0 auto 8px' }}>
                  <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1px dashed rgba(99,102,241,0.18)', animation: 'spin 14s linear infinite' }} />
                  <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '1px dashed rgba(99,102,241,0.12)', animation: 'spin 20s linear infinite reverse' }} />
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, rgba(99,102,241,0.1), rgba(129,140,248,0.06))', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                </div>
                <p className="sf-empty-title">{tr('Aucune vidéo traitée', 'No video processed')}</p>
                <p className="sf-empty-desc">{tr('Sélectionne ', 'Select ')}<b>{tr('2 vidéos ou plus', '2 or more videos')}</b>{tr(' depuis la banque pour les spoofer', ' from the bank to spoof them')}<br />{tr('et comparer les métadonnées injectées côte à côte.', 'and compare the injected metadata side by side.')}</p>
                <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[tr('Métadonnées iPhone', 'iPhone metadata'), tr('GPS multi-pays', 'Multi-country GPS'), tr('Altitude + objectif', 'Altitude + lens'), tr('ID caméra unique', 'Unique camera ID')].map(pill => (
                    <span key={pill} className="sf-badge" style={{ padding: '4px 10px', background: 'rgba(99,102,241,0.05)', color: 'rgba(99,102,241,0.65)', border: '1px solid rgba(99,102,241,0.12)', fontSize: 10 }}>
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Save-to-bank bar */}
                {doneCount > 0 && (
                  <div className="sf-banner is-accent">
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--text-3)' }}>
                      {tr('Dossier : ', 'Folder: ')}<span style={{ color: 'var(--accent-lt)', fontWeight: 600 }}>{saveFolder ?? tr('Racine', 'Root')}</span>
                    </div>
                    <button
                      onClick={saveAllToBank}
                      disabled={savingAll || jobs.every(j => j.savedToBank || j.status !== 'done')}
                      className="sf-btn sf-btn-sm sf-btn-primary sf-banner-action cursor-pointer sf-tabular"
                    >
                      {savingAll
                        ? <><span className="sf-spinner" /> {tr('Enregistrement…', 'Saving…')}</>
                        : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h16"/><path d="M4 12v4h4l4-4 4 4h4v-4"/><path d="M12 4v12"/></svg> {tr(`Tout enregistrer (${doneCount})`, `Save all (${doneCount})`)}</>
                      }
                    </button>
                  </div>
                )}
                {jobs.map(job => (
                  <SpoofJobCard key={job.id} job={job} onSave={() => saveJobToBank(job)} />
                ))}
                {doneCount >= 2 && <ComparePanel jobs={jobs} />}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  )
}

function SpoofJobCard({ job, onSave }: { job: SpoofJob; onSave: () => void }) {
  const tr = useTr()
  const isDone = job.status === 'done'
  const isErr  = job.status === 'error'
  const isProc = job.status === 'processing'
  const isQ    = job.status === 'queued'

  async function download() {
    if (!job.outputUrl) return
    try {
      const res  = await fetch(job.outputUrl)
      const blob = await res.blob()
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'video/mp4' }))
      a.download = `spoof_${job.name.replace(/\.[^.]+$/, '')}.mov`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    } catch {
      const a = document.createElement('a')
      a.href = job.outputUrl!
      a.download = `spoof_${job.name.replace(/\.[^.]+$/, '')}.mov`
      a.click()
    }
  }

  const META_ROWS: { label: string; key: keyof AppliedMeta }[] = [
    { label: tr('Appareil', 'Device'),    key: 'model' },
    { label: tr('Marque', 'Make'),      key: 'make' },
    { label: tr('Logiciel', 'Software'),    key: 'software' },
    { label: tr('Objectif', 'Lens'),    key: 'lens' },
    { label: tr('Localisation', 'Location'),key: 'city' },
    { label: tr('GPS', 'GPS'),         key: 'gps' },
    { label: tr('Altitude', 'Altitude'),    key: 'altitude' },
    { label: tr('Date', 'Date'),        key: 'creationDate' },
    { label: tr('Fuseau', 'Timezone'),      key: 'timezone' },
    { label: tr('ID Caméra', 'Camera ID'),   key: 'cameraId' },
    { label: tr('ISO', 'ISO'),         key: 'iso' },
    { label: tr('Exposition', 'Exposure'),  key: 'exposure' },
    { label: tr('Ouverture', 'Aperture'),   key: 'aperture' },
    { label: tr('Focale', 'Focal length'),      key: 'focal' },
    { label: tr('Encodeur', 'Encoder'),    key: 'encoder' },
    { label: tr('CRF', 'CRF'),         key: 'crf' },
    { label: tr('Audio', 'Audio'),       key: 'audioBitrate' },
    { label: tr('GOP', 'GOP'),         key: 'gopSize' },
    { label: tr('Colorimétrie', 'Color space'),key: 'colorSpace' },
  ]

  return (
    <div
      className="sf-card"
      style={{
        borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12,
        borderColor: isDone ? 'rgba(99,102,241,0.3)' : isErr ? 'rgba(239,68,68,0.25)' : 'var(--border)',
        boxShadow: isDone ? '0 0 20px -6px rgba(99,102,241,0.12)' : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Status icon / video preview */}
        {isDone && job.outputUrl ? (
          <div style={{ width: 44, height: 60, borderRadius: 9, flexShrink: 0, overflow: 'hidden', background: '#000', border: '1px solid rgba(99,102,241,0.25)', position: 'relative' }}>
            <video
              src={job.outputUrl}
              muted loop playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onMouseEnter={e => (e.target as HTMLVideoElement).play().catch(() => {})}
              onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
            />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)" stroke="none"><polygon points="6,4 20,12 6,20"/></svg>
            </div>
          </div>
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isErr ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isErr ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
          }}>
            {isQ && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="1.75" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            {isProc && <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.2)', borderTopColor: '#6366F1', animation: 'spin 0.9s linear infinite' }} />}
            {isErr && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.name}
          </div>
          <div style={{ fontSize: 10, color: isDone ? 'rgba(99,102,241,0.7)' : isErr ? '#f87171' : 'var(--text-4)', marginTop: 2 }}>
            {isQ && tr('En attente…', 'Queued…')}
            {isProc && tr('Traitement en cours…', 'Processing…')}
            {isDone && (job.meta ? `📱 ${job.meta.model} · 📍 ${job.meta.city}` : tr('Spoofing terminé', 'Spoofing done'))}
            {isErr && (job.error?.slice(0, 60) ?? tr('Erreur', 'Error'))}
          </div>
        </div>

        {/* Actions */}
        {isDone && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={download}
              className="sf-btn cursor-pointer"
              style={{ height: 30, fontSize: 10, padding: '0 10px', background: 'rgba(99,102,241,0.1)', color: '#6366F1', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 7, gap: 5 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              {tr('Télécharger', 'Download')}
            </button>
            {job.storagePath && (
              job.savedToBank ? (
                <span
                  className="sf-badge sf-badge-ok"
                  style={{ height: 30, fontSize: 10, padding: '0 10px', borderRadius: 7, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {tr('Enregistré', 'Saved')}
                </span>
              ) : (
                <button
                  onClick={onSave}
                  className="sf-btn cursor-pointer"
                  style={{ height: 30, fontSize: 10, padding: '0 10px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 7, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {tr('Enregistrer', 'Save')}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Injected metadata — lets you verify / compare what changed per video */}
      {isDone && job.meta && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px 16px',
          padding: '12px', borderRadius: 9, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {META_ROWS.map(({ label, key }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 9, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--ivory)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(job.meta![key])}>
                {String(job.meta![key])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const COMPARE_ROWS: { label: string; en: string; key: keyof AppliedMeta; unique?: boolean }[] = [
  { label: 'Appareil',    en: 'Device',    key: 'model' },
  { label: 'Logiciel',    en: 'Software',    key: 'software' },
  { label: 'Localisation', en: 'Location', key: 'city',        unique: true },
  { label: 'GPS',         en: 'GPS',         key: 'gps',          unique: true },
  { label: 'Altitude',    en: 'Altitude',    key: 'altitude',     unique: true },
  { label: 'Date / heure', en: 'Date / time', key: 'creationDate', unique: true },
  { label: 'Fuseau',      en: 'Timezone',      key: 'timezone' },
  { label: 'Objectif',    en: 'Lens',    key: 'lens' },
  { label: 'ISO',         en: 'ISO',         key: 'iso',          unique: true },
  { label: 'Exposition',  en: 'Exposure',  key: 'exposure',     unique: true },
  { label: 'Ouverture',   en: 'Aperture',   key: 'aperture' },
  { label: 'ID Caméra',   en: 'Camera ID',   key: 'cameraId',     unique: true },
  { label: 'Encodeur',    en: 'Encoder',    key: 'encoder' },
  { label: 'CRF',         en: 'CRF',         key: 'crf',          unique: true },
  { label: 'Audio',       en: 'Audio',       key: 'audioBitrate', unique: true },
  { label: 'GOP',         en: 'GOP',         key: 'gopSize',      unique: true },
  { label: 'Colorimétrie', en: 'Color space', key: 'colorSpace' },
]

function ComparePanel({ jobs }: { jobs: SpoofJob[] }) {
  const tr = useTr()
  const done = jobs.filter(j => j.status === 'done' && j.meta)
  if (done.length < 2) return null

  return (
    <div style={{
      borderRadius: 12, padding: '14px 16px',
      background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.18)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>
          {tr(`Comparaison — ${done.length} vidéos spoofées avec des métadonnées différentes`, `Comparison — ${done.length} videos spoofed with different metadata`)}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', color: 'var(--text-4)', fontWeight: 600, paddingBottom: 8, paddingRight: 12, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{tr('Champ', 'Field')}</th>
              {done.map((j, i) => (
                <th key={j.id} style={{ textAlign: 'left', color: '#6366F1', fontWeight: 700, paddingBottom: 8, paddingLeft: 8, fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {tr('Vidéo', 'Video')} {i + 1} — {j.name.slice(0, 18)}{j.name.length > 18 ? '…' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map(({ label, en, key, unique }) => {
              const vals = done.map(j => String(j.meta![key] ?? '—'))
              const allSame = vals.every(v => v === vals[0])
              return (
                <tr key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '5px 12px 5px 0', color: 'var(--text-4)', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {tr(label, en)}
                  </td>
                  {vals.map((val, i) => (
                    <td key={i} style={{
                      padding: '5px 8px', verticalAlign: 'top',
                      color: unique && !allSame ? '#22c55e' : 'var(--ivory)',
                      fontWeight: unique && !allSame ? 700 : 400,
                      maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={val}>
                      {unique && !allSame && <span style={{ marginRight: 4, fontSize: 9 }}>✓</span>}
                      {val}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-4)', fontStyle: 'italic' }}>
        {tr('Les champs en vert ', 'The fields in green ')}<span style={{ color: '#22c55e' }}>✓</span>{tr(' sont différents entre chaque vidéo — GPS, horodatage, ID caméra, encodage vidéo, etc.', ' differ between each video — GPS, timestamp, camera ID, video encoding, etc.')}
      </div>
    </div>
  )
}
