// Rotation d'IP proxy — config par org (ou perso). Porté de electron-app.
// Chaque org enregistre ses « Change IP URL ». Quand activée, l'app appelle ces
// URLs AVANT chaque boot de téléphone (posting/story/cross/warmup/login) pour
// repartir sur une IP fraîche. Stocké en JSON { enabled, urls, names } dans la
// colonne `proxy` de app_config / org_config (même format que le web).
import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { OrgState } from './data'

export interface ProxyRotationConfig { enabled: boolean; urls: string[]; names?: string[] }
export interface RotationProxy { url: string; label: string }
const EMPTY: ProxyRotationConfig = { enabled: false, urls: [] }

// Cache module-level : les fonctions de posting (hors React) lisent la config ici.
let _cache: ProxyRotationConfig = { ...EMPTY }
export function getProxyRotation(): ProxyRotationConfig { return _cache }
export function activeRotationUrls(): string[] {
  return _cache.enabled ? _cache.urls.filter(u => /^https?:\/\//i.test(u.trim())).map(u => u.trim()) : []
}
function hostLabel(url: string, i: number): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return `Proxy ${i + 1}` }
}
export function listRotationProxies(): RotationProxy[] {
  const c = _cache
  if (!c.enabled) return []
  return c.urls.map((u, i) => ({ url: u.trim(), label: (c.names?.[i]?.trim()) || hostLabel(u.trim(), i) }))
    .filter(p => /^https?:\/\//i.test(p.url))
}
export function resolveRotationUrls(selected?: string[] | null): string[] {
  const all = activeRotationUrls()
  if (!selected || selected.length === 0) return all
  const set = new Set(selected.map(s => s.trim()))
  const picked = all.filter(u => set.has(u.trim()))
  return picked.length ? picked : all
}

function parse(raw: string | null | undefined): ProxyRotationConfig {
  const s = (raw ?? '').trim()
  if (!s) return { ...EMPTY }
  try {
    const j = JSON.parse(s)
    if (j && typeof j === 'object' && Array.isArray(j.urls)) {
      const urls = j.urls.filter((u: unknown) => typeof u === 'string') as string[]
      const names = Array.isArray(j.names) ? urls.map((_, i) => (typeof j.names[i] === 'string' ? j.names[i] : '')) : undefined
      return { enabled: !!j.enabled, urls, names }
    }
  } catch { /* ancienne valeur texte = 1 URL */ }
  return /^https?:\/\//i.test(s) ? { enabled: true, urls: [s] } : { ...EMPTY }
}
function cleanPairs(cfg: ProxyRotationConfig): { urls: string[]; names: string[] } {
  const pairs = cfg.urls.map((u, i) => ({ u: u.trim(), n: (cfg.names?.[i] ?? '').trim() })).filter(p => p.u)
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
      : supabase.from('app_config').select('proxy').eq('user_id', userId).is('org_id', null).maybeSingle()
    const { data } = await q
    _cache = parse((data as { proxy?: string } | null)?.proxy)
    return _cache
  } catch { return { ..._cache } }
}
export async function saveProxyRotation(orgId: string | null, userId: string, cfg: ProxyRotationConfig): Promise<{ ok: boolean; error?: string }> {
  const { urls, names } = cleanPairs(cfg)
  _cache = { enabled: cfg.enabled, urls, names }
  const proxy = serialize(_cache)
  try {
    if (orgId) { const { error } = await supabase.from('org_config').update({ proxy }).eq('org_id', orgId); if (error) return { ok: false, error: error.message } }
    else { const { error } = await supabase.from('app_config').upsert({ user_id: userId, proxy }, { onConflict: 'user_id' }); if (error) return { ok: false, error: error.message } }
    return { ok: true }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Échec' } }
}

// Test d'un proxy : appelle sa Change-IP URL (desktop = direct, pas de CORS).
export async function testRotationUrl(url: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await fetch(url.trim(), { signal: AbortSignal.timeout(15000) })
    return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` }
  } catch (e) { return { ok: false, detail: e instanceof Error ? e.message : 'injoignable' } }
}

// Hook React : charge la config + expose setter/save.
export function useProxyRotation(user: User, org: OrgState) {
  const { currentOrg } = org
  const [cfg, setCfg] = useState<ProxyRotationConfig>({ ..._cache })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadProxyRotation(currentOrg?.id ?? null, user.id).then(c => { if (!cancelled) { setCfg(c); setLoading(false) } })
    return () => { cancelled = true }
  }, [currentOrg?.id, user.id])
  const save = useCallback(async (c: ProxyRotationConfig) => {
    setCfg(c)
    return saveProxyRotation(currentOrg?.id ?? null, user.id, c)
  }, [currentOrg?.id, user.id])
  return { cfg, setCfg, save, loading }
}
