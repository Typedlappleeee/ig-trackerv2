import { useState, useRef, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { runFfmpegRepurposeBatch, runRepurposeViaServer } from '@/lib/ffmpeg-web'
import { uploadVideoFromPath, type UploadScope } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { useT, useLang } from '@/lib/i18n'
import { useOrg } from '@/lib/orgContext'
import { BankPicker } from '@/pages/Bank'
import { checkAndDeductCredits, CREDIT_COSTS, useCredits } from '@/lib/credits'
import { useLicense } from '@/lib/license'

const isWeb = typeof window !== 'undefined' && !(window as any).electronAPI

interface VideoRepurposeProps { user: User }

type Intensity  = 'subtle' | 'medium' | 'aggressive'
type Format     = '9:16' | '1:1' | '16:9' | 'keep'
type JobStatus  = 'queued' | 'processing' | 'done' | 'error'

interface SourceVideo { url: string; name: string }

interface VariantJob {
  id: number; seed: number; status: JobStatus; progress: number
  sourceIndex: number; sourceName: string
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
    a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  } catch {
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
  }
}

// ── VariantCard ───────────────────────────────────────────────────────────────

function VariantCard({ job, index }: { job: VariantJob; index: number }) {
  const t = useT()
  const isDone = job.status === 'done'
  const isErr  = job.status === 'error'
  const isProc = job.status === 'processing'
  const isQ    = job.status === 'queued'

  return (
    <div className="sf-card anim-scale-in" style={{
      borderRadius: 14, overflow: 'hidden', position: 'relative',
      borderColor: isDone ? 'rgba(99,102,241,0.3)' : isErr ? 'rgba(239,68,68,0.25)' : 'var(--border)',
      boxShadow: isDone ? '0 0 24px -6px rgba(99,102,241,0.15)' : 'none',
      transition: 'border-color 0.3s, box-shadow 0.3s',
    }}>
      {/* Thumbnail */}
      <div style={{ width: '100%', aspectRatio: '9/16', background: '#0a0a14', position: 'relative', overflow: 'hidden', maxHeight: 160 }}>
        {job.thumb ? (
          <img src={job.thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isProc && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.2)', borderTopColor: '#6366F1', animation: 'spin 0.9s linear infinite', margin: '0 auto 6px' }} />
                <div style={{ fontSize: 10, color: 'rgba(99,102,241,0.6)' }}>{job.progress}%</div>
              </div>
            )}
            {isQ && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: 0.4 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
            )}
            {isErr && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </div>
            )}
          </div>
        )}
        {isProc && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,#6366F1,#818cf8)', width: `${job.progress}%`, transition: 'width 0.4s ease' }} />
          </div>
        )}
        {isDone && (
          <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(10,10,20,0.82)', backdropFilter: 'blur(4px)', borderRadius: 5, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#6366F1', border: '1px solid rgba(99,102,241,0.22)' }}>
            #{String(index + 1).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* Transforms tags */}
      {isDone && job.transforms && job.transforms.length > 0 && (
        <div style={{ padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: 3, borderBottom: '1px solid var(--border)' }}>
          {job.transforms.map((tr, i) => (
            <span key={i} className="sf-badge sf-badge-accent" style={{ fontSize: 8, padding: '2px 5px', borderRadius: 4 }}>{tr}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '6px 8px' }}>
        {isDone && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => job.outputPath && downloadBlob(job.outputPath, `variant_${index + 1}.mp4`)}
              className="sf-btn cursor-pointer"
              style={{ flex: 1, height: 28, fontSize: 9, background: 'rgba(99,102,241,0.1)', color: '#6366F1', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Télécharger
            </button>
            {job.uploading && <span style={{ fontSize: 9, color: 'var(--text-3)', display: 'flex', alignItems: 'center', paddingRight: 2 }}>
              <div className="sf-spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
            </span>}
            {job.uploadError && (
              <span title={job.uploadError} style={{ fontSize: 9, color: '#f87171', cursor: 'help', display: 'flex', alignItems: 'center' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </span>
            )}
          </div>
        )}
        {isErr && <div style={{ fontSize: 9, color: '#f87171' }}>{job.error?.slice(0, 45)}</div>}
        {isQ   && <div style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'center' }}>En attente…</div>}
        {isProc && <div style={{ fontSize: 9, color: 'rgba(99,102,241,0.6)', textAlign: 'center' }}>Traitement {job.progress}%</div>}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function VideoRepurpose({ user }: VideoRepurposeProps) {
  const t = useT()
  const { currentOrg } = useOrg()
  const credits = useCredits()
  const { isSuperAdmin } = useLicense()
  const scope: UploadScope = currentOrg
    ? { mode: 'org', id: currentOrg.id }
    : { mode: 'user', id: user.id }

  const [sources, setSources]           = useState<SourceVideo[]>([])
  const [dragging, setDragging]         = useState(false)
  const [showBank, setShowBank]         = useState(false)
  const [count, setCount]               = useState(5)
  const [intensity, setIntensity]       = useState<Intensity>('subtle')
  const [format, setFormat]             = useState<Format>('9:16')
  const [saveToBank, setSaveToBank]     = useState(isWeb)
  const [bankFolder, setBankFolder]     = useState('')
  const [bankFolders, setBankFolders]   = useState<string[]>([])
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [folderInput, setFolderInput]   = useState('')
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

  function addFiles(files: FileList | File[]) {
    const vids = Array.from(files).filter(f => f.type.startsWith('video/'))
    if (!vids.length) return
    setSources(prev => [
      ...prev,
      ...vids.map(f => ({ url: URL.createObjectURL(f), name: f.name })),
    ])
    setJobs([]); setTotalDone(0)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [])

  const totalJobs = sources.length * count

  async function startGeneration() {
    if (!sources.length || running) return
    const creditCost = totalJobs * CREDIT_COSTS.clone_vid
    if (!isSuperAdmin) {
      const creditRes = await checkAndDeductCredits(credits.ownerId, creditCost)
      if (!creditRes.ok) {
        const balanceDisplay = creditRes.balance ?? credits.balance
        const errDetail = creditRes.error ? ` (${creditRes.error})` : ''
        alert(`Crédits insuffisants — ${creditCost} crédits requis pour ${totalJobs} vidéos. Solde: ${balanceDisplay}${errDetail}`)
        return
      }
      if (typeof creditRes.balance === 'number') credits.setBalance(creditRes.balance)
    }
    abortRef.current = false
    setRunning(true); setStartedAt(Date.now()); setElapsed(0); setTotalDone(0)

    // Build all jobs upfront: for each source × count variants
    let jobId = 0
    const allJobs: VariantJob[] = []
    for (let si = 0; si < sources.length; si++) {
      for (let vi = 0; vi < count; vi++) {
        allJobs.push({
          id: jobId++, seed: Date.now() + jobId * 7919,
          status: 'queued', progress: 0,
          sourceIndex: si, sourceName: sources[si].name,
        })
      }
    }
    setJobs(allJobs)

    try {
      let done = 0
      // Process all variants of each source in one batch — input written once per source
      for (let si = 0; si < sources.length; si++) {
        if (abortRef.current) break
        const src = sources[si]
        const sourceJobs = allJobs.filter(j => j.sourceIndex === si)

        // Try server-side FFmpeg first (native speed, ~3s/video, all variants in parallel)
        // Falls back to WASM automatically if the API is unavailable
        sourceJobs.forEach(j => updateJob(j.id, { status: 'processing', progress: 5 }))
        let results
        try {
          results = await runRepurposeViaServer({
            sourceUrl: src.url,
            userId:    user.id,
            seeds:     sourceJobs.map(j => j.seed),
            intensity,
            format,
            onUploadProgress: pct => sourceJobs.forEach(j => updateJob(j.id, { progress: Math.round(pct * 0.25) })),
            onProcessing:     ()  => sourceJobs.forEach(j => updateJob(j.id, { progress: 30 })),
          })
          sourceJobs.forEach(j => updateJob(j.id, { progress: 90 }))
        } catch {
          results = await runFfmpegRepurposeBatch({
            inputPath: src.url,
            seeds:     sourceJobs.map(j => j.seed),
            intensity,
            format,
            onVariantStart:    idx => updateJob(sourceJobs[idx].id, { status: 'processing', progress: 5 }),
            onVariantProgress: (idx, pct) => updateJob(sourceJobs[idx].id, { progress: pct }),
          })
        }

        for (let vi = 0; vi < sourceJobs.length; vi++) {
          if (abortRef.current) break
          const result = results[vi] ?? { ok: false, error: 'No result' }
          const job    = sourceJobs[vi]

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
                const variantNum = vi + 1
                let storagePath: string
                let thumbnailPath: string | null = null
                if (result.storagePath) {
                  storagePath = result.storagePath  // server already uploaded
                  thumbnailPath = result.thumbnailPath ?? null
                } else {
                  const up = await uploadVideoFromPath(result.outputPath!, scope)
                  storagePath   = up.storagePath
                  thumbnailPath = up.thumbnailPath
                }
                const { error: dbErr } = await supabase.from('content_bank').insert({
                  user_id: user.id, org_id: currentOrg?.id ?? null,
                  title: `CloneVid #${String(variantNum).padStart(3, '0')} — ${src.name}`,
                  file_url: null, storage_path: storagePath, thumbnail_path: thumbnailPath,
                  folder: bankFolder.trim() || null, tags: [], notes: '',
                })
                if (dbErr) throw new Error(dbErr.message)
                updateJob(job.id, { uploading: false })
              } catch (e) {
                updateJob(job.id, { uploading: false, uploadError: String(e instanceof Error ? e.message : e) })
              }
            }
          } else {
            updateJob(job.id, { status: 'error', error: result.error ?? 'Unknown error' })
          }

          done++; setTotalDone(done)
        }
      }
    } finally {
      setRunning(false)
    }
  }

  function stop() { abortRef.current = true; setRunning(false) }

  function removeSource(i: number) {
    setSources(prev => prev.filter((_, idx) => idx !== i))
    setJobs([]); setTotalDone(0)
  }

  const donePct    = jobs.length > 0 ? Math.round((totalDone / jobs.length) * 100) : 0
  const avgSim     = jobs.filter(j => j.similarityPct != null).map(j => j.similarityPct!)
  const avgSimVal  = avgSim.length > 0 ? Math.round(avgSim.reduce((a, b) => a + b, 0) / avgSim.length) : null
  const elapsedStr = elapsed > 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`

  // Group jobs by source for display
  const jobsBySource = sources.map((src, si) => ({
    src,
    jobs: jobs.filter(j => j.sourceIndex === si),
  }))

  return (
    <div className="anim-page" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--base)' }}>
      {showBank && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const newSrcs = paths.map((url, i) => ({ url, name: titles?.[i] ?? 'bank video' }))
            setSources(prev => [...prev, ...newSrcs])
            setJobs([]); setTotalDone(0)
            setShowBank(false)
          }}
          onClose={() => setShowBank(false)}
        />
      )}

      {/* ── Premium Header ── */}
      <header className="sf-page-header" style={{ background: 'rgba(7,7,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="sf-anim-slide-up sf-d50" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Zap icon badge */}
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(99,102,241,0.06))',
            border: '1px solid rgba(99,102,241,0.28)',
            boxShadow: '0 0 24px -6px rgba(99,102,241,0.4)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{
                fontSize: 22, fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1, margin: 0,
                background: 'linear-gradient(135deg, #FFFFFF 0%, rgba(99,102,241,0.9) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>CloneVid</h1>
              {running ? (
                <span className="sf-badge" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1', border: '1px solid rgba(99,102,241,0.25)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366F1', display: 'inline-block' }} />
                  Génération…
                </span>
              ) : (
                <span className="sf-badge sf-badge-muted">Prêt</span>
              )}
            </div>
            <p className="sf-page-sub">
              {sources.length > 1
                ? `${sources.length} vidéos × ${count} variantes = ${totalJobs} au total`
                : `1 video → N variantes uniques · transformations invisibles`}
            </p>
          </div>
        </div>

        {/* Stats when running */}
        {jobs.length > 0 && (
          <div className="anim-stagger" style={{ display: 'flex', gap: 10 }}>
            {[
              { label: t('repurposeGeneratedHeader'), value: `${totalDone}/${jobs.length}` },
              { label: t('repurposeSimilarityHeader'), value: avgSimVal != null ? `${avgSimVal}%` : '—' },
              { label: t('repurposeTimeHeader'), value: elapsedStr },
            ].map(s => (
              <div key={s.label} className="sf-card" style={{ padding: '8px 16px', textAlign: 'center', minWidth: 72 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#6366F1', lineHeight: 1, letterSpacing: '-0.03em' }}>{s.value}</div>
                <div style={{ fontSize: 9, color: 'var(--text-4)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Global progress bar */}
      {running && (
        <div className="sf-progress" style={{ borderRadius: 0, height: 2, flexShrink: 0 }}>
          <div className="sf-progress-bar" style={{ width: `${donePct}%`, boxShadow: '0 0 8px rgba(99,102,241,0.5)' }} />
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

        {/* ── Left panel ── */}
        <div className="anim-stagger" style={{ width: 278, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Upload zone */}
          <div style={{ padding: '16px 14px 0' }}>
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer sf-hover-lift"
              style={{
                borderRadius: 14, border: `2px dashed ${dragging ? '#6366F1' : sources.length ? 'rgba(99,102,241,0.35)' : 'var(--border-md)'}`,
                background: dragging ? 'rgba(99,102,241,0.06)' : sources.length ? 'rgba(99,102,241,0.03)' : 'rgba(255,255,255,0.02)',
                padding: '20px 14px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
              }}
            >
              <input ref={fileInputRef} type="file" accept="video/*" multiple style={{ display: 'none' }}
                onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
              {/* Upload icon */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sources.length ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${sources.length ? 'rgba(99,102,241,0.25)' : 'var(--border)'}`, color: sources.length ? '#6366F1' : 'var(--text-3)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: sources.length ? '#6366F1' : 'var(--text-2)', marginBottom: 3 }}>
                {sources.length ? `${sources.length} vidéo${sources.length > 1 ? 's' : ''} sélectionnée${sources.length > 1 ? 's' : ''}` : t('repurposeDropVideo')}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-4)' }}>
                {sources.length ? "Cliquer pour en ajouter d’autres" : 'MP4, MOV, WebM — plusieurs fichiers OK'}
              </div>
            </div>

            {/* Selected videos list */}
            {sources.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sources.map((src, i) => (
                  <div key={i} className="sf-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 9 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.7)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {src.name.slice(0, 22)}{src.name.length > 22 ? '…' : ''}
                    </span>
                    {!running && (
                      <button onClick={e => { e.stopPropagation(); removeSource(i) }}
                        className="sf-btn sf-btn-ghost sf-btn-icon cursor-pointer"
                        style={{ width: 20, height: 20, minWidth: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* From bank */}
            <button
              onClick={() => setShowBank(true)} disabled={running}
              className="sf-btn sf-btn-secondary cursor-pointer"
              style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8h20M4 8V6a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8M10 12h4"/></svg>
              {t('repurposeFromBank')}
            </button>
          </div>

          {/* Divider */}
          <div className="sf-divider" style={{ margin: '14px 0' }} />

          {/* Count — per video */}
          <div style={{ padding: '0 14px' }}>
            <div className="sf-section-label" style={{ marginBottom: 8 }}>
              {t('repurposeVariantsSection')}
              {sources.length > 1 && <span style={{ marginLeft: 6, color: 'rgba(99,102,241,0.6)', fontWeight: 600, fontSize: 9 }}>par vidéo</span>}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[3, 5, 10, 25].map(n => (
                <button key={n} onClick={() => setCount(n)} disabled={running} className="cursor-pointer"
                  style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: count === n ? 'rgba(99,102,241,0.15)' : 'var(--surface-2)', color: count === n ? '#6366F1' : 'var(--text-3)', outline: count === n ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent' }}
                >{n}</button>
              ))}
            </div>
            <input type="range" min={1} max={50} value={count} disabled={running}
              onChange={e => setCount(Number(e.target.value))}
              style={{ width: '100%', marginTop: 8, accentColor: '#6366F1', cursor: 'pointer' }}
            />
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
              {sources.length > 1
                ? <span><span style={{ color: '#6366F1', fontWeight: 700 }}>{count}</span> /vidéo · <span style={{ color: '#6366F1', fontWeight: 700 }}>{totalJobs}</span> total</span>
                : `${count} ${count > 1 ? t('repurposeVariantPlural') : t('repurposeVariant')}`}
            </div>
          </div>

          {/* Divider */}
          <div className="sf-divider" style={{ margin: '14px 0' }} />

          {/* Intensity */}
          <div style={{ padding: '0 14px' }}>
            <div className="sf-section-label" style={{ marginBottom: 8 }}>{t('repurposeIntensitySection')}</div>
            {(['subtle', 'medium', 'aggressive'] as Intensity[]).map(lv => {
              const meta = {
                subtle:     { label: t('repurposeSubtle'),     desc: '~75-90% · couleur + zoom léger',    color: '#6366F1', bars: 1 },
                medium:     { label: t('repurposeMedium'),     desc: '~60-80% · temp. couleur + teinte',  color: '#fbbf24', bars: 2 },
                aggressive: { label: t('repurposeAggressive'), desc: '~42-65% · fort changement visuel',  color: '#f87171', bars: 3 },
              }[lv]
              const active = intensity === lv
              return (
                <button key={lv} onClick={() => setIntensity(lv)} disabled={running} className="cursor-pointer"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 10, marginBottom: 5, cursor: 'pointer', border: 'none', textAlign: 'left', transition: 'all 0.15s',
                    background: active ? `rgba(${lv === 'subtle' ? '34,211,238' : lv === 'medium' ? '251,191,36' : '248,113,113'},0.08)` : 'var(--surface-2)',
                    outline: active ? `1px solid rgba(${lv === 'subtle' ? '34,211,238' : lv === 'medium' ? '251,191,36' : '248,113,113'},0.32)` : '1px solid var(--border)',
                  }}
                >
                  {/* Level bars */}
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexShrink: 0 }}>
                    {[1,2,3].map(b => (
                      <div key={b} style={{
                        width: 4, borderRadius: 2,
                        height: b === 1 ? 8 : b === 2 ? 12 : 16,
                        background: b <= meta.bars && active ? meta.color : b <= meta.bars ? `${meta.color}44` : 'rgba(255,255,255,0.08)',
                        transition: 'background 0.2s',
                      }} />
                    ))}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: active ? meta.color : 'var(--text-2)', transition: 'color 0.15s' }}>{meta.label}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-4)', marginTop: 1 }}>{meta.desc}</div>
                  </div>
                  {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0, boxShadow: `0 0 6px ${meta.color}` }} />}
                </button>
              )
            })}
          </div>

          {/* Divider */}
          <div className="sf-divider" style={{ margin: '14px 0' }} />

          {/* Output format */}
          <div style={{ padding: '0 14px' }}>
            <div className="sf-section-label" style={{ marginBottom: 8 }}>{t('repurposeFormatSection')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {([[`9:16`, t('repurposeTikTok')], [`1:1`, t('repurposeSquare')], [`16:9`, t('repurposeYouTube')], [`keep`, t('repurposeOriginal')]] as [Format, string][]).map(([f, lbl]) => (
                <button key={f} onClick={() => setFormat(f)} disabled={running} className="cursor-pointer"
                  style={{ padding: '8px 4px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: format === f ? 'rgba(99,102,241,0.12)' : 'var(--surface-2)', color: format === f ? '#6366F1' : 'var(--text-3)', outline: format === f ? '1px solid rgba(99,102,241,0.25)' : '1px solid var(--border)' }}
                >{lbl}</button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="sf-divider" style={{ margin: '14px 0' }} />

          {/* Export banque */}
          <div style={{ padding: '0 14px' }}>
            <div className="sf-card" style={{ padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: (isWeb || saveToBank) ? 10 : 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 13v8m-4-4l4 4 4-4M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>
                <span style={{ fontSize: 12, flex: 1, color: 'var(--text-2)', fontWeight: 500 }}>
                  {isWeb ? t('repurposeAutoExport') : t('repurposeSaveToBank')}
                </span>
                {!isWeb && (
                  <button onClick={() => setSaveToBank(v => !v)} disabled={running} className="cursor-pointer"
                    style={{ position: 'relative', width: 36, height: 20, borderRadius: 99, background: saveToBank ? 'linear-gradient(130deg,#6366F1,#818cf8)' : 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}
                  >
                    <span style={{ position: 'absolute', top: 2, left: saveToBank ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', display: 'block' }} />
                  </button>
                )}
                {isWeb && <span className="sf-badge" style={{ fontSize: 9, color: '#6366F1', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '1px 6px' }}>ON</span>}
              </div>

              {(isWeb || saveToBank) && (
                <button
                  onClick={() => { setFolderInput(bankFolder); setShowFolderModal(true) }}
                  disabled={running}
                  className="cursor-pointer"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px',
                    borderRadius: 9, fontSize: 11.5, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer',
                    background: bankFolder ? 'rgba(99,102,241,0.1)' : 'var(--surface-2)',
                    border: `1px solid ${bankFolder ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                    color: bankFolder ? '#818CF8' : 'var(--text-3)', textAlign: 'left',
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bankFolder || 'Choisir un dossier…'}
                  </span>
                  {bankFolder && (
                    <span
                      role="button"
                      onClick={e => { e.stopPropagation(); setBankFolder('') }}
                      className="cursor-pointer sf-press"
                      style={{ opacity: 0.5, lineHeight: 1, cursor: 'pointer', fontSize: 13 }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Generate button */}
          <div style={{ padding: '14px 14px 16px' }}>
            <button
              onClick={running ? stop : startGeneration}
              disabled={!sources.length}
              className="sf-btn sf-btn-lg cursor-pointer"
              style={{
                width: '100%',
                background: !sources.length ? 'var(--surface-2)' : running ? 'rgba(239,68,68,0.12)' : 'linear-gradient(135deg,rgba(99,102,241,0.22),rgba(129,140,248,0.22))',
                color: !sources.length ? 'var(--text-4)' : running ? '#f87171' : '#6366F1',
                border: sources.length ? `1px solid ${running ? 'rgba(239,68,68,0.28)' : 'rgba(99,102,241,0.32)'}` : '1px solid var(--border)',
                boxShadow: sources.length && !running ? '0 0 24px rgba(99,102,241,0.14)' : 'none',
                cursor: sources.length ? 'pointer' : 'not-allowed',
                justifyContent: 'center',
              }}
            >
              {running ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  {t('repurposeStopBtn')} ({totalDone}/{jobs.length})
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {sources.length > 1
                    ? `Générer ${totalJobs} variantes (${sources.length}×${count})`
                    : `${t('repurposeGenerateBtn')} ${count} ${count > 1 ? t('repurposeVariantPlural') : t('repurposeVariant')}`}
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Right: variants grid ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', background: 'var(--base)' }}>
          {jobs.length === 0 ? (
            <div className="sf-empty anim-stagger" style={{ height: '100%' }}>
              {/* Animated icon */}
              <div style={{ position: 'relative', width: 76, height: 76, margin: '0 auto 8px' }}>
                <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1px dashed rgba(99,102,241,0.18)', animation: 'spin 14s linear infinite' }} />
                <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '1px dashed rgba(99,102,241,0.12)', animation: 'spin 20s linear infinite reverse' }} />
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, rgba(99,102,241,0.1), rgba(129,140,248,0.06))', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                </div>
              </div>
              <p className="sf-empty-title">{t('repurposeEmptyState')}</p>
              <p className="sf-empty-desc">
                {t('repurposeEmptyDesc').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}
              </p>
              {/* Transform pills */}
              <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[
                  { label: 'Color grading', icon: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z' },
                  { label: 'Zoom crop', icon: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM10 7v3m0 0v3m0-3h3m-3 0H7' },
                  { label: 'Grain', icon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' },
                  { label: 'Encoding', icon: 'M2 12h2m16 0h2M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41' },
                  { label: 'Hash unique', icon: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18' },
                ].map(pill => (
                  <span key={pill.label} className="sf-badge" style={{ padding: '4px 10px', background: 'rgba(99,102,241,0.05)', color: 'rgba(99,102,241,0.65)', border: '1px solid rgba(99,102,241,0.12)', fontSize: 10, gap: 5 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={pill.icon}/></svg>
                    {pill.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {jobsBySource.map(({ src, jobs: srcJobs }, si) => (
                srcJobs.length > 0 && (
                  <div key={si}>
                    {sources.length > 1 && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="14" height="9" rx="1.5"/><path d="M16 6.5L22 4v7l-6-2.5V6.5Z"/></svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</span>
                        <span className="sf-badge" style={{ fontSize: 9, color: 'rgba(99,102,241,0.5)', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', flexShrink: 0 }}>
                          {srcJobs.filter(j => j.status === 'done').length}/{srcJobs.length}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                      {srcJobs.map((job, i) => <VariantCard key={job.id} job={job} index={i} />)}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Folder destination modal ───────────────────────────────────────── */}
      {showFolderModal && (
        <div className="sf-modal-bg" onClick={() => setShowFolderModal(false)}>
          <div className="sf-modal anim-scale-in" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sf-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </div>
                <span className="sf-modal-title">Dossier de destination</span>
              </div>
              <button onClick={() => setShowFolderModal(false)}
                className="sf-btn sf-btn-ghost sf-btn-icon sf-btn-sm cursor-pointer">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Free-type input */}
            <div className="sf-modal-body" style={{ paddingBottom: 12 }}>
              <input
                autoFocus
                placeholder="Nom du dossier (existant ou nouveau)…"
                value={folderInput}
                onChange={e => setFolderInput(e.target.value)}
                className="sf-input"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const n = folderInput.trim()
                    setBankFolder(n)
                    if (n && !bankFolders.includes(n)) setBankFolders(prev => [...prev, n].sort())
                    setShowFolderModal(false)
                  }
                  if (e.key === 'Escape') setShowFolderModal(false)
                }}
              />
              {folderInput.trim() && (
                <button
                  onClick={() => {
                    const n = folderInput.trim()
                    setBankFolder(n)
                    if (n && !bankFolders.includes(n)) setBankFolders(prev => [...prev, n].sort())
                    setShowFolderModal(false)
                  }}
                  className="sf-btn sf-btn-secondary cursor-pointer"
                  style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Utiliser «{folderInput.trim()}»
                </button>
              )}
            </div>

            {/* Existing folders list */}
            {bankFolders.length > 0 && (
              <div style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
                {bankFolders.map(f => (
                  <button key={f}
                    onClick={() => { setBankFolder(f); setShowFolderModal(false) }}
                    className="cursor-pointer"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', textAlign: 'left', background: f === bankFolder ? 'rgba(99,102,241,0.1)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: f === bankFolder ? '#818CF8' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
                    {f === bankFolder && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
