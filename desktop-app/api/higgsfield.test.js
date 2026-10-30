// Relais Genjutsu (/api/higgsfield) : accès Blowsome, comptes Higgsfield de l'espace (jetons jamais
// renvoyés), connexion OAuth, renouvellement du jeton, appels MCP, reels via la Veille, garde-fous.
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }))
import { createHandler } from './higgsfield.js'

function makeDb() {
  const t = { sf_hf_accounts: [], organizations: [], organization_members: [], profiles: [] }
  const objects = new Map()
  const users = new Map()
  function query(table) {
    const f = []
    let op = 'select', payload = null, maybe = false, wantRows = false
    const b = {
      select() { if (op !== 'select') wantRows = true; return b },
      insert(r) { op = 'insert'; payload = r; return b },
      update(r) { op = 'update'; payload = r; return b },
      delete() { op = 'delete'; return b },
      eq(k, v) { f.push(r => r[k] === v); return b },
      is(k, v) { f.push(r => (r[k] ?? null) === v); return b },
      order() { return b }, maybeSingle() { maybe = true; return b },
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
    }
    function run() {
      const m = r => f.every(fn => fn(r))
      if (op === 'insert') { t[table].push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload }); return { data: null, error: null } }
      if (op === 'update') { const l = t[table].filter(m); l.forEach(r => Object.assign(r, payload)); return { data: wantRows ? l.map(r => ({ id: r.id })) : null, error: null } }
      if (op === 'delete') { t[table] = t[table].filter(r => !m(r)); return { data: null, error: null } }
      const l = t[table].filter(m)
      return { data: maybe ? (l[0] ?? null) : l, error: null }
    }
    return b
  }
  const client = {
    from: query,
    auth: { getUser: async jwt => ({ data: { user: users.get(jwt) ?? null } }) },
    storage: { from: () => ({
      upload: async (path, buf) => { objects.set(path, Buffer.from(buf)); return { error: null } },
      createSignedUrl: async path => ({ data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/content/${path}?token=t` }, error: null }),
    }) },
  }
  return { t, objects, users, client }
}

// Higgsfield + Supabase simulés
function makeFetch(state) {
  const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...h } })
  return vi.fn(async (url, init = {}) => {
    const u = String(url)
    state.calls.push(u)
    if (u.endsWith('/rest/v1/rpc/my_license')) return json({ valid: true, blowsome: state.blowsome.has(String(init.headers.authorization).slice(7)) })
    if (u.endsWith('/.well-known/oauth-authorization-server')) return json({ registration_endpoint: 'https://mcp.higgsfield.ai/register', authorization_endpoint: 'https://mcp.higgsfield.ai/authorize', token_endpoint: 'https://mcp.higgsfield.ai/token' })
    if (u === 'https://mcp.higgsfield.ai/register') { state.registered = JSON.parse(init.body); return json({ client_id: 'cid-9' }) }
    if (u === 'https://mcp.higgsfield.ai/token') {
      const p = new URLSearchParams(init.body)
      if (p.get('grant_type') === 'authorization_code') return json(p.get('code') === 'good' ? { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 } : { error: 'invalid_grant' }, p.get('code') === 'good' ? 200 : 400)
      state.refreshes++
      return json({ access_token: `at-r${state.refreshes}`, refresh_token: `rt-r${state.refreshes}`, expires_in: 3600 })
    }
    if (u === 'https://mcp.higgsfield.ai/mcp') {
      const tok = String(init.headers.authorization).slice(7)
      state.mcpTokens.push(tok)
      if (state.revoked.has(tok)) return new Response('unauthorized', { status: 401 })
      const rpc = JSON.parse(init.body)
      return json({ jsonrpc: '2.0', id: rpc.id, result: { structuredContent: { ok: true, method: rpc.method } } }, 200, { 'mcp-session-id': 'sess-1' })
    }
    if (u.endsWith('/functions/v1/run-scheduled-posts')) return json(JSON.parse(init.body).code === 'NOVID' ? { ok: true, videoUrl: null } : { ok: true, videoUrl: 'https://scontent.cdninstagram.com/v/abc.mp4' })
    if (u.startsWith('https://scontent.cdninstagram.com/')) return new Response(Buffer.alloc(5000, 1), { status: 200, headers: { 'content-type': 'video/mp4' } })
    return new Response('not found', { status: 404 })
  })
}

function call(handler, body, auth = 'jwt-user') {
  const req = { method: 'POST', headers: { authorization: `Bearer ${auth}` }, body }
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(s) { resolve({ status: this.statusCode, body: s ? JSON.parse(s) : null }) } }
    handler(req, res)
  })
}

let D, S, H, ORG, USER
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://proj.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
  D = makeDb(); ORG = crypto.randomUUID(); USER = crypto.randomUUID()
  D.t.organizations.push({ id: ORG, owner_id: USER })
  D.users.set('jwt-user', { id: USER }); D.users.set('jwt-other', { id: crypto.randomUUID() })
  S = { calls: [], blowsome: new Set(['jwt-user']), refreshes: 0, mcpTokens: [], revoked: new Set(), registered: null }
  H = createHandler({ fetcher: makeFetch(S), database: () => D.client })
})

describe('Relais Genjutsu', () => {
  it('session obligatoire, accès Blowsome obligatoire', async () => {
    expect((await call(H, { op: 'accounts' }, 'nope')).status).toBe(401)
    const r = await call(H, { op: 'accounts' }, 'jwt-other')
    expect(r.status).toBe(403); expect(r.body.code).toBe('blowsome')
  })

  it('connexion d’un compte : adresse de retour locale seulement, jetons gardés côté serveur', async () => {
    expect((await call(H, { op: 'login_start', redirect: 'https://evil.example/cb', state: 's', challenge: 'c', org_id: ORG })).status).toBe(400)
    const st = await call(H, { op: 'login_start', redirect: 'http://127.0.0.1:33418/callback', state: 's1', challenge: 'c1', org_id: ORG })
    expect(st.body.ok).toBe(true)
    expect(st.body.url).toContain('code_challenge=c1'); expect(st.body.url).toContain('state=s1')
    expect(S.registered.redirect_uris).toEqual(['http://127.0.0.1:33418/callback'])
    const bad = await call(H, { op: 'login_finish', name: 'Compte A', code: 'bad', redirect: 'http://127.0.0.1:33418/callback', client_id: 'cid-9', verifier: 'v', org_id: ORG })
    expect(bad.body.ok).toBe(false)
    const ok = await call(H, { op: 'login_finish', name: 'Compte A', code: 'good', redirect: 'http://127.0.0.1:33418/callback', client_id: 'cid-9', verifier: 'v', org_id: ORG })
    expect(ok.body).toEqual({ ok: true, name: 'Compte A' })
    expect(D.t.sf_hf_accounts[0]).toMatchObject({ space_org: ORG, owner_id: USER, access_token: 'at-1', refresh_token: 'rt-1' })
    const list = await call(H, { op: 'accounts', org_id: ORG })
    expect(list.body.accounts.map(a => a.name)).toEqual(['Compte A'])
    expect(JSON.stringify(list.body)).not.toContain('at-1')
    // autre espace (perso) : ne voit pas le compte de l'organisation
    expect((await call(H, { op: 'accounts' })).body.accounts).toEqual([])
  })

  it('MCP : jeton expiré renouvelé, jeton refusé (401) renouvelé puis rejoué', async () => {
    D.t.sf_hf_accounts.push({ id: 'a1', space_org: ORG, owner_id: USER, name: 'K', client_id: 'cid', access_token: 'old', refresh_token: 'rt', expires_at: new Date(Date.now() - 1000).toISOString(), updated_at: 'u0', created_at: 'c' })
    const r1 = await call(H, { op: 'mcp', account: 'K', rpc: { jsonrpc: '2.0', id: 1, method: 'initialize' }, org_id: ORG })
    expect(r1.body).toMatchObject({ ok: true, session: 'sess-1' })
    expect(S.mcpTokens.at(-1)).toBe('at-r1')
    S.revoked.add('at-r1')
    const r2 = await call(H, { op: 'mcp', account: 'K', session: 'sess-1', rpc: { jsonrpc: '2.0', id: 2, method: 'tools/call' }, org_id: ORG })
    expect(r2.body.ok).toBe(true)
    expect(S.mcpTokens.slice(-2)).toEqual(['at-r1', 'at-r2'])
    expect((await call(H, { op: 'mcp', account: 'Inconnu', rpc: {}, org_id: ORG })).status).toBe(404)
  })

  it('reel : vidéo via la Veille, copiée dans le stockage de l’espace', async () => {
    const r = await call(H, { op: 'reel', url: 'https://www.instagram.com/reel/ABC123/?igsh=x', org_id: ORG })
    expect(r.body.ok).toBe(true)
    expect(r.body.url).toContain(`videos/orgs/${ORG}/genjutsu/sources/`)
    expect([...D.objects.keys()][0]).toMatch(new RegExp(`^videos/orgs/${ORG}/genjutsu/sources/`))
    expect((await call(H, { op: 'reel', url: 'https://www.instagram.com/reel/NOVID/', org_id: ORG })).body.ok).toBe(false)
    expect((await call(H, { op: 'reel', url: 'https://tiktok.com/x', org_id: ORG })).status).toBe(400)
  })

  it('résultats : seulement des adresses Higgsfield ; retrait réservé aux admins de l’espace', async () => {
    expect((await call(H, { op: 'keep', url: 'https://evil.example/x.mp4', org_id: ORG })).status).toBe(400)
    const member = crypto.randomUUID(); D.users.set('jwt-member', { id: member }); S.blowsome.add('jwt-member')
    D.t.organization_members.push({ org_id: ORG, user_id: member, role: 'member' })
    D.t.sf_hf_accounts.push({ id: 'a2', space_org: ORG, owner_id: USER, name: 'K2', client_id: 'c', created_at: 'c' })
    expect((await call(H, { op: 'remove', name: 'K2', org_id: ORG }, 'jwt-member')).status).toBe(403)
    expect((await call(H, { op: 'remove', name: 'K2', org_id: ORG })).body.ok).toBe(true)
    expect(D.t.sf_hf_accounts).toHaveLength(0)
  })
})
