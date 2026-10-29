// API ScaleFlow Link : deux espaces (A = ScaleFlow de l'utilisateur, B = « site du staff » qui
// parle le même contrat) dans une banque Supabase simulée en mémoire. On vérifie la clé, la
// lecture des dossiers/fichiers, l'envoi A → B, l'import B → A, l'isolation et l'anti-SSRF.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const H = vi.hoisted(() => ({ db: null }))
vi.mock('node:dns/promises', () => ({
  lookup: async host => {
    if (host === 'evil-dns.test') return [{ address: '10.0.0.7', family: 4 }]
    if (host === 'cgnat.test') return [{ address: '100.64.1.2', family: 4 }]
    return [{ address: '93.184.216.34', family: 4 }]
  },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => H.db.client() }))

import { createHash } from 'node:crypto'
import v1 from './v1.js'
import link from './link.js'

// ── Supabase simulé (tables + stockage « content » + auth) ────────────────────────
function makeDb() {
  const t = { content_bank: [], sf_api_tokens: [], sf_link_partners: [], organizations: [], organization_members: [] }
  const objects = new Map()          // chemin → { bytes, type }
  const sessions = new Map()         // jeton de session → user
  let quotaFull = false
  const STORE = 'https://proj.supabase.co/storage/v1/object/sign/content/'
  function query(table) {
    let rows = () => t[table]
    const f = []
    let op = 'select', payload = null, single = false, maybe = false, range = null, sel = null
    const b = {
      select(c) { if (op === 'select' || op === 'insert') sel = c; return b },
      insert(r) { op = 'insert'; payload = Array.isArray(r) ? r : [r]; return b },
      update(r) { op = 'update'; payload = r; return b },
      eq(k, v) { f.push(r => r[k] === v); return b },
      is(k, v) { f.push(r => (r[k] ?? null) === v); return b },
      in(k, vs) { f.push(r => vs.includes(r[k])); return b },
      or(expr) { if (expr.startsWith('notes.is.null')) f.push(r => !r.notes || !['__sf_folder__', '__sf_drive_folder__'].includes(r.notes)); return b },
      order() { return b }, limit(n) { range = [0, n - 1]; return b }, range(a, z) { range = [a, z]; return b },
      single() { single = true; return b }, maybeSingle() { maybe = true; return b },
      then(res, rej) { return Promise.resolve(run()).then(res, rej) },
    }
    function run() {
      if (op === 'insert') {
        const out = payload.map(r => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), deleted_at: null, ...r }))
        t[table].push(...out)
        return { data: single ? out[0] : out, error: null }
      }
      let list = rows().filter(r => f.every(fn => fn(r)))
      if (op === 'update') { list.forEach(r => Object.assign(r, payload)); return { data: null, error: null } }
      list = [...list].sort((a, z) => String(z.created_at).localeCompare(String(a.created_at)))
      if (range) list = list.slice(range[0], range[1] + 1)
      if (single || maybe) return { data: list[0] ?? null, error: null }
      return { data: list, error: null }
    }
    return b
  }
  const client = () => ({
    from: query,
    rpc: async (name, args) => name === 'bank_can_upload' ? { data: !quotaFull && /^videos\/(users|orgs)\//.test(args.p_name), error: null } : { data: null, error: { message: 'unknown' } },
    auth: { getUser: async jwt => ({ data: { user: sessions.get(jwt) ?? null } }) },
    storage: {
      from: () => ({
        upload: async (path, buf, o) => { if (objects.has(path)) return { error: { message: 'exists' } }; objects.set(path, { bytes: Buffer.from(buf), type: o?.contentType }); return { error: null } },
        remove: async paths => { paths.forEach(p => objects.delete(p)); return { error: null } },
        createSignedUrls: async paths => ({ data: paths.map(p => ({ path: p, signedUrl: objects.has(p) ? STORE + p + '?token=t' : null })) }),
        createSignedUploadUrl: async path => ({ data: { signedUrl: STORE + path + '?upload=1', token: 'up' }, error: null }),
        list: async (dir, o) => ({ data: [...objects.keys()].filter(k => k.startsWith(dir + '/')).map(k => ({ name: k.slice(dir.length + 1) })).filter(x => !o?.search || x.name.includes(o.search)) }),
      }),
    },
  })
  return { t, objects, sessions, client, STORE, setQuotaFull: v => { quotaFull = v } }
}

