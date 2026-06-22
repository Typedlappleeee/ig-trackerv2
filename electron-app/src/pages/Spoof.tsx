import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { BankPicker } from '@/pages/Bank'
import { useOrg } from '@/lib/orgContext'
import { BankFolderSelect } from '@/components/BankFolderSelect'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'

const PRESETS: Record<string, string> = {
  iphone17pro: 'iPhone 17 Pro',
  iphone16pro: 'iPhone 16 Pro',
  iphone16:    'iPhone 16',
  iphone15pro: 'iPhone 15 Pro',
  iphone15:    'iPhone 15',
}

// International locations grouped by country (label includes a flag).
const GPS_GROUPS: { country: string; cities: Record<string, string> }[] = [
  { country: '🇫🇷 France', cities: {
    paris: 'Paris', marseille: 'Marseille', lyon: 'Lyon', toulouse: 'Toulouse', nice: 'Nice', bordeaux: 'Bordeaux',
  }},
  { country: '🇬🇧 Royaume-Uni / 🇮🇪 Irlande', cities: {
    london: 'Londres', manchester: 'Manchester', dublin: 'Dublin',
  }},
  { country: '🇪🇸 Espagne / 🇵🇹 Portugal', cities: {
    madrid: 'Madrid', barcelona: 'Barcelone', lisbon: 'Lisbonne',
  }},
  { country: '🇮🇹 Italie', cities: {
    rome: 'Rome', milan: 'Milan',
  }},
  { country: '🇩🇪 Europe centrale', cities: {
    berlin: 'Berlin', munich: 'Munich', amsterdam: 'Amsterdam', brussels: 'Bruxelles', zurich: 'Zurich', geneva: 'Genève',
  }},
  { country: '🌎 Amériques', cities: {
    newyork: 'New York', losangeles: 'Los Angeles', miami: 'Miami', toronto: 'Toronto', montreal: 'Montréal', mexico: 'Mexico', saopaulo: 'São Paulo',
  }},
  { country: '🌏 Asie / Moyen-Orient / Océanie', cities: {
    dubai: 'Dubaï', istanbul: 'Istanbul', tokyo: 'Tokyo', singapore: 'Singapour', sydney: 'Sydney',
  }},
]

