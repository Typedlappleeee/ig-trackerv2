// Persistance légère des réglages de composeur (Reels / Story / Photo…).
//
// Problème résolu : tous les réglages d'un composeur sont des useState remis à
// zéro à chaque montage/chargement → l'utilisateur refait toute sa config et
// recolle ses captions à chaque fois. Ce module stocke dans localStorage :
//   • le DERNIER réglage utilisé (auto-restauré à l'ouverture) ;
//   • des PRESETS nommés (config complète + pool de captions) rechargeables en 1 clic.
//
// Tout est cloisonné par composeur ET par contexte (org vs perso), pour qu'une
// org ne voie pas les presets d'une autre. Purement local (rapide, hors-ligne) ;
// aucune donnée n'est envoyée — on pourra basculer en DB plus tard si besoin.

export type ComposerPreset<T> = { name: string; config: T; savedAt: number }

function key(composer: string, orgId: string | null, kind: 'last' | 'presets'): string {
  return `sf-composer:${composer}:${orgId ?? 'perso'}:${kind}`
}

function readJson<T>(k: string, fallback: T): T {
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : fallback }
  catch { return fallback }
}
function writeJson(k: string, v: unknown): void {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* quota / mode privé : on ignore */ }
}

// ── Dernier réglage (auto-restore) ──────────────────────────────────────────
export function loadLast<T>(composer: string, orgId: string | null): T | null {
  return readJson<T | null>(key(composer, orgId, 'last'), null)
}
export function saveLast<T>(composer: string, orgId: string | null, config: T): void {
  writeJson(key(composer, orgId, 'last'), config)
}

// ── Presets nommés ──────────────────────────────────────────────────────────
export function loadPresets<T>(composer: string, orgId: string | null): ComposerPreset<T>[] {
  const list = readJson<ComposerPreset<T>[]>(key(composer, orgId, 'presets'), [])
  return Array.isArray(list) ? list : []
}
export function savePreset<T>(composer: string, orgId: string | null, name: string, config: T): ComposerPreset<T>[] {
  const clean = name.trim()
  if (!clean) return loadPresets<T>(composer, orgId)
  const list = loadPresets<T>(composer, orgId).filter(p => p.name.toLowerCase() !== clean.toLowerCase())
  list.unshift({ name: clean, config, savedAt: Date.now() })
  writeJson(key(composer, orgId, 'presets'), list.slice(0, 30)) // garde-fou
  return list.slice(0, 30)
}
export function deletePreset<T>(composer: string, orgId: string | null, name: string): ComposerPreset<T>[] {
  const list = loadPresets<T>(composer, orgId).filter(p => p.name.toLowerCase() !== name.trim().toLowerCase())
  writeJson(key(composer, orgId, 'presets'), list)
  return list
}
