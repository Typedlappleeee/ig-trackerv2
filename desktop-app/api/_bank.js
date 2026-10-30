// Banque ScaleFlow côté serveur — partagée par l'API publique (/api/v1) et la liaison avec
// le site partenaire (/api/link). Fichier préfixé `_` : module, pas une route Vercel.
//
// Un « espace » (scope) = { orgId, userId } : l'organisation (orgId) ou l'espace perso
// (orgId null + userId). Toutes les requêtes passent par la clé service-role : CHAQUE
// requête est donc filtrée explicitement sur l'espace (inScope), et chaque chemin de
// stockage reste sous videos/<users|orgs>/<id>/.
import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { hostIsPrivate } from './_ssrf.js'

export function db() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('config serveur incomplète')
  return createClient(url, key, { auth: { persistSession: false } })
}

export const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const NOT_SENTINEL = 'notes.is.null,notes.not.in.("__sf_folder__","__sf_drive_folder__")'
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
const VID_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp']
const MIME_EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v', 'video/x-matroska': 'mkv', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif' }
export const MIME_OF = { ...Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m])), jpeg: 'image/jpeg' }
export const MAX_BYTES = 300 * 1024 * 1024        // 300 Mo par fichier (mémoire d'une fonction)
const URL_TTL = 6 * 3600                            // liens de téléchargement : 6 h

export const extOf = s => (String(s || '').toLowerCase().split('?')[0].split('#')[0].match(/\.([a-z0-9]{1,5})$/) || [])[1] || ''
export const kindOf = s => (IMG_EXT.includes(extOf(s)) ? 'image' : 'video')
export const sha256 = t => createHash('sha256').update(String(t)).digest('hex')
export const inScope = (q, scope) => (scope.orgId ? q.eq('org_id', scope.orgId) : q.eq('user_id', scope.userId).is('org_id', null))
export const scopeDir = scope => `videos/${scope.orgId ? `orgs/${scope.orgId}` : `users/${scope.userId}`}/`

// Noms : sans caractères de contrôle ni « / » de chemin, longueur bornée. '' → null.
export function cleanFolder(v) {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return s || null
}
export function cleanTitle(v, fallback = 'media') {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 200)
  return s || fallback
}
export function clampLimit(v, def = 50, max = 200) {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def
}
export function parseCursor(v) {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n > 0 && n < 1e7 ? n : 0
}

// ── Clé API (Authorization: Bearer sf_…) → espace ─────────────────────────────────
export async function authToken(s, header) {
  const m = /^Bearer\s+(sf_[0-9a-f]{48})\s*$/i.exec(String(header || ''))
  if (!m) return null
  const { data } = await s.from('sf_api_tokens').select('id, owner_id, space_org, revoked_at, last_used_at').eq('token_hash', sha256(m[1].toLowerCase())).maybeSingle()
  if (!data || data.revoked_at) return null
  // Le créateur de la clé doit toujours faire partie de l'organisation (sinon la clé meurt).
  if (data.space_org && !(await isMember(s, data.space_org, data.owner_id))) return null
  // Attendu (≈ 50 ms) : sur Vercel, une écriture lancée sans attendre peut être coupée à la fin
  // de la requête → « utilisée jamais » affiché alors que la clé sert.
  if (!data.last_used_at || Date.now() - Date.parse(data.last_used_at) > 60_000) {
    await s.from('sf_api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {}, () => {})
  }
  return { orgId: data.space_org, userId: data.owner_id, tokenId: data.id }
}

// Rôle d'un utilisateur dans une organisation : 'owner' | 'admin' | 'member' | 'viewer' | null.
export async function roleIn(s, orgId, userId) {
  const { data: o } = await s.from('organizations').select('owner_id').eq('id', orgId).maybeSingle()
  if (!o) return null
  if (o.owner_id === userId) return 'owner'
  const { data: m } = await s.from('organization_members').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle()
  return m ? (m.role || 'member') : null
}
async function isMember(s, orgId, userId) { return !!(await roleIn(s, orgId, userId)) }

// ── Lecture ──────────────────────────────────────────────────────────────────────
async function allRows(make) {
  const out = []
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function listFolders(s, scope) {
  const rows = await allRows(() => inScope(s.from('content_bank').select('folder, notes, storage_path, file_url, title, deleted_at, created_at'), scope).order('created_at', { ascending: false }).order('id'))
  const map = new Map()
  const unfiled = { videos: 0, images: 0 }
  for (const r of rows) {
    if (r.deleted_at) continue
    const media = !SENTINELS.includes(r.notes ?? '') && !!(r.storage_path || r.file_url)
    if (r.folder && !map.has(r.folder)) map.set(r.folder, { name: r.folder, videos: 0, images: 0, updated_at: r.created_at })
    if (!media) continue
    const k = kindOf(r.storage_path || r.file_url || r.title) === 'image' ? 'images' : 'videos'
    if (r.folder) map.get(r.folder)[k]++
    else unfiled[k]++
  }
  return { folders: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)), unfiled }
}

