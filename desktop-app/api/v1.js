// API publique ScaleFlow (« ScaleFlow Link » v1) — /api/v1/<route>
//   Auth : Authorization: Bearer sf_… (clé créée dans Paramètres › API & site partenaire).
//   Routes : GET me · GET folders · POST folders · GET files (?unused=1) · POST files · POST uploads ·
//            DELETE files/<id> (corbeille) · PATCH files/<id> · POST files/<id>/used ·
//            GET docs (documentation HTML, sans clé).
// Les réponses sont { ok: true, … } ou { ok: false, error, code } avec le bon statut HTTP.
// Appels SERVEUR À SERVEUR uniquement (pas de CORS : la clé ne doit jamais être dans un navigateur).
// Env Vercel : SUPABASE_URL (ou VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
import { db, authCheck, logCall, listFolders, listFiles, createFolder, storeFromUrl, createUpload, registerUpload, cleanFolder, bodyOf, trashFile, markUsed, updateFile } from './_bank.js'
import { DOCS_HTML } from './_linkdocs.js'

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x')
  const route = String(url.searchParams.get('r') || '').replace(/^\/+|\/+$/g, '').toLowerCase()
  const method = String(req.method || 'GET').toUpperCase()

  if (route === 'docs') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.end(DOCS_HTML)
  }
  // Chaque appel est noté dans le journal de l'API (Réglages › Intégrations) AVANT la réponse.
  let s = null, who = null
  const reply = async (status, body) => {
    if (s) await logCall(s, req, { who, method, route: route || 'me', status, error: body.ok ? null : body.error })
    if (status === 204) { res.statusCode = 204; return res.end() }
    return send(res, status, body)
  }
  if (method === 'OPTIONS') {
    // Pré-requête d'un navigateur : un site appelle l'API depuis une PAGE WEB → bloqué (pas de CORS).
    try { s = db() } catch { /* config */ }
    return reply(204, { ok: false, error: 'appel depuis une page web (navigateur) : bloqué — il faut appeler l’API depuis le serveur du site' })
  }

  try {
    s = db()
    const auth = await authCheck(s, req.headers.authorization)
    const scope = auth.scope
    who = scope ?? auth.attach ?? null
    if (!scope) return reply(401, { ok: false, code: 'unauthorized', error: `clé API refusée : ${auth.reason}` })

    if ((route === '' || route === 'me') && method === 'GET') {
      return reply(200, { ok: true, api: 'scaleflow-link', version: 1, space: scope.orgId ? { type: 'organization', id: scope.orgId } : { type: 'personal' } })
    }
    if (route === 'folders' && method === 'GET') {
      return reply(200, { ok: true, ...(await listFolders(s, scope)) })
    }
    if (route === 'folders' && method === 'POST') {
      const b = bodyOf(req)
      return reply(200, { ok: true, folder: await createFolder(s, scope, b.name) })
    }
    if (route === 'files' && method === 'GET') {
      const folder = url.searchParams.has('folder') ? cleanFolder(url.searchParams.get('folder')) : null
      const unused = /^(1|true|yes)$/i.test(url.searchParams.get('unused') || '')
      return reply(200, { ok: true, folder, ...(await listFiles(s, scope, { folder, limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor'), unused })) })
    }
    if (route === 'files' && method === 'POST') {
      const b = bodyOf(req)
      if (b.path) return reply(200, { ok: true, file: await registerUpload(s, scope, b) })
      if (!b.url) return reply(422, { ok: false, code: 'invalid_action', error: 'url (ou path) requis' })
      return reply(200, { ok: true, file: await storeFromUrl(s, scope, b) })
    }
    // files/<id> : DELETE (corbeille), PATCH {folder, title} ; files/<id>/used : POST (+1 utilisation)
    const m = /^files\/([0-9a-f-]{36})(\/used)?$/i.exec(route)
    if (m && !m[2] && method === 'DELETE') return reply(200, { ok: true, ...(await trashFile(s, scope, m[1])) })
    if (m && !m[2] && method === 'PATCH') return reply(200, { ok: true, file: await updateFile(s, scope, m[1], bodyOf(req)) })
    if (m && m[2] && method === 'POST') return reply(200, { ok: true, ...(await markUsed(s, scope, m[1])) })
    if (route === 'uploads' && method === 'POST') {
      return reply(200, { ok: true, ...(await createUpload(s, scope, bodyOf(req))) })
    }
    return reply(404, { ok: false, code: 'not_found', error: `route inconnue : ${method} /api/v1/${route}` })
  } catch (e) {
    const status = Number(e?.status) || 500
    return reply(status, { ok: false, code: e?.code || 'server_error', error: status === 500 ? `erreur serveur : ${e?.message || e}` : String(e?.message || e) })
  }
}
