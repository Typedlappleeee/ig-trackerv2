// Mixer / Outil « Incrustation photo-vidéo ».
// Simple & visuel : mets une vidéo, choisis une photo (ou vidéo), place-la en la
// glissant sur l'aperçu, et définis QUAND elle apparaît en glissant une zone sur
// la TIMELINE (pas de saisie de secondes). L'aperçu montre l'incrustation en direct.
import { useState, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { BankPicker } from '@/pages/Bank'
import { BankFolderSelect } from '@/components/BankFolderSelect'
import { useTr } from '@/lib/i18n'

type Pick = { url: string; title: string }
type OverlayPick = Pick & { type: 'image' | 'video' }

function isVideoName(s: string): boolean { return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(s) }
function fmt(t: number): string { const m = Math.floor(t / 60); const s = t % 60; return `${m}:${s.toFixed(1).padStart(4, '0')}` }

export function OverlayComposer({ user, onExit }: { user: User; onExit: () => void }) {
  const tr = useTr()
  const { currentOrg } = useOrg()

  const [base, setBase] = useState<Pick | null>(null)
  const [overlay, setOverlay] = useState<OverlayPick | null>(null)
  const [pick, setPick] = useState<null | 'base' | 'overlay'>(null)

  // Position/taille en fractions de la vidéo (0..1).
  const [x, setX] = useState(0.35)
  const [y, setY] = useState(0.4)
  const [w, setW] = useState(0.3)
  // Fenêtre temporelle (secondes) où l'overlay est visible.
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(2)
  const [dur, setDur] = useState(0)          // durée totale de la vidéo
  const [t, setT] = useState(0)              // temps de lecture courant

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ url: string; storagePath?: string } | null>(null)
  const [error, setError] = useState('')
  const [saveFolder, setSaveFolder] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)   // conteneur d'aperçu
  const videoRef = useRef<HTMLVideoElement>(null)
  const tlRef = useRef<HTMLDivElement>(null)      // barre timeline
  const drag = useRef<{ k: string; px: number; s0: number; e0: number; x: number; y: number; w: number } | null>(null)

  const visible = t >= start && t <= end   // overlay affiché à cet instant ?

  // ── Drag position/taille sur l'aperçu ──────────────────────────────────────
  const onStagePointerDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const st = { k: mode, px: e.clientX, py: e.clientY, x, y, w, s0: 0, e0: 0 } as { k: string; px: number; py: number; x: number; y: number; w: number; s0: number; e0: number }
    const onMove = (ev: PointerEvent) => {
      const c = stageRef.current; if (!c) return
      const r = c.getBoundingClientRect()
      const dx = (ev.clientX - st.px) / r.width
      const dy = (ev.clientY - st.py) / r.height
      if (mode === 'move') { setX(Math.min(Math.max(st.x + dx, 0), 1 - w)); setY(Math.min(Math.max(st.y + dy, 0), 1)) }
      else setW(Math.min(Math.max(st.w + dx, 0.05), 1 - x))
    }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  // ── Timeline : glisser la zone (déplacer / redimensionner) + scrub ─────────
  const timeAt = (clientX: number): number => {
    const bar = tlRef.current; if (!bar || dur <= 0) return 0
    const r = bar.getBoundingClientRect()
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * dur
  }
  const onTlPointerDown = (k: 'move' | 'left' | 'right' | 'seek') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (k === 'seek') { const nt = timeAt(e.clientX); if (videoRef.current) videoRef.current.currentTime = nt; setT(nt); return }
    drag.current = { k, px: e.clientX, s0: start, e0: end, x, y, w }
    const onMove = (ev: PointerEvent) => {
      const d = drag.current; const bar = tlRef.current; if (!d || !bar || dur <= 0) return
      const r = bar.getBoundingClientRect()
      const dt = ((ev.clientX - d.px) / r.width) * dur
      if (d.k === 'move') { let ns = d.s0 + dt, ne = d.e0 + dt; const len = d.e0 - d.s0; if (ns < 0) { ns = 0; ne = len } if (ne > dur) { ne = dur; ns = dur - len } setStart(ns); setEnd(ne) }
      else if (d.k === 'left') setStart(Math.min(Math.max(d.s0 + dt, 0), end - 0.2))
      else setEnd(Math.min(Math.max(d.e0 + dt, start + 0.2), dur))
    }
    const onUp = () => { drag.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  const generate = useCallback(async () => {
    if (!base || !overlay || running) return
    setRunning(true); setError(''); setResult(null); setSaved(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/mix-overlay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'media', videoUrl: base.url, overlayUrl: overlay.url, overlayType: overlay.type,
          userId: user.id, x, y, w, start, duration: Math.max(end - start, 0.2),
          supabaseToken: session?.access_token, supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        }),
      })
      const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
      if (!data.ok) throw new Error(data.error || tr('Échec du rendu', 'Render failed'))
      setResult({ url: data.url, storagePath: data.storagePath })
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) } finally { setRunning(false) }
  }, [base, overlay, running, x, y, w, start, end, user.id, tr])

  const saveToBank = async () => {
    if (!result?.storagePath || saved) return
    const { error: err } = await supabase.from('content_bank').insert({
      user_id: user.id, org_id: currentOrg?.id ?? null, title: `Overlay — ${base?.title ?? 'vidéo'}`,
      file_url: null, storage_path: result.storagePath, thumbnail_path: null, folder: saveFolder, tags: ['overlay'], notes: '',
    })
    if (!err) setSaved(true)
  }

  const pct = (v: number) => dur > 0 ? `${(v / dur) * 100}%` : '0%'

  return (
    <div className="anim-page sf-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {pick && (
        <BankPicker user={user} mode="multi" resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const url = paths[0]; const title = titles?.[0] ?? 'média'
            if (!url) { setPick(null); return }
            if (pick === 'base') { setBase({ url, title }); setResult(null) }
            else setOverlay({ url, title, type: isVideoName(url) || isVideoName(title) ? 'video' : 'image' })
            setPick(null)
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
        <button onClick={onExit} className="sf-btn sf-btn-secondary cursor-pointer" style={{ flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
          {tr('Retour', 'Back')}
        </button>
      </header>

      <div className="sf-page-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 28, alignItems: 'start' }}>
        {/* Aperçu + timeline */}
        <div>
          <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Aperçu — glisse la photo pour la placer', 'Preview — drag the photo to place it')}</div>
          <div ref={stageRef} style={{ position: 'relative', width: '100%', aspectRatio: '9/16', maxHeight: '58vh', margin: '0 auto', borderRadius: 14, overflow: 'hidden', background: '#0b0b12', border: '1px solid var(--border)' }}>
            {base
              ? <video ref={videoRef} src={base.url} muted loop autoPlay playsInline
                  onLoadedMetadata={e => { const d = e.currentTarget.duration || 0; setDur(d); setEnd(Math.min(2, d || 2)); setStart(0) }}
                  onTimeUpdate={e => setT(e.currentTarget.currentTime)}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-4)', fontSize: 12 }}>{tr('Choisis une vidéo', 'Pick a video')}</div>}
            {base && overlay && (
              <div onPointerDown={onStagePointerDown('move')}
                style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, cursor: 'move', touchAction: 'none',
                  opacity: visible ? 1 : 0.28, outline: '2px solid #A5B4FC', borderRadius: 4, transition: 'opacity .12s' }}>
                {overlay.type === 'video'
                  ? <video src={overlay.url} muted loop autoPlay playsInline style={{ display: 'block', width: '100%' }} />
                  : <img src={overlay.url} alt="" style={{ display: 'block', width: '100%' }} />}
                <div onPointerDown={onStagePointerDown('resize')} style={{ position: 'absolute', right: -7, bottom: -7, width: 16, height: 16, borderRadius: '50%', background: '#818CF8', border: '2px solid #fff', cursor: 'nwse-resize', touchAction: 'none' }} />
              </div>
            )}
          </div>

          {/* Timeline */}
          {base && dur > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-4)', marginBottom: 5, fontVariantNumeric: 'tabular-nums' }}>
                <span>{tr('Quand la photo apparaît', 'When it appears')}</span>
                <span>{fmt(start)} → {fmt(end)} · {(end - start).toFixed(1)}s</span>
              </div>
              <div ref={tlRef} onPointerDown={onTlPointerDown('seek')}
                style={{ position: 'relative', height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', cursor: 'pointer', overflow: 'hidden', touchAction: 'none' }}>
                {/* zone visible de l'overlay */}
                <div onPointerDown={onTlPointerDown('move')}
                  style={{ position: 'absolute', top: 0, bottom: 0, left: pct(start), width: dur > 0 ? `${((end - start) / dur) * 100}%` : '0%', background: 'linear-gradient(90deg, rgba(99,102,241,0.5), rgba(139,92,246,0.5))', cursor: 'grab', touchAction: 'none' }}>
                  <div onPointerDown={onTlPointerDown('left')} style={{ position: 'absolute', left: -1, top: 0, bottom: 0, width: 10, cursor: 'ew-resize', background: '#818CF8', borderRadius: '9px 0 0 9px' }} />
                  <div onPointerDown={onTlPointerDown('right')} style={{ position: 'absolute', right: -1, top: 0, bottom: 0, width: 10, cursor: 'ew-resize', background: '#818CF8', borderRadius: '0 9px 9px 0' }} />
                </div>
                {/* tête de lecture */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: pct(t), width: 2, background: '#fff', boxShadow: '0 0 6px #fff', pointerEvents: 'none' }} />
              </div>
              <p style={{ margin: '6px 2px 0', fontSize: 10.5, color: 'var(--text-4)' }}>{tr('Glisse la zone violette pour choisir le moment · clique ailleurs pour te déplacer dans la vidéo', 'Drag the purple range to set the moment · click elsewhere to scrub the video')}</p>
            </div>
          )}
        </div>

        {/* Contrôles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Vidéo', 'Video')}</div>
              <button onClick={() => setPick('base')} className="sf-btn sf-btn-secondary cursor-pointer" style={{ width: '100%', justifyContent: 'center' }}>
                {base ? `🎬 ${base.title.slice(0, 22)}` : tr('Choisir', 'Choose')}
              </button>
            </div>
            <div>
              <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Photo / vidéo à incruster', 'Photo / video to overlay')}</div>
              <button onClick={() => setPick('overlay')} className="sf-btn sf-btn-secondary cursor-pointer" style={{ width: '100%', justifyContent: 'center' }}>
                {overlay ? `${overlay.type === 'video' ? '🎞' : '🖼'} ${overlay.title.slice(0, 22)}` : tr('Choisir', 'Choose')}
              </button>
            </div>
          </div>

          <div>
            <div className="sf-section-label" style={{ marginBottom: 6 }}>{tr('Taille', 'Size')} · {Math.round(w * 100)}%</div>
            <input type="range" min={5} max={100} value={Math.round(w * 100)} onChange={e => setW(Math.min(Number(e.target.value) / 100, 1 - x))} style={{ width: '100%', accentColor: '#818CF8' }} />
          </div>

          <BankFolderSelect value={saveFolder} onChange={setSaveFolder} userId={user.id} orgId={currentOrg?.id} label={tr('Dossier de destination', 'Destination folder')} />

          <button onClick={generate} disabled={!base || !overlay || running} className="sf-btn sf-btn-primary sf-btn-lg cursor-pointer" style={{ justifyContent: 'center', opacity: (!base || !overlay || running) ? 0.6 : 1 }}
            title={!base ? tr('Choisis une vidéo', 'Pick a video') : !overlay ? tr('Choisis une photo/vidéo à incruster', 'Pick an overlay') : ''}>
            {running ? tr('Génération…', 'Rendering…') : tr('Générer la vidéo', 'Generate video')}
          </button>

          {error && <div className="sf-banner is-danger" style={{ fontSize: 12.5 }}>{error}</div>}

          {result && (
            <div className="sf-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <video src={result.url} controls playsInline style={{ width: '100%', maxHeight: 300, borderRadius: 10, background: '#000' }} />
              <button onClick={saveToBank} disabled={saved} className="sf-btn sf-btn-secondary cursor-pointer" style={{ justifyContent: 'center' }}>
                {saved ? tr('✓ Enregistré dans la banque', '✓ Saved to bank') : tr('Enregistrer dans la banque', 'Save to bank')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OverlayComposer
