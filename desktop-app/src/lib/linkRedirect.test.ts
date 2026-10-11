import { describe, it, expect, vi, beforeEach } from 'vitest'
const H = vi.hoisted(() => ({ inserts: [] as any[], links: [] as any[], pages: [] as any[] }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => {
      const f: Record<string, unknown> = {}
      const b: any = {
        select: () => b, eq: (k: string, v: unknown) => { f[k] = v; return b },
        maybeSingle: async () => ({ data: (t === 'tracked_links' ? H.links : H.pages).find(r => Object.entries(f).every(([k, v]) => r[k] === v)) ?? null }),
        insert: (r: any) => { H.inserts.push(r); return Promise.resolve({ error: null }) },
      }
      return b
    },
  }),
}))
process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
// @ts-expect-error fonction serverless en JS
import handler from '../../api/l.js'

function call(path: string, ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari') {
  const res: any = { headers: {} as Record<string, string>, statusCode: 0, body: '', setHeader(k: string, v: string) { this.headers[k] = v }, end(b?: string) { this.body = b ?? '' } }
  return handler({ url: path, headers: { 'user-agent': ua, host: 'lnk.test', 'x-vercel-ip-country': 'FR' } }, res).then(() => res)
}

beforeEach(() => {
  H.inserts = []
  H.pages = [{ id: 'pg1', slug: 'lea', title: 'Léa', bio: 'Hello', avatar_url: null, active: true, buttons: [{ label: 'Mon OF', url: 'https://onlyfans.com/lea' }, { label: 'Telegram', url: 'https://t.me/lea' }] }]
  H.links = [{ id: 'l1', code: 'lea-ig07', page_id: 'pg1', destination: null }, { id: 'l2', code: 'direct', page_id: null, destination: 'https://example.com/x' }]
})

describe('liens suivis /l/<code>', () => {
  it('lien d’un compte → page de liens, visite comptée pour ce compte', async () => {
    const r = await call('/api/l?p=lea-ig07')
    expect(r.statusCode).toBe(200)
    expect(r.body).toContain('Mon OF'); expect(r.body).toContain('class="pill first"')
    expect(r.body).toMatch(/\/l\/lea-ig07\?b=0&amp;v=[0-9a-f-]{36}/)
    expect(H.inserts[0]).toMatchObject({ link_id: 'l1', page_id: 'pg1', button: null, country: 'FR', device: 'ios', bot: false })
  })
  it('clic sur un bouton → redirection 302 vers sa vraie destination, clic compté', async () => {
    const r = await call('/api/l?p=lea-ig07&b=0')
    expect(r.statusCode).toBe(302)
    expect(r.headers.Location).toBe('https://onlyfans.com/lea')
    expect(H.inserts[0]).toMatchObject({ link_id: 'l1', button: 0 })
  })
  it('lien d’un compte : ses propres URL de boutons (ex. son lien OF de suivi)', async () => {
    H.links[0].overrides = { 0: 'https://onlyfans.com/lea/c133' }
    const r = await call('/api/l?p=lea-ig07&b=0&v=11111111-2222-3333-4444-555555555555')
    expect(r.headers.Location).toBe('https://onlyfans.com/lea/c133')
    expect(H.inserts[0].visit_id).toBe('11111111-2222-3333-4444-555555555555')
  })
  it('lien direct → 302', async () => {
    const r = await call('/api/l?p=direct')
    expect(r.statusCode).toBe(302); expect(r.headers.Location).toBe('https://example.com/x')
  })
  it('robot d’aperçu Instagram/Facebook → compté comme robot', async () => {
    await call('/api/l?p=lea', 'facebookexternalhit/1.1')
    expect(H.inserts[0].bot).toBe(true)
  })
  it('navigateur intégré d’Instagram (iPhone) → page « Ouvrir dans Safari », pas encore de clic compté', async () => {
    const r = await call('/api/l?p=lea-ig07&b=0', 'Mozilla/5.0 (iPhone) Instagram 300.0')
    expect(r.body).toContain('x-safari-https://lnk.test/l/lea-ig07?b=0&amp;x=1')
    expect(H.inserts.length).toBe(0)
  })
  it('Android dans Instagram → ouverture Chrome (intent)', async () => {
    const r = await call('/api/l?p=lea', 'Mozilla/5.0 (Linux; Android 14) Instagram 300.0')
    expect(r.body).toContain('intent://lnk.test/l/lea?x=1#Intent;scheme=https;package=com.android.chrome')
  })
  it('code inconnu / invalide → 404', async () => {
    expect((await call('/api/l?p=nope')).statusCode).toBe(404)
    expect((await call('/api/l?p=../etc')).statusCode).toBe(404)
  })
})
