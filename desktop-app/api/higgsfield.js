// Relais Genjutsu de ScaleFlow : les comptes Higgsfield de l'espace (organisation ou perso), sans
// site extérieur ni mot de passe. Accès = session ScaleFlow + accès Blowsome (ou super-admin).
// Les jetons Higgsfield restent ici (table sf_hf_accounts, sans politique RLS : clé service-role
// seulement) et ne reviennent jamais au navigateur. SQL : supabase/migrations/20261031_hf_accounts.sql.
//
// POST /api/higgsfield  { op, org_id, ... }  Authorization: Bearer <session Supabase>
//   accounts                                  → comptes de l'espace (nom, crédits, plan)
//   login_start  { redirect, state, challenge } → adresse de connexion Higgsfield (OAuth PKCE)
//   login_finish { name, code, redirect, client_id, verifier } → compte enregistré
//   remove       { name }                     → (propriétaire/admin de l'espace)
//   note         { name, credits, plan }      → solde relu, gardé à côté du compte
//   mcp          { account, session, rpc }    → un appel JSON-RPC au serveur MCP Higgsfield
//   upload_image { account, type, data(b64) } → image de référence déposée chez Higgsfield
//   reel         { url }                      → vidéo d'un reel Instagram, copiée dans le stockage
//   keep         { url }                      → résultat Higgsfield copié dans le stockage (lien 7 j)
//   save         { url, folder, title }       → résultat rangé tel quel dans la Banque
import { randomUUID } from 'node:crypto'
import { db, roleIn, storeFromUrl, fetchPublic, scopeDir, bodyOf, httpError } from './_bank.js'

export const config = { maxDuration: 60 }

const ISSUER = 'https://mcp.higgsfield.ai'
const RESOURCE = `${ISSUER}/mcp`
const SCOPE = 'openid email offline_access'
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/callback$/
const RESULT_HOST = /(^|\.)higgsfield\.ai$|\.cloudfront\.net$/i
const SIGN_TTL = 7 * 86400

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}
const form = o => new URLSearchParams(o).toString()

let meta = null
async function oauthMeta(f) {
  if (meta) return meta
  const r = await f(`${ISSUER}/.well-known/oauth-authorization-server`)
  if (!r.ok) throw new Error(`Higgsfield : configuration de connexion indisponible (HTTP ${r.status})`)
  meta = await r.json()
  return meta
}

// Réponse MCP : JSON simple ou flux SSE (on garde le message qui répond à notre id).
function readRpc(raw, type, id) {
  if (!raw.trim()) return null
  if (!/text\/event-stream/.test(type)) return JSON.parse(raw)
  let last = null
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue
    try { const m = JSON.parse(line.slice(5).trim()); if (id != null && m.id === id) return m; last = m } catch { /* ligne partielle */ }
  }
  return last
}
async function mcpCall(f, token, session, rpc) {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  if (session) headers['mcp-session-id'] = session
  const r = await f(RESOURCE, { method: 'POST', headers, body: JSON.stringify(rpc) })
  const sid = r.headers.get('mcp-session-id') || session || null
  const raw = await r.text()
  if (!r.ok) return { status: r.status, session: sid, error: `Higgsfield : HTTP ${r.status} ${raw.slice(0, 300)}` }
  return { status: 200, session: sid, rep: readRpc(raw, r.headers.get('content-type') || '', rpc && rpc.id) }
}
// Un outil appelé de bout en bout ici (poignée de main comprise).
async function serverTool(f, token, name, args) {
  const init = await mcpCall(f, token, null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'scaleflow', version: '1' } } })
  if (init.error) throw new Error(init.error)
  await mcpCall(f, token, init.session, { jsonrpc: '2.0', method: 'notifications/initialized' })
  const r = await mcpCall(f, token, init.session, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args || {} } })
  if (r.error) throw new Error(r.error)
  if (r.rep?.error) throw new Error(r.rep.error.message || JSON.stringify(r.rep.error))
  const res = r.rep?.result || {}
  if (res.structuredContent != null) return res.structuredContent
  const txt = (res.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n')
  if (res.isError) throw new Error(txt.slice(0, 400))
  try { return JSON.parse(txt) } catch { return txt }
}

