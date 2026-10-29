// API publique ScaleFlow (« ScaleFlow Link » v1) — /api/v1/<route>
//   Auth : Authorization: Bearer sf_… (clé créée dans Paramètres › API & site partenaire).
//   Routes : GET me · GET folders · POST folders · GET files · POST files · POST uploads ·
//            GET docs (documentation HTML, sans clé).
// Les réponses sont { ok: true, … } ou { ok: false, error, code } avec le bon statut HTTP.
// Appels SERVEUR À SERVEUR uniquement (pas de CORS : la clé ne doit jamais être dans un navigateur).
// Env Vercel : SUPABASE_URL (ou VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
import { db, authToken, listFolders, listFiles, createFolder, storeFromUrl, createUpload, registerUpload, cleanFolder, bodyOf } from './_bank.js'
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
  if (method === 'OPTIONS') { res.statusCode = 204; return res.end() }

  try {
    const s = db()
    const scope = await authToken(s, req.headers.authorization)
    if (!scope) return send(res, 401, { ok: false, code: 'unauthorized', error: 'clé API manquante, invalide ou révoquée' })

    if ((route === '' || route === 'me') && method === 'GET') {
      return send(res, 200, { ok: true, api: 'scaleflow-link', version: 1, space: scope.orgId ? { type: 'organization', id: scope.orgId } : { type: 'personal' } })
    }
    if (route === 'folders' && method === 'GET') {
      return send(res, 200, { ok: true, ...(await listFolders(s, scope)) })
    }
    if (route === 'folders' && method === 'POST') {
      const b = bodyOf(req)
      return send(res, 200, { ok: true, folder: await createFolder(s, scope, b.name) })
    }
    if (route === 'files' && method === 'GET') {
      const folder = url.searchParams.has('folder') ? cleanFolder(url.searchParams.get('folder')) : null
      return send(res, 200, { ok: true, folder, ...(await listFiles(s, scope, { folder, limit: url.searchParams.get('limit'), cursor: url.searchParams.get('cursor') })) })
    }
    if (route === 'files' && method === 'POST') {
      const b = bodyOf(req)
      if (b.path) return send(res, 200, { ok: true, file: await registerUpload(s, scope, b) })
      if (!b.url) return send(res, 422, { ok: false, code: 'invalid_action', error: 'url (ou path) requis' })
      return send(res, 200, { ok: true, file: await storeFromUrl(s, scope, b) })
    }
    if (route === 'uploads' && method === 'POST') {
      return send(res, 200, { ok: true, ...(await createUpload(s, scope, bodyOf(req))) })
    }
    return send(res, 404, { ok: false, code: 'not_found', error: `route inconnue : ${method} /api/v1/${route}` })
  } catch (e) {
    const status = Number(e?.status) || 500
    return send(res, status, { ok: false, code: e?.code || 'server_error', error: status === 500 ? `erreur serveur : ${e?.message || e}` : String(e?.message || e) })
  }
}
