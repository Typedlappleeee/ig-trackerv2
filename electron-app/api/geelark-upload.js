// Server-side GéeLark video upload proxy.
// Accepts: POST { signedUrl, bearer }              — fetch direct, no admin key needed
//       or POST { storagePath, bucket, bearer }    — Supabase service role key required
// Returns: { ok, token } or { ok: false, error }

// Vercel Hobby max = 60s (default is 10s — videos need more time)
module.exports.config = { maxDuration: 60 }

const { createClient } = require('@supabase/supabase-js')
const { assertAllowedMediaUrl, fetchMediaFollow } = require('./_ssrf')

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

const SV = '[SERVER-v5]'

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heif', 'heic']

// Devine le type de fichier GéeLark depuis l'URL/chemin source. GéeLark encode
// l'extension dans la resourceUrl : envoyer 'mp4' pour une photo produit une URL
// .mp4 que le template threadsImage refuse. On dérive donc l'extension réelle.
function guessFileType(src) {
  const ext = (String(src || '').split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] || 'mp4').toLowerCase()
  return ext
}

// Network errors ("fetch failed") are usually transient — DNS hiccup, connection
// reset, TLS, or a momentary timeout. Retrying with backoff absorbs most of them.
// Each attempt has its own AbortController timeout so a stalled socket fails fast
// instead of eating the whole 60s budget.
async function fetchRetry(label, url, init = {}, { tries = 3, timeoutMs = 25000 } = {}) {
  let lastErr
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      clearTimeout(timer)
      return res
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      // Surface the real reason: undici hides it in err.cause.code (ECONNRESET,
      // ETIMEDOUT, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT…) or it's an abort timeout.
      const cause = err?.cause?.code || err?.cause?.message || (ctrl.signal.aborted ? 'TIMEOUT' : '')
      console.warn(`${SV} [${label}] tentative ${attempt}/${tries} échouée: ${err?.message ?? err}${cause ? ` (cause=${cause})` : ''}`)
      if (attempt < tries) await new Promise(r => setTimeout(r, attempt * 1500))
    }
  }
  // Re-throw with a label + cause so the caller's catch produces a useful message.
  const cause = lastErr?.cause?.code || lastErr?.cause?.message || ''
  const e = new Error(`[${label}] ${lastErr?.message ?? 'fetch failed'}${cause ? ` (cause=${cause})` : ''}`)
  e._labelled = true
  throw e
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true })
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: `${SV} Method not allowed` })
    }

    const { storagePath, bucket = 'content', bearer, signedUrl, fileType: fileTypeArg } = req.body ?? {}
    // Extension réelle (photo vs vidéo). Pour une VIDÉO on force 'mp4' : les
    // templates RPA (Insta/TikTok/Threads) exigent du mp4 — une resourceUrl .mov
    // /.webm casse le posting. Une PHOTO garde son extension (threadsImage la veut).
    const realExt = (fileTypeArg || guessFileType(signedUrl || storagePath) || 'mp4').toLowerCase()
    const isImage = IMAGE_EXTS.includes(realExt)
    const fileType = isImage ? realExt : 'mp4'
    console.log(`${SV} body keys: ${Object.keys(req.body ?? {}).join(',')} | signedUrl=${!!signedUrl} | storagePath=${!!storagePath}`)

    if ((!storagePath && !signedUrl) || !bearer) {
      return res.status(400).json({ ok: false, error: `${SV}[SV-E001] Missing storagePath/signedUrl or bearer` })
    }

    let bytes
    if (signedUrl) {
      // Anti-SSRF : le signedUrl doit être une URL de la banque Supabase de l'app,
      // et on ne suit PAS les redirections (une 3xx vers une IP interne
      // contournerait l'allowlist). Sinon cet endpoint fetch n'importe quelle URL.
      try { assertAllowedMediaUrl(signedUrl) }
      catch (e) { return res.status(400).json({ ok: false, error: `${SV}[SV-E002s] ${e.message}` }) }
      console.log(`${SV} [SV-A] fetch signedUrl (${String(signedUrl).slice(0, 80)})`)
      // SUIT les redirections (Supabase peut renvoyer une 3xx vers son CDN de
      // stockage) tout en re-validant chaque saut (anti-SSRF). Le retry/timeout
      // réseau reste géré par fetchRetry, réutilisé via `doFetch`.
      let dlRes
      try {
        dlRes = await fetchMediaFollow(signedUrl, {
          timeoutMs: 30000,
          doFetch: (u, init) => fetchRetry('SV-A:download', u, init, { tries: 3, timeoutMs: 30000 }),
        })
      } catch (e) {
        return res.status(200).json({ ok: false, error: `${SV}[SV-E002] Fetch vidéo échoué: ${e?.message ?? e}` })
      }
      if (!dlRes.ok) {
        return res.status(200).json({ ok: false, error: `${SV}[SV-E002] Fetch vidéo échoué: ${dlRes.status}` })
      }
      bytes = Buffer.from(await dlRes.arrayBuffer())
      console.log(`${SV} [SV-A] fetch ok, ${bytes.length} bytes`)
    } else {
      // storagePath — clé service-role : on limite à l'arborescence de l'app pour
      // qu'un storagePath arbitraire ne puisse pas lire le fichier d'un autre tenant.
      if (!/^videos\/(users|orgs)\/[^/]+\//.test(String(storagePath)) || String(storagePath).includes('..')) {
        return res.status(400).json({ ok: false, error: `${SV}[SV-E003p] chemin non autorisé` })
      }
      console.log(`${SV} [SV-B] storagePath path, tentative admin client`)
      const supabase = getSupabaseAdmin()
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr || !blob) {
        return res.status(200).json({ ok: false, error: `${SV}[SV-E003] Supabase download failed: ${dlErr?.message ?? 'unknown'}` })
      }
      bytes = Buffer.from(await blob.arrayBuffer())
    }

    const glUrlRes = await fetchRetry('SV-C:getUrl', 'https://openapi.geelark.com/open/v1/upload/getUrl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ fileType }),
    }, { tries: 3, timeoutMs: 20000 })
    if (!glUrlRes.ok) {
      return res.status(200).json({ ok: false, error: `${SV}[SV-E004a] GéeLark URL HTTP: ${glUrlRes.status}` })
    }
    const glData = await glUrlRes.json()
    if (glData.code !== 0) {
      return res.status(200).json({ ok: false, error: `${SV}[SV-E004b] GéeLark error: ${glData.msg ?? glData.code}` })
    }
    const d = glData.data ?? {}
    const uploadUrl = d.uploadUrl
    const token     = d.resourceUrl
    if (!uploadUrl || !token) {
      return res.status(200).json({ ok: false, error: `${SV}[SV-E005] No uploadUrl/resourceUrl. Keys: ${Object.keys(d).join(',')}` })
    }

    const putCT = isImage
      ? (fileType === 'jpg' ? 'image/jpeg' : `image/${fileType}`)
      : 'video/mp4'
    let putRes = await fetchRetry('SV-D:put', uploadUrl, { method: 'PUT', body: bytes }, { tries: 3, timeoutMs: 45000 })
    if (!putRes.ok) {
      putRes = await fetchRetry('SV-D:put2', uploadUrl, { method: 'PUT', headers: { 'Content-Type': putCT }, body: bytes }, { tries: 2, timeoutMs: 45000 })
      if (!putRes.ok) {
        const errBody = await putRes.text().catch(() => '')
        return res.status(200).json({ ok: false, error: `${SV}[SV-E006] S3 PUT failed: ${putRes.status} — ${errBody.slice(0, 200)}` })
      }
    }

    console.log(`${SV} [OK] token=${token.slice(0, 40)} isImage=${isImage}`)
    return res.status(200).json({ ok: true, token, isImage })
  } catch (err) {
    const msg = err?.message ?? String(err)
    console.error(`${SV} exception:`, msg)
    return res.status(200).json({ ok: false, error: `${SV}[SV-E000] ${msg}` })
  }
}
