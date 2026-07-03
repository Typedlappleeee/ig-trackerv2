/**
 * Rotation d'IP proxy — config par organisation (ou par utilisateur en solo).
 *
 * Chaque org enregistre UNE FOIS son/ses « Change IP URL » (ex. Prox'Easy :
 * https://dongle.proxeasy.tech/android/changeip?u=…). Quand la rotation est
 * activée, l'app appelle ces URLs AVANT chaque post (mass posting, story,
 * reels IG/TikTok, programmation) pour repartir sur une IP fraîche.
 *
 * Stockage : réutilise la colonne `proxy` (texte, inutilisée) de
 * app_config / org_config — aucune migration nécessaire. On y met un JSON
 * { enabled, urls[] }. Rétro-compatible : si l'ancienne valeur était une simple
 * chaîne, on la traite comme une URL unique.
 */
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { useOrg } from './orgContext'

export interface ProxyRotationConfig {
  enabled: boolean
  urls:    string[]
}

const EMPTY: ProxyRotationConfig = { enabled: false, urls: [] }

// ── Cache module-level ───────────────────────────────────────────────────────
// Les fonctions de posting (geelark.ts, MassPosting, scheduler…) ne sont pas
// toujours dans l'arbre React → elles lisent la config via ce cache synchrone,
// mis à jour à chaque chargement/sauvegarde.
let _cache: ProxyRotationConfig = { ...EMPTY }
export function getProxyRotation(): ProxyRotationConfig { return _cache }
// URLs effectivement à roter (uniquement si activé et non vides).
export function activeRotationUrls(): string[] {
  return _cache.enabled ? _cache.urls.filter(u => /^https?:\/\//i.test(u.trim())) : []
}

function parse(raw: string | null | undefined): ProxyRotationConfig {
  if (!raw) return { ...EMPTY }
  const s = raw.trim()
  if (!s) return { ...EMPTY }
  try {
    const j = JSON.parse(s)
    if (j && typeof j === 'object' && Array.isArray(j.urls)) {
      return { enabled: !!j.enabled, urls: j.urls.filter((u: unknown) => typeof u === 'string') }
    }
  } catch { /* pas du JSON → ancienne valeur texte = 1 URL */ }
  return /^https?:\/\//i.test(s) ? { enabled: true, urls: [s] } : { ...EMPTY }
}

function serialize(cfg: ProxyRotationConfig): string {
  return JSON.stringify({ enabled: cfg.enabled, urls: cfg.urls.map(u => u.trim()).filter(Boolean) })
}

export async function loadProxyRotation(orgId: string | null, userId: string): Promise<ProxyRotationConfig> {
  try {
    const q = orgId
      ? supabase.from('org_config').select('proxy').eq('org_id', orgId).maybeSingle()
      : supabase.from('app_config').select('proxy').eq('user_id', userId).is('org_id' as never, null as never).maybeSingle()
    const { data } = await q
    const cfg = parse((data as { proxy?: string } | null)?.proxy)
    _cache = cfg
    return cfg
  } catch {
    return { ..._cache }
  }
}

export async function saveProxyRotation(orgId: string | null, userId: string, cfg: ProxyRotationConfig): Promise<void> {
  const clean: ProxyRotationConfig = { enabled: cfg.enabled, urls: cfg.urls.map(u => u.trim()).filter(Boolean) }
  _cache = clean
  const proxy = serialize(clean)
  if (orgId) {
    await supabase.from('org_config').update({ proxy }).eq('org_id', orgId)
  } else {
    // upsert : la ligne app_config existe déjà (bearer…), sinon on la crée.
    await supabase.from('app_config').upsert({ user_id: userId, proxy }, { onConflict: 'user_id' })
  }
}

// ── Hook React ───────────────────────────────────────────────────────────────
export function useProxyRotation(user: User) {
  const { currentOrg } = useOrg()
  const [cfg, setCfg]     = useState<ProxyRotationConfig>({ ...EMPTY })
  const [loading, setLoad] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoad(true)
    loadProxyRotation(currentOrg?.id ?? null, user.id).then(c => {
      if (!cancelled) { setCfg(c); setLoad(false) }
    })
    return () => { cancelled = true }
  }, [currentOrg?.id, user.id])

  async function save(next: ProxyRotationConfig) {
    setCfg(next)
    await saveProxyRotation(currentOrg?.id ?? null, user.id, next)
  }

  return { cfg, setCfg, save, loading }
}
