// Liaison avec le site partenaire (ex. site du staff) — appelée par l'app ScaleFlow connectée.
//   Auth : Authorization: Bearer <jeton de session Supabase de l'utilisateur>.
//   POST { op, org_id, … } :
//     test                     → GET  <partenaire>/me
//     folders                  → GET  <partenaire>/folders
//     files  {folder, cursor}  → GET  <partenaire>/files
//     send   {ids, folder}     → médias de MA banque → POST <partenaire>/files (liens 24 h), en parallèle
//     import {items, folder}   → médias du partenaire → MA banque
// La clé API du partenaire est lue ici (service-role), jamais renvoyée au navigateur.
import { db, roleIn, filesByIds, storeFromUrl, assertPublicUrl, cleanFolder, bodyOf, httpError } from './_bank.js'

function send(res, body) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function partnerCall(p, path, { method = 'GET', body, timeout = 25_000 } = {}) {
  const base = (await assertPublicUrl(p.base_url)).replace(/\/+$/, '')
  let resp
  try {
    resp = await fetch(base + path, {
      method, redirect: 'manual', signal: AbortSignal.timeout(timeout),
      headers: { Authorization: `Bearer ${p.api_key}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    throw httpError(502, 'partner_unreachable', `site partenaire injoignable (${e?.name === 'TimeoutError' ? 'délai dépassé' : e?.message || e})`)
  }
  let j = null
  try { j = await resp.json() } catch { /* pas du JSON */ }
  if (!resp.ok || !j || j.ok === false) throw httpError(502, 'partner_error', `site partenaire : ${j?.error || `HTTP ${resp.status}`}`)
  return j
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, { ok: false, error: 'POST attendu' })
    const s = db()
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const { data: auth } = jwt ? await s.auth.getUser(jwt) : { data: null }
    const user = auth?.user
    if (!user) return send(res, { ok: false, error: 'session expirée : reconnecte-toi' })

    const b = bodyOf(req)
    const orgId = b.org_id && /^[0-9a-f-]{36}$/i.test(String(b.org_id)) ? String(b.org_id) : null
    const role = orgId ? await roleIn(s, orgId, user.id) : 'owner'
    if (!role) return send(res, { ok: false, error: 'espace non autorisé' })
    const canWrite = role !== 'viewer'

    let pq = s.from('sf_link_partners').select('name, base_url, api_key')
    pq = orgId ? pq.eq('space_org', orgId) : pq.is('space_org', null).eq('owner_id', user.id)
    const { data: p } = await pq.maybeSingle()
    if (!p) return send(res, { ok: false, error: 'aucun site partenaire configuré (Paramètres › API & site partenaire)' })

    switch (b.op) {
      case 'test': {
        const j = await partnerCall(p, '/me')
        return send(res, { ok: true, partner: p.name, info: j })
      }
      case 'folders': {
        const j = await partnerCall(p, '/folders')
        return send(res, { ok: true, partner: p.name, folders: Array.isArray(j.folders) ? j.folders : [], unfiled: j.unfiled ?? null })
      }
      case 'files': {
        const q = new URLSearchParams()
        const folder = cleanFolder(b.folder)
        if (folder) q.set('folder', folder)
        if (b.cursor) q.set('cursor', String(b.cursor))
        q.set('limit', '60')
        const j = await partnerCall(p, `/files?${q}`)
        return send(res, { ok: true, files: Array.isArray(j.files) ? j.files : [], next_cursor: j.next_cursor ?? null })
      }
      case 'send': {
        if (!canWrite) return send(res, { ok: false, error: 'accès en lecture seule' })
        const folder = cleanFolder(b.folder)
        const files = await filesByIds(s, { orgId, userId: user.id }, (b.ids || []).slice(0, 6))
        // Tous les fichiers EN MÊME TEMPS : la durée totale ≈ celle du plus long (pas leur somme).
        const results = await Promise.all(files.map(async f => {
          if (!f.url) return { id: f.id, ok: false, error: 'fichier sans lien' }
          try {
            await partnerCall(p, '/files', { method: 'POST', body: { url: f.url, folder, title: f.title, thumbnail_url: f.thumbnail_url }, timeout: 55_000 })
            return { id: f.id, ok: true }
          } catch (e) { return { id: f.id, ok: false, error: e?.message || String(e) } }
        }))
        return send(res, { ok: true, results })
      }
      case 'import': {
        if (!canWrite) return send(res, { ok: false, error: 'accès en lecture seule' })
        const folder = cleanFolder(b.folder)
        const results = await Promise.all((Array.isArray(b.items) ? b.items : []).slice(0, 3).map(async it => {
          try {
            const file = await storeFromUrl(s, { orgId, userId: user.id }, { url: it?.url, folder, title: it?.title, thumbnail_url: it?.thumbnail_url })
            return { ok: true, id: file.id }
          } catch (e) { return { ok: false, error: e?.message || String(e) } }
        }))
        return send(res, { ok: true, results })
      }
      default:
        return send(res, { ok: false, error: 'opération inconnue' })
    }
  } catch (e) {
    return send(res, { ok: false, error: e?.message || String(e) })
  }
}
