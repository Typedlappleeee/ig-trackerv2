// Lecteur vidéo en fenêtre (Banque, aperçu Auto-contenu) : grand, avec le son et les contrôles.
// - pendant le chargement : indicateur, plus de cadre noir muet ;
// - vidéo dont seul le son se décode (HEVC .MOV d'iPhone) ou illisible : message clair et
//   bouton « Télécharger » au lieu d'une lecture qui « bug » (son sans image, écran noir) ;
// - `overlay` : élément affiché par-dessus la vidéo (ex. aperçu de la légende).
import { useState, type ReactNode } from 'react'
import { Modal, Icon } from '@/lib/ui'
import type { Theme } from '@/lib/theme'

export function VideoPlayerModal({ theme, url, title, onClose, overlay }: {
  theme: Theme; url: string; title: string; onClose: () => void; overlay?: ReactNode
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'nodecode' | 'error'>('loading')
  const bad = state === 'nodecode' || state === 'error'
  return (
    <Modal theme={theme} title={title} onClose={onClose} width={440}>
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!bad && (
          <video src={url} controls autoPlay playsInline preload="auto"
            onLoadedData={e => setState(e.currentTarget.videoWidth > 0 ? 'ok' : 'nodecode')}
            // Code 4 = format non pris en charge (HEVC…) ; sinon réseau / fichier absent.
            onError={e => setState(e.currentTarget.error?.code === 4 ? 'nodecode' : 'error')}
            style={{ display: 'block', width: '100%', maxHeight: '72vh', background: '#000', opacity: state === 'ok' ? 1 : 0.001 }} />
        )}
        {state === 'ok' && overlay && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{overlay}</div>}
        {state === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#A1A1AA', fontSize: 13 }}>
            <span style={{ width: 26, height: 26, borderRadius: 99, border: '2.5px solid rgba(255,255,255,0.15)', borderTopColor: '#A78BFA', animation: 'spin .8s linear infinite' }} />
            Chargement de la vidéo…
            <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
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
              {state === 'error' && <button type="button" onClick={() => setState('loading')} style={{ height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#F4F4F5', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>Réessayer</button>}
              <a href={url} download target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 10, background: '#F4F4F5', color: '#0A0A0B', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><Icon d="M12 3v12|M7 10l5 5 5-5|M4 21h16" size={13} sw={2.2} />Télécharger</a>
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
