import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { BankPicker } from '@/pages/Bank'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { VideoRepurpose } from '@/pages/VideoRepurpose'

const isWeb = typeof window !== 'undefined' && !(window as any).electronAPI?.isElectron

const PRESETS: Record<string, string> = {
  iphone17pro: 'iPhone 17 Pro',
  iphone16pro: 'iPhone 16 Pro',
  iphone16:    'iPhone 16',
  iphone15pro: 'iPhone 15 Pro',
  iphone15:    'iPhone 15',
}

const GPS_CITIES: Record<string, string> = {
  newyork:      'New York, NY',
  losangeles:   'Los Angeles, CA',
  chicago:      'Chicago, IL',
  miami:        'Miami, FL',
  houston:      'Houston, TX',
  phoenix:      'Phoenix, AZ',
  philadelphia: 'Philadelphia, PA',
  sanantonio:   'San Antonio, TX',
  sandiego:     'San Diego, CA',
  dallas:       'Dallas, TX',
  boston:       'Boston, MA',
  seattle:      'Seattle, WA',
  denver:       'Denver, CO',
  nashville:    'Nashville, TN',
  atlanta:      'Atlanta, GA',
  portland:     'Portland, OR',
  lasvegas:     'Las Vegas, NV',
  austin:       'Austin, TX',
  minneapolis:  'Minneapolis, MN',
  sanfrancisco: 'San Francisco, CA',
}

const GPS_CITY_KEYS = Object.keys(GPS_CITIES)

type JobStatus = 'queued' | 'processing' | 'done' | 'error'

interface SpoofJob {
  id: string
  name: string
  url: string
  status: JobStatus
  outputUrl?: string
  storagePath?: string
  error?: string
}

interface SelectedVideo { url: string; name: string }

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function Spoof({ user }: { user: User }) {
  const credits = useCredits()

  const [activeTab, setActiveTab]         = useState<'spoof' | 'clone'>('spoof')
  const [showBank, setShowBank]           = useState(false)
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
  const [jobs, setJobs]                   = useState<SpoofJob[]>([])
  const [running, setRunning]             = useState(false)

  function updateJob(id: string, patch: Partial<SpoofJob>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }

  async function runSpoof() {
    if (!selectedVideos.length || running) return

    const creditCost = selectedVideos.length * CREDIT_COSTS.clone_vid
    const creditRes = await checkAndDeductCredits(credits.ownerId, creditCost)
    if (!creditRes.ok) {
      const balance = creditRes.balance ?? credits.balance
      alert(`Crédits insuffisants — ${creditCost} crédits requis. Solde: ${balance}`)
      return
    }
    if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)

    const initialJobs: SpoofJob[] = selectedVideos.map((v, i) => ({
      id: `${Date.now()}_${i}`,
      name: v.name,
      url: v.url,
      status: 'queued',
    }))
    setJobs(initialJobs)
    setRunning(true)

    const { data: { session } } = await supabase.auth.getSession()

    try {
      for (const job of initialJobs) {
        updateJob(job.id, { status: 'processing' })

        const resolvedCity = gpsCity === 'random'
          ? GPS_CITY_KEYS[Math.floor(Math.random() * GPS_CITY_KEYS.length)]
          : gpsCity

        try {
          const res = await fetch('/api/spoof', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceUrl: job.url,
              userId: user.id,
              mode: 'video',
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
            updateJob(job.id, { status: 'done', outputUrl: data.url, storagePath: data.storagePath })
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
  const creditCost = selectedVideos.length * CREDIT_COSTS.clone_vid

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
            <p className="sf-page-sub">Métadonnées iPhone + ajustements visuels · contournement détection IA</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, border: '1px solid var(--border)' }}>
          {(['spoof', 'clone'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="cursor-pointer"
              style={{
                padding: '6px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none',
                background: activeTab === tab ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: activeTab === tab ? '#6366F1' : 'var(--text-3)',
                outline: activeTab === tab ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {tab === 'spoof' ? 'Spoofing' : 'CloneVid'}
            </button>
          ))}
        </div>
      </header>

      {/* ── CloneVid tab ── */}
      {activeTab === 'clone' && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <VideoRepurpose user={user} />
        </div>
      )}

      {/* ── Spoof tab ── */}
      {activeTab === 'spoof' && (
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
                style={{ width: '100%', fontSize: 12 }}
              >
                <option value="random">🎲 Aléatoire</option>
                {Object.entries(GPS_CITIES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
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
                    {creditCost} crédit{creditCost > 1 ? 's' : ''} · {selectedVideos.length} vidéo{selectedVideos.length > 1 ? 's' : ''}
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
                    Traitement {doneCount}/{selectedVideos.length}…
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Spoofing {selectedVideos.length > 0 ? `(${selectedVideos.length})` : ''}
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
                <p className="sf-empty-desc">Sélectionne des vidéos depuis la banque,<br />configure les métadonnées puis lance le spoofing.</p>
                <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['Métadonnées iPhone', 'GPS aléatoire', 'Date custom', 'Grain + filtre'].map(pill => (
                    <span key={pill} className="sf-badge" style={{ padding: '4px 10px', background: 'rgba(99,102,241,0.05)', color: 'rgba(99,102,241,0.65)', border: '1px solid rgba(99,102,241,0.12)', fontSize: 10 }}>
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {jobs.map(job => (
                  <SpoofJobCard key={job.id} job={job} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  )
}

function SpoofJobCard({ job }: { job: SpoofJob }) {
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

  return (
    <div
      className="sf-card"
      style={{
        borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
        borderColor: isDone ? 'rgba(99,102,241,0.3)' : isErr ? 'rgba(239,68,68,0.25)' : 'var(--border)',
        boxShadow: isDone ? '0 0 20px -6px rgba(99,102,241,0.12)' : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      {/* Status icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isDone ? 'rgba(99,102,241,0.12)' : isErr ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isDone ? 'rgba(99,102,241,0.25)' : isErr ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
      }}>
        {isQ && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-4)" strokeWidth="1.75" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
        {isProc && <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.2)', borderTopColor: '#6366F1', animation: 'spin 0.9s linear infinite' }} />}
        {isDone && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
        {isErr && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ivory)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.name}
        </div>
        <div style={{ fontSize: 10, color: isDone ? 'rgba(99,102,241,0.7)' : isErr ? '#f87171' : 'var(--text-4)', marginTop: 2 }}>
          {isQ && 'En attente…'}
          {isProc && 'Traitement en cours…'}
          {isDone && 'Spoofing terminé'}
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
            <a
              href="#"
              onClick={e => { e.preventDefault(); window.location.hash = '#bank' }}
              className="sf-btn cursor-pointer"
              style={{ height: 30, fontSize: 10, padding: '0 10px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 7, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8h20M4 8V6a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8"/></svg>
              Banque
            </a>
          )}
        </div>
      )}
    </div>
  )
}