const GPS_CITY_KEYS = GPS_GROUPS.flatMap(g => Object.keys(g.cities))
const FRANCE_CITY_KEYS = Object.keys(GPS_GROUPS[0].cities) // GPS_GROUPS[0] is France

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
  const credits = useCredits()
  const { currentOrg } = useOrg()

  const [showBank, setShowBank]           = useState(false)
  const [saveFolder, setSaveFolder]       = useState<string | null>(null)
  const [savingAll, setSavingAll]         = useState(false)
  const [selectedVideos, setSelectedVideos] = useState<SelectedVideo[]>([])
  const [preset, setPreset]               = useState('iphone17pro')
  const [gpsCity, setGpsCity]             = useState('random')
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

  function updateJob(id: string, patch: Partial<SpoofJob>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }

  async function saveJobToBank(job: SpoofJob): Promise<boolean> {
    if (!job.storagePath || job.savedToBank) return false
    const { error } = await supabase.from('content_bank').insert({
      user_id: user.id, org_id: currentOrg?.id ?? null,
      title: `Spoof — ${job.name}`,
      file_url: null,
      storage_path: job.storagePath,
      thumbnail_path: null,
      folder: saveFolder, tags: ['spoof'], notes: job.meta ? `${job.meta.model} · ${job.meta.city}` : '',
    })
    if (error) { alert('Échec de l\'enregistrement : ' + error.message); return false }
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

  async function runSpoof() {
    if (!selectedVideos.length || running) return

    const totalOutputs = selectedVideos.length * copies
    const creditCost = totalOutputs * CREDIT_COSTS.clone_vid
    const creditRes = await checkAndDeductCredits(credits.ownerId, creditCost)
    if (!creditRes.ok) {
      const balance = creditRes.balance ?? credits.balance
      alert(`Crédits insuffisants — ${creditCost} crédits requis. Solde: ${balance}`)
      return
    }
    if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)

    // Each source video produces `copies` independent spoofed outputs — every
    // copy gets its own unique metadata (GPS, date, camera id, encoding…).
    const initialJobs: SpoofJob[] = selectedVideos.flatMap((v, vi) =>
      Array.from({ length: copies }, (_, c) => ({
        id: `${Date.now()}_${vi}_${c}`,
        name: copies > 1 ? `${v.name} (copie ${c + 1}/${copies})` : v.name,
        url: v.url,
        status: 'queued' as JobStatus,
      })),
    )
    setJobs(initialJobs)
    setRunning(true)

    const { data: { session } } = await supabase.auth.getSession()

    try {
      for (const job of initialJobs) {
        updateJob(job.id, { status: 'processing' })

        const resolvedCity = gpsCity === 'random'
          ? GPS_CITY_KEYS[Math.floor(Math.random() * GPS_CITY_KEYS.length)]
          : gpsCity === 'random_france'
          ? FRANCE_CITY_KEYS[Math.floor(Math.random() * FRANCE_CITY_KEYS.length)]
          : gpsCity

        try {
          const res = await fetch('/api/repurpose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceUrl: job.url,
              userId: user.id,
              mode: 'spoof',
              preset,
              gpsCity: resolvedCity,
              customDate: customDate.replace(/-/g, ':'),
              adjustments: { brightness, saturation, contrast, noise, vignette, flipH, zoomPct },
              supabaseToken: session?.access_token,
              supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            }),
          })
          const data = await res.json()
          if (data.ok) {
            updateJob(job.id, { status: 'done', outputUrl: data.url, storagePath: data.storagePath, meta: data.appliedMeta })
          } else {
            updateJob(job.id, { status: 'error', error: data.error ?? 'Erreur inconnue' })
          }
        } catch (err) {
          updateJob(job.id, { status: 'error', error: String(err) })
        }
      }
    } finally {
      setRunning(false)
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

      {/* ── Header ── */}
      <header className="sf-page-header" style={{ background: 'rgba(7,7,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="sf-anim-slide-up sf-d50" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(99,102,241,0.06))',
            border: '1px solid rgba(99,102,241,0.28)',
            boxShadow: '0 0 24px -6px rgba(99,102,241,0.4)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="sf-page-title">Spoof</h1>
              {running && (
                <span className="sf-badge sf-badge-violet" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366F1', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  Traitement…
                </span>
              )}
            </div>
            <p className="sf-page-sub">Métadonnées iPhone authentiques + GPS multi-pays · chaque export est unique</p>
          </div>
        </div>
      </header>

      {/* ── Spoof body ── */}
      {(
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

          {/* ── Left panel ── */}
          <div className="anim-stagger" style={{ width: 290, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Source videos */}
            <div style={{ padding: '16px 14px 0' }}>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>Vidéos source</div>

              <button
                onClick={() => setShowBank(true)}
                disabled={running}
                className="sf-btn sf-btn-secondary cursor-pointer"
                style={{ width: '100%', justifyContent: 'center', marginBottom: selectedVideos.length ? 8 : 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8h20M4 8V6a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8M10 12h4"/></svg>
                {selectedVideos.length
                  ? `${selectedVideos.length} vidéo${selectedVideos.length > 1 ? 's' : ''} · Ajouter`
                  : 'Ajouter vidéos'}
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

            <div className="sf-divider" style={{ margin: '14px 0' }} />

            {/* iPhone model */}
            <div style={{ padding: '0 14px' }}>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>Modèle iPhone</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {Object.entries(PRESETS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPreset(key)}
                    disabled={running}
                    className="cursor-pointer"
                    style={{
                      padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                      background: preset === key ? 'rgba(99,102,241,0.15)' : 'var(--surface-2)',
                      color: preset === key ? '#6366F1' : 'var(--text-3)',
                      outline: preset === key ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sf-divider" style={{ margin: '14px 0' }} />

            {/* GPS location */}
            <div style={{ padding: '0 14px' }}>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>🏙 Localisation GPS</div>
              <select
                value={gpsCity}
                onChange={e => setGpsCity(e.target.value)}
                disabled={running}
                className="sf-input"
                style={{ width: '100%', fontSize: 12, color: '#e8e8f0', background: '#1a1a2e' }}
              >
                <option value="random" style={{ color: '#e8e8f0', background: '#1a1a2e' }}>🎲 Aléatoire (tous pays)</option>
                <option value="random_france" style={{ color: '#e8e8f0', background: '#1a1a2e' }}>🇫🇷 Aléatoire France uniquement</option>
                {GPS_GROUPS.map(group => (
                  <optgroup key={group.country} label={group.country} style={{ color: '#a0a0c0', background: '#0f0f1e', fontWeight: 600 }}>
                    {Object.entries(group.cities).map(([key, label]) => (
                      <option key={key} value={key} style={{ color: '#e8e8f0', background: '#1a1a2e' }}>{label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="sf-divider" style={{ margin: '14px 0' }} />

            {/* Custom date */}
            <div style={{ padding: '0 14px' }}>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>Date de création</div>
              <input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                disabled={running}
                className="sf-input"
                style={{ width: '100%', fontSize: 12 }}
              />
            </div>

            <div className="sf-divider" style={{ margin: '14px 0' }} />

            {/* Copies per video */}
            <div style={{ padding: '0 14px' }}>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>
                Copies par vidéo
                <span style={{ fontWeight: 400, color: 'var(--text-4)', marginLeft: 6 }}>chaque copie = métadonnées uniques</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setCopies(c => Math.max(1, c - 1))}
                  disabled={running || copies <= 1}
                  className="sf-btn cursor-pointer"
                  style={{ width: 34, height: 34, fontSize: 18, lineHeight: 1, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: copies <= 1 ? 0.5 : 1 }}
                >−</button>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#818CF8' }}>{copies}</div>
                <button
                  onClick={() => setCopies(c => Math.min(20, c + 1))}
                  disabled={running || copies >= 20}
                  className="sf-btn cursor-pointer"
                  style={{ width: 34, height: 34, fontSize: 18, lineHeight: 1, borderRadius: 8, background: 'rgba(99,102,241,0.1)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: copies >= 20 ? 0.5 : 1 }}
                >+</button>
              </div>
              {selectedVideos.length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 6, textAlign: 'center' }}>
                  {selectedVideos.length} vidéo{selectedVideos.length > 1 ? 's' : ''} × {copies} = <b style={{ color: '#818CF8' }}>{totalOutputs}</b> export{totalOutputs > 1 ? 's' : ''}
                </div>
              )}
            </div>

            <div className="sf-divider" style={{ margin: '14px 0' }} />

            {/* Bank destination */}
            <div style={{ padding: '0 14px' }}>
              <BankFolderSelect value={saveFolder} onChange={setSaveFolder} userId={user.id} orgId={currentOrg?.id} label="Dossier de destination" />
            </div>

            <div className="sf-divider" style={{ margin: '14px 0' }} />

            {/* Visual adjustments collapsible */}
            <div style={{ padding: '0 14px' }}>
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
                Ajustements visuels
                <svg
                  width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ marginLeft: 'auto', transform: showAdjustments ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {showAdjustments && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Sliders */}
                  {([
                    { label: 'Luminosité', value: brightness, set: setBrightness, min: -50, max: 50 },
                    { label: 'Saturation', value: saturation, set: setSaturation, min: -50, max: 50 },
                    { label: 'Contraste',  value: contrast,   set: setContrast,   min: -50, max: 50 },
                    { label: 'Grain/Bruit', value: noise,     set: setNoise,      min: 0,   max: 30 },
                    { label: 'Zoom (%)',   value: zoomPct,    set: setZoomPct,    min: 0,   max: 15 },
                  ] as const).map(({ label, value, set, min, max }) => (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: 11, color: '#6366F1', fontWeight: 700 }}>{value}</span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={value}
                        disabled={running}
                        onChange={e => (set as (v: number) => void)(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#6366F1', cursor: 'pointer' }}
                      />
                    </div>
                  ))}

                  {/* Toggles */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([
                      { label: 'Flip H', value: flipH, set: setFlipH },
                      { label: 'Vignette', value: vignette, set: setVignette },
                    ] as const).map(({ label, value, set }) => (
                      <button
                        key={label}
                        onClick={() => (set as (v: boolean) => void)(!value)}
                        disabled={running}
                        className="cursor-pointer"
                        style={{
                          flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                          background: value ? 'rgba(99,102,241,0.15)' : 'var(--surface-2)',
                          color: value ? '#6366F1' : 'var(--text-3)',
                          outline: value ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                          transition: 'all 0.15s',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Credits + Run button */}
            <div style={{ padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
              {selectedVideos.length > 0 && !running && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span className="sf-badge sf-badge-violet" style={{ fontSize: 10 }}>
                    {creditCost} crédit{creditCost > 1 ? 's' : ''} · {totalOutputs} export{totalOutputs > 1 ? 's' : ''}
                  </span>
                </div>
              )}
              <button
                onClick={runSpoof}
                disabled={!selectedVideos.length || running}
                className="sf-btn sf-btn-lg cursor-pointer"
                style={{
                  width: '100%',
                  background: !selectedVideos.length ? 'var(--surface-2)' : running ? 'rgba(239,68,68,0.12)' : 'linear-gradient(135deg,rgba(99,102,241,0.22),rgba(129,140,248,0.22))',
                  color: !selectedVideos.length ? 'var(--text-4)' : running ? '#f87171' : '#6366F1',
                  border: selectedVideos.length ? `1px solid ${running ? 'rgba(239,68,68,0.28)' : 'rgba(99,102,241,0.32)'}` : '1px solid var(--border)',
                  boxShadow: selectedVideos.length && !running ? '0 0 24px rgba(99,102,241,0.14)' : 'none',
                  cursor: selectedVideos.length ? 'pointer' : 'not-allowed',
                  justifyContent: 'center',
                }}
              >
                {running ? (
                  <>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(248,113,113,0.3)', borderTopColor: '#f87171', animation: 'spin 0.9s linear infinite' }} />
                    Traitement {doneCount}/{totalOutputs}…
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Spoofing {totalOutputs > 0 ? `(${totalOutputs})` : ''}
                  </>
                )}
              </button>
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
                <p className="sf-empty-title">Aucune vidéo traitée</p>
                <p className="sf-empty-desc">Sélectionne <b>2 vidéos ou plus</b> depuis la banque pour les spoofer<br />et comparer les métadonnées injectées côte à côte.</p>
                <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['Métadonnées iPhone', 'GPS multi-pays', 'Altitude + objectif', 'ID caméra unique'].map(pill => (
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
                  <div className="sf-card" style={{
                    padding: '10px 14px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10,
                    flexWrap: 'wrap', borderColor: 'rgba(99,102,241,0.18)', background: 'rgba(99,102,241,0.04)',
                  }}>
                    <div style={{ flex: 1, fontSize: 11, color: 'var(--text-3)' }}>
                      Dossier : <span style={{ color: '#818CF8', fontWeight: 600 }}>{saveFolder ?? 'Racine'}</span>
                    </div>
                    <button
                      onClick={saveAllToBank}
                      disabled={savingAll || jobs.every(j => j.savedToBank || j.status !== 'done')}
                      className="sf-btn cursor-pointer"
                      style={{
                        height: 32, padding: '0 14px', fontSize: 11, fontWeight: 700, borderRadius: 8,
                        background: 'linear-gradient(135deg,rgba(99,102,241,0.22),rgba(129,140,248,0.22))',
                        color: '#818CF8', border: '1px solid rgba(99,102,241,0.32)',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        opacity: (savingAll || jobs.every(j => j.savedToBank || j.status !== 'done')) ? 0.5 : 1,
                      }}
                    >
                      {savingAll
                        ? <><div style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid rgba(129,140,248,0.3)', borderTopColor: '#818CF8', animation: 'spin 0.9s linear infinite' }} /> Enregistrement…</>
                        : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h16"/><path d="M4 12v4h4l4-4 4 4h4v-4"/><path d="M12 4v12"/></svg> Tout enregistrer ({doneCount})</>
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
      a.download = `spoof_${job.name}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    } catch {
      const a = document.createElement('a')
      a.href = job.outputUrl!
      a.download = `spoof_${job.name}`
      a.click()
    }
  }

  const META_ROWS: { label: string; key: keyof AppliedMeta }[] = [
    { label: 'Appareil',    key: 'model' },
    { label: 'Marque',      key: 'make' },
    { label: 'Logiciel',    key: 'software' },
    { label: 'Objectif',    key: 'lens' },
    { label: 'Localisation',key: 'city' },
    { label: 'GPS',         key: 'gps' },
    { label: 'Altitude',    key: 'altitude' },
    { label: 'Date',        key: 'creationDate' },
    { label: 'Fuseau',      key: 'timezone' },
    { label: 'ID Caméra',   key: 'cameraId' },
    { label: 'ISO',         key: 'iso' },
    { label: 'Exposition',  key: 'exposure' },
    { label: 'Ouverture',   key: 'aperture' },
    { label: 'Focale',      key: 'focal' },
    { label: 'Encodeur',    key: 'encoder' },
    { label: 'CRF',         key: 'crf' },
    { label: 'Audio',       key: 'audioBitrate' },
    { label: 'GOP',         key: 'gopSize' },
    { label: 'Colorimétrie',key: 'colorSpace' },
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
            {isQ && 'En attente…'}
            {isProc && 'Traitement en cours…'}
            {isDone && (job.meta ? `📱 ${job.meta.model} · 📍 ${job.meta.city}` : 'Spoofing terminé')}
            {isErr && (job.error?.slice(0, 60) ?? 'Erreur')}
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
              Télécharger
            </button>
            {job.storagePath && (
              job.savedToBank ? (
                <span
                  className="sf-btn"
                  style={{ height: 30, fontSize: 10, padding: '0 10px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 7, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Enregistré
                </span>
              ) : (
                <button
                  onClick={onSave}
                  className="sf-btn cursor-pointer"
                  style={{ height: 30, fontSize: 10, padding: '0 10px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 7, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Enregistrer
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Injected metadata — lets you verify / compare what changed per video */}
      {isDone && job.meta && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px 14px',
          padding: '10px 12px', borderRadius: 9, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)',
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

const COMPARE_ROWS: { label: string; key: keyof AppliedMeta; unique?: boolean }[] = [
  { label: 'Appareil',    key: 'model' },
  { label: 'Logiciel',    key: 'software' },
  { label: 'Localisation', key: 'city',        unique: true },
  { label: 'GPS',         key: 'gps',          unique: true },
  { label: 'Altitude',    key: 'altitude',     unique: true },
  { label: 'Date / heure', key: 'creationDate', unique: true },
  { label: 'Fuseau',      key: 'timezone' },
  { label: 'Objectif',    key: 'lens' },
  { label: 'ISO',         key: 'iso',          unique: true },
  { label: 'Exposition',  key: 'exposure',     unique: true },
  { label: 'Ouverture',   key: 'aperture' },
  { label: 'ID Caméra',   key: 'cameraId',     unique: true },
  { label: 'Encodeur',    key: 'encoder' },
  { label: 'CRF',         key: 'crf',          unique: true },
  { label: 'Audio',       key: 'audioBitrate', unique: true },
  { label: 'GOP',         key: 'gopSize',      unique: true },
  { label: 'Colorimétrie', key: 'colorSpace' },
]

function ComparePanel({ jobs }: { jobs: SpoofJob[] }) {
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
          Comparaison — {done.length} vidéos spoofées avec des métadonnées différentes
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', color: 'var(--text-4)', fontWeight: 600, paddingBottom: 8, paddingRight: 12, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Champ</th>
              {done.map((j, i) => (
                <th key={j.id} style={{ textAlign: 'left', color: '#6366F1', fontWeight: 700, paddingBottom: 8, paddingLeft: 8, fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Vidéo {i + 1} — {j.name.slice(0, 18)}{j.name.length > 18 ? '…' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map(({ label, key, unique }) => {
              const vals = done.map(j => String(j.meta![key] ?? '—'))
              const allSame = vals.every(v => v === vals[0])
              return (
                <tr key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '5px 12px 5px 0', color: 'var(--text-4)', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {label}
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
        Les champs en vert <span style={{ color: '#22c55e' }}>✓</span> sont différents entre chaque vidéo — GPS, horodatage, ID caméra, encodage vidéo, etc.
      </div>
    </div>
  )
}
