import { useState, useRef, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { runFfmpegRepurposeWeb } from '@/lib/ffmpeg-web'
import { uploadVideoFromPath, type UploadScope } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { useT, useLang } from '@/lib/i18n'
import { useOrg } from '@/lib/orgContext'
import { BankPicker } from '@/pages/Bank'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'

const isWeb = typeof window !== 'undefined' && !(window as any).electronAPI

interface VideoRepurposeProps { user: User }

type Intensity  = 'subtle' | 'medium' | 'aggressive' | 'vener'
type Format     = '9:16' | '1:1' | '16:9' | 'keep'
type JobStatus  = 'queued' | 'processing' | 'done' | 'error'

interface VariantJob {
  id: number; seed: number; status: JobStatus; progress: number
  outputPath?: string; similarityPct?: number; transforms?: string[]
  error?: string; thumb?: string; uploading?: boolean; uploadError?: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

function extractThumb(blobUrl: string): Promise<string | null> {
  return new Promise(resolve => {
    const v = document.createElement('video')
    v.muted = true; v.src = blobUrl
    v.onloadeddata = () => {
      v.currentTime = 0.5
      v.onseeked = () => {
        const c = document.createElement('canvas')
        c.width = 120; c.height = 214
        c.getContext('2d')?.drawImage(v, 0, 0, 120, 214)
        resolve(c.toDataURL('image/jpeg', 0.7)); v.src = ''
      }
    }
    v.onerror = () => { v.src = ''; resolve(null) }
    setTimeout(() => { v.src = ''; resolve(null) }, 8000)
  })
}

async function downloadBlob(url: string, filename: string) {
  try {
    const res  = await fetch(url)
    const blob = await res.blob()
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'video/mp4' }))
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  } catch {
    // fallback — direct link
    const a    = document.createElement('a')
    a.href     = url; a.download = filename; a.click()
  }
}

// ── SimilarityBadge ──────────────────────────────────────────────────────────

function SimilarityBadge({ pct }: { pct: number }) {
  const color = pct >= 90 ? '#22d3ee' : pct >= 80 ? '#a78bfa' : '#f59e0b'
  const label = pct >= 90 ? 'SAFE' : pct >= 80 ? 'OK' : 'RISQUÉ'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
        background: `${color}18`, color, border: `1px solid ${color}35`, letterSpacing: '0.06em',
      }}>{label}</div>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{pct}%</span>
    </div>
  )
}

// ── VariantCard ───────────────────────────────────────────────────────────────

