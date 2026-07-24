// Mixer — mode « Image/Vidéo positionnée ».
// Choisis une vidéo de base + un média (image/vidéo) à incruster, place-le
// PRÉCISÉMENT en glissant sur l'aperçu + règle sa taille, et définis QUAND il
// apparaît (seconde de début) et PENDANT combien de temps. Rendu serveur ffmpeg.
import { useState, useRef, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { BankPicker } from '@/pages/Bank'
import { BankFolderSelect } from '@/components/BankFolderSelect'
import { useTr } from '@/lib/i18n'

type Pick = { url: string; title: string }
type OverlayPick = Pick & { type: 'image' | 'video' }

function isVideoName(s: string): boolean {
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(s)
}

export function OverlayComposer({ user, onMode }: { user: User; onMode: (m: 'caption' | 'overlay') => void }) {
  const tr = useTr()
  const { currentOrg } = useOrg()

  const [base, setBase] = useState<Pick | null>(null)
  const [overlay, setOverlay] = useState<OverlayPick | null>(null)
  const [pick, setPick] = useState<null | 'base' | 'overlay'>(null)

  // Position/taille de l'overlay en FRACTIONS de la vidéo (0..1).
  const [x, setX] = useState(0.1)
  const [y, setY] = useState(0.1)
  const [w, setW] = useState(0.3)
  const [start, setStart] = useState(0)
  const [duration, setDuration] = useState(3)

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ url: string; storagePath?: string } | null>(null)
  const [error, setError] = useState('')
  const [saveFolder, setSaveFolder] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const boxRef = useRef<HTMLDivElement>(null)   // conteneur d'aperçu (9:16)
  const drag = useRef<{ mode: 'move' | 'resize'; px: number; py: number; x: number; y: number; w: number } | null>(null)

  const onPointerDown = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    drag.current = { mode, px: e.clientX, py: e.clientY, x, y, w }
    const onMove = (ev: PointerEvent) => {
      const d = drag.current; const cont = boxRef.current
      if (!d || !cont) return
      const r = cont.getBoundingClientRect()
      const dx = (ev.clientX - d.px) / r.width
      const dy = (ev.clientY - d.py) / r.height
      if (d.mode === 'move') {
        setX(Math.min(Math.max(d.x + dx, 0), 1 - w))
        setY(Math.min(Math.max(d.y + dy, 0), 1))
      } else {
        setW(Math.min(Math.max(d.w + dx, 0.05), 1 - x))
      }
    }
    const onUp = () => { drag.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const generate = useCallback(async () => {
    if (!base || !overlay || running) return
    setRunning(true); setError(''); setResult(null); setSaved(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/mix-overlay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'media',
          videoUrl: base.url,
          overlayUrl: overlay.url,
          overlayType: overlay.type,
          userId: user.id,
          x, y, w, start, duration,
          supabaseToken: session?.access_token,
          supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        }),
      })
      const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
      if (!data.ok) throw new Error(data.error || tr('Échec du rendu', 'Render failed'))
      setResult({ url: data.url, storagePath: data.storagePath })
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setRunning(false)
    }
  }, [base, overlay, running, x, y, w, start, duration, user.id, tr])

  const saveToBank = async () => {
    if (!result?.storagePath || saved) return
    const { error: err } = await supabase.from('content_bank').insert({
      user_id: user.id, org_id: currentOrg?.id ?? null,
      title: `Overlay — ${base?.title ?? 'vidéo'}`,
      file_url: null, storage_path: result.storagePath, thumbnail_path: null,
      folder: saveFolder, tags: ['overlay'], notes: '',
    })
    if (!err) setSaved(true)
  }

  return (
    <div className="anim-page sf-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {pick && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(paths, titles) => {
            const url = paths[0]; const title = titles?.[0] ?? 'média'
            if (!url) { setPick(null); return }
            if (pick === 'base') setBase({ url, title })
            else setOverlay({ url, title, type: isVideoName(url) || isVideoName(title) ? 'video' : 'image' })
            setPick(null)
          }}
          onClose={() => setPick(null)}
        />
      )}

      {/* Header + switch de mode */}
      <header className="sf-page-header" style={{ background: 'rgba(7,7,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" style={{ ['--icon-grad' as string]: 'linear-gradient(135deg,#818CF8,#8B5CF6 55%,#6366F1)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="8" y="8" width="8" height="6" rx="1"/></svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="sf-page-title sf-title-grad" style={{ fontSize: 22, fontWeight: 800 }}>Mixer</h1>
            <p className="sf-page-sub">{tr('Incruste une image/vidéo — position + timing précis', 'Overlay an image/video — precise position + timing')}</p>
          </div>
        </div>
        <div className="sf-segment" style={{ flexShrink: 0 }}>
          <button className="sf-segment-item cursor-pointer" onClick={() => onMode('caption')}>{tr('Texte', 'Text')}</button>
          <button className="sf-segment-item is-active cursor-pointer">{tr('Image/Vidéo', 'Image/Video')}</button>
        </div>
      </header>

      <div className="sf-page-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 320px) 1fr', gap: 24, alignItems: 'start' }}>
        {/* Aperçu avec overlay déplaçable */}
        <div>
          <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Aperçu — glisse pour placer', 'Preview — drag to place')}</div>
          <div ref={boxRef} style={{ position: 'relative', width: '100%', aspectRatio: '9/16', borderRadius: 14, overflow: 'hidden', background: '#0b0b12', border: '1px solid var(--border)' }}>
            {base
              ? <video src={base.url} muted loop autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-4)', fontSize: 12 }}>{tr('Choisis une vidéo de base', 'Pick a base video')}</div>}
            {base && overlay && (
              <div
                onPointerDown={onPointerDown('move')}
                style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, cursor: 'move', touchAction: 'none', border: '2px solid #A5B4FC', borderRadius: 6, boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }}
              >
                {overlay.type === 'video'
                  ? <video src={overlay.url} muted loop autoPlay playsInline style={{ display: 'block', width: '100%' }} />
                  : <img src={overlay.url} alt="" style={{ display: 'block', width: '100%' }} />}
                {/* poignée de redimensionnement */}
                <div onPointerDown={onPointerDown('resize')} style={{ position: 'absolute', right: -7, bottom: -7, width: 16, height: 16, borderRadius: '50%', background: '#818CF8', border: '2px solid #fff', cursor: 'nwse-resize', touchAction: 'none' }} />
              </div>
            )}
          </div>
        </div>

        {/* Contrôles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 460 }}>
          <div>
            <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Vidéo de base', 'Base video')}</div>
            <button onClick={() => setPick('base')} className="sf-btn sf-btn-secondary cursor-pointer" style={{ width: '100%', justifyContent: 'center' }}>
              {base ? `🎬 ${base.title.slice(0, 30)}` : tr('Choisir la vidéo', 'Choose video')}
            </button>
          </div>
          <div>
            <div className="sf-section-label" style={{ marginBottom: 8 }}>{tr('Média à incruster (image ou vidéo)', 'Overlay media (image or video)')}</div>
            <button onClick={() => setPick('overlay')} className="sf-btn sf-btn-secondary cursor-pointer" style={{ width: '100%', justifyContent: 'center' }}>
              {overlay ? `${overlay.type === 'video' ? '🎞' : '🖼'} ${overlay.title.slice(0, 30)}` : tr("Choisir l'overlay", 'Choose overlay')}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <div className="sf-section-label" style={{ marginBottom: 6 }}>{tr('Apparaît à (s)', 'Appears at (s)')}</div>
              <input type="number" min={0} step={0.5} value={start} onChange={e => setStart(Math.max(0, Number(e.target.value) || 0))} className="sf-input" style={{ width: '100%' }} />
            </label>
            <label>
              <div className="sf-section-label" style={{ marginBottom: 6 }}>{tr('Pendant (s)', 'For (s)')}</div>
              <input type="number" min={0.2} step={0.5} value={duration} onChange={e => setDuration(Math.max(0.2, Number(e.target.value) || 0.2))} className="sf-input" style={{ width: '100%' }} />
            </label>
          </div>

          <div>
            <div className="sf-section-label" style={{ marginBottom: 6 }}>{tr('Taille de l\'overlay', 'Overlay size')} · {Math.round(w * 100)}%</div>
            <input type="range" min={5} max={100} value={Math.round(w * 100)} onChange={e => setW(Math.min(Number(e.target.value) / 100, 1 - x))} style={{ width: '100%', accentColor: '#818CF8' }} />
          </div>

          <BankFolderSelect value={saveFolder} onChange={setSaveFolder} userId={user.id} orgId={currentOrg?.id} label={tr('Dossier de destination', 'Destination folder')} />

          <button onClick={generate} disabled={!base || !overlay || running} className="sf-btn sf-btn-primary cursor-pointer" style={{ justifyContent: 'center', opacity: (!base || !overlay || running) ? 0.6 : 1 }}
            title={!base ? tr('Choisis une vidéo de base', 'Pick a base video') : !overlay ? tr('Choisis un média à incruster', 'Pick an overlay media') : ''}>
            {running ? tr('Rendu en cours…', 'Rendering…') : tr('Générer la vidéo', 'Generate video')}
          </button>

          {error && <div className="sf-banner is-danger" style={{ fontSize: 12.5 }}>{error}</div>}

          {result && (
            <div className="sf-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <video src={result.url} controls playsInline style={{ width: '100%', maxHeight: 320, borderRadius: 10, background: '#000' }} />
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
