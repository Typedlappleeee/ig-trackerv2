import { useEffect, useRef, useState, type CSSProperties, type VideoHTMLAttributes } from 'react'

/** <video> qui COUPE son téléchargement quand il disparaît (lecteur fermé, page quittée, vignette
 *  masquée). Un <video> retiré de la page continue sinon de télécharger en fond et se partage la
 *  connexion avec la vidéo suivante. Changer de vidéo = changer la `key`. */
export function Video(props: VideoHTMLAttributes<HTMLVideoElement>) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    return () => { if (v) { v.pause(); v.removeAttribute('src'); v.load() } }
  }, [])
  return <video ref={ref} {...props} />
}

// Vignettes sans miniature : 3 vidéos chargées à la fois au plus, dans l'ordre d'affichage.
// Chrome lit plusieurs Mo par vidéo avant la 1re image ; toutes en même temps, elles saturent
// la connexion (images lentes ET vidéo cliquée qui attend derrière).
const MAX_LOADS = 3
let busy = 0
const queue: { go: () => void; dead: boolean }[] = []
function pump() {
  while (busy < MAX_LOADS && queue.length) { const t = queue.shift()!; if (t.dead) continue; busy++; t.go() }
}
/** Réserve une place de chargement ; renvoie la fonction qui la rend (ou annule l'attente). */
function slot(go: () => void): () => void {
  let running = false
  const t = { go: () => { running = true; go() }, dead: false }
  queue.push(t); pump()
  return () => { if (t.dead) return; t.dead = true; if (running) { busy--; pump() } }
}

/** 1re image d'une vidéo SANS miniature, pour une vignette. La vidéo n'est chargée que le temps
 *  d'afficher cette image : elle est recopiée dans un <canvas>, puis le téléchargement est coupé.
 *  Avant, chaque vignette gardait un <video preload="metadata"> qui continuait de télécharger :
 *  la Banque saturait la connexion et la vidéo cliquée attendait derrière (10 s et plus).
 *  `load` = false (hors écran, lecteur ouvert…) → rien ne se charge ; l'image déjà prise reste.
 *  Pas de crossOrigin (voir Bank.tsx) : le canvas sert seulement à l'affichage. */
export default function VideoFrame({ src, load = true, at = 0.1, onError }: { src: string; load?: boolean; at?: number; onError?: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const [shot, setShot] = useState<string | null>(null)     // lien dont l'image est prise
  const [gaveUp, setGaveUp] = useState<string | null>(null) // lien illisible / trop long : on n'insiste pas
  const [granted, setGranted] = useState(false)
  const want = load && shot !== src && gaveUp !== src
  useEffect(() => {
    if (!want) return
    const release = slot(() => setGranted(true))
    return () => { release(); setGranted(false) }
  }, [want, src])
  // Jamais une place bloquée : sans image au bout de 30 s, on rend la place (le repli reste).
  useEffect(() => {
    if (!want || !granted) return
    const t = setTimeout(() => setGaveUp(src), 30_000)
    return () => clearTimeout(t)
  }, [want, granted, src])
  const capture = (v: HTMLVideoElement) => {
    const c = cv.current
    if (c && v.videoWidth) {
      const w = Math.min(200, v.videoWidth)
      c.width = w; c.height = Math.max(1, Math.round(w * v.videoHeight / v.videoWidth))
      try { c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height); setShot(src); return } catch { /* image non copiable */ }
    }
    setGaveUp(src)
  }
  const S: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
  return <>
    <canvas ref={cv} style={{ ...S, opacity: shot === src ? 1 : 0, transition: 'opacity .25s ease' }} />
    {want && granted && <Video key={src} src={`${src}#t=${at}`} muted playsInline preload="metadata"
      onError={() => { setGaveUp(src); onError?.() }} onLoadedData={e => capture(e.currentTarget)} style={{ ...S, opacity: 0 }} />}
  </>
}
