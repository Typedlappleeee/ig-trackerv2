import { useState, useRef, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { runFfmpegRepurposeBatch } from '@/lib/ffmpeg-web'
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
    <div style={{
      borderRadius: 14, overflow: 'hidden', position: 'relative',
      background: isDone ? 'rgba(34,211,238,0.03)' : 'rgba(255,255,255,0.025)',
      border: `1px solid ${isDone ? 'rgba(34,211,238,0.25)' : isErr ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
      transition: 'border-color 0.3s, box-shadow 0.3s',
      boxShadow: isDone ? '0 0 24px rgba(34,211,238,0.08)' : 'none',
    }}>
      {/* Thumbnail */}
      <div style={{ width: '100%', aspectRatio: '9/16', background: '#0a0a14', position: 'relative', overflow: 'hidden', maxHeight: 160 }}>
        {job.thumb ? (
          <img src={job.thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isProc && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(34,211,238,0.2)', borderTopColor: '#22d3ee', animation: 'spin 0.9s linear infinite', margin: '0 auto 6px' }} />
                <div style={{ fontSize: 10, color: 'rgba(34,211,238,0.6)' }}>{job.progress}%</div>
              </div>
            )}
            {isQ    && <span style={{ fontSize: 18, opacity: 0.2 }}>⏳</span>}
            {isErr  && <span style={{ fontSize: 18 }}>❌</span>}
          </div>
        )}
        {isProc && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(0,0,0,0.4)' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,#22d3ee,#818cf8)', width: `${job.progress}%`, transition: 'width 0.4s ease' }} />
          </div>
        )}
        {isDone && (
          <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(10,10,20,0.8)', backdropFilter: 'blur(4px)', borderRadius: 5, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)' }}>
            #{String(index + 1).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* Transforms tags */}
      {isDone && job.transforms && job.transforms.length > 0 && (
        <div style={{ padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {job.transforms.map((tr, i) => (
            <span key={i} style={{
              fontSize: 8, fontWeight: 600, padding: '2px 5px', borderRadius: 4,
              background: 'rgba(129,140,248,0.1)', color: 'rgba(167,139,250,0.8)',
              border: '1px solid rgba(129,140,248,0.15)',
            }}>{tr}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '6px 8px' }}>
        {isDone && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => job.outputPath && downloadBlob(job.outputPath, `variant_${index + 1}.mp4`)}
              style={{ flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 9, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'rgba(34,211,238,0.12)', color: '#22d3ee', transition: 'background 0.15s' }}
            >⬇ Télécharger</button>
            {job.uploading && <span style={{ fontSize: 9, color: 'rgba(148,163,184,0.4)', display: 'flex', alignItems: 'center', paddingRight: 2 }}>☁…</span>}
            {job.uploadError && <span title={job.uploadError} style={{ fontSize: 9, color: '#f87171', cursor: 'help', display: 'flex', alignItems: 'center' }}>⚠</span>}
          </div>
        )}
        {isErr && <div style={{ fontSize: 9, color: '#f87171' }}>{job.error?.slice(0, 45)}</div>}
        {isQ   && <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.3)', textAlign: 'center' }}>En attente…</div>}
        {isProc && <div style={{ fontSize: 9, color: 'rgba(34,211,238,0.5)', textAlign: 'center' }}>Traitement {job.progress}%</div>}
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
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName]   = useState('')
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

        const results = await runFfmpegRepurposeBatch({
          inputPath: src.url,
          seeds:     sourceJobs.map(j => j.seed),
          intensity,
          format,
          onVariantStart:    idx => updateJob(sourceJobs[idx].id, { status: 'processing', progress: 5 }),
          onVariantProgress: (idx, pct) => updateJob(sourceJobs[idx].id, { progress: pct }),
        })

        for (let vi = 0; vi < results.length; vi++) {
          if (abortRef.current) break
          const result = results[vi]
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
                const up = await uploadVideoFromPath(result.outputPath!, scope)
                const { error: dbErr } = await supabase.from('content_bank').insert({
                  user_id: user.id, org_id: currentOrg?.id ?? null,
                  title: `CloneVid #${String(variantNum).padStart(3, '0')} — ${src.name}`,
                  file_url: null, storage_path: up.storagePath, thumbnail_path: up.thumbnailPath,
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
    <div className="anim-page" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {showBank && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="full"
          onSelect={(paths, titles) => {
            const newSrcs = paths.map((url, i) => ({ url, name: titles?.[i] ?? 'bank video' }))
            setSources(prev => [...prev, ...newSrcs])
            setJobs([]); setTotalDone(0)
            setShowBank(false)
          }}
          onClose={() => setShowBank(false)}
        />
      )}

      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F1F0F7', letterSpacing: '-0.02em', marginBottom: 3 }}>CloneVid</h1>
            <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.55)' }}>
              {sources.length > 1
                ? `${sources.length} vidéos × ${count} variantes = ${totalJobs} au total`
                : `1 video → N unique variants · invisible transformations`}
            </p>
          </div>
          {jobs.length > 0 && (
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: t('repurposeGeneratedHeader'), value: `${totalDone}/${jobs.length}` },
                { label: t('repurposeSimilarityHeader'), value: avgSimVal != null ? `${avgSimVal}%` : '—' },
                { label: t('repurposeTimeHeader'), value: elapsedStr },
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
        <div style={{ width: 270, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 13 }}>

          {/* Upload zone */}
          <div>
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                borderRadius: 12, border: `2px dashed ${dragging ? '#22d3ee' : sources.length ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.1)'}`,
                background: dragging ? 'rgba(34,211,238,0.05)' : 'rgba(255,255,255,0.02)',
                padding: '14px 12px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
              }}
            >
              <input ref={fileInputRef} type="file" accept="video/*" multiple style={{ display: 'none' }}
                onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
              <div style={{ fontSize: 20, marginBottom: 4, opacity: sources.length ? 1 : 0.4 }}>📁</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: sources.length ? '#22d3ee' : 'rgba(226,232,240,0.6)', marginBottom: 2 }}>
                {sources.length ? `${sources.length} vidéo${sources.length > 1 ? 's' : ''} sélectionnée${sources.length > 1 ? 's' : ''}` : t('repurposeDropVideo')}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)' }}>
                {sources.length ? 'Cliquer pour en ajouter d\'autres' : 'MP4, MOV, WebM — plusieurs fichiers OK'}
              </div>
            </div>

            {/* Selected videos list */}
            {sources.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {sources.map((src, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 7, background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.1)' }}>
                    <span style={{ fontSize: 10 }}>🎬</span>
                    <span style={{ flex: 1, fontSize: 10, color: 'rgba(226,232,240,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {src.name.slice(0, 22)}{src.name.length > 22 ? '…' : ''}
                    </span>
                    {!running && (
                      <button onClick={e => { e.stopPropagation(); removeSource(i) }}
                        style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* From bank */}
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
              🗂 {t('repurposeFromBank')}
            </button>
          </div>

          {/* Count — per video */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
              {t('repurposeVariantsSection')}
              {sources.length > 1 && <span style={{ marginLeft: 4, color: 'rgba(34,211,238,0.5)', fontWeight: 600 }}>par vidéo</span>}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[3, 5, 10, 25].map(n => (
                <button key={n} onClick={() => setCount(n)} disabled={running}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: count === n ? 'linear-gradient(135deg,rgba(34,211,238,0.2),rgba(129,140,248,0.2))' : 'rgba(255,255,255,0.04)', color: count === n ? '#22d3ee' : 'rgba(148,163,184,0.5)', outline: count === n ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent' }}
                >{n}</button>
              ))}
            </div>
            <input type="range" min={1} max={50} value={count} disabled={running}
              onChange={e => setCount(Number(e.target.value))}
              style={{ width: '100%', marginTop: 8, accentColor: '#22d3ee' }}
            />
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(148,163,184,0.35)', marginTop: 1 }}>
              {sources.length > 1
                ? <span><span style={{ color: '#22d3ee', fontWeight: 600 }}>{count}</span> /vidéo · <span style={{ color: '#a78bfa', fontWeight: 600 }}>{totalJobs}</span> total</span>
                : `${count} ${count > 1 ? t('repurposeVariantPlural') : t('repurposeVariant')}`}
            </div>
          </div>

          {/* Intensity */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>{t('repurposeIntensitySection')}</div>
            {(['subtle', 'medium', 'aggressive'] as Intensity[]).map(lv => {
              const meta = {
                subtle:     { label: t('repurposeSubtle'),     desc: '~75-90% · couleur + zoom léger',    color: '#22d3ee', bars: 1 },
                medium:     { label: t('repurposeMedium'),     desc: '~60-80% · temp. couleur + teinte',  color: '#fbbf24', bars: 2 },
                aggressive: { label: t('repurposeAggressive'), desc: '~42-65% · fort changement visuel',  color: '#f87171', bars: 3 },
              }[lv]
              const active = intensity === lv
              return (
                <button key={lv} onClick={() => setIntensity(lv)} disabled={running}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 8, marginBottom: 4, cursor: 'pointer', border: 'none', textAlign: 'left', transition: 'all 0.15s',
                    background: active ? `rgba(${lv === 'subtle' ? '34,211,238' : lv === 'medium' ? '251,191,36' : '248,113,113'},0.08)` : 'rgba(255,255,255,0.025)',
                    outline: active ? `1px solid rgba(${lv === 'subtle' ? '34,211,238' : lv === 'medium' ? '251,191,36' : '248,113,113'},0.3)` : '1px solid rgba(255,255,255,0.05)',
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
                    <div style={{ fontSize: 11, fontWeight: 700, color: active ? meta.color : 'rgba(226,232,240,0.65)', transition: 'color 0.15s' }}>{meta.label}</div>
                    <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.4)', marginTop: 1 }}>{meta.desc}</div>
                  </div>
                  {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0, boxShadow: `0 0 6px ${meta.color}` }} />}
                </button>
              )
            })}
          </div>

          {/* Output format */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>{t('repurposeFormatSection')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {([[`9:16`, t('repurposeTikTok')], [`1:1`, t('repurposeSquare')], [`16:9`, t('repurposeYouTube')], [`keep`, t('repurposeOriginal')]] as [Format, string][]).map(([f, lbl]) => (
                <button key={f} onClick={() => setFormat(f)} disabled={running}
                  style={{ padding: '6px 4px', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: format === f ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.025)', color: format === f ? '#22d3ee' : 'rgba(148,163,184,0.5)', outline: format === f ? '1px solid rgba(34,211,238,0.2)' : '1px solid rgba(255,255,255,0.05)' }}
                >{lbl}</button>
              ))}
            </div>
          </div>

          {/* Export banque */}
          <div style={{ borderRadius: 9, padding: '9px 11px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: (isWeb || saveToBank) ? 9 : 0 }}>
              <span style={{ fontSize: 11, flex: 1, color: 'rgba(226,232,240,0.65)', fontWeight: 500 }}>☁ {isWeb ? t('repurposeAutoExport') : t('repurposeSaveToBank')}</span>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {/* Dropdown dossiers existants */}
                <select
                  value={bankFolder}
                  onChange={e => { setBankFolder(e.target.value); setCreatingFolder(false) }}
                  disabled={running}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 7, fontSize: 11, background: 'rgba(255,255,255,0.05)', border: `1px solid ${bankFolder ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`, color: bankFolder ? '#c4b5fd' : 'rgba(148,163,184,0.5)', cursor: 'pointer', outline: 'none' }}
                >
                  <option value="" style={{ background: '#0c0919', color: '#94a3b8' }}>📁 Aucun dossier</option>
                  {bankFolders.map(f => (
                    <option key={f} value={f} style={{ background: '#0c0919', color: '#e2d9f3' }}>📁 {f}</option>
                  ))}
                </select>

                {/* Nouveau dossier */}
                {creatingFolder ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      autoFocus
                      placeholder="Nom du nouveau dossier…"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const n = newFolderName.trim()
                          if (n) { setBankFolder(n); setBankFolders(prev => prev.includes(n) ? prev : [...prev, n]) }
                          setNewFolderName(''); setCreatingFolder(false)
                        }
                        if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
                      }}
                      style={{ flex: 1, padding: '5px 8px', borderRadius: 7, fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(139,92,246,0.5)', color: '#e2d9f3', outline: 'none' }}
                    />
                    <button
                      onClick={() => {
                        const n = newFolderName.trim()
                        if (n) { setBankFolder(n); setBankFolders(prev => prev.includes(n) ? prev : [...prev, n]) }
                        setNewFolderName(''); setCreatingFolder(false)
                      }}
                      style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'rgba(139,92,246,0.25)', color: '#a78bfa' }}
                    >✓</button>
                    <button
                      onClick={() => { setCreatingFolder(false); setNewFolderName('') }}
                      style={{ padding: '5px 8px', borderRadius: 7, fontSize: 11, cursor: 'pointer', border: 'none', background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.5)' }}
                    >✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreatingFolder(true)}
                    disabled={running}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '5px 0', borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: '1px dashed rgba(139,92,246,0.3)', background: 'transparent', color: 'rgba(139,92,246,0.55)', transition: 'all 0.15s', width: '100%' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.07)'; e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(139,92,246,0.55)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)' }}
                  >
                    + Nouveau dossier
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={running ? stop : startGeneration}
            disabled={!sources.length}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: sources.length ? 'pointer' : 'not-allowed', border: 'none', transition: 'all 0.2s',
              background: !sources.length ? 'rgba(255,255,255,0.04)' : running ? 'rgba(239,68,68,0.12)' : 'linear-gradient(135deg,rgba(34,211,238,0.22),rgba(129,140,248,0.22))',
              color: !sources.length ? 'rgba(148,163,184,0.25)' : running ? '#f87171' : '#22d3ee',
              boxShadow: sources.length && !running ? '0 0 20px rgba(34,211,238,0.12)' : 'none',
              outline: sources.length ? `1px solid ${running ? 'rgba(239,68,68,0.22)' : 'rgba(34,211,238,0.28)'}` : 'none',
            }}
          >
            {running
              ? `${t('repurposeStopBtn')} (${totalDone}/${jobs.length})`
              : sources.length > 1
                ? `Générer ${totalJobs} variantes (${sources.length}×${count})`
                : `${t('repurposeGenerateBtn')} ${count} ${count > 1 ? t('repurposeVariantPlural') : t('repurposeVariant')}`}
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
              <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(226,232,240,0.55)' }}>{t('repurposeEmptyState')}</div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.35)', maxWidth: 340, lineHeight: 1.7 }}>
                {t('repurposeEmptyDesc').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {['🎨 Color grading', '🔊 Audio', '🌀 Grain', '✂️ Crop', '📦 Encoding', '🔐 Unique hash'].map(pill => (
                  <span key={pill} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: 'rgba(34,211,238,0.05)', color: 'rgba(34,211,238,0.6)', border: '1px solid rgba(34,211,238,0.1)' }}>{pill}</span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {jobsBySource.map(({ src, jobs: srcJobs }, si) => (
                srcJobs.length > 0 && (
                  <div key={si}>
                    {sources.length > 1 && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(148,163,184,0.5)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10 }}>🎬</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</span>
                        <span style={{ fontSize: 10, color: 'rgba(34,211,238,0.4)', flexShrink: 0 }}>
                          {srcJobs.filter(j => j.status === 'done').length}/{srcJobs.length}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
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
    </div>
  )
}