function VariantCard({ job, index }: { job: VariantJob; index: number }) {
  const isDone = job.status === 'done'
  const isErr  = job.status === 'error'
  const isProc = job.status === 'processing'
  const isQ    = job.status === 'queued'

  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden', position: 'relative',
      background: 'rgba(255,255,255,0.025)',
      border: `1px solid ${isDone ? 'rgba(34,211,238,0.2)' : isErr ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
      transition: 'border-color 0.3s, box-shadow 0.3s',
      boxShadow: isDone ? '0 0 20px rgba(34,211,238,0.06)' : 'none',
    }}>
      {/* Thumbnail */}
      <div style={{ width: '100%', aspectRatio: '9/16', background: '#0a0a14', position: 'relative', overflow: 'hidden', maxHeight: 160 }}>
        {job.thumb ? (
          <img src={job.thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isProc && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 28, height: 28, border: '2px solid rgba(34,211,238,0.3)', borderTopColor: '#22d3ee', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 6px' }} />
                <div style={{ fontSize: 10, color: 'rgba(34,211,238,0.6)', fontWeight: 600 }}>{job.progress}%</div>
              </div>
            )}
            {isQ   && <div style={{ fontSize: 18, opacity: 0.2 }}>⏳</div>}
            {isErr && <div style={{ fontSize: 18, opacity: 0.5 }}>✕</div>}
          </div>
        )}
        {isProc && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,#22d3ee,#818cf8)', width: `${job.progress}%`, transition: 'width 0.4s ease', boxShadow: '0 0 6px rgba(34,211,238,0.6)' }} />
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', borderRadius: 5, padding: '2px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
          #{index + 1}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {isDone && job.similarityPct != null && <SimilarityBadge pct={job.similarityPct} />}
        {isErr && <div style={{ fontSize: 10, color: '#f87171', fontWeight: 500 }}>{job.error?.slice(0, 60)}</div>}
        {isQ    && <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)' }}>En attente…</div>}
        {isProc && <div style={{ fontSize: 10, color: '#22d3ee' }}>Traitement…</div>}
        {isDone && job.uploading && <div style={{ fontSize: 9, color: 'rgba(34,211,238,0.6)' }}>☁ Upload…</div>}
        {isDone && job.uploadError && <div style={{ fontSize: 9, color: '#f87171' }}>⚠ {job.uploadError.slice(0, 40)}</div>}

        {/* Transform pills */}
        {isDone && job.transforms && job.transforms.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
            {job.transforms.map((t, i) => (
              <span key={i} style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 500,
                background: 'rgba(129,140,248,0.08)', color: 'rgba(167,139,250,0.7)',
                border: '1px solid rgba(129,140,248,0.12)',
              }}>{t}</span>
            ))}
          </div>
        )}

        {/* Download button */}
        {isDone && job.outputPath && (
          <button
            onClick={() => downloadBlob(job.outputPath!, `clonevid_${String(index + 1).padStart(3, '0')}.mp4`)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
              background: 'rgba(34,211,238,0.1)', color: '#22d3ee',
              border: '1px solid rgba(34,211,238,0.2)', cursor: 'pointer', transition: 'background 0.15s', marginTop: 2,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,211,238,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(34,211,238,0.1)')}
          >
            ⬇ MP4
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function VideoRepurpose({ user }: VideoRepurposeProps) {
  const { currentOrg } = useOrg()
  const credits = useCredits()
  const scope: UploadScope = currentOrg
    ? { mode: 'org', id: currentOrg.id }
    : { mode: 'user', id: user.id }

  const [sourceUrl, setSourceUrl]       = useState<string | null>(null)
  const [sourceName, setSourceName]     = useState('')
  const [dragging, setDragging]         = useState(false)
  const [showBank, setShowBank]         = useState(false)
  const [count, setCount]               = useState(10)
  const [intensity, setIntensity]       = useState<Intensity>('subtle')
  const [format, setFormat]             = useState<Format>('9:16')
  const [saveToBank, setSaveToBank]     = useState(isWeb)
  const [bankFolder, setBankFolder]     = useState('')
  const [bankFolders, setBankFolders]   = useState<string[]>([])
  const [jobs, setJobs]                 = useState<VariantJob[]>([])
  const [running, setRunning]           = useState(false)
  const [totalDone, setTotalDone]       = useState(0)
  const [startedAt, setStartedAt]       = useState<number | null>(null)
  const [elapsed, setElapsed]           = useState(0)
  const abortRef    = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!running || !startedAt) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [running, startedAt])

  // Load existing bank folders
  useEffect(() => {
    async function loadFolders() {
      let q = supabase.from('content_bank').select('folder') as any
      q = currentOrg
        ? q.eq('org_id', currentOrg.id).not('folder', 'is', null)
        : q.eq('user_id', user.id).is('org_id', null).not('folder', 'is', null)
      const { data } = await q
      const flist = [...new Set((data ?? []).map((r: any) => r.folder).filter(Boolean))] as string[]
      setBankFolders(flist)
    }
    loadFolders()
  }, [user.id, currentOrg])

  function updateJob(id: number, patch: Partial<VariantJob>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }

  function handleFile(file: File) {
    if (!file.type.startsWith('video/')) return
    setSourceUrl(URL.createObjectURL(file))
    setSourceName(file.name)
    setJobs([]); setTotalDone(0)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  async function startGeneration() {
    if (!sourceUrl || running) return
    const creditCost = count * CREDIT_COSTS.clone_vid
    const creditRes = await checkAndDeductCredits(credits.ownerId, creditCost)
    if (!creditRes.ok) {
      alert(`Crédits insuffisants — il faut ${creditCost} crédit(s) pour ${count} vidéo(s). Solde : ${creditRes.balance ?? 0}`)
      return
    }
    abortRef.current = false
    setRunning(true); setStartedAt(Date.now()); setElapsed(0); setTotalDone(0)

    const newJobs: VariantJob[] = Array.from({ length: count }, (_, i) => ({
      id: i, seed: Date.now() + i * 7919, status: 'queued', progress: 0,
    }))
    setJobs(newJobs)

    let done = 0
    for (let i = 0; i < count; i++) {
      if (abortRef.current) break
      const job = newJobs[i]
      updateJob(job.id, { status: 'processing', progress: 5 })

      const result = await runFfmpegRepurposeWeb({
        inputPath: sourceUrl, seed: job.seed, intensity, format,
        onProgress: pct => updateJob(job.id, { progress: pct }),
      })

      if (result.ok && result.outputPath) {
        const thumb = await extractThumb(result.outputPath)
        updateJob(job.id, {
          status: 'done', progress: 100,
          outputPath: result.outputPath,
          similarityPct: result.similarityPct,
          transforms: result.transformSummary,
          thumb: thumb ?? undefined,
        })

        if (isWeb || saveToBank) {
          updateJob(job.id, { uploading: true })
          try {
            const up = await uploadVideoFromPath(result.outputPath, scope)
            const { error: dbErr } = await supabase.from('content_bank').insert({
              user_id: user.id, org_id: currentOrg?.id ?? null,
              title: `CloneVid #${String(i + 1).padStart(3, '0')} — ${sourceName}`,
              file_url: null, storage_path: up.storagePath, thumbnail_path: up.thumbnailPath,
              folder: bankFolder.trim() || null, tags: [], notes: '',
            })
            if (dbErr) throw new Error(dbErr.message)
            updateJob(job.id, { uploading: false })
          } catch (e) {
            console.error('[clonevid] bank upload failed:', e)
            updateJob(job.id, { uploading: false, uploadError: String(e instanceof Error ? e.message : e) })
          }
        }
      } else {
        updateJob(job.id, { status: 'error', error: result.error ?? 'Erreur inconnue' })
      }

      done++; setTotalDone(done)
    }
    setRunning(false)
  }

  function stop() { abortRef.current = true; setRunning(false) }

  const donePct    = jobs.length > 0 ? Math.round((totalDone / jobs.length) * 100) : 0
  const avgSim     = jobs.filter(j => j.similarityPct != null).map(j => j.similarityPct!)
  const avgSimVal  = avgSim.length > 0 ? Math.round(avgSim.reduce((a, b) => a + b, 0) / avgSim.length) : null
  const elapsedStr = elapsed > 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`

  return (
    <div className="anim-page" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {showBank && (
        <BankPicker
          user={user}
          mode="single"
          resolveMode="full"
          onSelect={(paths, titles) => {
            if (paths[0]) {
              setSourceUrl(paths[0])
              setSourceName(titles?.[0] ?? 'vidéo banque')
              setJobs([]); setTotalDone(0)
            }
            setShowBank(false)
          }}
          onClose={() => setShowBank(false)}
        />
      )}

      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F1F0F7', letterSpacing: '-0.02em', marginBottom: 3 }}>
              CloneVid
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.55)' }}>
              1 vidéo → N variantes uniques · transformations invisibles à l'œil
            </p>
          </div>
          {jobs.length > 0 && (
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Générées', value: `${totalDone}/${jobs.length}` },
                { label: 'Similarité', value: avgSimVal != null ? `${avgSimVal}%` : '—' },
                { label: 'Temps', value: elapsedStr },
              ].map(s => (
                <div key={s.label} style={{ padding: '8px 14px', borderRadius: 10, textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#22d3ee', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.45)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {running && (
          <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,#22d3ee,#818cf8)', width: `${donePct}%`, transition: 'width 0.5s ease', boxShadow: '0 0 8px rgba(34,211,238,0.5)' }} />
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* Left panel */}
        <div style={{ width: 270, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>

          {/* Upload zone */}
          <div>
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                borderRadius: 12, border: `2px dashed ${dragging ? '#22d3ee' : sourceUrl ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.1)'}`,
                background: dragging ? 'rgba(34,211,238,0.05)' : 'rgba(255,255,255,0.02)',
                padding: '16px 12px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                boxShadow: dragging ? '0 0 24px rgba(34,211,238,0.12)' : 'none',
              }}
            >
              <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              {sourceUrl ? (
                <>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>🎬</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#22d3ee', marginBottom: 2 }}>Vidéo chargée</div>
                  <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.45)', wordBreak: 'break-all' }}>{sourceName.slice(0, 28)}{sourceName.length > 28 ? '…' : ''}</div>
                  <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.3)', marginTop: 4 }}>Cliquer pour changer</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.4 }}>📁</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(226,232,240,0.6)', marginBottom: 3 }}>Drop ta vidéo ici</div>
                  <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)' }}>MP4, MOV, WebM</div>
                </>
              )}
            </div>
            {/* Depuis la banque */}
            <button
              onClick={() => setShowBank(true)} disabled={running}
              style={{
                width: '100%', marginTop: 7, padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', border: '1px solid rgba(129,140,248,0.2)', background: 'rgba(129,140,248,0.06)',
                color: 'rgba(167,139,250,0.7)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.12)'; e.currentTarget.style.color = '#a78bfa' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(129,140,248,0.06)'; e.currentTarget.style.color = 'rgba(167,139,250,0.7)' }}
            >
              🗂 Depuis la banque
            </button>
          </div>

          {/* Count */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Variantes</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[5, 10, 25, 50].map(n => (
                <button key={n} onClick={() => setCount(n)} disabled={running}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: count === n ? 'linear-gradient(135deg,rgba(34,211,238,0.2),rgba(129,140,248,0.2))' : 'rgba(255,255,255,0.04)', color: count === n ? '#22d3ee' : 'rgba(148,163,184,0.5)', outline: count === n ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent' }}
                >{n}</button>
              ))}
            </div>
            <input type="range" min={1} max={100} value={count} disabled={running}
              onChange={e => setCount(Number(e.target.value))}
              style={{ width: '100%', marginTop: 8, accentColor: '#22d3ee' }}
            />
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(148,163,184,0.35)', marginTop: 1 }}>{count} variante{count > 1 ? 's' : ''}</div>
          </div>

          {/* Intensity */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Intensité</div>
            {(['subtle', 'medium', 'aggressive', 'vener'] as Intensity[]).map(lv => {
              const meta = {
                subtle:     { label: 'Subtile',    desc: '~90-99%', emoji: '🔵' },
                medium:     { label: 'Moyenne',    desc: '~80-90%', emoji: '🟡' },
                aggressive: { label: 'Aggressive', desc: '~65-80%', emoji: '🔴' },
                vener:      { label: 'Vener 🔥',   desc: '~42-65%', emoji: '💥' },
              }[lv]
              return (
                <button key={lv} onClick={() => setIntensity(lv)} disabled={running}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 10px', borderRadius: 8, marginBottom: 4, cursor: 'pointer', border: 'none', textAlign: 'left', transition: 'all 0.15s', background: intensity === lv ? 'rgba(34,211,238,0.07)' : 'rgba(255,255,255,0.025)', outline: intensity === lv ? '1px solid rgba(34,211,238,0.22)' : '1px solid rgba(255,255,255,0.05)' }}
                >
                  <span style={{ fontSize: 12 }}>{meta.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: intensity === lv ? '#22d3ee' : 'rgba(226,232,240,0.65)' }}>{meta.label}</div>
                    <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.35)', marginTop: 1 }}>{meta.desc} similarité</div>
                  </div>
                  {intensity === lv && <span style={{ color: '#22d3ee', fontSize: 11 }}>✓</span>}
                </button>
              )
            })}
          </div>

          {/* Format de sortie */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Format de sortie</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {([['9:16', 'TikTok/Reels'], ['1:1', 'Carré'], ['16:9', 'YouTube'], ['keep', 'Original']] as [Format, string][]).map(([f, lbl]) => (
                <button key={f} onClick={() => setFormat(f)} disabled={running}
                  style={{ padding: '6px 4px', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: format === f ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.025)', color: format === f ? '#22d3ee' : 'rgba(148,163,184,0.5)', outline: format === f ? '1px solid rgba(34,211,238,0.2)' : '1px solid rgba(255,255,255,0.05)' }}
                >{lbl}</button>
              ))}
            </div>
          </div>

          {/* Export banque */}
          <div style={{ borderRadius: 9, padding: '9px 11px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: (isWeb || saveToBank) ? 9 : 0 }}>
              <span style={{ fontSize: 11, flex: 1, color: 'rgba(226,232,240,0.65)', fontWeight: 500 }}>☁ {isWeb ? 'Export automatique banque' : 'Sauvegarder en banque'}</span>
              {!isWeb && (
                <button onClick={() => setSaveToBank(v => !v)} disabled={running}
                  className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                  style={{ background: saveToBank ? 'linear-gradient(130deg,#22d3ee,#818cf8)' : 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer' }}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${saveToBank ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              )}
              {isWeb && <span style={{ fontSize: 9, color: '#22d3ee', fontWeight: 600, background: 'rgba(34,211,238,0.1)', padding: '2px 6px', borderRadius: 4 }}>ON</span>}
            </div>
            {(isWeb || saveToBank) && (
              <>
                {bankFolders.length > 0 && (
                  <select value={bankFolders.includes(bankFolder) ? bankFolder : ''}
                    onChange={e => setBankFolder(e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 7, fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2d9f3', marginBottom: 5, cursor: 'pointer' }}>
                    <option value="" style={{ background: '#0c0919' }}>Choisir un dossier…</option>
                    {bankFolders.map(f => <option key={f} value={f} style={{ background: '#0c0919' }}>{f}</option>)}
                  </select>
                )}
                <input placeholder={bankFolders.length > 0 ? 'Ou nouveau dossier…' : 'Dossier (optionnel)'}
                  value={bankFolder} onChange={e => setBankFolder(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 7, fontSize: 11, background: 'rgba(255,255,255,0.04)', border: `1px solid ${bankFolder.trim() ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`, color: '#e2d9f3', outline: 'none' }}
                />
              </>
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={running ? stop : startGeneration}
            disabled={!sourceUrl}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: sourceUrl ? 'pointer' : 'not-allowed', border: 'none', transition: 'all 0.2s',
              background: !sourceUrl ? 'rgba(255,255,255,0.04)' : running ? 'rgba(239,68,68,0.12)' : 'linear-gradient(135deg,rgba(34,211,238,0.22),rgba(129,140,248,0.22))',
              color: !sourceUrl ? 'rgba(148,163,184,0.25)' : running ? '#f87171' : '#22d3ee',
              boxShadow: sourceUrl && !running ? '0 0 20px rgba(34,211,238,0.12)' : 'none',
              outline: sourceUrl ? `1px solid ${running ? 'rgba(239,68,68,0.22)' : 'rgba(34,211,238,0.28)'}` : 'none',
            }}
          >
            {running ? `⏹ Arrêter (${totalDone}/${jobs.length})` : `⚡ Générer ${count} variante${count > 1 ? 's' : ''}`}
          </button>
        </div>

        {/* Right: variants grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {jobs.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12 }}>
              <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 6px' }}>
                <div style={{ position: 'absolute', inset: -12, borderRadius: '50%', border: '1px dashed rgba(34,211,238,0.18)', animation: 'orbit-spin 12s linear infinite' }} />
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,rgba(34,211,238,0.1),rgba(129,140,248,0.06))', border: '1px solid rgba(34,211,238,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>⚡</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(226,232,240,0.55)' }}>Upload une vidéo & génère tes variantes</div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.35)', maxWidth: 340, lineHeight: 1.7 }}>
                Chaque variante reçoit des micro-transformations invisibles :<br />couleur, audio, grain, crop, encodage — hash unique garanti.
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {['🎨 Colorimétrie', '🔊 Audio', '🌀 Grain', '✂️ Crop', '📦 Encodage', '🔐 Hash unique'].map(t => (
                  <span key={t} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: 'rgba(34,211,238,0.05)', color: 'rgba(34,211,238,0.6)', border: '1px solid rgba(34,211,238,0.1)' }}>{t}</span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
              {jobs.map((job, i) => <VariantCard key={job.id} job={job} index={i} />)}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
