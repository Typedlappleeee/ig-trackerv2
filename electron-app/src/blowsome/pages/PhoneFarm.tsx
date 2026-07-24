// Blowsome — Phone Farm / iRemoTech. Vrai panneau de contrôle à distance des
// iPhones iRemoTech via leur Device API (proxy /api/iremotech).
// Capture d'écran cliquable → tap aux coordonnées, + actions (texte, scroll, URL…).
import { useState, useEffect, useRef, useCallback } from 'react'
import { iremotech, extractDevices, type IrtDevice, type IrtAction } from '@/lib/iremotech'
import {
  useBlowCSS, Grad, Ico, ICON, GRAD, GOLD, INK, MUTED, FAINT, HAIR,
  BlowCard, BlowPageHeader, BlowBadge, BlowButton, BlowEmpty,
} from '../ui'

type Conn = 'checking' | 'ok' | 'unconfigured' | 'error'

export function BlowPhoneFarm() {
  useBlowCSS()
  const [conn, setConn] = useState<Conn>('checking')
  const [connMsg, setConnMsg] = useState('')
  const [devices, setDevices] = useState<IrtDevice[]>([])
  const [selected, setSelected] = useState<IrtDevice | null>(null)
  const [snap, setSnap] = useState<string | null>(null)
  const [snapLoading, setSnapLoading] = useState(false)
  const [text, setText] = useState('')
  const [log, setLog] = useState<string[]>([])
  const imgRef = useRef<HTMLImageElement>(null)

  const addLog = (m: string) => setLog(l => [`${new Date().toLocaleTimeString()} · ${m}`, ...l].slice(0, 30))

  const loadDevices = useCallback(async () => {
    setConn('checking'); setConnMsg('')
    const r = await iremotech.listDevices()
    if (r.ok) {
      const list = extractDevices(r.data)
      setDevices(list)
      setConn('ok')
      if (list.length && !selected) setSelected(list[0])
    } else if ((r.error ?? '').toLowerCase().includes('iremotech_api_key') || (r.error ?? '').includes('Clé iRemoTech absente')) {
      setConn('unconfigured'); setConnMsg(r.error ?? '')
    } else {
      setConn('error'); setConnMsg(r.error ?? `Erreur ${r.status ?? ''}`)
    }
  }, [selected])

  useEffect(() => { loadDevices() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSnapshot = useCallback(async (dev: IrtDevice | null) => {
    if (!dev) return
    setSnapLoading(true)
    const r = await iremotech.snapshot(dev.public_id)
    setSnapLoading(false)
    if (r.ok && r.dataUrl) setSnap(r.dataUrl)
    else addLog(`❌ snapshot : ${r.error ?? r.status}`)
  }, [])

  useEffect(() => { if (selected) { setSnap(null); refreshSnapshot(selected) } }, [selected, refreshSnapshot])

  const sendAction = async (a: IrtAction, label: string) => {
    if (!selected) return
    const r = await iremotech.action(selected.public_id, a)
    addLog(r.ok ? `✓ ${label}` : `❌ ${label} : ${r.error ?? r.status}`)
    if (r.ok) window.setTimeout(() => refreshSnapshot(selected), 700)
  }

  // Clic sur la capture → tap aux coordonnées (espace pixel de la capture).
  const onSnapClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return
    const rect = img.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) / rect.width * img.naturalWidth)
    const y = Math.round((e.clientY - rect.top) / rect.height * img.naturalHeight)
    sendAction({ type: 'tap', x, y }, `tap (${x}, ${y})`)
  }

  return (
    <div>
      <BlowPageHeader
        title="Phone Farm — iRemoTech"
        subtitle="Pilote tes vrais iPhones à distance (capture, taps, actions)"
        action={<BlowButton variant="ghost" onClick={loadDevices}><Ico d={ICON.spark} size={15} /> Rafraîchir</BlowButton>}
      />

      {/* Connexion non configurée */}
      {conn === 'unconfigured' && (
        <BlowCard style={{ padding: 24 }}>
          <BlowBadge tone="gold">✦ Configuration requise</BlowBadge>
          <h3 style={{ margin: '12px 0 8px', fontSize: 18, fontWeight: 800, color: INK }}>Connecte ton compte iRemoTech</h3>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: MUTED, maxWidth: 560 }}>
            Ajoute ta clé API iRemoTech dans les variables d'environnement Vercel :
          </p>
          <pre style={{ margin: '12px 0', padding: '12px 14px', borderRadius: 10, background: '#0b0b12', border: `1px solid ${HAIR}`, fontSize: 12.5, color: '#c8c8e0', overflowX: 'auto' }}>
IREMOTECH_API_KEY = irt_live_&lt;key_id&gt;_&lt;secret&gt;{'\n'}IREMOTECH_API_BASE = https://api.iremotech.com/v1  (optionnel)
          </pre>
          <p style={{ margin: 0, fontSize: 12.5, color: FAINT }}>
            Crée la clé dans ton dashboard iRemoTech (scopes <b>read · control · upload</b>), puis redéploie et clique « Rafraîchir ».
          </p>
        </BlowCard>
      )}

      {conn === 'error' && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title="Connexion impossible" hint={connMsg || 'Vérifie la clé API et le réseau.'} icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'checking' && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title="Connexion à iRemoTech…" icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'ok' && devices.length === 0 && (
        <BlowCard style={{ padding: 8 }}>
          <BlowEmpty title="Aucun iPhone" hint="Ton compte iRemoTech ne renvoie aucun appareil. Ajoute/assigne des iPhones côté iRemoTech." icon={<Ico d={ICON.phone} size={20} />} />
        </BlowCard>
      )}

      {conn === 'ok' && devices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) 1fr', gap: 16, alignItems: 'start' }}>
          {/* Liste des iPhones */}
          <BlowCard style={{ padding: 10 }}>
            <p style={{ margin: '4px 6px 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED }}>
              {devices.length} iPhone{devices.length > 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 520, overflowY: 'auto' }} className="blow-scroll">
              {devices.map(d => {
                const on = selected?.public_id === d.public_id
                return (
                  <button key={d.public_id} onClick={() => setSelected(d)} className="blow-tap" style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 11, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: on ? 'linear-gradient(100deg, rgba(168,85,247,0.2), rgba(99,102,241,0.12))' : 'transparent',
                    boxShadow: on ? 'inset 0 0 0 1px rgba(168,85,247,0.35)' : 'none',
                  }}>
                    <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, display: 'grid', placeItems: 'center', color: '#fff', background: on ? GRAD : 'var(--surface-3)' }}>
                      <Ico d={ICON.phone} size={15} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || d.public_id}</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: FAINT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.public_id}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </BlowCard>

          {/* Contrôle de l'iPhone sélectionné */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 300px) 1fr', gap: 16, alignItems: 'start' }}>
            {/* Capture cliquable */}
            <BlowCard style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Écran</span>
                <button onClick={() => refreshSnapshot(selected)} className="blow-tap" style={{ fontSize: 11, color: '#D8B4FE', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>↻ Rafraîchir</button>
              </div>
              <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1px solid ${HAIR}`, background: '#0b0b12', aspectRatio: '9/19.5', display: 'grid', placeItems: 'center' }}>
                {snap ? (
                  <img ref={imgRef} src={snap} alt="écran" onClick={onSnapClick} style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair' }} title="Clique pour taper à cet endroit" />
                ) : (
                  <span style={{ fontSize: 12, color: FAINT }}>{snapLoading ? 'Capture…' : 'Pas de capture'}</span>
                )}
              </div>
              <p style={{ margin: '9px 2px 0', fontSize: 10.5, color: FAINT, textAlign: 'center' }}>Clique sur l'écran pour <Grad style={{ fontWeight: 700 }}>taper</Grad> à cet endroit</p>
            </BlowCard>

            {/* Actions + journal */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <BlowCard style={{ padding: 16 }}>
                <p style={{ margin: '0 0 12px', fontSize: 12.5, fontWeight: 800, color: INK }}>Actions rapides</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'scroll', x: 200, y: 500, dy: -600 }, 'scroll ↑')} style={{ height: 34 }}>↑ Scroll</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'scroll', x: 200, y: 500, dy: 600 }, 'scroll ↓')} style={{ height: 34 }}>↓ Scroll</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'press', name: 'home' }, 'home')} style={{ height: 34 }}>⌂ Accueil</BlowButton>
                  <BlowButton variant="ghost" onClick={() => sendAction({ type: 'open_url', url: 'https://instagram.com' }, 'open instagram')} style={{ height: 34 }}>Instagram</BlowButton>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input
                    value={text} onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && text) { sendAction({ type: 'text', text }, `texte "${text}"`); setText('') } }}
                    placeholder="Taper du texte dans le champ actif…"
                    style={{ flex: 1, height: 38, padding: '0 13px', borderRadius: 11, outline: 'none', color: INK, fontSize: 13, background: 'rgba(255,255,255,0.045)', border: `1px solid ${HAIR}` }}
                  />
                  <BlowButton onClick={() => { if (text) { sendAction({ type: 'text', text }, `texte "${text}"`); setText('') } }} style={{ height: 38 }}>Envoyer</BlowButton>
                </div>
              </BlowCard>

              <BlowCard style={{ padding: 16 }}>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 800, color: INK }}>Journal</p>
                <div className="blow-scroll" style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {log.length === 0
                    ? <span style={{ fontSize: 12, color: FAINT }}>Aucune action pour l'instant.</span>
                    : log.map((l, i) => <span key={i} style={{ fontSize: 11.5, color: l.includes('❌') ? '#F87171' : 'var(--text-2)', fontFamily: 'monospace' }}>{l}</span>)}
                </div>
              </BlowCard>

              <p style={{ margin: '2px 2px 0', fontSize: 11.5, color: FAINT, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: GOLD }}>✦</span> POC iRemoTech — l'automatisation complète (posting/story) se construira sur ces primitives.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BlowPhoneFarm
