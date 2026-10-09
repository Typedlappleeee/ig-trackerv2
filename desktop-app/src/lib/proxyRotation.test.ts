import { describe, it, expect, vi, beforeEach } from 'vitest'

// Base simulée fidèle à la prod : app_config n'a PAS de colonne org_id ; org_config
// n'accepte l'écriture que pour un admin (RLS) et peut ne pas avoir de ligne.
const H = vi.hoisted(() => ({
  db: { app_config: new Map<string, { proxy: string }>(), org_config: new Map<string, { proxy: string }>() },
  admin: true,
}))
vi.mock('./supabase', () => {
  const from = (table: 'app_config' | 'org_config') => {
    const filters: [string, string, unknown][] = []
    let op: 'select' | 'upsert' = 'select', row: Record<string, string> | null = null
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return b },
      is: (c: string, v: unknown) => { filters.push(['is', c, v]); return b },
      upsert: (r: Record<string, string>) => { op = 'upsert'; row = r; return b },
      maybeSingle: () => b,
      then: (res: (v: unknown) => void) => {
        const key = table === 'app_config' ? 'user_id' : 'org_id'
        if (filters.some(f => f[1] === 'org_id') && table === 'app_config') return res({ data: null, error: { message: 'column app_config.org_id does not exist' } })
        if (op === 'upsert') {
          if (table === 'org_config' && !H.admin) return res({ data: null, error: { message: 'new row violates row-level security policy for table "org_config"' } })
          H.db[table].set(row![key], { proxy: row!.proxy })
          return res({ data: [{ [key]: row![key] }], error: null })
        }
        const id = filters.find(f => f[1] === key)?.[2] as string
        return res({ data: H.db[table].get(id) ?? null, error: null })
      },
    })
    return b
  }
  return { supabase: { from } }
})
vi.mock('./platform', () => ({ IS_WEB: true }))
import { loadProxyRotation, saveProxyRotation, activeRotationUrls } from './proxyRotation'

const CFG = { enabled: true, urls: ['https://i.fxdx.in/actionlinks/do/changeip/abc'], names: ['PE-2316'] }

describe('rotation proxy — sauvegarde et relecture', () => {
  beforeEach(() => { H.db.app_config.clear(); H.db.org_config.clear(); H.admin = true })

  it('compte perso : enregistré puis relu après rechargement (bug « ne sauvegarde pas »)', async () => {
    expect((await saveProxyRotation(null, 'u1', CFG)).ok).toBe(true)
    const c = await loadProxyRotation(null, 'u1')
    expect(c.urls).toEqual(CFG.urls)
    expect(c.names).toEqual(['PE-2316'])
    expect(activeRotationUrls()).toEqual(CFG.urls)          // la rotation est bien appliquée aux posts
  })
  it('organisation sans ligne de config : créée par upsert', async () => {
    expect((await saveProxyRotation('o1', 'u1', CFG)).ok).toBe(true)
    expect((await loadProxyRotation('o1', 'u1')).urls).toEqual(CFG.urls)
  })
  it('membre non admin : message clair au lieu d’un faux « Enregistré »', async () => {
    H.admin = false
    const r = await saveProxyRotation('o1', 'u1', CFG)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/propriétaire ou un admin/)
  })
  it('plus aucune config en base : rotation désactivée', async () => {
    await saveProxyRotation(null, 'u1', CFG)
    H.db.app_config.clear()
    await loadProxyRotation(null, 'u1')                     // ligne absente = config vide (lecture OK)
    expect(activeRotationUrls()).toEqual([])
  })
})