// ── Appels HTTP simulés : v1 (ScaleFlow) et le « site staff » (même contrat, autre espace) ──
function call(handler, { method = 'GET', path = '', query = {}, body, auth }) {
  const qs = new URLSearchParams({ ...(path ? { r: path } : {}), ...query })
  const req = { method, url: `/api/x?${qs}`, headers: { authorization: auth }, body }
  return new Promise(resolve => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v }, end(s) { resolve({ status: this.statusCode, body: s && this.headers['content-type']?.includes('json') ? JSON.parse(s) : s }) } }
    handler(req, res)
  })
}
const tok = () => 'sf_' + [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join('')
const hash = s => createHash('sha256').update(s).digest('hex')

let D, ORG_A, ORG_B, USER, TOKEN_A, TOKEN_B, fetchLog
beforeEach(() => {
  D = makeDb(); H.db = D
  process.env.SUPABASE_URL = 'https://proj.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
  ORG_A = crypto.randomUUID(); ORG_B = crypto.randomUUID(); USER = crypto.randomUUID()
  const staff = crypto.randomUUID()
  D.t.organizations.push({ id: ORG_A, owner_id: USER }, { id: ORG_B, owner_id: staff })
  TOKEN_A = tok(); TOKEN_B = tok()
  D.t.sf_api_tokens.push(
    { id: 'ta', owner_id: USER, space_org: ORG_A, token_hash: hash(TOKEN_A), revoked_at: null },
    { id: 'tb', owner_id: staff, space_org: ORG_B, token_hash: hash(TOKEN_B), revoked_at: null },
  )
  // Le « site staff » expose l'API v1 sur https://staff.example.com/api/scaleflow avec la clé B.
  D.t.sf_link_partners.push({ owner_id: USER, space_org: ORG_A, name: 'Staff', base_url: 'https://staff.example.com/api/scaleflow', api_key: TOKEN_B })
  D.sessions.set('jwt-user', { id: USER })
  // Banque A : 3 vidéos dans « Montage », 1 hors dossier. Banque B : 2 vidéos dans « VA ».
  const add = (org, owner, folder, name, bytes) => {
    const path = `videos/orgs/${org}/${crypto.randomUUID()}.mp4`
    D.objects.set(path, { bytes: Buffer.from(bytes), type: 'video/mp4' })
    D.t.content_bank.push({ id: crypto.randomUUID(), org_id: org, user_id: owner, title: name, folder, storage_path: path, thumbnail_path: null, file_url: null, notes: null, created_at: new Date(Date.now() - D.t.content_bank.length * 1000).toISOString(), deleted_at: null })
  }
  add(ORG_A, USER, 'Montage', 'clip 1', 'AAA1'); add(ORG_A, USER, 'Montage', 'clip 2', 'AAA2'); add(ORG_A, USER, 'Montage', 'clip 3', 'AAA3'); add(ORG_A, USER, null, 'brut', 'AAA4')
  add(ORG_B, staff, 'VA', 'staff 1', 'BBB1'); add(ORG_B, staff, 'VA', 'staff 2', 'BBB2')
  D.t.content_bank.push({ id: crypto.randomUUID(), org_id: ORG_A, user_id: USER, title: 'Vide', folder: 'Vide', storage_path: null, file_url: null, notes: '__sf_folder__', created_at: new Date().toISOString(), deleted_at: null })

  // Réseau : le site staff (= handler v1) et les URL signées du stockage simulé.
  fetchLog = []
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(url)
    fetchLog.push(`${init.method || 'GET'} ${u.host}${u.pathname}`)
    if (u.host === 'staff.example.com') {
      const route = u.pathname.replace('/api/scaleflow', '').replace(/^\//, '')
      const r = await call(v1, { method: init.method || 'GET', path: route, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers?.Authorization })
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
    }
    if (url.startsWith(D.STORE) && globalThis.__slowMs) await new Promise(r => setTimeout(r, globalThis.__slowMs))
    if (url.startsWith(D.STORE)) {
      const p = decodeURIComponent(u.pathname.replace('/storage/v1/object/sign/content/', ''))
      const o = D.objects.get(p)
      return o ? new Response(o.bytes, { status: 200, headers: { 'content-type': o.type, 'content-length': String(o.bytes.length) } }) : new Response('no', { status: 404 })
    }
    if (u.host === 'redirect.example.com') return new Response('', { status: 302, headers: { location: 'https://127.0.0.1/secret' } })
    if (u.host === 'big.example.com') return new Response(new Uint8Array(10), { status: 200, headers: { 'content-length': String(400 * 1024 * 1024) } })
    return new Response('not found', { status: 404 })
  })
})

