// Santé des comptes — dérivation HONNÊTE et déterministe (la table `phones` n'a
// pas de colonne de santé). On part de 100 et on retranche selon des signaux RÉELS :
// account_state (banni/shadow), status, ig_status, et l'ancienneté du dernier post.
// Aucun aléatoire — même entrée ⇒ même score. Partagé entre Phones et Santé.

export interface PhoneLike {
  ig_status: string | null
  status: string
  last_post_at: string | null
  account_state: string | null
}

export function deriveHealth(p: PhoneLike): number {
  if (p.account_state === 'banned') return 12
  let s = 100
  if (p.account_state === 'shadow') s -= 40
  if (p.ig_status === 'error') s -= 30
  else if (p.ig_status === 'rate_limited') s -= 20
  if (p.status === 'error') s -= 25
  else if (p.status === 'offline') s -= 8
  else if (p.status === 'warming') s -= 5
  if (p.last_post_at) {
    const days = (Date.now() - new Date(p.last_post_at).getTime()) / 86_400_000
    if (days > 30) s -= 25
    else if (days > 14) s -= 12
  } else {
    s -= 8 // jamais posté / date inconnue
  }
  return Math.max(0, Math.min(100, Math.round(s)))
}

export function healthColor(v: number): string {
  return v >= 85 ? '#10B981' : v >= 70 ? '#F59E0B' : '#EF4444'
}

// Cause dominante + correctif suggéré, dérivés des VRAIS champs (pas d'invention).
export function healthReason(p: PhoneLike): { why: string; fix: string; sev: 'bad' | 'warn' } {
  if (p.account_state === 'banned') return { why: 'Compte banni détecté', fix: 'Remplacer le compte', sev: 'bad' }
  if (p.account_state === 'shadow') return { why: 'Shadowban détecté', fix: 'Warmup 24 h avant de reprendre', sev: 'bad' }
  if (p.ig_status === 'error') return { why: 'Erreur Instagram sur le compte', fix: 'Vérifier la connexion du compte', sev: 'bad' }
  if (p.ig_status === 'rate_limited') return { why: 'Action bloquée récemment', fix: 'Warmup 1 h avant de reprendre', sev: 'warn' }
  if (p.status === 'error') return { why: 'Appareil en erreur', fix: 'Redémarrer l’appareil', sev: 'warn' }
  if (p.last_post_at) {
    const days = (Date.now() - new Date(p.last_post_at).getTime()) / 86_400_000
    if (days > 30) return { why: 'Inactif depuis plus de 30 jours', fix: 'Reprendre en douceur (1 post/jour)', sev: 'warn' }
    if (days > 14) return { why: 'Inactif depuis plus de 14 jours', fix: 'Republier progressivement', sev: 'warn' }
  } else {
    return { why: 'Aucune publication enregistrée', fix: 'Warmup puis premier post', sev: 'warn' }
  }
  return { why: 'À surveiller', fix: 'Garder une cadence prudente', sev: 'warn' }
}
