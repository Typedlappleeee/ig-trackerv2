// Lecteur vidéo en fenêtre (Banque, aperçu Auto-contenu) : grand, avec le son et les contrôles.
// - La vidéo est d'abord TÉLÉCHARGÉE en accéléré (morceaux parallèles, lib/fastFetch) avec une
//   barre de progression, puis lue depuis la mémoire : plus de lecture qui « charge beaucoup »
//   et saccade (une vidéo 4K de 10 s pèse 40–80 Mo, plus que ce qu'une seule connexion au
//   stockage débite en temps réel). Gardée en cache : la rouvrir est instantané.
//   « Lire sans attendre » repasse en lecture directe (streaming).
// - Vidéo dont seul le son se décode (HEVC .MOV d'iPhone) ou illisible : message clair et
//   bouton « Télécharger ».
// - `overlay` : affiché par-dessus l'image de la vidéo, calé exactement sur son cadre
//   (ex. aperçu de la légende).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal, Icon } from '@/lib/ui'
import type { Theme } from '@/lib/theme'
import { fetchFast, cachedVideo, rememberVideo, type FetchProgress } from '@/lib/fastFetch'

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} Mo`

export function VideoPlayerModal({ theme, url, title, onClose, overlay, poster }: {
  theme: Theme; url: string; title: string; onClose: () => void; overlay?: ReactNode; poster?: string | null
}) {
  const [src, setSrc] = useState<string | null>(() => cachedVideo(url))
  const [prog, setProg] = useState<FetchProgress | null>(null)
  const [state, setState] = useState<'fetching' | 'loading' | 'ok' | 'nodecode' | 'error'>(() => cachedVideo(url) ? 'loading' : 'fetching')
  const ctrl = useRef<AbortController | null>(null)

  useEffect(() => {
    if (src) return
    const ac = new AbortController(); ctrl.current = ac
    fetchFast(url, p => setProg(p), ac.signal)
      .then(blob => { if (!ac.signal.aborted) { setSrc(rememberVideo(url, blob)); setState('loading') } })
      .catch(() => { if (!ac.signal.aborted) { setSrc(url); setState('loading') } })   // repli : lecture directe
    return () => ac.abort()
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps

  const streamNow = () => { ctrl.current?.abort(); setSrc(url); setState('loading') }
  const bad = state === 'nodecode' || state === 'error'
  const pct = prog?.total ? Math.min(100, Math.round((prog.loaded / prog.total) * 100)) : null

  return (
    <Modal theme={theme} title={title} onClose={onClose} width={440}>
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Miniature floutée en fond pendant le téléchargement */}
        {poster && (state === 'fetching' || state === 'loading') && <img src={poster} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(14px) brightness(.45)', transform: 'scale(1.1)' }} />}
        {src && !bad && (
          // Cadre ajusté à l'image : la légende se place sur la vidéo, pas sur les bandes noires.
          <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0, opacity: state === 'ok' ? 1 : 0.001 }}>
            <video src={src} controls autoPlay playsInline preload="auto"
              onLoadedData={e => setState(e.currentTarget.videoWidth > 0 ? 'ok' : 'nodecode')}
              // Code 4 = format non pris en charge (HEVC…) ; sinon réseau / fichier absent.
              onError={e => setState(e.currentTarget.error?.code === 4 ? 'nodecode' : 'error')}
              style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '72vh', background: '#000' }} />
            {state === 'ok' && overlay && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', lineHeight: 'normal' }}>{overlay}</div>}
          </div>
        )}
        {(state === 'fetching' || state === 'loading') && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, color: '#D4D4D8', fontSize: 13 }}>
            {state === 'fetching' && prog ? (
              <>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>
                  Chargement {pct !== null ? `${pct} %` : ''} · {mb(prog.loaded)}{prog.total ? ` / ${mb(prog.total)}` : ''}
                </span>
                <span style={{ width: 'min(260px, 80%)', height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: pct !== null ? `${Math.max(3, pct)}%` : '35%', borderRadius: 99, background: 'linear-gradient(90deg,#8B5CF6,#EC4899)', transition: 'width .25s ease', animation: pct === null ? 'vpSlide 1.2s ease-in-out infinite' : undefined }} />
                </span>
              </>
            ) : (
              <>
                <span style={{ width: 26, height: 26, borderRadius: 99, border: '2.5px solid rgba(255,255,255,0.15)', borderTopColor: '#A78BFA', animation: 'vpSpin .8s linear infinite' }} />
                Chargement de la vidéo…
              </>
            )}
            {state === 'fetching' && (
              <button type="button" onClick={streamNow} style={{ marginTop: 4, height: 32, padding: '0 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(10,10,11,0.5)', color: '#E4E4E7', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>Lire sans attendre</button>
            )}
            <style>{'@keyframes vpSpin{to{transform:rotate(360deg)}}@keyframes vpSlide{from{transform:translateX(-100%)}to{transform:translateX(290%)}}'}</style>
          </div>
        )}
        {bad && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '36px 24px', textAlign: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 14, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#FBBF24' }}><Icon d="M12 9v4|M12 17h.01|M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" size={20} /></span>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#F4F4F5' }}>{state === 'nodecode' ? 'Aperçu impossible dans l’app' : 'La vidéo ne se charge pas'}</span>
            <span style={{ fontSize: 13, lineHeight: 1.55, color: '#A1A1AA', maxWidth: 320 }}>
              {state === 'nodecode'
                ? 'Cette vidéo est au format HEVC (iPhone) : ton ordinateur ne sait pas l’afficher ici. Elle reste utilisable pour générer des variantes et publier.'
                : 'Le fichier est introuvable ou la connexion a coupé. Réessaie, ou télécharge-la pour la vérifier.'}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              {state === 'error' && <button type="button" onClick={() => { setSrc(url); setState('loading') }} style={{ height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#F4F4F5', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>Réessayer</button>}
              <a href={url} download target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 10, background: '#F4F4F5', color: '#0A0A0B', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><Icon d="M12 3v12|M7 10l5 5 5-5|M4 21h16" size={13} sw={2.2} />Télécharger</a>
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