async function signMany(s, paths) {
  const want = [...new Set(paths.filter(Boolean))]
  const out = new Map()
  for (let i = 0; i < want.length; i += 100) {
    const { data } = await s.storage.from('content').createSignedUrls(want.slice(i, i + 100), URL_TTL)
    for (const d of data || []) if (d.signedUrl && d.path) out.set(d.path, d.signedUrl)
  }
  return out
}
function fileOut(r, signed) {
  return {
    id: r.id, title: r.title || 'media', folder: r.folder ?? null,
    kind: kindOf(r.storage_path || r.file_url || r.title),
    url: r.storage_path ? signed.get(r.storage_path) ?? null : r.file_url ?? null,
    thumbnail_url: r.thumbnail_path ? signed.get(r.thumbnail_path) ?? null : null,
    duration: r.duration ?? null, created_at: r.created_at,
  }
}
const FILE_COLS = 'id, title, folder, storage_path, thumbnail_path, file_url, duration, created_at'

// Fichiers d'un dossier (folder null = hors dossier), plus récents d'abord, par pages.
export async function listFiles(s, scope, { folder, limit, cursor }) {
  const lim = clampLimit(limit), off = parseCursor(cursor)
  let q = inScope(s.from('content_bank').select(FILE_COLS), scope).is('deleted_at', null).or(NOT_SENTINEL)
  q = folder ? q.eq('folder', folder) : q.is('folder', null)
  const { data, error } = await q.order('created_at', { ascending: false }).order('id').range(off, off + lim)
  if (error) throw new Error(error.message)
  const rows = (data || []).filter(r => r.storage_path || r.file_url)
  const page = rows.slice(0, lim)
  const signed = await signMany(s, page.flatMap(r => [r.storage_path, r.thumbnail_path]))
  return { files: page.map(r => fileOut(r, signed)), next_cursor: (data || []).length > lim ? String(off + lim) : null }
}

