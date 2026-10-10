// Aperçu « comme sur Instagram » d'un Reel avant publication : une vidéo choisie,
// un compte et une légende tirés au hasard parmi la sélection (bouton « Autre aperçu »).
import { useEffect, useState } from 'react'
import type { Theme } from '@/lib/theme'
import { Btn, Icon } from '@/lib/ui'

export interface PreviewVideo { id: string; title: string }
export interface PreviewAccount { username: string; pp?: string | null }

const ICONS = {
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  comment: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z',
  send: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z|M12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z|M12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  music: 'M9 18V5l12-2v13|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  shuffle: 'M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6|M4 4l5 5',
}

export default function ReelPreview({ theme, videos, accounts, captions, resolveUrl, posterFor, platform = 'instagram' }: {
  theme: Theme
  platform?: 'instagram' | 'tiktok'
  videos: PreviewVideo[]
  accounts: PreviewAccount[]
  captions: string[]
  resolveUrl: (id: string) => Promise<string | null>
  posterFor?: (id: string) => string | undefined
}) {
  // Tirage au hasard STABLE : refait seulement au clic sur « Autre aperçu » (taper la
  // légende ne change pas la vidéo ni le compte affichés).
  const [seed, setSeed] = useState(() => [Math.random(), Math.random(), Math.random()])
  const at = <T,>(a: T[], r: number): T | undefined => a.length ? a[Math.floor(r * a.length)] : undefined
  const caps = captions.map(c => c.trim()).filter(Boolean)
  const pick = { video: at(videos, seed[0]), account: at(accounts, seed[1]), caption: at(caps, seed[2]) ?? '' }
  const vid = pick.video?.id
  const [src, setSrc] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    let cancelled = false
    setSrc(null); setMore(false)
    if (vid) resolveUrl(vid).then(u => { if (!cancelled) setSrc(u) }).catch(() => {})
    return () => { cancelled = true }
  }, [vid]) // eslint-disable-line react-hooks/exhaustive-deps

  const user = pick.account?.username || 'compte'
  const poster = pick.video ? posterFor?.(pick.video.id) : undefined
  const long = pick.caption.length > 70 || pick.caption.includes('\n')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 300, aspectRatio: '9 / 16', borderRadius: 12, overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,0.08)' }}>
        {pick.video ? (
          src
            ? <video key={src} src={src} poster={poster} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : poster ? <img src={poster} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontSize: 12.5, color: '#71717A' }}>Aucune vidéo choisie</div>
        )}

        {/* Habillage Reels Instagram */}
        {platform === 'tiktok'
          ? <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14, fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.65)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}><span>Abonnements</span><span style={{ color: '#fff', borderBottom: '2px solid #fff', paddingBottom: 3 }}>Pour toi</span></div>
          : <div style={{ position: 'absolute', top: 12, left: 14, fontSize: 16, fontWeight: 600, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>Reels</div>}
        <div style={{ position: 'absolute', inset: 'auto 0 0 0', height: '55%', background: 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 10, bottom: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, color: '#fff' }}>
          {[ICONS.heart, ICONS.comment, ICONS.send, ICONS.more].map((d, i) => <Icon key={i} d={d} size={22} sw={1.9} />)}
          <span style={{ width: 24, height: 24, borderRadius: 6, border: '2px solid #fff', overflow: 'hidden', background: '#27272A' }}>
            {pick.account?.pp && <img src={pick.account.pp} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </span>
        </div>
        <div style={{ position: 'absolute', left: 12, right: 52, bottom: 14, display: 'flex', flexDirection: 'column', gap: 8, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 99, flexShrink: 0, overflow: 'hidden', background: '#3F3F46', border: '1px solid rgba(255,255,255,0.6)' }}>
              {pick.account?.pp && <img src={pick.account.pp} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </span>
            <span data-no-tr style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user}</span>
            <span style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: 600 }}>Suivre</span>
          </div>
          {pick.caption && (
            <div onClick={() => long && setMore(m => !m)} style={{ fontSize: 12.5, lineHeight: 1.45, cursor: long ? 'pointer' : 'default', maxHeight: more ? 160 : undefined, overflowY: more ? 'auto' : undefined }}>
              <span data-no-tr style={{ whiteSpace: 'pre-wrap', display: more ? 'inline' : '-webkit-box', WebkitLineClamp: more ? undefined : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{pick.caption}</span>
              {long && !more && <span style={{ color: 'rgba(255,255,255,0.7)' }}> plus</span>}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(255,255,255,0.9)' }}>
            <Icon d={ICONS.music} size={12} />
            <span data-no-tr style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user}</span>
            <span>· Son original</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Btn theme={theme} sm tone="ghost" icon={ICONS.shuffle} label="Autre aperçu" disabled={videos.length <= 1 && accounts.length <= 1 && caps.length <= 1} onClick={() => setSeed([Math.random(), Math.random(), Math.random()])} />
        <span style={{ fontSize: 11.5, color: '#71717A' }}>Vidéo, compte et légende tirés au hasard</span>
      </div>
    </div>
  )
}