/* ── espace + accès ── */
const spaceOf = scope => ({ col: scope.orgId ? 'space_org' : 'owner_id', val: scope.orgId || scope.userId, personal: !scope.orgId })
const inSpace = (q, scope) => { const sp = spaceOf(scope); return sp.personal ? q.is('space_org', null).eq('owner_id', sp.val) : q.eq('space_org', sp.val) }

async function isBlowsome(f, jwt, s, userId) {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  try {
    const r = await f(`${url}/rest/v1/rpc/my_license`, { method: 'POST', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}' })
    if (r.ok) {
      const lic = await r.json()
      const l = Array.isArray(lic) ? lic[0] : lic
      if (l && (l.blowsome === true || l.super === true || l.is_super_admin === true)) return true
    }
  } catch { /* repli sur le profil */ }
  const { data: p } = await s.from('profiles').select('email, is_super_admin').eq('id', userId).maybeSingle()
  return !!(p && (p.is_super_admin || p.email === 'tintin.aunea@gmail.com'))
}

/* ── comptes ── */
async function accountRow(s, scope, name) {
  const { data, error } = await inSpace(s.from('sf_hf_accounts').select('*'), scope).eq('name', String(name || '')).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw httpError(404, 'unknown_account', `compte inconnu : ${name}`)
  return data
}
// Jeton valide du compte : renouvelé s'il expire (un seul renouvellement à la fois).
async function tokenOf(f, s, scope, name, force = false, refused = null) {
  let a = await accountRow(s, scope, name)
  if (force && refused && a.access_token && a.access_token !== refused) return a.access_token
  if (!force && a.access_token && Date.parse(a.expires_at || 0) - Date.now() > 120_000) return a.access_token
  if (!a.refresh_token) throw new Error(`connexion expirée : reconnecte ${name}`)
  // verrou optimiste : seul celui qui « prend » la ligne renouvelle
  const { data: taken } = await s.from('sf_hf_accounts').update({ updated_at: new Date().toISOString() }).eq('id', a.id).eq('updated_at', a.updated_at).select('id')
  if (!taken || !taken.length) {
    const before = a.access_token
    for (let k = 0; k < 16; k++) {
      await new Promise(r => setTimeout(r, 500))
      a = await accountRow(s, scope, name)
      if (a.access_token && a.access_token !== before) return a.access_token
    }
    throw new Error('renouvellement de la connexion en cours, réessaie dans un instant')
  }
  const md = await oauthMeta(f)
  const r = await f(md.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'refresh_token', refresh_token: a.refresh_token, client_id: a.client_id, resource: RESOURCE }) })
  const t = await r.json().catch(() => ({}))
  if (!t.access_token) throw new Error(`Higgsfield a coupé la connexion de ${name} : reconnecte-le une fois`)
  await s.from('sf_hf_accounts').update({
    access_token: t.access_token, refresh_token: t.refresh_token || a.refresh_token,
    expires_at: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', a.id)
  return t.access_token
}

/* ── stockage (vidéos de travail : sources et résultats) ── */
async function keepBytes(s, scope, buf, contentType, sub) {
  const path = `${scopeDir(scope)}genjutsu/${sub}/${randomUUID()}.mp4`
  const up = await s.storage.from('content').upload(path, buf, { contentType: contentType || 'video/mp4', upsert: false })
  if (up.error) throw new Error(up.error.message)
  const { data, error } = await s.storage.from('content').createSignedUrl(path, SIGN_TTL)
  if (error || !data?.signedUrl) throw new Error('lien de la vidéo impossible')
  return data.signedUrl
}
const reelCode = u => { try { const x = new URL(u); return /(^|\.)instagram\.com$/i.test(x.hostname) ? (x.pathname.match(/\/(?:reel|reels|p|tv)\/([\w-]+)/i) || [])[1] || null : null } catch { return null } }

export function createHandler({ fetcher = fetch, database = db } = {}) {
  return async function handler(req, res) {
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST uniquement' })
    try {
      const s = database()
      const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
      const { data: u } = jwt ? await s.auth.getUser(jwt).catch(() => ({ data: null })) : { data: null }
      const user = u?.user
      if (!user) return send(res, 401, { ok: false, code: 'unauthorized', error: 'session expirée : reconnecte-toi' })
      const b = bodyOf(req)
      const orgId = b.org_id && /^[0-9a-f-]{36}$/i.test(String(b.org_id)) ? String(b.org_id) : null
      const role = orgId ? await roleIn(s, orgId, user.id) : 'owner'
      if (!role || role === 'viewer') return send(res, 403, { ok: false, code: 'forbidden', error: 'espace non autorisé' })
      if (!(await isBlowsome(fetcher, jwt, s, user.id))) return send(res, 403, { ok: false, code: 'blowsome', error: 'Genjutsu est réservé à l’accès Blowsome' })
      const scope = { orgId, userId: user.id }
      const op = String(b.op || '')

      if (op === 'accounts') {
        const { data, error } = await inSpace(s.from('sf_hf_accounts').select('name, credits, plan, updated_at'), scope).order('created_at')
        if (error) return send(res, 200, { ok: false, code: /relation|does not exist|schema cache/i.test(error.message) ? 'sql_missing' : 'db', error: error.message })
        // jamais de jeton dans la réponse
        return send(res, 200, { ok: true, accounts: (data || []).map(a => ({ name: a.name, credits: a.credits ?? null, plan: a.plan ?? null, updated_at: a.updated_at ?? null })) })
      }
      if (op === 'login_start') {
        const redirect = String(b.redirect || '')
        if (!LOOPBACK.test(redirect)) return send(res, 400, { ok: false, error: 'adresse de retour refusée (redirect)' })
        const md = await oauthMeta(fetcher)
        const r = await fetcher(md.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'ScaleFlow', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPE }) })
        const t = await r.text()
        if (!r.ok) return send(res, 400, { ok: false, error: `Higgsfield refuse l’adresse de retour (redirect) : ${t.slice(0, 200)}` })
        const clientId = JSON.parse(t).client_id
        const url = `${md.authorization_endpoint}?${form({ response_type: 'code', client_id: clientId, redirect_uri: redirect, scope: SCOPE, state: String(b.state || ''), code_challenge: String(b.challenge || ''), code_challenge_method: 'S256', resource: RESOURCE, prompt: 'login', max_age: '0' })}`
        return send(res, 200, { ok: true, url, client_id: clientId })
      }
      if (op === 'login_finish') {
        const name = String(b.name || '').trim().slice(0, 60)
        if (!name || !b.code || !b.client_id || !b.verifier || !LOOPBACK.test(String(b.redirect || ''))) return send(res, 400, { ok: false, error: 'connexion incomplète' })
        const md = await oauthMeta(fetcher)
        const r = await fetcher(md.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'authorization_code', code: String(b.code), redirect_uri: String(b.redirect), client_id: String(b.client_id), code_verifier: String(b.verifier), resource: RESOURCE }) })
        const t = await r.json().catch(() => ({}))
        if (!t.access_token) return send(res, 200, { ok: false, error: t.error_description || t.error || 'Higgsfield a refusé la connexion' })
        const row = {
          name, client_id: String(b.client_id), access_token: t.access_token, refresh_token: t.refresh_token || null,
          expires_at: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(), updated_at: new Date().toISOString(),
        }
        const { data: cur } = await inSpace(s.from('sf_hf_accounts').select('id'), scope).eq('name', name).maybeSingle()
        const { error } = cur
          ? await s.from('sf_hf_accounts').update(row).eq('id', cur.id)
          : await s.from('sf_hf_accounts').insert({ ...row, space_org: orgId, owner_id: user.id })
        if (error) return send(res, 200, { ok: false, error: error.message })
        return send(res, 200, { ok: true, name })
      }
      if (op === 'remove') {
        if (orgId && !['owner', 'admin'].includes(role)) return send(res, 403, { ok: false, error: 'réservé au propriétaire ou à un admin de l’espace' })
        await inSpace(s.from('sf_hf_accounts').delete(), scope).eq('name', String(b.name || ''))
        return send(res, 200, { ok: true })
      }
      if (op === 'note') {
        await inSpace(s.from('sf_hf_accounts').update({ credits: b.credits == null ? null : Number(b.credits), plan: b.plan ? String(b.plan) : null }), scope).eq('name', String(b.name || ''))
        return send(res, 200, { ok: true })
      }
      if (op === 'mcp') {
        const name = String(b.account || '')
        let token = await tokenOf(fetcher, s, scope, name)
        let r = await mcpCall(fetcher, token, b.session || null, b.rpc)
        if (r.error && r.status === 401) { token = await tokenOf(fetcher, s, scope, name, true, token); r = await mcpCall(fetcher, token, b.session || null, b.rpc) }
        if (r.error) return send(res, r.status || 502, { ok: false, error: r.error, session: r.session })
        return send(res, 200, { ok: true, session: r.session, rep: r.rep })
      }
      if (op === 'upload_image') {
        if (!b.data) return send(res, 400, { ok: false, error: 'image manquante' })
        const token = await tokenOf(fetcher, s, scope, String(b.account || ''))
        const type = /^image\/(png|jpeg|webp)$/.test(String(b.type)) ? String(b.type) : 'image/jpeg'
        const ask = await serverTool(fetcher, token, 'media_upload', { filename: type === 'image/png' ? 'reference.png' : 'reference.jpg', content_type: type })
        const slot = (ask && ask.uploads && ask.uploads[0]) || ask
        if (!slot?.upload_url || !slot?.media_id) throw new Error('Higgsfield n’a pas donné d’adresse de dépôt')
        const bytes = Buffer.from(String(b.data), 'base64')
        let put = await fetcher(slot.upload_url, { method: 'PUT', headers: { 'content-type': type, 'if-none-match': '*' }, body: bytes })
        if (!put.ok && (put.status === 400 || put.status === 403)) put = await fetcher(slot.upload_url, { method: 'PUT', headers: { 'content-type': type }, body: bytes })
        if (!put.ok) throw new Error(`dépôt de la photo refusé (HTTP ${put.status})`)
        await serverTool(fetcher, token, 'media_confirm', { type: 'image', media_id: slot.media_id })
        return send(res, 200, { ok: true, media_id: slot.media_id, url: slot.url || null })
      }
      if (op === 'reel') {
        const code = reelCode(String(b.url || ''))
        if (!code) return send(res, 400, { ok: false, error: 'ce n’est pas un lien de reel Instagram' })
        // la fiche du reel (vidéo fraîche) vient de la Veille ScaleFlow (HikerAPI côté Supabase)
        const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
        const fr = await fetcher(`${base}/functions/v1/run-scheduled-posts`, { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: JSON.stringify({ viral: 'media', code }) })
        const m = await fr.json().catch(() => null)
        if (!m?.ok || !m.videoUrl) return send(res, 200, { ok: false, error: m?.error === 'reel introuvable' || (m?.ok && !m.videoUrl) ? 'ce post n’a pas de vidéo (ou il est privé)' : `Instagram n’a pas rendu ce reel${m?.error ? ` (${m.error})` : ''}` })
        const v = await fetcher(m.videoUrl, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.instagram.com/' } })
        if (!v.ok) return send(res, 200, { ok: false, error: `vidéo Instagram indisponible (HTTP ${v.status})` })
        const buf = Buffer.from(await v.arrayBuffer())
        if (buf.length < 1000) return send(res, 200, { ok: false, error: 'vidéo Instagram vide' })
        return send(res, 200, { ok: true, url: await keepBytes(s, scope, buf, 'video/mp4', 'sources'), user: m.username || m.owner || null })
      }
      if (op === 'keep') {
        let host = ''
        try { host = new URL(String(b.url)).hostname } catch { /* invalide */ }
        if (!RESULT_HOST.test(host)) return send(res, 400, { ok: false, error: 'adresse de vidéo non autorisée' })
        const got = await fetchPublic(String(b.url), { maxBytes: 300 * 1024 * 1024, fetcher })
        return send(res, 200, { ok: true, url: await keepBytes(s, scope, got.buf, got.contentType, 'results') })
      }
      if (op === 'save') {
        const file = await storeFromUrl(s, scope, { url: String(b.url || ''), folder: b.folder, title: b.title }, fetcher)
        return send(res, 200, { ok: true, file })
      }
      return send(res, 400, { ok: false, error: `opération inconnue : ${op}` })
    } catch (e) {
      const st = e && e.status ? e.status : 502
      return send(res, st, { ok: false, code: e && e.code, error: String((e && e.message) || e) })
    }
  }
}

export default createHandler()
