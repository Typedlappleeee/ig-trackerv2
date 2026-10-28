import { describe, it, expect, vi, beforeEach } from 'vitest'

// Table iremotech_device_meta simulée (clé = scope_id|device_id) + canal temps réel.
type Row = { scope_id: string; is_org: boolean; device_id: string; containers: string[] }
type Cb = (p: { new: Partial<Row> }) => void
const H = vi.hoisted(() => ({ rows: new Map<string, Row>(), fail: false, listeners: [] as { filter: string; cb: Cb }[], channels: [] as string[], removed: 0 }))
vi.mock('./supabase', () => {
  const from = () => {
    let op: 'select' | 'upsert' = 'select'
    let payload: Row | null = null
    let scopeId: string | null = null
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: () => b,
      upsert: (r: Row) => { op = 'upsert'; payload = r; return b },
      eq: (_c: string, v: string) => { scopeId = v; return b },
      then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => {
        if (H.fail) return res({ data: null, error: { message: 'column "containers" does not exist' } })
        if (op === 'upsert' && payload) {
          const r = payload as Row
          H.rows.set(`${r.scope_id}|${r.device_id}`, r)
          for (const l of H.listeners) if (l.filter === `scope_id=eq.${r.scope_id}`) l.cb({ new: r })
          return res({ data: null, error: null })
        }
        void rej
        return res({ data: [...H.rows.values()].filter(r => r.scope_id === scopeId), error: null })
      },
    })
    return b
  }
  const channel = (name: string) => {
    H.channels.push(name)
    const ch = {
      on: (_e: string, o: { filter: string }, cb: Cb) => { H.listeners.push({ filter: o.filter, cb }); return ch },
      subscribe: () => ch,
    }
    return ch
  }
  return { supabase: { from, channel, removeChannel: async () => { H.removed++; H.listeners = [] } } }
})

import { setContainerScope, loadDevContainers, addDevContainer, removeDevContainer, pullContainers, subscribeContainers } from './irtContainers'
import { isDeviceOn } from './iremotech'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)) }, removeItem: (k: string) => { m.delete(k) }, clear: () => m.clear() } }
const flush = () => new Promise(r => setTimeout(r, 0))
beforeEach(() => {
  Object.assign(globalThis, { localStorage: mem() })
  H.rows.clear(); H.fail = false; H.listeners = []; H.channels = []; H.removed = 0
  setContainerScope('org1', 'u1')
})

describe('Containers iRemoTech partagés (temps réel)', () => {
  it('ajout / suppression envoyés à Supabase pour l’espace courant', async () => {
    addDevContainer('dev1', '12'); addDevContainer('dev1', 'Default'); await flush()
    expect(H.rows.get('org1|dev1')).toMatchObject({ is_org: true, containers: ['12', 'Default'] })
    removeDevContainer('dev1', '12'); await flush()
    expect(H.rows.get('org1|dev1')!.containers).toEqual(['Default'])
  })

  it('autre PC : retrouve les containers (plus de « 0c ») ; les containers locaux d’avant sont repris la 1re fois', async () => {
    H.rows.set('org1|dev1', { scope_id: 'org1', is_org: true, device_id: 'dev1', containers: ['1', '2'] })
    localStorage.setItem('sf-irt-containers:dev2', JSON.stringify(['vieux']))   // créé avant la synchro
    const r = await pullContainers(['dev1', 'dev2', 'dev3'])
    expect(r).toEqual({ dev1: ['1', '2'], dev2: ['vieux'], dev3: [] })
    expect(loadDevContainers('dev1')).toEqual(['1', '2'])
    await flush()
    expect(H.rows.get('org1|dev2')!.containers).toEqual(['vieux'])            // partagé aux autres
  })

  it('ensuite Supabase fait foi : une suppression faite ailleurs est suivie', async () => {
    H.rows.set('org1|dev1', { scope_id: 'org1', is_org: true, device_id: 'dev1', containers: ['1', '2'] })
    await pullContainers(['dev1'])
    H.rows.set('org1|dev1', { scope_id: 'org1', is_org: true, device_id: 'dev1', containers: ['2'] })
    expect((await pullContainers(['dev1']))!.dev1).toEqual(['2'])
    expect(loadDevContainers('dev1')).toEqual(['2'])
  })

  it('espace perso séparé de l’orga', async () => {
    setContainerScope(null, 'u1')
    addDevContainer('dev1', 'perso'); await flush()
    expect(H.rows.get('u1|dev1')).toMatchObject({ is_org: false, containers: ['perso'] })
    expect(H.rows.has('org1|dev1')).toBe(false)
  })

  it('SQL pas encore passé → null, on garde le cache local', async () => {
    localStorage.setItem('sf-irt-containers:dev1', JSON.stringify(['a']))
    H.fail = true
    expect(await pullContainers(['dev1'])).toBeNull()
    expect(loadDevContainers('dev1')).toEqual(['a'])
  })

  it('temps réel : modification ailleurs → callback + cache ; canaux distincts (Studio + Phone Farm)', async () => {
    const seen: [string, string[]][] = []
    const off1 = subscribeContainers((d, l) => seen.push([d, l]))
    const off2 = subscribeContainers(() => {})
    expect(new Set(H.channels).size).toBe(2)
    H.listeners[0].cb({ new: { scope_id: 'org1', device_id: 'dev9', containers: ['x', 'y'] } })
    expect(seen).toEqual([['dev9', ['x', 'y']]])
    expect(loadDevContainers('dev9')).toEqual(['x', 'y'])
    off1(); off2(); expect(H.removed).toBe(2)
  })
})

describe('État en ligne des iPhones', () => {
  it.each([
    ['online', true], ['ON', true], ['connected', true], ['reachable', true],
    ['offline', false], ['disconnected', false], ['unreachable', false], ['', false], [undefined, false],
  ])('%s → %s', (status, on) => { expect(isDeviceOn({ public_id: 'x', status })).toBe(on) })
})
