// Facebook par l'API officielle Meta — Reels publiés sur des PAGES, sans téléphone.
//   GET  /api/fb?code&state        → retour de la connexion Facebook (enregistre les Pages)
//   POST /api/fb  { a, org_id, … } → Authorization: Bearer <session Supabase>
//     start                        → adresse de connexion Facebook (state signé, 15 min)
//     pages                        → Pages connectées de l'espace (sans jeton)
//     remove  { page }             → retire une Page
//     publish { page, file_id, caption } → publie UN Reel sur UNE Page (Meta télécharge la vidéo
//                                    lui-même depuis un lien signé de la Banque)
//     status  { page, video_id }   → où en est le traitement du Reel chez Meta
// Variables Vercel : META_APP_ID, META_APP_SECRET (jamais envoyées au navigateur),
// META_FB_REDIRECT_URI (facultatif ; par défaut https://scaleflow.company/api/fb).
// SQL : supabase/migrations/20261110_fb_pages.sql. Les jetons de Page restent en base, côté serveur.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, roleIn, filesByIds, bodyOf } from './_bank.js'

const GRAPH = 'https://graph.facebook.com/v21.0'
const RUPLOAD = 'https://rupload.facebook.com/video-upload/v21.0'
export const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const redirectUri = () => process.env.META_FB_REDIRECT_URI || 'https://scaleflow.company/api/fb'

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const b64u = b => Buffer.from(b).toString('base64url')

// state signé : { u: utilisateur, o: organisation|null, e: expiration } + HMAC (secret de l'app Meta).
export function signState(secret, userId, orgId, ttlMs = 15 * 60_000, now = Date.now()) {
  const p = b64u(JSON.stringify({ u: userId, o: orgId || null, e: now + ttlMs }))
  return `${p}.${createHmac('sha256', secret).update(p).digest('base64url')}`
}
export function readState(secret, state, now = Date.now()) {
  const [p, sig] = String(state || '').split('.')
  if (!p || !sig) return null
  const want = createHmac('sha256', secret).update(p).digest()
  let got
  try { got = Buffer.from(sig, 'base64url') } catch { return null }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const j = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
    if (!UUID.test(String(j.u)) || (j.o && !UUID.test(String(j.o))) || !(Number(j.e) > now)) return null
    return { userId: String(j.u), orgId: j.o ? String(j.o) : null }
  } catch { return null }
}

