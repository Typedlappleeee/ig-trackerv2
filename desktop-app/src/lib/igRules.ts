// Règles Instagram partagées (édition en masse, Flow Builder, primitives ADB). Pur, sans dépendance.

export function usernameIssue(handle: string): string | null {
  const h = handle.trim().replace(/^@/, '')
  if (!h) return 'Pseudo vide'
  if (h.length > 30) return `Pseudo trop long « ${h} » (30 caractères max)`
  if (!/^[a-zA-Z0-9._]+$/.test(h)) return `Pseudo invalide « ${h} » (lettres, chiffres, . et _ seulement)`
  if (h.startsWith('.') || h.endsWith('.')) return `Pseudo invalide « ${h} » (ne peut pas commencer ni finir par un point)`
  if (h.includes('..')) return `Pseudo invalide « ${h} » (deux points à la suite interdits)`
  return null
}

/** Chiffres aléatoires d'un gabarit de pseudo : « lea{4} » → « lea4821 ». */
export function expandUsername(tpl: string): string {
  return tpl.replace(/\{(\d{1,2})\}/g, (_, n) => Array.from({ length: Math.min(12, +n) }, () => Math.floor(Math.random() * 10)).join(''))
}
export const hasRandom = (s: string) => /\{\d{1,2}\}/.test(s)

/** Problème d'un gabarit de pseudo AVANT de démarrer un téléphone (longueur après expansion, caractères, points). */
export function usernameTemplateIssue(tpl: string): string | null {
  const t = tpl.trim().replace(/^@/, '')
  // Expansion « pire cas » : chaque {n} devient n chiffres (max 12).
  return usernameIssue(t.replace(/\{(\d{1,2})\}/g, (_, n) => '0'.repeat(Math.min(12, +n))))
}

/** Problèmes d'une liste de pseudos pour `nPhones` comptes (chaque compte doit avoir un @ unique). */
export function usernameListIssues(ls: string[], nPhones: number): string[] {
  const out: string[] = []
  for (const l of ls) { const e = usernameTemplateIssue(l); if (e) out.push(e) }
  if (nPhones > 0 && ls.length < nPhones && !ls.every(hasRandom)) out.push(`${ls.length} pseudo(s) pour ${nPhones} compte(s) — ajoute-en ou utilise {4} pour des chiffres aléatoires.`)
  const fixed = ls.filter(l => !hasRandom(l)).map(l => l.trim().replace(/^@/, '').toLowerCase())
  if (new Set(fixed).size < fixed.length) out.push('Le même pseudo est utilisé deux fois — chaque compte doit avoir un @ unique.')
  return out
}
