/**
 * Détecteur de risque (ban / shadowban / compte en perdition).
 * Calcule un score de santé 0-100 par compte à partir de signaux déjà collectés :
 *   - statut Instagram (ig_status) : erreur / session expirée / rate-limited
 *   - tendance followers sur la période (baisse = mauvais signe)
 *   - effondrement des vues vs début de période (shadowban classique)
 * Fonction pure → testable et réutilisable côté client comme serveur.
 */

export interface HealthInput {
  igStatus:        string | null   // 'active' | 'error' | 'expired' | 'rate_limited' | null
  followersNow:    number
  followersStart:  number | null    // 1er snapshot de la période (null si pas d'historique)
  viewsNow:        number
  viewsStart:      number | null
}

export interface HealthFlag { severity: 'mild' | 'severe'; label: string }

export interface HealthResult {
  score: number                       // 0-100 (100 = parfaite santé)
  level: 'ok' | 'watch' | 'risk'
  flags: HealthFlag[]
}

export function computeHealth(i: HealthInput): HealthResult {
  const flags: HealthFlag[] = []
  let score = 100

  // ── Statut Instagram ────────────────────────────────────────────────────────
  switch (i.igStatus) {
    case 'error':
      flags.push({ severity: 'severe', label: 'Statut Instagram : erreur' }); score -= 45; break
    case 'expired':
      flags.push({ severity: 'severe', label: 'Session Instagram expirée' }); score -= 35; break
    case 'rate_limited':
      flags.push({ severity: 'severe', label: 'Rate-limited par Instagram' }); score -= 40; break
  }

  // ── Tendance followers ──────────────────────────────────────────────────────
  if (i.followersStart !== null && i.followersStart > 0) {
    const delta = i.followersNow - i.followersStart
    const pct = delta / i.followersStart
    if (pct <= -0.10) {
      flags.push({ severity: 'severe', label: `Followers en chute (${Math.round(pct * 100)}%)` }); score -= 35
    } else if (delta < 0) {
      flags.push({ severity: 'mild', label: `Followers en baisse (${delta})` }); score -= 15
    } else if (delta === 0) {
      flags.push({ severity: 'mild', label: 'Croissance des followers à l\'arrêt' }); score -= 8
    }
  }

  // ── Effondrement des vues (signal shadowban) ────────────────────────────────
  if (i.viewsStart !== null && i.viewsStart > 500) {
    const pct = (i.viewsNow - i.viewsStart) / i.viewsStart
    if (pct <= -0.40) {
      flags.push({ severity: 'severe', label: `Vues en chute libre (${Math.round(pct * 100)}%)` }); score -= 30
    } else if (pct <= -0.20) {
      flags.push({ severity: 'mild', label: `Vues en baisse (${Math.round(pct * 100)}%)` }); score -= 15
    }
  }

  score = Math.max(0, Math.min(100, score))
  const hasSevere = flags.some(f => f.severity === 'severe')
  const level: HealthResult['level'] = hasSevere || score < 45 ? 'risk' : flags.length > 0 || score < 75 ? 'watch' : 'ok'
  return { score, level, flags }
}

export const HEALTH_COLORS: Record<HealthResult['level'], { color: string; bg: string; border: string; label: string }> = {
  ok:    { color: 'var(--ok)',     bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.22)',  label: 'Sain' },
  watch: { color: 'var(--warn)',   bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.22)', label: 'À surveiller' },
  risk:  { color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.22)',  label: 'À risque' },
}