function htmlPage(ok, title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><body style="margin:0;font-family:system-ui,sans-serif;background:#0A0A0B;color:#EDEDEF;display:grid;place-items:center;min-height:100vh">
<div style="text-align:center;max-width:440px;padding:24px">
<div style="width:44px;height:44px;margin:0 auto;border-radius:99px;display:grid;place-items:center;font-size:22px;background:${ok ? 'rgba(52,211,153,.14)' : 'rgba(252,165,165,.14)'};color:${ok ? '#34D399' : '#FCA5A5'}">${ok ? '✓' : '!'}</div>
<h1 style="font-size:20px;margin:16px 0 8px">${esc(title)}</h1>
<p style="color:#A1A1AA;font-size:14px;line-height:1.6">${esc(body)}</p>
<p style="color:#7C7C86;font-size:12px;margin-top:20px">Tu peux fermer cet onglet et revenir dans ScaleFlow.</p>
</div></body>`
}

async function graph(url, init) {
  let r
  try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) }) } catch (e) {
    throw new Error(`Facebook injoignable (${e?.name === 'TimeoutError' ? 'délai dépassé' : e?.message || e})`)
  }
  let j = null
  try { j = await r.json() } catch { /* pas du JSON */ }
  if (!r.ok || !j || j.error) {
    const e = j?.error
    throw new Error(e ? `Facebook : ${e.error_user_msg || e.message || 'erreur'}${e.code ? ` (code ${e.code})` : ''}` : `Facebook : HTTP ${r.status}`)
  }
  return j
}
const q = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString()

// Toutes les Pages gérées par le compte qui vient de se connecter (avec leur jeton de Page).
async function userPages(userToken) {
  const out = []
  let url = `${GRAPH}/me/accounts?${q({ fields: 'id,name,access_token,picture{url}', limit: 100, access_token: userToken })}`
  for (let k = 0; url && k < 20; k++) {
    const j = await graph(url)
    for (const p of j.data || []) if (p?.id && p.access_token) out.push({ page_id: String(p.id), name: String(p.name || 'Page'), picture: p.picture?.data?.url || null, access_token: p.access_token })
    url = j.paging?.next || null
  }
  return out
}

async function callback(req, res) {
  const appId = process.env.META_APP_ID, secret = process.env.META_APP_SECRET
  const { code, state, error, error_description } = req.query || {}
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  if (!appId || !secret) return res.end(htmlPage(false, 'Connexion pas encore configurée', 'L’application Meta n’est pas branchée côté serveur (META_APP_ID / META_APP_SECRET).'))
  if (error) return res.end(htmlPage(false, 'Autorisation refusée', error_description || error))
  const st = readState(secret, state)
  if (!code || !st) return res.end(htmlPage(false, 'Lien expiré', 'Relance « Connecter Facebook » depuis ScaleFlow (le lien est valable 15 minutes).'))
  try {
    const s = db()
    if (st.orgId) { const role = await roleIn(s, st.orgId, st.userId); if (!role || role === 'viewer') return res.end(htmlPage(false, 'Espace non autorisé', 'Ton rôle ne permet pas de connecter des Pages dans cet espace.')) }
    const short = await graph(`${GRAPH}/oauth/access_token?${q({ client_id: appId, client_secret: secret, redirect_uri: redirectUri(), code })}`)
    let userToken = short.access_token
    try { userToken = (await graph(`${GRAPH}/oauth/access_token?${q({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: secret, fb_exchange_token: short.access_token })}`)).access_token || userToken } catch { /* jeton court : les Pages restent utilisables un temps */ }
    const pages = await userPages(userToken)
    if (!pages.length) return res.end(htmlPage(false, 'Aucune Page trouvée', 'Ce compte Facebook ne gère aucune Page, ou aucune Page n’a été cochée dans la fenêtre d’autorisation.'))
    let n = 0
    for (const p of pages) {
      let f = s.from('sf_fb_pages').select('id').eq('page_id', p.page_id)
      f = st.orgId ? f.eq('space_org', st.orgId) : f.is('space_org', null).eq('owner_id', st.userId)
      const { data: old } = await f.maybeSingle()
      const row = { name: p.name, picture: p.picture, access_token: p.access_token, connected_at: new Date().toISOString(), last_error: null }
      const { error: e } = old
        ? await s.from('sf_fb_pages').update(row).eq('id', old.id)
        : await s.from('sf_fb_pages').insert({ ...row, owner_id: st.userId, space_org: st.orgId, page_id: p.page_id })
      if (e) throw new Error(/sf_fb_pages/.test(e.message) && /does not exist|schema cache/i.test(e.message) ? 'la table des Pages n’existe pas encore (SQL 20261110_fb_pages.sql à lancer)' : e.message)
      n++
    }
    return res.end(htmlPage(true, `${n} Page${n > 1 ? 's' : ''} connectée${n > 1 ? 's' : ''}`, pages.map(p => p.name).slice(0, 12).join(' · ')))
  } catch (e) {
    return res.end(htmlPage(false, 'Échec de la connexion', e?.message || String(e)))
  }
}

function send(res, body) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

// Phase lisible d'un Reel : 'processing' | 'published' | 'failed'.
export function reelPhase(status) {
  const st = status || {}
  const err = st.processing_phase?.errors?.[0]?.message || st.uploading_phase?.errors?.[0]?.message || st.publishing_phase?.errors?.[0]?.message || null
  if (err || st.video_status === 'error' || [st.uploading_phase, st.processing_phase, st.publishing_phase].some(p => p?.status === 'error')) return { phase: 'failed', error: err || 'Facebook a refusé la vidéo' }
  if (st.publishing_phase?.status === 'complete' || st.publishing_phase?.publish_status === 'published' || st.video_status === 'ready') return { phase: 'published', error: null }
  return { phase: 'processing', error: null }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return callback(req, res)
  try {
    if (req.method !== 'POST') return send(res, { ok: false, error: 'POST attendu' })
    const s = db()
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const { data: auth } = jwt ? await s.auth.getUser(jwt) : { data: null }
    const user = auth?.user
    if (!user) return send(res, { ok: false, error: 'session expirée : reconnecte-toi' })
    const b = bodyOf(req)
    const orgId = b.org_id && UUID.test(String(b.org_id)) ? String(b.org_id) : null
    const role = orgId ? await roleIn(s, orgId, user.id) : 'owner'
    if (!role) return send(res, { ok: false, error: 'espace non autorisé' })
    const canWrite = role !== 'viewer'
    const scope = { orgId, userId: user.id }
    const inSpace = qy => (orgId ? qy.eq('space_org', orgId) : qy.is('space_org', null).eq('owner_id', user.id))
    const pageRow = async id => {
      if (!UUID.test(String(id || ''))) return null
      const { data } = await inSpace(s.from('sf_fb_pages').select('id, page_id, name, access_token')).eq('id', String(id)).maybeSingle()
      return data || null
    }

    switch (b.a) {
      case 'start': {
        if (!canWrite) return send(res, { ok: false, error: 'accès en lecture seule' })
        const appId = process.env.META_APP_ID, secret = process.env.META_APP_SECRET
        if (!appId || !secret) return send(res, { ok: false, code: 'not_configured', error: 'L’application Meta n’est pas encore branchée (META_APP_ID / META_APP_SECRET sur Vercel).' })
        const url = `https://www.facebook.com/v21.0/dialog/oauth?${q({ client_id: appId, redirect_uri: redirectUri(), state: signState(secret, user.id, orgId), scope: SCOPES.join(','), response_type: 'code' })}`
        return send(res, { ok: true, url })
      }
      case 'pages': {
        const { data, error } = await inSpace(s.from('sf_fb_pages').select('id, page_id, name, picture, connected_at, last_post_at, last_error')).order('name')
        if (error) return send(res, { ok: false, code: /does not exist|schema cache/i.test(error.message) ? 'no_sql' : 'db', error: error.message })
        return send(res, { ok: true, pages: data || [], configured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET) })
      }
      case 'remove': {
        if (!canWrite) return send(res, { ok: false, error: 'accès en lecture seule' })
        const p = await pageRow(b.page)
        if (!p) return send(res, { ok: false, error: 'Page introuvable' })
        await s.from('sf_fb_pages').delete().eq('id', p.id)
        return send(res, { ok: true })
      }
      case 'publish': {
        if (!canWrite) return send(res, { ok: false, error: 'accès en lecture seule' })
        const p = await pageRow(b.page)
        if (!p) return send(res, { ok: false, error: 'Page introuvable' })
        const [file] = await filesByIds(s, scope, [b.file_id])
        if (!file?.url) return send(res, { ok: false, error: 'vidéo introuvable dans la Banque' })
        if (file.kind !== 'video') return send(res, { ok: false, error: 'un Reel doit être une vidéo' })
        const caption = String(b.caption ?? '').slice(0, 2200)
        try {
          const start = await graph(`${GRAPH}/${p.page_id}/video_reels?${q({ upload_phase: 'start', access_token: p.access_token })}`, { method: 'POST' })
          const videoId = String(start.video_id || '')
          if (!videoId) throw new Error('Facebook n’a pas ouvert l’envoi')
          await graph(`${RUPLOAD}/${videoId}`, { method: 'POST', headers: { Authorization: `OAuth ${p.access_token}`, file_url: file.url } })
          await graph(`${GRAPH}/${p.page_id}/video_reels?${q({ upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED', description: caption, access_token: p.access_token })}`, { method: 'POST' })
          await s.from('sf_fb_pages').update({ last_post_at: new Date().toISOString(), last_error: null }).eq('id', p.id)
          return send(res, { ok: true, video_id: videoId })
        } catch (e) {
          const msg = e?.message || String(e)
          await s.from('sf_fb_pages').update({ last_error: msg.slice(0, 300) }).eq('id', p.id)
          return send(res, { ok: false, error: msg, reconnect: /code 190\b|session has expired|access token/i.test(msg) })
        }
      }
      case 'status': {
        const p = await pageRow(b.page)
        if (!p || !/^\d{5,25}$/.test(String(b.video_id || ''))) return send(res, { ok: false, error: 'demande invalide' })
        const j = await graph(`${GRAPH}/${b.video_id}?${q({ fields: 'status,permalink_url', access_token: p.access_token })}`)
        const ph = reelPhase(j.status)
        if (ph.phase === 'failed') await s.from('sf_fb_pages').update({ last_error: String(ph.error).slice(0, 300) }).eq('id', p.id)
        return send(res, { ok: true, ...ph, link: j.permalink_url ? `https://www.facebook.com${j.permalink_url}` : null })
      }
      default:
        return send(res, { ok: false, error: 'action inconnue' })
    }
  } catch (e) {
    return send(res, { ok: false, error: e?.message || String(e) })
  }
}
