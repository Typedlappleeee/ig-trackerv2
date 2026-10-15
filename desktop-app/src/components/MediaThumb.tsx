// Vignette d'un média de la banque, qui s'affiche TOUJOURS (jamais de carré noir) :
//   1. la miniature enregistrée (thumbnail) ;
//   2. sinon, pour une vidéo visible à l'écran, sa 1re image via un <video> qui n'apparaît
//      (en fondu) que lorsqu'une image est réellement peinte ;
//   3. dessous, en permanence, un repli lisible (format + icône) : vidéo non décodable par
//      le navigateur (.MOV HEVC d'iPhone), fichier introuvable, chargement en cours.
// `playing` : lecture en boucle par-dessus (survol, clic pour lire).
// Le parent doit être en position relative (la vignette remplit son cadre).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '@/lib/ui'

const FILL: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
const HUES = ['139,92,246', '6,182,212', '236,72,153', '16,185,129', '245,158,11', '99,102,241']
const hueOf = (s: string) => { let h = 0; for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0; return HUES[h % HUES.length] }

/** Visible à l'écran (avec une marge) : on ne monte les <video> que pour les vignettes visibles. */
export function useInView(ref: React.RefObject<HTMLElement | null>, rootMargin = '400px'): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(entries => setInView(!!entries[0]?.isIntersecting), { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin])
  return inView
}

export function MediaThumb({ id, thumb, media, video, ext, broken = false, playing = false, playMuted = true, onPlayError, small = false }: {
  /** Identifiant (couleur du repli). */
  id: string
  /** Miniature enregistrée (URL), si elle existe. */
  thumb: string | null
  /** URL du média lui-même (signée). */
  media: string | null
  video: boolean
  /** Extension affichée sur le repli (MOV, MP4…). */
  ext?: string
  broken?: boolean
  playing?: boolean
  /** Lecture sans le son (survol) ; false = avec le son (clic pour lire). */
  playMuted?: boolean
  onPlayError?: () => void
  small?: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [frame, setFrame] = useState(false)        // 1re image vidéo peinte
  const [undecodable, setUndecodable] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setThumbFailed(false) }, [thumb])
  useEffect(() => { setFrame(false); setUndecodable(false); setImgFailed(false) }, [media])

  const showThumb = !broken && !!thumb && !thumbFailed
  const tryVideo = !broken && !showThumb && video && !!media && inView && !undecodable
  const tryImage = !broken && !showThumb && !video && !!media && inView && !imgFailed
  const label = broken ? 'Fichier introuvable' : undecodable ? `${ext || 'VIDÉO'} · aperçu indisponible` : (ext || (video ? 'VIDÉO' : 'IMAGE'))

  return (
    <span ref={ref} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#161618' }}>
      {/* Repli permanent : visible tant que rien n'est peint par-dessus. */}
      <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: small ? 4 : 6, padding: 8, textAlign: 'center',
        background: broken ? 'repeating-linear-gradient(135deg,#1A1215,#1A1215 8px,#16101299 8px,#16101299 16px)' : `linear-gradient(160deg, rgba(${hueOf(id)},0.3), #161618 75%)`,
        color: broken ? '#F87171' : 'rgba(255,255,255,0.72)' }}>
        <Icon d={broken ? 'M12 9v4|M12 17h.01|M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' : video ? 'M6 4l14 8-14 8V4z' : 'M3 3h18v18H3z|M21 15l-5-5L5 21'} size={small ? 14 : 18} />
        <span style={{ fontSize: small ? 9 : 10.5, fontWeight: 650, letterSpacing: '.04em', lineHeight: 1.3 }}>{label}</span>
      </span>
      {showThumb && <img src={thumb!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setThumbFailed(true)} style={FILL} />}
      {tryVideo && (
        <video src={`${media}#t=0.1`} muted playsInline preload="metadata"
          onLoadedData={e => {
            if (e.currentTarget.videoWidth > 0) setFrame(true)
            else setUndecodable(true)   // piste vidéo illisible (HEVC) : seul le son est décodé
          }}
          onError={() => setUndecodable(true)}
          style={{ ...FILL, opacity: frame ? 1 : 0, transition: 'opacity .25s ease' }} />
      )}
      {tryImage && <img src={media!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} style={FILL} />}
      {playing && media && video && (
        <video src={media} autoPlay loop playsInline muted={playMuted} onError={() => onPlayError?.()}
          onLoadedData={e => { if (!e.currentTarget.videoWidth) onPlayError?.() }} style={{ ...FILL, background: '#000' }} />
      )}
    </span>
  )
}