describe('API v1 (clé ScaleFlow)', () => {
  it('clé absente / fausse / révoquée → 401', async () => {
    expect((await call(v1, { path: 'me' })).status).toBe(401)
    expect((await call(v1, { path: 'me', auth: 'Bearer ' + tok() })).status).toBe(401)
    D.t.sf_api_tokens[0].revoked_at = new Date().toISOString()
    expect((await call(v1, { path: 'me', auth: 'Bearer ' + TOKEN_A })).status).toBe(401)
  })
  it('dossiers (avec compte vidéos, dossier vide inclus) et fichiers avec liens signés', async () => {
    const f = await call(v1, { path: 'folders', auth: 'Bearer ' + TOKEN_A })
    expect(f.body.folders).toEqual([
      expect.objectContaining({ name: 'Montage', videos: 3, images: 0 }),
      expect.objectContaining({ name: 'Vide', videos: 0 }),
    ])
    expect(f.body.unfiled).toEqual({ videos: 1, images: 0 })
    const files = await call(v1, { path: 'files', query: { folder: 'Montage', limit: '2' }, auth: 'Bearer ' + TOKEN_A })
    expect(files.body.files.map(x => x.title)).toEqual(['clip 1', 'clip 2'])
    expect(files.body.files[0].url).toMatch(/^https:\/\/proj\.supabase\.co\/.+token=/)
    expect(files.body.next_cursor).toBe('2')
    const p2 = await call(v1, { path: 'files', query: { folder: 'Montage', cursor: '2' }, auth: 'Bearer ' + TOKEN_A })
    expect(p2.body.files.map(x => x.title)).toEqual(['clip 3'])
  })
  it('isolation : la clé B ne voit jamais la banque A', async () => {
    const f = await call(v1, { path: 'folders', auth: 'Bearer ' + TOKEN_B })
    expect(f.body.folders.map(x => x.name)).toEqual(['VA'])
    const m = await call(v1, { path: 'files', query: { folder: 'Montage' }, auth: 'Bearer ' + TOKEN_B })
    expect(m.body.files).toEqual([])
  })
  it('créateur de la clé retiré de l’organisation → clé refusée', async () => {
    D.t.organizations[0].owner_id = crypto.randomUUID()
    expect((await call(v1, { path: 'me', auth: 'Bearer ' + TOKEN_A })).status).toBe(401)
  })
  it('POST /folders puis envoi direct (uploads → PUT → files)', async () => {
    const c = await call(v1, { method: 'POST', path: 'folders', body: { name: '  Nouveau   lot ' }, auth: 'Bearer ' + TOKEN_A })
    expect(c.body.folder).toEqual({ name: 'Nouveau lot', created: true })
    const up = await call(v1, { method: 'POST', path: 'uploads', body: { filename: 'x.MOV' }, auth: 'Bearer ' + TOKEN_A })
    expect(up.body.path).toMatch(new RegExp(`^videos/orgs/${ORG_A}/[0-9a-f-]{36}\\.mov$`))
    const early = await call(v1, { method: 'POST', path: 'files', body: { path: up.body.path, folder: 'Nouveau lot' }, auth: 'Bearer ' + TOKEN_A })
    expect(early.status).toBe(409)
    D.objects.set(up.body.path, { bytes: Buffer.from('MOV'), type: 'video/quicktime' })   // le PUT
    const reg = await call(v1, { method: 'POST', path: 'files', body: { path: up.body.path, folder: 'Nouveau lot', title: 'mon clip.mov' }, auth: 'Bearer ' + TOKEN_A })
    expect(reg.body.file).toMatchObject({ title: 'mon clip', folder: 'Nouveau lot', kind: 'video' })
    // chemin d'un autre espace → refusé
    const other = await call(v1, { method: 'POST', path: 'files', body: { path: `videos/orgs/${ORG_B}/${crypto.randomUUID()}.mp4` }, auth: 'Bearer ' + TOKEN_A })
    expect(other.status).toBe(422)
  })
  it('anti-SSRF : http, IP privée, DNS vers réseau interne, redirection interne, trop lourd', async () => {
    const post = url => call(v1, { method: 'POST', path: 'files', body: { url, folder: 'x' }, auth: 'Bearer ' + TOKEN_A })
    expect((await post('http://example.com/a.mp4')).body.error).toMatch(/https requis/)
    expect((await post('https://169.254.169.254/latest')).body.error).toMatch(/non autorisé/)
    expect((await post('https://evil-dns.test/a.mp4')).body.error).toMatch(/non autorisé/)
    expect((await post('https://cgnat.test/a.mp4')).body.error).toMatch(/non autorisé/)
    expect((await post('https://redirect.example.com/a.mp4')).body.error).toMatch(/non autorisé/)
    expect((await post('https://big.example.com/a.mp4')).status).toBe(413)
  })
  it('banque pleine → 507, rien d’enregistré', async () => {
    D.setQuotaFull(true)
    const n = D.t.content_bank.length
    const r = await call(v1, { method: 'POST', path: 'files', body: { url: D.STORE + D.t.content_bank[0].storage_path + '?token=t', folder: 'x' }, auth: 'Bearer ' + TOKEN_B })
    expect(r.status).toBe(507)
    expect(D.t.content_bank.length).toBe(n)
  })
  it('documentation HTML sans clé', async () => {
    const d = await call(v1, { path: 'docs' })
    expect(d.status).toBe(200)
    expect(d.body).toContain('ScaleFlow Link')
  })
})