// Médias précis de l'espace (pour les envoyer au partenaire) avec des liens valables 24 h.
export async function filesByIds(s, scope, ids) {
  const want = [...new Set((ids || []).map(String).filter(x => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 50)
  if (!want.length) return []
  const { data, error } = await inScope(s.from('content_bank').select(FILE_COLS), scope).in('id', want).is('deleted_at', null)
  if (error) throw new Error(error.message)
  const rows = (data || []).filter(r => r.storage_path || r.file_url)
  const signed = new Map()
  const paths = [...new Set(rows.flatMap(r => [r.storage_path, r.thumbnail_path]).filter(Boolean))]
  if (paths.length) {
    const { data: d } = await s.storage.from('content').createSignedUrls(paths, 24 * 3600)
    for (const x of d || []) if (x.signedUrl && x.path) signed.set(x.path, x.signedUrl)
  }
  return rows.map(r => fileOut(r, signed))
}

// ── Écriture ─────────────────────────────────────────────────────────────────────
export async function createFolder(s, scope, rawName) {
  const name = cleanFolder(rawName)
  if (!name) throw httpError(422, 'invalid_folder', 'nom de dossier vide')
  const { data } = await inScope(s.from('content_bank').select('id'), scope).eq('folder', name).limit(1)
  if (data && data.length) return { name, created: false }
  const { error } = await s.from('content_bank').insert({ user_id: scope.userId, org_id: scope.orgId, title: name, folder: name, file_url: null, storage_path: null, thumbnail_path: null, duration: null, tags: [], notes: '__sf_folder__' })
  if (error) throw new Error(error.message)
  return { name, created: true }
}

async function quotaOk(s, path) {
  const { data, error } = await s.rpc('bank_can_upload', { p_name: path })
  return error ? true : data !== false            // fonction absente (SQL pas passé) → pas de limite
}

async function insertRow(s, scope, { title, folder, path, thumbPath }) {
  const { data, error } = await s.from('content_bank').insert({
    user_id: scope.userId, org_id: scope.orgId, title, storage_path: path, thumbnail_path: thumbPath ?? null,
    file_url: null, folder, duration: null, tags: [], notes: null, used_count: 0,
  }).select(FILE_COLS).single()
  if (error) {
    await s.storage.from('content').remove([path, ...(thumbPath ? [thumbPath] : [])]).catch(() => {})
    throw new Error(error.message)
  }
  return data
}

// Range des octets (ex. sortie d'un outil Studio) dans la banque de l'espace : fichier + miniature
// éventuelle + ligne content_bank. Renvoie le média (liens signés 6 h).
export async function storeBytes(s, scope, { buf, ext, contentType, title, folder, thumb }) {
  const id = randomUUID()
  const path = `${scopeDir(scope)}${id}.${ext}`
  if (!(await quotaOk(s, path))) throw httpError(507, 'bank_full', 'banque pleine (limite d’espace atteinte)')
  const up = await s.storage.from('content').upload(path, buf, { contentType: contentType || undefined, upsert: false })
  if (up.error) throw new Error(up.error.message)
  let thumbPath = null
  if (thumb) {
    const tp = `${scopeDir(scope)}${id}_thumb.jpg`
    const tu = await s.storage.from('content').upload(tp, thumb, { contentType: 'image/jpeg', upsert: false })
    if (!tu.error) thumbPath = tp
  }
  const row = await insertRow(s, scope, { title: cleanTitle(title), folder: cleanFolder(folder), path, thumbPath })
  return fileOut(row, await signMany(s, [row.storage_path, row.thumbnail_path]))
}

// Octets d'un média de MA banque (id dans l'espace), lus dans le stockage (clé service-role).
export async function bytesOfFile(s, scope, id, maxBytes = MAX_BYTES) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw httpError(422, 'invalid_file', 'file_id invalide')
  const { data: r } = await inScope(s.from('content_bank').select('id, title, folder, storage_path, file_url, deleted_at'), scope).eq('id', String(id)).maybeSingle()
  if (!r || r.deleted_at || !(r.storage_path || r.file_url)) throw httpError(404, 'file_not_found', 'média introuvable dans ta banque')
  if (!r.storage_path) { const got = await fetchPublic(r.file_url, { maxBytes }); return { ...got, title: r.title, folder: r.folder, ext: extOf(r.file_url) } }
  const { data, error } = await s.storage.from('content').download(r.storage_path)
  if (error || !data) throw httpError(502, 'fetch_failed', 'lecture du média impossible')
  if (data.size > maxBytes) throw httpError(413, 'too_large', `fichier trop lourd (max ${Math.round(maxBytes / 1048576)} Mo)`)
  return { buf: Buffer.from(await data.arrayBuffer()), contentType: data.type || '', title: r.title, folder: r.folder, ext: extOf(r.storage_path) }
}

// Télécharge un média depuis une URL https PUBLIQUE et le range dans la banque.
export async function storeFromUrl(s, scope, { url, folder, title, thumbnail_url }, fetcher = fetch) {
  const got = await fetchPublic(url, { maxBytes: MAX_BYTES, fetcher })
  let ext = extOf(new URL(got.finalUrl).pathname) || MIME_EXT[got.contentType] || ''
  if (![...IMG_EXT, ...VID_EXT].includes(ext)) ext = String(got.contentType).startsWith('image/') ? 'jpg' : 'mp4'
  const id = randomUUID()
  const path = `${scopeDir(scope)}${id}.${ext}`
  if (!(await quotaOk(s, path))) throw httpError(507, 'bank_full', 'banque pleine (limite d’espace atteinte)')
  const up = await s.storage.from('content').upload(path, got.buf, { contentType: got.contentType || undefined, upsert: false })
  if (up.error) throw new Error(up.error.message)
  let thumbPath = null
  if (thumbnail_url && kindOf(path) === 'video') {
    try {
      const th = await fetchPublic(thumbnail_url, { maxBytes: 5 * 1024 * 1024, fetcher })
      if (String(th.contentType).startsWith('image/')) {
        const tp = `${scopeDir(scope)}${id}_thumb.jpg`
        const tu = await s.storage.from('content').upload(tp, th.buf, { contentType: th.contentType, upsert: false })
        if (!tu.error) thumbPath = tp
      }
    } catch { /* miniature facultative */ }
  }
  const fallback = decodeURIComponent(new URL(got.finalUrl).pathname.split('/').pop() || 'media')
  const row = await insertRow(s, scope, { title: cleanTitle(title, cleanTitle(fallback)), folder: cleanFolder(folder), path, thumbPath })
  return fileOut(row, await signMany(s, [row.storage_path, row.thumbnail_path]))
}

// Envoi direct (gros fichiers) : 1) lien d'envoi signé, 2) PUT du fichier, 3) enregistrement.
export async function createUpload(s, scope, { filename, content_type }) {
  let ext = extOf(filename) || MIME_EXT[String(content_type || '').toLowerCase()] || ''
  if (![...IMG_EXT, ...VID_EXT].includes(ext)) throw httpError(422, 'invalid_file', 'type de fichier non pris en charge (vidéo ou image)')
  const path = `${scopeDir(scope)}${randomUUID()}.${ext}`
  if (!(await quotaOk(s, path))) throw httpError(507, 'bank_full', 'banque pleine (limite d’espace atteinte)')
  const { data, error } = await s.storage.from('content').createSignedUploadUrl(path)
  if (error) throw new Error(error.message)
  return { path, upload_url: data.signedUrl, token: data.token, method: 'PUT', expires_in: 7200 }
}
export async function registerUpload(s, scope, { path, folder, title }) {
  const p = String(path || '')
  const dir = scopeDir(scope)
  const name = p.slice(dir.length)
  if (!p.startsWith(dir) || !/^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(name)) throw httpError(422, 'invalid_path', 'chemin inconnu : utilise celui renvoyé par POST /uploads')
  const { data: same } = await inScope(s.from('content_bank').select(FILE_COLS), scope).eq('storage_path', p).limit(1)
  if (same && same.length) return fileOut(same[0], await signMany(s, [same[0].storage_path, same[0].thumbnail_path]))
  const { data: objs } = await s.storage.from('content').list(dir.slice(0, -1), { search: name, limit: 1 })
  if (!objs || !objs.some(o => o.name === name)) throw httpError(409, 'not_uploaded', 'fichier pas encore envoyé (PUT sur upload_url d’abord)')
  const row = await insertRow(s, scope, { title: cleanTitle(title), folder: cleanFolder(folder), path: p })
  return fileOut(row, await signMany(s, [row.storage_path]))
}

// ── Réseau sortant : URL https publique uniquement (anti-SSRF, DNS vérifié) ─────────
export async function assertPublicUrl(raw, resolve = lookup) {
  let u
  try { u = new URL(String(raw)) } catch { throw httpError(422, 'invalid_url', 'URL invalide') }
  if (u.protocol !== 'https:') throw httpError(422, 'invalid_url', 'URL : https requis')
  if (u.username || u.password) throw httpError(422, 'invalid_url', 'URL avec identifiants refusée')
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostIsPrivate(host)) throw httpError(422, 'invalid_url', 'hôte non autorisé')
  if (!net.isIP(host)) {
    let addrs = []
    try { addrs = await resolve(host, { all: true }) } catch { throw httpError(422, 'invalid_url', 'hôte introuvable') }
    if (!addrs.length || addrs.some(a => hostIsPrivate(a.address) || isPrivateV4(a.address))) throw httpError(422, 'invalid_url', 'hôte non autorisé')
  } else if (isPrivateV4(host)) throw httpError(422, 'invalid_url', 'hôte non autorisé')
  return u.toString()
}
// 100.64/10 (CGNAT) et 198.18/15 (tests) en plus des plages de _ssrf.js.
function isPrivateV4(ip) {
  const m = /^(\d+)\.(\d+)\./.exec(ip)
  return !!m && ((+m[1] === 100 && +m[2] >= 64 && +m[2] <= 127) || (+m[1] === 198 && (+m[2] === 18 || +m[2] === 19)))
}

