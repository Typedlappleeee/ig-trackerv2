// Proxy serverless iRemoTech (Device API) — garde la clé API côté serveur et
// évite le CORS navigateur. Utilisé par la sous-app Blowsome (Phone Farm).
//
// Config Vercel requise :
//   IREMOTECH_API_KEY   = irt_live_<key_id>_<secret>   (créée dans leur dashboard)
//   IREMOTECH_API_BASE  = https://api.iremotech.com/v1 (optionnel, défaut ci-dessous)
//
// Le client POST { op, deviceId?, body?, filename?, mediaUrl? } ; on relaie vers
// l'API iRemoTech. Snapshot renvoyé en data URL base64 (JPEG). Upload média :
// on télécharge le fichier de la banque Supabase (garde anti-SSRF) puis on POST
// les octets bruts sur /devices/{id}/media.

import { fetchMediaFollow } from './_ssrf.js'


const BASE = (process.env.IREMOTECH_API_BASE || 'https://api.iremotech.com/v1').replace(/\/$/, '')

async function jsonOr(res) { try { return await res.json() } catch { return null } }

export default async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, base: BASE })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const { op, deviceId, body, filename, mediaUrl, apiKey } = req.body ?? {}
  // Clé : d'abord celle envoyée par le client (config par agence dans ScaleFlow),
  // sinon la variable d'env Vercel globale (fallback optionnel).
  const KEY = (typeof apiKey === 'string' && apiKey.trim()) ? apiKey.trim() : process.env.IREMOTECH_API_KEY
  if (!KEY) return res.status(200).json({ ok: false, error: 'Clé iRemoTech absente : colle ta clé API dans ScaleFlow (Phone Farm → ⚙) ou définis IREMOTECH_API_KEY sur Vercel.' })
  const auth = { Authorization: `Bearer ${KEY}` }
  const dev = encodeURIComponent(String(deviceId ?? ''))

  try {
    if (op === 'devices') {
      const r = await fetch(`${BASE}/devices`, { headers: auth, signal: AbortSignal.timeout(20000) })
      return res.status(200).json({ ok: r.ok, status: r.status, data: await jsonOr(r) })
    }
    if (op === 'usage') {
      const r = await fetch(`${BASE}/usage`, { headers: auth, signal: AbortSignal.timeout(20000) })
      return res.status(200).json({ ok: r.ok, status: r.status, data: await jsonOr(r) })
    }
    if (op === 'snapshot') {
      const r = await fetch(`${BASE}/devices/${dev}/snapshot`, { headers: auth, signal: AbortSignal.timeout(25000) })
      if (!r.ok) {
        // On remonte le corps réel d'iRemoTech (souvent un JSON { error, message })
        // pour diagnostiquer un 503 « device offline » vs autre chose.
        let detail = ''
        try { detail = (await r.text()).slice(0, 300) } catch { /* ignore */ }
        return res.status(200).json({ ok: false, status: r.status, error: `snapshot ${r.status}${detail ? ` — ${detail}` : ''}` })
      }
      const buf = Buffer.from(await r.arrayBuffer())
      return res.status(200).json({ ok: true, dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` })
    }
    if (op === 'action') {
      const r = await fetch(`${BASE}/devices/${dev}/actions`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(20000),
      })
      return res.status(200).json({ ok: r.ok, status: r.status, data: await jsonOr(r) })
    }
    // Automations iRemoTech (scope « automations ») : list_accounts / account_status / warm_up, puis suivi des jobs.
    if (op === 'automation') {
      const r = await fetch(`${BASE}/devices/${dev}/automations`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(20000),
      })
      // Retry-After (secondes) transmis : « automation ran too recently » (429) → l'appli sait combien attendre
      return res.status(200).json({ ok: r.ok, status: r.status, retryAfter: Number(r.headers.get('retry-after')) || null, data: await jsonOr(r) })
    }
    if (op === 'jobs') {
      const limit = Math.max(1, Math.min(100, Number(req.body?.limit) || 50))
      const r = await fetch(`${BASE}/devices/${dev}/automations?limit=${limit}`, { headers: auth, signal: AbortSignal.timeout(20000) })
      return res.status(200).json({ ok: r.ok, status: r.status, data: await jsonOr(r) })
    }
    if (op === 'job') {
      const id = String(req.body?.jobId ?? '')
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return res.status(200).json({ ok: false, error: 'job invalide' })
      const r = await fetch(`${BASE}/automations/${encodeURIComponent(id)}`, { headers: auth, signal: AbortSignal.timeout(20000) })
      return res.status(200).json({ ok: r.ok, status: r.status, data: await jsonOr(r) })
    }
    // Profils Instagram des comptes iRemoTech (photo, abonnés, abonnements, publications) via HikerAPI.
    // Secours quand l'edge function Supabase n'est pas déployée. Clé iRemoTech vérifiée (réservé aux clients
    // iRemoTech), 30 comptes max par appel ; HIKERAPI_KEY doit être définie sur Vercel.
    if (op === 'profiles') {
      const hk = process.env.HIKERAPI_KEY
      if (!hk) return res.status(200).json({ ok: false, error: 'HIKERAPI_KEY absente sur Vercel' })
      const chk = await fetch(`${BASE}/devices`, { headers: auth, signal: AbortSignal.timeout(15000) })
      if (!chk.ok) return res.status(200).json({ ok: false, error: 'clé iRemoTech refusée' })
      const list = [...new Set((Array.isArray(req.body?.usernames) ? req.body.usernames : []).map(u => String(u ?? '').toLowerCase().replace(/^@/, '').trim()).filter(u => /^[a-z0-9._]{1,30}$/.test(u)))].slice(0, 30)
      const profiles = {}
      await Promise.all(list.map(async u => {
        try {
          const r = await fetch(`https://api.hikerapi.com/v1/user/by/username?username=${encodeURIComponent(u)}`, { headers: { 'x-access-key': hk, accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
          const j = r.ok ? await r.json() : null
          const x = j?.user ?? j
          if (!x || !(x.pk || x.username)) { profiles[u] = null; return }
          const num = v => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)
          profiles[u] = { username: u, full_name: x.full_name || null, profile_pic: x.profile_pic_url_hd || x.profile_pic_url || null, followers: num(x.follower_count), following: num(x.following_count), media_count: num(x.media_count), is_verified: !!x.is_verified, at: new Date().toISOString() }
        } catch { profiles[u] = null }
      }))
      return res.status(200).json({ ok: true, profiles })
    }
    // Stats Instagram (HikerAPI) des comptes iRemoTech : abonnés, Reels publiés ces 24 h et leurs vues, Reels > 5 000 vues
    // en 48 h, Story active (et lien) — 3 requêtes HikerAPI par compte, 8 comptes max par appel (temps Vercel).
    if (op === 'stats') {
      const hk = process.env.HIKERAPI_KEY
      if (!hk) return res.status(200).json({ ok: false, error: 'HIKERAPI_KEY absente sur Vercel' })
      const chk = await fetch(`${BASE}/devices`, { headers: auth, signal: AbortSignal.timeout(15000) })
      if (!chk.ok) return res.status(200).json({ ok: false, error: 'clé iRemoTech refusée' })
      const list = [...new Set((Array.isArray(req.body?.usernames) ? req.body.usernames : []).map(u => String(u ?? '').toLowerCase().replace(/^@/, '').trim()).filter(u => /^[a-z0-9._]{1,30}$/.test(u)))].slice(0, 8)
      const hget = async (path, params) => {
        for (let a = 0; a < 2; a++) {
          try {
            const r = await fetch(`https://api.hikerapi.com${path}?${new URLSearchParams(params)}`, { headers: { 'x-access-key': hk, accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
            if (r.ok) return await r.json().catch(() => null)
            if (r.status !== 429 && r.status < 500) return null
          } catch { /* relance */ }
          await new Promise(r => setTimeout(r, 1200))
        }
        return null
      }
      const num = (...v) => { for (const x of v) { const k = Number(x); if (Number.isFinite(k) && k >= 0 && x !== null && x !== '') return k } return null }
      const ts = v => { if (v == null) return 0; const n = Number(v); if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000; const d = Date.parse(String(v)); return Number.isFinite(d) ? d : 0 }
      const now = Date.now()
      const stats = {}
      await Promise.all(list.map(async u => {
        try {
          const p = await hget('/v1/user/by/username', { username: u })
          const x = p?.user ?? p
          if (!x || !(x.pk || x.username)) { stats[u] = { username: u, missing: true, at: new Date().toISOString() }; return }
          const pk = String(x.pk ?? x.id ?? '')
          const [clips, stories] = await Promise.all([pk ? hget('/v1/user/clips/chunk', { user_id: pk }) : null, pk ? hget('/v1/user/stories', { user_id: pk }) : null])
          const items = Array.isArray(clips) ? (Array.isArray(clips[0]) ? clips[0] : clips.filter(i => i && typeof i === 'object' && !Array.isArray(i))) : Array.isArray(clips?.items) ? clips.items : []
          const reels = items.map(m => ({ code: String(m.code ?? ''), at: ts(m.taken_at ?? m.taken_at_ts), views: num(m.play_count, m.view_count, m.ig_play_count) ?? 0, thumb: m.thumbnail_url ?? m?.image_versions2?.candidates?.[0]?.url ?? null })).filter(r => r.code && r.at)
          const d24 = reels.filter(r => now - r.at <= 24 * 3600_000), d48 = reels.filter(r => now - r.at <= 48 * 3600_000)
          const st = Array.isArray(stories) ? stories : Array.isArray(stories?.items) ? stories.items : []
          // sticker lien = stickers[].story_link.url (vu en vrai le 27/11/2026 : type « gif », lien dans story_link)
          const hasLink = st.some(s => (Array.isArray(s.links) && s.links.length) || (Array.isArray(s.story_link_stickers) && s.story_link_stickers.length) || (Array.isArray(s.stickers) && s.stickers.some(k => k?.story_link?.url || /link/i.test(String(k?.type ?? k?.extra?.type ?? '')))))
          stats[u] = {
            username: u, followers: num(x.follower_count), following: num(x.following_count), media: num(x.media_count),
            reels24: d24.length, views24: d24.reduce((n, r) => n + r.views, 0),
            viral48: d48.filter(r => r.views >= 5000).sort((a, b) => b.views - a.views).slice(0, 3),
            topReel: reels.slice().sort((a, b) => b.views - a.views)[0] ?? null,
            story: st.length > 0, storyLink: hasLink, storyAt: st.length ? Math.max(...st.map(s => ts(s.taken_at))) : null,
            private: !!x.is_private, recent: reels.slice().sort((p, q) => q.at - p.at).slice(0, 12).map(r => ({ at: r.at, views: r.views })),
            at: new Date().toISOString(),
          }
        } catch { stats[u] = null }
      }))
      return res.status(200).json({ ok: true, stats })
    }
    if (op === 'media') {
      // Deux sources : fileData (base64, fichier PC ≤ ~4 Mo) OU mediaUrl (banque Supabase).
      let bytes
      if (typeof req.body?.fileData === 'string' && req.body.fileData) {
        try { bytes = Buffer.from(req.body.fileData, 'base64') }
        catch (e) { return res.status(200).json({ ok: false, error: `base64 invalide: ${e?.message ?? e}` }) }
      } else {
        let dl
        try { dl = await fetchMediaFollow(mediaUrl) }
        catch (e) { return res.status(200).json({ ok: false, error: `média refusé: ${e?.message ?? e}` }) }
        if (!dl.ok) return res.status(200).json({ ok: false, error: `fetch média ${dl.status}` })
        bytes = Buffer.from(await dl.arrayBuffer())
      }
      // Flux RECOMMANDÉ par iRemoTech (doc du 25/11/2026) : ticket d'envoi (un par fichier, 300 Mo) puis envoi direct ;
      // l'ancien POST /media (obsolète, 100 Mo) reste en secours. 429 / 5xx → nouvel essai (Retry-After respecté).
      const name = encodeURIComponent(filename || 'video.mp4')
      const t0 = Date.now()
      const left = () => 55000 - (Date.now() - t0)
      const wait = (ms) => new Promise(r => setTimeout(r, ms))
      let last = { ok: false, status: 0, data: null }
      for (let attempt = 0; attempt < 3 && left() > 8000; attempt++) {
        let r
        try {
          const tk = await fetch(`${BASE}/devices/${dev}/media/ticket`, { method: 'POST', headers: auth, signal: AbortSignal.timeout(Math.min(15000, left())) })
          const tj = tk.ok ? await jsonOr(tk) : null
          if (tj && tj.upload_url && tj.ticket && (!tj.max_bytes || bytes.length <= tj.max_bytes)) {
            r = await fetch(`${tj.upload_url}${tj.upload_url.includes('?') ? '&' : '?'}filename=${name}`, {
              method: 'POST', headers: { Authorization: `Bearer ${tj.ticket}`, 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) },
              body: bytes, signal: AbortSignal.timeout(Math.max(5000, left())),
            })
          } else {
            r = await fetch(`${BASE}/devices/${dev}/media?filename=${name}`, {
              method: 'POST', headers: { ...auth, 'Content-Type': 'application/octet-stream' },
              body: bytes, signal: AbortSignal.timeout(Math.max(5000, left())),
            })
          }
        } catch (e) { last = { ok: false, status: 0, data: { error: e?.message ?? String(e) } }; await wait(2000); continue }
        last = { ok: r.ok, status: r.status, data: await jsonOr(r) }
        if (r.ok || (r.status !== 429 && r.status < 500)) break
        const ra = Number(r.headers.get('retry-after'))
        await wait(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 3000 * (attempt + 1), Math.max(0, left() - 6000)))
      }
      return res.status(200).json(last)
    }
    return res.status(400).json({ ok: false, error: `op inconnu: ${op}` })
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) ? e.message : String(e) })
  }
}

// maxDuration défini dans vercel.json (clé functions).
export const config = { maxDuration: 60 }
