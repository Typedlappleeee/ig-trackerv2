// Cellule « IP sortante » partagée (Cloud Phones + Proxies + fenêtre du tel).
// Lit le cache proxyChecks (keyé par proxyId) et se met à jour en direct quand
// un autre onglet teste le proxy. Affiche : drapeau + IP + ville, et (non
// compact) ISP + temps relatif. Bouton « tester » si pas encore résolu.
import { useEffect, useReducer } from 'react'
import { getProxyCheck, isStale, subscribeProxyChecks } from '@/lib/proxyChecks'
import { flagEmoji } from '@/lib/flag'

function relTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60); if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

interface Props {
  proxyId?: string
  onTest?: () => void          // lance runProxyCheck sur le proxy (fourni par le parent)
  compact?: boolean            // une seule ligne (title-bar de fenêtre)
  testing?: boolean
}

export function ExitIpCell({ proxyId, onTest, compact, testing }: Props) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => subscribeProxyChecks(force), [])

  if (!proxyId) return <span style={{ color: 'var(--text-4)' }}>—</span>
  const c = getProxyCheck(proxyId)

  if (testing) return <span style={{ color: 'var(--text-4)' }}>…</span>
  if (!c) {
    return onTest
      ? <button onClick={onTest} style={testBtn}>tester</button>
      : <span style={{ color: 'var(--text-4)' }}>—</span>
  }
  if (!c.reachable) {
    return <span onClick={onTest} title={c.error} style={{ color: 'var(--danger)', cursor: onTest ? 'pointer' : 'default', fontWeight: 700, fontSize: 12 }}>● KO{onTest ? ' ↻' : ''}</span>
  }

  const flag = flagEmoji(c.countryCode || c.country)
  const stale = isStale(c)
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.3, opacity: stale ? 0.55 : 1 }}>
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--ok)', whiteSpace: 'nowrap' }}>
        {flag && <span style={{ marginRight: 5 }}>{flag}</span>}{c.ip}{c.city ? <span style={{ color: 'var(--text-4)', fontFamily: 'inherit' }}> · {c.city}</span> : null}
      </span>
      {!compact && (c.isp || c.checkedAt) && (
        <span style={{ fontSize: 10, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{c.isp ? `${c.isp} · ` : ''}{relTime(c.checkedAt)}{stale ? ' (à revérifier)' : ''}</span>
      )}
    </span>
  )
}

const testBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--border-md)', borderRadius: 6, color: 'var(--text-3)', cursor: 'pointer', fontSize: 10.5, padding: '2px 8px' }

export default ExitIpCell