// GET d'un média : redirections suivies UNE PAR UNE (chaque saut revalidé), taille plafonnée.
export async function fetchPublic(raw, { maxBytes = MAX_BYTES, timeoutMs = 45_000, fetcher = fetch, resolve } = {}) {
  let url = await assertPublicUrl(raw, resolve)
  for (let hop = 0; hop <= 5; hop++) {
    const resp = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location')
      if (!loc) throw httpError(502, 'fetch_failed', `téléchargement refusé (${resp.status})`)
      url = await assertPublicUrl(new URL(loc, url).toString(), resolve)
      continue
    }
    if (!resp.ok) throw httpError(502, 'fetch_failed', `téléchargement échoué (${resp.status})`)
    const len = Number(resp.headers.get('content-length') || 0)
    if (len > maxBytes) throw httpError(413, 'too_large', `fichier trop lourd (max ${Math.round(maxBytes / 1048576)} Mo)`)
    const chunks = []
    let total = 0
    const reader = resp.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) { await reader.cancel().catch(() => {}); throw httpError(413, 'too_large', `fichier trop lourd (max ${Math.round(maxBytes / 1048576)} Mo)`) }
      chunks.push(value)
    }
    if (!total) throw httpError(502, 'fetch_failed', 'fichier vide')
    const contentType = String(resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    return { buf: Buffer.concat(chunks.map(c => Buffer.from(c))), contentType, finalUrl: url }
  }
  throw httpError(502, 'fetch_failed', 'trop de redirections')
}

export function httpError(status, code, message) {
  const e = new Error(message)
  e.status = status; e.code = code
  return e
}
export function bodyOf(req) {
  const b = req.body
  if (!b) return {}
  if (typeof b === 'string') { try { return JSON.parse(b) } catch { return {} } }
  return typeof b === 'object' ? b : {}
}
