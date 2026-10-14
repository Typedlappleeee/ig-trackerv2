// Aperçu en direct du Studio : la source choisie avec, par-dessus, ce que l'outil va produire.
//   • Texte sur vidéo : MÊME PNG que la sortie (textToPng), déplaçable à la souris.
//   • Incrustation : photo déplaçable + poignée de redimensionnement (taille en % de la largeur).
//   • Montage (couper) : zone gardée sur la timeline + lecture de l'extrait.
//   • Sous-titres : exemple de rendu à 75 % de hauteur.
//   • Remix / Spoof : 3 variantes simulées en CSS (approximatif) à partir de remixParams.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { textToPng, type CaptionStyle } from '@/lib/studioTools'
import { remixParams, type RemixIntensity, type RemixToggles } from '@/lib/studioFilters'
import { Icon } from '@/lib/ui'

export type StudioToolId = 'remix' | 'spoof' | 'imgspoof' | 'subs' | 'overlay' | 'montage' | 'mixer'
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}${s < 60 ? `.${Math.floor((s % 1) * 10)}` : ''}`
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function Preview({ src, kind, tool, caption, onCaptionMove, overlay, onOverlayChange, trim, onTrim, onDuration, remix, empty }: {
  src: string | null; kind: 'video' | 'image'; tool: StudioToolId
  caption?: { text: string; x: number; y: number; style: CaptionStyle }; onCaptionMove?: (x: number, y: number) => void
  overlay?: { url: string | null; x: number; y: number; size: number }; onOverlayChange?: (o: { x: number; y: number; size: number }) => void
  trim?: { start: number; end: number | null }; onTrim?: (start: number, end: number | null) => void; onDuration?: (d: number) => void
  remix?: { intensity: RemixIntensity; toggles: RemixToggles }
  empty?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const vref = useRef<HTMLVideoElement>(null)
  const [ar, setAr] = useState(9 / 16)
  const [dur, setDur] = useState(0)
  const [capUrl, setCapUrl] = useState<string | null>(null)
  const drag = useRef<null | { mode: 'cap' | 'ov' | 'size' }>(null)

  // Légende : on régénère le PNG (comme la sortie) avec un léger délai pendant la frappe.
  useEffect(() => {
    if (tool !== 'mixer' || !caption?.text.trim()) { setCapUrl(null); return }
    let url: string | null = null, alive = true
    const t = setTimeout(() => {
      void textToPng(caption.text, 1080, false, caption.style).then(png => {
        if (!alive) return
        url = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' })); setCapUrl(url)
      }).catch(() => {})
    }, 220)
    return () => { alive = false; clearTimeout(t); if (url) URL.revokeObjectURL(url) }
  }, [tool, caption?.text, caption?.style])

  // Déplacement à la souris (légende, photo) et redimensionnement (photo).
  const pct = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100), w: r.width } }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !box.current) return
    const p = pct(e)
    if (drag.current.mode === 'cap') onCaptionMove?.(Math.round(p.x), Math.round(p.y))
    else if (drag.current.mode === 'ov' && overlay) onOverlayChange?.({ ...overlay, x: Math.round(p.x), y: Math.round(p.y) })
    else if (drag.current.mode === 'size' && overlay) onOverlayChange?.({ ...overlay, size: Math.round(clamp(Math.abs(p.x - overlay.x) * 2, 8, 100)) })
  }
  const start = (mode: 'cap' | 'ov' | 'size') => (e: React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); drag.current = { mode }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId) }
  const stop = () => { drag.current = null }

  // Montage : lecture limitée à l'extrait gardé.
  useEffect(() => {
    const v = vref.current; if (!v || tool !== 'montage' || !trim) return
    const f = () => { if (trim.end != null && v.currentTime >= trim.end) { v.pause(); v.currentTime = trim.start } }
    v.addEventListener('timeupdate', f); return () => v.removeEventListener('timeupdate', f)
  }, [tool, trim?.start, trim?.end]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!src) {
    return (
      <div style={{ position: 'relative', width: 'min(100%, 300px)', aspectRatio: '9 / 16', margin: '0 auto', borderRadius: 18, border: '1.5px dashed rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, boxSizing: 'border-box', color: '#71717A', fontSize: 13, lineHeight: 1.5 }}>
        {empty ?? 'Ajoute une source pour voir l’aperçu.'}
      </div>
    )
  }

  const variants = (tool === 'remix' || tool === 'spoof' || tool === 'imgspoof') && remix
    ? [1, 2, 3].map(i => {
      const p = remixParams(i * 17.3, remix.intensity, tool === 'remix' ? remix.toggles : { color: false, speed: false, crop: true, mirror: false })
      return { p, css: { filter: `brightness(${(1 + p.brightness * 2).toFixed(3)}) contrast(${p.contrast}) saturate(${p.saturation}) hue-rotate(${p.hue}deg)`, transform: `scale(${p.zoom}) ${p.mirror ? 'scaleX(-1)' : ''}` } }
    })
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <div ref={box} onPointerMove={onMove} onPointerUp={stop} onPointerCancel={stop}
        style={{ position: 'relative', width: `min(100%, ${Math.round(540 * ar)}px)`, aspectRatio: String(ar), borderRadius: 18, overflow: 'hidden', background: '#000', boxShadow: '0 30px 60px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,0.08)', touchAction: 'none' }}>
        {kind === 'video'
          ? <video ref={vref} key={src} src={src} controls={tool !== 'mixer' && tool !== 'overlay'} muted loop playsInline autoPlay preload="metadata"
              onLoadedMetadata={e => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) setAr(v.videoWidth / v.videoHeight); setDur(v.duration || 0); onDuration?.(v.duration || 0); if (trim && trim.start > 0) v.currentTime = trim.start }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
          : <img key={src} src={src} alt="" onLoad={e => { const im = e.currentTarget; if (im.naturalWidth) setAr(im.naturalWidth / im.naturalHeight) }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}

        {/* Légende (même rendu que la sortie), déplaçable */}
        {tool === 'mixer' && capUrl && caption && (
          <img src={capUrl} alt="" draggable={false} onPointerDown={start('cap')}
            style={{ position: 'absolute', left: caption.style === 'snapchat' ? 0 : `${caption.x}%`, top: `${caption.y}%`, width: '100%', transform: caption.style === 'snapchat' ? 'translateY(-50%)' : 'translate(-50%,-50%)', cursor: 'grab', userSelect: 'none', filter: 'drop-shadow(0 0 0.5px rgba(167,139,250,.9))' }} />
        )}
        {tool === 'mixer' && !capUrl && <span style={{ position: 'absolute', left: 0, right: 0, bottom: '10%', textAlign: 'center', color: 'rgba(255,255,255,.55)', fontSize: 13, fontWeight: 700 }}>Écris ta légende →</span>}

        {/* Photo incrustée : déplaçable + poignée de taille */}
        {tool === 'overlay' && overlay?.url && (
          <span onPointerDown={start('ov')} style={{ position: 'absolute', left: `${overlay.x}%`, top: `${overlay.y}%`, width: `${overlay.size}%`, transform: 'translate(-50%,-50%)', cursor: 'grab', outline: '2px solid rgba(167,139,250,.9)', outlineOffset: 2, borderRadius: 2 }}>
            <img src={overlay.url} alt="" draggable={false} style={{ display: 'block', width: '100%', userSelect: 'none' }} />
            <span onPointerDown={start('size')} title="Redimensionner" style={{ position: 'absolute', right: -9, bottom: -9, width: 18, height: 18, borderRadius: 99, background: '#A78BFA', border: '2px solid #fff', cursor: 'nwse-resize', boxShadow: '0 2px 8px rgba(0,0,0,.5)' }} />
          </span>
        )}
        {tool === 'overlay' && !overlay?.url && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.6)', fontSize: 13, fontWeight: 700 }}>Choisis une photo à incruster →</span>}

        {/* Sous-titres : exemple de rendu */}
        {tool === 'subs' && (
          <span style={{ position: 'absolute', left: 0, right: 0, top: '75%', transform: 'translateY(-50%)', textAlign: 'center', fontFamily: '"Arial Black", system-ui, Arial, sans-serif', fontWeight: 900, fontSize: 'clamp(16px, 7cqw, 34px)', color: '#fff', WebkitTextStroke: '1.5px #000', textShadow: '0 3px 8px rgba(0,0,0,.6)', letterSpacing: '.01em', pointerEvents: 'none', containerType: 'inline-size' } as React.CSSProperties}>
            EXEMPLE DE SOUS-TITRE
          </span>
        )}
        {(tool === 'mixer' || tool === 'overlay') && <span style={{ position: 'absolute', top: 10, left: 10, padding: '4px 9px', borderRadius: 99, background: 'rgba(10,10,11,.6)', backdropFilter: 'blur(6px)', color: '#E4E4E7', fontSize: 11.5, fontWeight: 700, pointerEvents: 'none' }}>Glisse pour placer</span>}
      </div>

      {/* Montage : barre de coupe */}
      {tool === 'montage' && trim && onTrim && dur > 0 && (
        <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ position: 'relative', height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${(trim.start / dur) * 100}%`, width: `${(((trim.end ?? dur) - trim.start) / dur) * 100}%`, background: 'linear-gradient(90deg, rgba(139,92,246,.45), rgba(236,72,153,.45))', borderLeft: '3px solid #C4B5FD', borderRight: '3px solid #F9A8D4' }} />
            <input type="range" min={0} max={dur} step={0.1} value={trim.start} aria-label="Début" onChange={e => { const v = Math.min(Number(e.target.value), (trim.end ?? dur) - 0.5); onTrim(Math.max(0, v), trim.end); if (vref.current) vref.current.currentTime = Math.max(0, v) }}
              style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'ew-resize' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([['Début', trim.start, (v: number) => onTrim(Math.min(v, (trim.end ?? dur) - 0.5), trim.end)], ['Fin', trim.end ?? dur, (v: number) => onTrim(trim.start, v >= dur - 0.05 ? null : Math.max(v, trim.start + 0.5))]] as [string, number, (v: number) => void][]).map(([l, v, set]) => (
              <label key={l} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#A1A1AA' }}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l}</span><b style={{ color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{fmtT(v)}</b></span>
                <input type="range" min={0} max={dur} step={0.1} value={v} onChange={e => { set(Number(e.target.value)); if (vref.current) vref.current.currentTime = Number(e.target.value) }} style={{ accentColor: '#A78BFA' }} />
              </label>
            ))}
          </div>
          <span style={{ fontSize: 12, color: '#71717A', textAlign: 'center' }}>Extrait gardé : <b style={{ color: '#E4E4E7' }}>{fmtT((trim.end ?? dur) - trim.start)}</b> sur {fmtT(dur)}</span>
        </div>
      )}

      {/* Remix / Spoof : 3 variantes simulées */}
      {variants && (
        <div style={{ width: '100%', maxWidth: 520 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 650, color: '#A1A1AA' }}><Icon d="M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6" size={12} />Aperçu des variantes <span style={{ color: '#5A5A63', fontWeight: 500 }}>(approximatif)</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {variants.map((v, i) => (
              <span key={i} style={{ position: 'relative', aspectRatio: String(ar), borderRadius: 12, overflow: 'hidden', background: '#000', boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }}>
                {kind === 'video'
                  ? <video src={`${src}#t=0.5`} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...v.css }} />
                  : <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...v.css }} />}
                <span style={{ position: 'absolute', top: 6, left: 6, padding: '2px 7px', borderRadius: 99, background: 'rgba(10,10,11,.65)', color: '#fff', fontSize: 10.5, fontWeight: 800 }}>V{i + 1}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