describe('Liaison avec le site staff (/api/link)', () => {
  const L = body => call(link, { method: 'POST', body: { org_id: ORG_A, ...body }, auth: 'Bearer jwt-user' })
  it('session invalide → refusé ; espace d’un autre → refusé', async () => {
    expect((await call(link, { method: 'POST', body: { op: 'folders', org_id: ORG_A }, auth: 'Bearer nope' })).body.ok).toBe(false)
    expect((await call(link, { method: 'POST', body: { op: 'folders', org_id: ORG_B }, auth: 'Bearer jwt-user' })).body.error).toMatch(/non autorisé/)
  })
  it('je vois LEUR banque (dossiers + fichiers), séparément de la mienne', async () => {
    expect((await L({ op: 'test' })).body).toMatchObject({ ok: true, partner: 'Staff' })
    const f = await L({ op: 'folders' })
    expect(f.body.folders.map(x => x.name)).toEqual(['VA'])
    const files = await L({ op: 'files', folder: 'VA' })
    expect(files.body.files.map(x => x.title)).toEqual(['staff 1', 'staff 2'])
  })
  it('j’envoie mes vidéos DANS LEUR dossier choisi', async () => {
    const ids = D.t.content_bank.filter(r => r.folder === 'Montage').map(r => r.id)
    const r = await L({ op: 'send', ids, folder: 'Prêt à poster' })
    expect(r.body.results.map(x => x.ok)).toEqual([true, true, true])
    const theirs = D.t.content_bank.filter(r => r.org_id === ORG_B && r.folder === 'Prêt à poster')
    expect(theirs.map(r => r.title).sort()).toEqual(['clip 1', 'clip 2', 'clip 3'])
    for (const r of theirs) expect(r.storage_path.startsWith(`videos/orgs/${ORG_B}/`)).toBe(true)   // copiés chez eux
    expect(D.objects.get(theirs.find(r => r.title === 'clip 2').storage_path).bytes.toString()).toBe('AAA2')
    // un id d'un autre espace est ignoré (pas d'envoi des fichiers des autres)
    const leak = await L({ op: 'send', ids: [D.t.content_bank.find(r => r.org_id === ORG_B).id], folder: 'x' })
    expect(leak.body.results).toEqual([])
  })
  it('je récupère leurs vidéos dans MA banque, dans le dossier voulu', async () => {
    const files = (await L({ op: 'files', folder: 'VA' })).body.files
    const r = await L({ op: 'import', items: files.map(f => ({ url: f.url, title: f.title })), folder: 'Reçu du staff' })
    expect(r.body.results.every(x => x.ok)).toBe(true)
    const mine = D.t.content_bank.filter(r => r.org_id === ORG_A && r.folder === 'Reçu du staff')
    expect(mine.map(r => r.title).sort()).toEqual(['staff 1', 'staff 2'])
    expect(mine.every(r => r.user_id === USER && r.storage_path.startsWith(`videos/orgs/${ORG_A}/`))).toBe(true)
  })
  it('vitesse : 6 vidéos envoyées EN PARALLÈLE (≈ durée d’une seule, pas la somme)', async () => {
    for (let i = 0; i < 3; i++) {
      const path = `videos/orgs/${ORG_A}/${crypto.randomUUID()}.mp4`
      D.objects.set(path, { bytes: Buffer.from('X' + i), type: 'video/mp4' })
      D.t.content_bank.push({ id: crypto.randomUUID(), org_id: ORG_A, user_id: USER, title: 'extra ' + i, folder: 'Montage', storage_path: path, thumbnail_path: null, file_url: null, notes: null, created_at: new Date().toISOString(), deleted_at: null })
    }
    const ids = D.t.content_bank.filter(r => r.org_id === ORG_A && r.folder === 'Montage').map(r => r.id)
    expect(ids.length).toBe(6)
    globalThis.__slowMs = 400                     // chaque téléchargement côté staff prend 400 ms
    const t0 = Date.now()
    const r = await L({ op: 'send', ids, folder: 'Rapide' })
    const ms = Date.now() - t0
    globalThis.__slowMs = 0
    expect(r.body.results.filter(x => x.ok).length).toBe(6)
    expect(ms).toBeLessThan(1000)                 // en série : 6 × 400 = 2,4 s
  })
  it('lecteur (viewer) : voit, mais ne peut ni envoyer ni importer', async () => {
    const viewer = crypto.randomUUID()
    D.t.organization_members.push({ org_id: ORG_A, user_id: viewer, role: 'viewer' })
    D.sessions.set('jwt-viewer', { id: viewer })
    const V = body => call(link, { method: 'POST', body: { org_id: ORG_A, ...body }, auth: 'Bearer jwt-viewer' })
    expect((await V({ op: 'folders' })).body.ok).toBe(true)
    expect((await V({ op: 'send', ids: [D.t.content_bank[0].id], folder: 'x' })).body.error).toMatch(/lecture seule/)
    expect((await V({ op: 'import', items: [], folder: 'x' })).body.error).toMatch(/lecture seule/)
  })
  it('adresse du partenaire interne → refusée (pas de SSRF via la liaison)', async () => {
    D.t.sf_link_partners[0].base_url = 'https://evil-dns.test/api'
    expect((await L({ op: 'folders' })).body.error).toMatch(/non autorisé/)
    expect(fetchLog.some(l => l.includes('evil-dns'))).toBe(false)
  })
})
