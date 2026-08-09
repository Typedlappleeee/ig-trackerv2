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
  names?:  string[]   // libellé optionnel par proxy, aligné sur urls[] (ex. « Dongle salon »)
}

// Un proxy configuré, prêt à être affiché/choisi (URL valide + libellé lisible).
export interface RotationProxy { url: string; label: string }

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

// Libellé par défaut d'un proxy quand aucun nom n'est saisi : son hostname.
function hostLabel(url: string, i: number): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return `Proxy ${i + 1}` }
}

// Liste des proxies configurés (actifs), avec leur libellé — pour le sélecteur.
// Vide si la rotation n'est pas activée (rien à choisir).
export function listRotationProxies(): RotationProxy[] {
  const c = _cache
  if (!c.enabled) return []
  return c.urls
    .map((u, i) => ({ url: u.trim(), label: (c.names?.[i]?.trim()) || hostLabel(u.trim(), i) }))
    .filter(p => /^https?:\/\//i.test(p.url))
}

// Résout les URLs à roter pour UN lancement précis selon la sélection de proxies.
// `selected` vide/absent = tous les proxies actifs (rétro-compatible). Sinon on ne
// rote QUE les proxies choisis → permet plusieurs postings en parallèle sur des
// proxies différents sans qu'un run change l'IP d'un proxy utilisé par un autre.
export function resolveRotationUrls(selected?: string[] | null): string[] {
  const all = activeRotationUrls()
  if (!selected || selected.length === 0) return all
  const set = new Set(selected.map(s => s.trim()))
  const picked = all.filter(u => set.has(u.trim()))
  return picked.length ? picked : all   // sélection qui ne matche rien → repli sur tout
}

function parse(raw: string | null | undefined): ProxyRotationConfig {
  if (!raw) return { ...EMPTY }
  const s = raw.trim()
  if (!s) return { ...EMPTY }
  try {
    const j = JSON.parse(s)
    if (j && typeof j === 'object' && Array.isArray(j.urls)) {
      const urls = j.urls.filter((u: unknown) => typeof u === 'string') as string[]
      const names = Array.isArray(j.names)
        ? urls.map((_, i) => (typeof j.names[i] === 'string' ? j.names[i] : ''))
        : undefined
      return { enabled: !!j.enabled, urls, names }
    }
  } catch { /* pas du JSON → ancienne valeur texte = 1 URL */ }
  return /^https?:\/\//i.test(s) ? { enabled: true, urls: [s] } : { ...EMPTY }
}

// Zippe url+nom et retire les lignes vides EN GARDANT l'alignement url↔nom.
function cleanPairs(cfg: ProxyRotationConfig): { urls: string[]; names: string[] } {
  const pairs = cfg.urls
    .map((u, i) => ({ u: u.trim(), n: (cfg.names?.[i] ?? '').trim() }))
    .filter(p => p.u)
  return { urls: pairs.map(p => p.u), names: pairs.map(p => p.n) }
}

function serialize(cfg: ProxyRotationConfig): string {
  const { urls, names } = cleanPairs(cfg)
  return JSON.stringify({ enabled: cfg.enabled, urls, names })
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
  const { urls, names } = cleanPairs(cfg)
  const clean: ProxyRotationConfig = { enabled: cfg.enabled, urls, names }
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
