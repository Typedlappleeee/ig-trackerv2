// Outil « Incrustation photo/vidéo » — simple OU en masse.
// Simple : 1 vidéo + 1 photo, placée où tu veux, quand tu veux (timeline).
// Masse : pool de vidéos × pool de photos → applique le même placement/timing à
// toutes (position/taille en fractions → s'adapte à chaque vidéo). Durées ultra
// courtes possibles (0.1s et moins) via des durées rapides.
import { useState, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { BankPicker } from '@/pages/Bank'
import { BankFolderSelect } from '@/components/BankFolderSelect'
import { useTr } from '@/lib/i18n'

type Vid = { url: string; title: string }
type Photo = Vid & { type: 'image' | 'video' }
type Job = { id: string; vTitle: string; pTitle: string; status: 'pending' | 'processing' | 'done' | 'error'; url?: string; error?: string }

function isVideoName(s: string): boolean { return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(s) }
function fmt(t: number): string { const m = Math.floor(t / 60); const s = t % 60; return `${m}:${s.toFixed(1).padStart(4, '0')}` }
const MIN_WIN = 0.05
const DUR_PRESETS = [0.1, 0.2, 0.3, 0.5, 1, 2]

export function OverlayComposer({ user, onExit }: { user: User; onExit: () => void }) {
  const tr = useTr()
  const { currentOrg } = useOrg()

  const [mass, setMass] = useState(false)
  const [videos, setVideos] = useState<Vid[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [pick, setPick] = useState<null | 'base' | 'overlay'>(null)
  const [distribution, setDistribution] = useState<'random' | 'all'>('random')

  const [x, setX] = useState(0.35)
  const [y, setY] = useState(0.4)
  const [w, setW] = useState(0.3)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(1)
  const [dur, setDur] = useState(0)
  const [t, setT] = useState(0)

  const [running, setRunning] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState('')
  const [saveFolder, setSaveFolder] = useState<string | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const tlRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ k: string; px: number; s0: number; e0: number } | null>(null)

  const refV = videos[0] ?? null
  const refP = photos[0] ?? null
  const visible = t >= start && t <= end
  const setDuration = (d: number) => setEnd(Math.min(start + d, dur || start + d))

  // ── Placement sur l'aperçu ─────────────────────────────────────────────────
  const onStageDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const px = e.clientX, py = e.clientY, x0 = x, y0 = y, w0 = w
    const onMove = (ev: PointerEvent) => {
      const c = stageRef.current; if (!c) return
      const r = c.getBoundingClientRect()
      const dx = (ev.clientX - px) / r.width, dy = (ev.clientY - py) / r.height
      if (mode === 'move') { setX(Math.min(Math.max(x0 + dx, 0), 1 - w)); setY(Math.min(Math.max(y0 + dy, 0), 1)) }
      else setW(Math.min(Math.max(w0 + dx, 0.05), 1 - x))
    }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  // ── Timeline ───────────────────────────────────────────────────────────────
  const timeAt = (cx: number) => { const b = tlRef.current; if (!b || dur <= 0) return 0; const r = b.getBoundingClientRect(); return Math.min(Math.max((cx - r.left) / r.width, 0), 1) * dur }
  const onTlDown = (k: 'move' | 'left' | 'right' | 'seek') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (k === 'seek') { const nt = timeAt(e.clientX); if (videoRef.current) videoRef.current.currentTime = nt; setT(nt); return }
    drag.current = { k, px: e.clientX, s0: start, e0: end }
    const onMove = (ev: PointerEvent) => {
      const d = drag.current; const b = tlRef.current; if (!d || !b || dur <= 0) return
      const r = b.getBoundingClientRect(); const dt = ((ev.clientX - d.px) / r.width) * dur
      if (d.k === 'move') { let ns = d.s0 + dt, ne = d.e0 + dt; const len = d.e0 - d.s0; if (ns < 0) { ns = 0; ne = len } if (ne > dur) { ne = dur; ns = dur - len } setStart(ns); setEnd(ne) }
      else if (d.k === 'left') setStart(Math.min(Math.max(d.s0 + dt, 0), end - MIN_WIN))
      else setEnd(Math.min(Math.max(d.e0 + dt, start + MIN_WIN), dur))
    }
    const onUp = () => { drag.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  // ── Génération (simple ou masse) ────────────────────────────────────────────
  const renderOne = async (v: Vid, p: Photo, token?: string): Promise<{ ok: boolean; url?: string; storagePath?: string; error?: string }> => {
    const res = await fetch('/api/mix-overlay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'media', videoUrl: v.url, overlayUrl: p.url, overlayType: p.type,
        userId: user.id, x, y, w, start, duration: Math.max(end - start, MIN_WIN),
        supabaseToken: token, supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      }),
    })
    return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
  }

  const generate = useCallback(async () => {
    if (!videos.length || !photos.length || running) return
    setRunning(true); setError('')
    const pairs: { v: Vid; p: Photo }[] = !mass
      ? [{ v: videos[0], p: photos[0] }]
      : distribution === 'all'
        ? videos.flatMap(v => photos.map(p => ({ v, p })))
        : videos.map((v, i) => ({ v, p: photos[i % photos.length] }))
    const initial: Job[] = pairs.map((pr, i) => ({ id: `${i}`, vTitle: pr.v.title, pTitle: pr.p.title, status: 'pending' }))
    setJobs(initial)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    let cursor = 0
    const worker = async () => {
      while (cursor < pairs.length) {
        const i = cursor++; const pr = pairs[i]
        setJobs(prev => prev.map(j => j.id === `${i}` ? { ...j, status: 'processing' } : j))
        try {
          const r = await renderOne(pr.v, pr.p, token)
          if (!r.ok || !r.url) throw new Error(r.error || 'échec')
          // auto-enregistrement en banque
          if (r.storagePath) {
            await supabase.from('content_bank').insert({
              user_id: user.id, org_id: currentOrg?.id ?? null, title: `Overlay — ${pr.v.title}`,
              file_url: null, storage_path: r.storagePath, thumbnail_path: null, folder: saveFolder, tags: ['overlay'], notes: '',
            })
          }
          setJobs(prev => prev.map(j => j.id === `${i}` ? { ...j, status: 'done', url: r.url } : j))
        } catch (e) {
          setJobs(prev => prev.map(j => j.id === `${i}` ? { ...j, status: 'error', error: String(e instanceof Error ? e.message : e) } : j))
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, pairs.length) }, worker))
    setRunning(false)
  }, [videos, photos, mass, distribution, running, x, y, w, start, end, user.id, currentOrg?.id, saveFolder])

  const pct = (v: number) => dur > 0 ? `${(v / dur) * 100}%` : '0%'
  const doneCount = jobs.filter(j => j.status === 'done').length
  const canGen = videos.length > 0 && photos.length > 0 && !running

  return (
    <div className="anim-page sf-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {pick && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const picks = paths.map((url, i) => ({ url, title: titles?.[i] ?? 'média' }))
            if (pick === 'base') {
              const vids = picks.map(p => ({ url: p.url, title: p.title }))
              setVideos(prev => mass ? dedupe([...prev, ...vids]) : vids.slice(0, 1))
            } else {
              const phs: Photo[] = picks.map(p => ({ url: p.url, title: p.title, type: isVideoName(p.url) || isVideoName(p.title) ? 'video' : 'image' }))
              setPhotos(prev => mass ? dedupe([...prev, ...phs]) : phs.slice(0, 1))
            }
            setJobs([]); setPick(null)
          }}
          onClose={() => setPick(null)} />
      )}

      <header className="sf-page-header" style={{ background: 'rgba(7,7,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" style={{ ['--icon-grad' as string]: 'linear-gradient(135deg,#818CF8,#8B5CF6 55%,#6366F1)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="8" y="8" width="8" height="6" rx="1"/></svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="sf-page-title sf-title-grad" style={{ fontSize: 22, fontWeight: 800 }}>{tr('Incrustation', 'Overlay')}</h1>
            <p className="sf-page-sub">{tr('Photo/vidéo placée où tu veux, quand tu veux', 'Photo/video placed where and when you want')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="sf-segment">
            <button className={`sf-segment-item cursor-pointer${!mass ? ' is-active' : ''}`} onClick={() => { setMass(false); setJobs([]) }}>{tr('Simple', 'Single')}</button>
            <button className={`sf-segment-item cursor-pointer${mass ? ' is-active' : ''}`} onClick={() => { setMass(true); setJobs([]) }}>{tr('En masse', 'Bulk')}</button>
          </div>
          <button onClick={onExit} className="sf-btn sf-btn-secondary cursor-pointer" style={{ flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
            {tr('Retour', 'Back')}
          </button>
        </div>
      </header>

      <div className="sf-page-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 28, alignItems: 'start' }}>
        {/* Aperçu (vidéo de référence) + timeline */}
        <div>
          <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Aperçu — glisse la photo pour la placer', 'Preview — drag the photo to place it')}</div>
          <div ref={stageRef} style={{ position: 'relative', width: '100%', aspectRatio: '9/16', maxHeight: '54vh', margin: '0 auto', borderRadius: 14, overflow: 'hidden', background: '#0b0b12', border: '1px solid var(--border)' }}>
            {refV
              ? <video ref={videoRef} src={refV.url} muted loop autoPlay playsInline
                  onLoadedMetadata={e => { const d = e.currentTarget.duration || 0; setDur(d); setEnd(Math.min(1, d || 1)); setStart(0) }}
                  onTimeUpdate={e => setT(e.currentTarget.currentTime)}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-4)', fontSize: 12 }}>{tr('Choisis une vidéo', 'Pick a video')}</div>}
            {refV && refP && (
              <div onPointerDown={onStageDown('move')} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, cursor: 'move', touchAction: 'none', opacity: visible ? 1 : 0.28, outline: '2px solid #A5B4FC', borderRadius: 4, transition: 'opacity .12s' }}>
                {refP.type === 'video' ? <video src={refP.url} muted loop autoPlay playsInline style={{ display: 'block', width: '100%' }} /> : <img src={refP.url} alt="" style={{ display: 'block', width: '100%' }} />}
                <div onPointerDown={onStageDown('resize')} style={{ position: 'absolute', right: -7, bottom: -7, width: 16, height: 16, borderRadius: '50%', background: '#818CF8', border: '2px solid #fff', cursor: 'nwse-resize', touchAction: 'none' }} />
              </div>
            )}
          </div>

          {refV && dur > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-4)', marginBottom: 5, fontVariantNumeric: 'tabular-nums' }}>
                <span>{tr('Quand elle apparaît', 'When it appears')}</span>
                <span>{fmt(start)} → {fmt(end)} · {(end - start).toFixed(2)}s</span>
              </div>
              <div ref={tlRef} onPointerDown={onTlDown('seek')} style={{ position: 'relative', height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', cursor: 'pointer', overflow: 'hidden', touchAction: 'none' }}>
                <div onPointerDown={onTlDown('move')} style={{ position: 'absolute', top: 0, bottom: 0, left: pct(start), width: dur > 0 ? `${Math.max(((end - start) / dur) * 100, 1.5)}%` : '0%', background: 'linear-gradient(90deg, rgba(99,102,241,0.5), rgba(139,92,246,0.5))', cursor: 'grab', touchAction: 'none' }}>
                  <div onPointerDown={onTlDown('left')} style={{ position: 'absolute', left: -1, top: 0, bottom: 0, width: 10, cursor: 'ew-resize', background: '#818CF8', borderRadius: '9px 0 0 9px' }} />
                  <div onPointerDown={onTlDown('right')} style={{ position: 'absolute', right: -1, top: 0, bottom: 0, width: 10, cursor: 'ew-resize', background: '#818CF8', borderRadius: '0 9px 9px 0' }} />
                </div>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: pct(t), width: 2, background: '#fff', boxShadow: '0 0 6px #fff', pointerEvents: 'none' }} />
              </div>
              {/* Durées rapides (dont ultra-courtes) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{tr('Durée :', 'Duration:')}</span>
                {DUR_PRESETS.map(d => (
                  <button key={d} onClick={() => setDuration(d)} className={`sf-btn sf-btn-sm cursor-pointer ${Math.abs((end - start) - d) < 0.01 ? 'sf-btn-primary' : 'sf-btn-secondary'}`} style={{ padding: '0 10px' }}>{d}s</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Contrôles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>{mass ? tr('Vidéos (pool)', 'Videos (pool)') : tr('Vidéo', 'Video')}</div>
              <button onClick={() => setPick('base')} className="sf-btn sf-btn-secondary cursor-pointer" style={{ width: '100%', justifyContent: 'center' }}>
                {videos.length ? (mass ? tr(`${videos.length} vidéo(s) · Ajouter`, `${videos.length} video(s) · Add`) : `🎬 ${videos[0].title.slice(0, 20)}`) : tr('Choisir', 'Choose')}
              </button>
            </div>
            <div>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>{mass ? tr('Photos (pool)', 'Photos (pool)') : tr('Photo / vidéo', 'Photo / video')}</div>
              <button onClick={() => setPick('overlay')} className="sf-btn sf-btn-secondary cursor-pointer" style={{ width: '100%', justifyContent: 'center' }}>
                {photos.length ? (mass ? tr(`${photos.length} photo(s) · Ajouter`, `${photos.length} photo(s) · Add`) : `${photos[0].type === 'video' ? '🎞' : '🖼'} ${photos[0].title.slice(0, 20)}`) : tr('Choisir', 'Choose')}
              </button>
            </div>
          </div>

          {mass && (
            <div>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Répartition', 'Distribution')}</div>
              <div className="sf-segment">
                <button className={`sf-segment-item cursor-pointer${distribution === 'random' ? ' is-active' : ''}`} onClick={() => setDistribution('random')}>{tr('1 photo par vidéo (rotation)', '1 photo per video (rotate)')}</button>
                <button className={`sf-segment-item cursor-pointer${distribution === 'all' ? ' is-active' : ''}`} onClick={() => setDistribution('all')}>{tr('Toutes les combinaisons', 'All combinations')}</button>
              </div>
              <p style={{ margin: '6px 2px 0', fontSize: 11, color: 'var(--text-4)' }}>
                {distribution === 'all'
                  ? tr(`→ ${videos.length * photos.length} vidéo(s) générée(s)`, `→ ${videos.length * photos.length} video(s) generated`)
                  : tr(`→ ${videos.length} vidéo(s) générée(s)`, `→ ${videos.length} video(s) generated`)}
              </p>
            </div>
          )}

          <div>
            <div className="sf-section-label" style={{ marginBottom: 6 }}>{tr('Taille', 'Size')} · {Math.round(w * 100)}%</div>
            <input type="range" min={5} max={100} value={Math.round(w * 100)} onChange={e => setW(Math.min(Number(e.target.value) / 100, 1 - x))} style={{ width: '100%', accentColor: '#818CF8' }} />
          </div>

          <BankFolderSelect value={saveFolder} onChange={setSaveFolder} userId={user.id} orgId={currentOrg?.id} label={tr('Dossier de destination', 'Destination folder')} />

          <button onClick={generate} disabled={!canGen} className="sf-btn sf-btn-primary sf-btn-lg cursor-pointer" style={{ justifyContent: 'center', opacity: canGen ? 1 : 0.6 }}
            title={!videos.length ? tr('Choisis une vidéo', 'Pick a video') : !photos.length ? tr('Choisis une photo', 'Pick a photo') : ''}>
            {running ? tr(`Génération… ${doneCount}/${jobs.length}`, `Rendering… ${doneCount}/${jobs.length}`) : mass ? tr('Générer en masse', 'Generate all') : tr('Générer la vidéo', 'Generate video')}
          </button>

          {error && <div className="sf-banner is-danger" style={{ fontSize: 12.5 }}>{error}</div>}

          {/* Résultats / progression */}
          {jobs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jobs.map(j => (
                <div key={j.id} className="sf-card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: j.status === 'done' ? 'var(--ok)' : j.status === 'error' ? 'var(--danger)' : j.status === 'processing' ? '#818CF8' : 'var(--text-4)' }} />
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.vTitle} · {j.pTitle}</span>
                  {j.status === 'done' && j.url && <a href={j.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--accent-l)', fontWeight: 700 }}>{tr('Voir', 'View')} ↗</a>}
                  {j.status === 'error' && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{tr('échec', 'failed')}</span>}
                  {j.status === 'processing' && <span style={{ fontSize: 11, color: '#818CF8' }}>…</span>}
                </div>
              ))}
              {!running && doneCount > 0 && <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 2px 0' }}>{tr(`✓ ${doneCount} enregistrée(s) dans la banque`, `✓ ${doneCount} saved to bank`)}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function dedupe<T extends { url: string }>(arr: T[]): T[] {
  const seen = new Set<string>()
  return arr.filter(a => (seen.has(a.url) ? false : (seen.add(a.url), true)))
}

export default OverlayComposer
