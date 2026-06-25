// Server-side GéeLark video upload proxy.
// Accepts: POST { signedUrl, bearer }              — fetch direct, no admin key needed
//       or POST { storagePath, bucket, bearer }    — Supabase service role key required
// Returns: { ok, token } or { ok: false, error }

// Vercel Hobby max = 60s (default is 10s — videos need more time)
module.exports.config = { maxDuration: 60 }

const { createClient } = require('@supabase/supabase-js')

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

const SV = '[SERVER-v4]'

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

    const { storagePath, bucket = 'content', bearer, signedUrl } = req.body ?? {}
    console.log(`${SV} body keys: ${Object.keys(req.body ?? {}).join(',')} | signedUrl=${!!signedUrl} | storagePath=${!!storagePath}`)

    if ((!storagePath && !signedUrl) || !bearer) {
      return res.status(400).json({ ok: false, error: `${SV}[SV-E001] Missing storagePath/signedUrl or bearer` })
    }

    let bytes
    if (signedUrl) {
      // Direct fetch — no admin key needed (signed URL already contains auth token)
      console.log(`${SV} [SV-A] fetch signedUrl (${String(signedUrl).slice(0, 80)})`)
      const dlRes = await fetchRetry('SV-A:download', signedUrl, {}, { tries: 3, timeoutMs: 30000 })
      if (!dlRes.ok) {
        return res.status(200).json({ ok: false, error: `${SV}[SV-E002] Fetch vidéo échoué: ${dlRes.status}` })
      }
      bytes = Buffer.from(await dlRes.arrayBuffer())
      console.log(`${SV} [SV-A] fetch ok, ${bytes.length} bytes, content-type=${dlRes.headers.get('content-type') ?? '?'}`)
      // Garde-fou : une URL signée expirée renvoie souvent un petit corps d'erreur
      // (JSON/XML) avec un statut 200. Sans ce contrôle, on uploaderait ces octets
      // bidons chez GéeLark → token "vert" mais vidéo indécodable → galerie vide sur
      // le téléphone. Une vraie vidéo fait toujours bien plus de 50 Ko.
      const ct = (dlRes.headers.get('content-type') ?? '').toLowerCase()
      if (bytes.length < 50_000 || ct.includes('json') || ct.includes('xml') || ct.includes('text/html')) {
        const preview = bytes.slice(0, 200).toString('utf8').replace(/\s+/g, ' ')
        return res.status(200).json({ ok: false, error: `${SV}[SV-E002b] Source vidéo invalide (${bytes.length} octets, type=${ct || '?'}) — URL signée probablement expirée. Aperçu: ${preview}` })
      }
    } else {
      // storagePath — requires SUPABASE_SERVICE_ROLE_KEY
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
      body: JSON.stringify({ fileType: 'mp4' }),
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

    // PUT avec Content-Type ET Content-Length explicites. Sans ça, undici peut
    // envoyer la requête en chunked / sans type, et certains stockages S3 présignés
    // acceptent (200) mais stockent un objet incohérent que GéeLark ne sait pas
    // décoder → vidéo absente de la galerie du téléphone alors que le token est valide.
    const putHeaders = { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) }
    let putRes = await fetchRetry('SV-D:put', uploadUrl, { method: 'PUT', headers: putHeaders, body: bytes }, { tries: 3, timeoutMs: 45000 })
    if (!putRes.ok) {
      putRes = await fetchRetry('SV-D:put2', uploadUrl, { method: 'PUT', body: bytes }, { tries: 2, timeoutMs: 45000 })
      if (!putRes.ok) {
        const errBody = await putRes.text().catch(() => '')
        return res.status(200).json({ ok: false, error: `${SV}[SV-E006] S3 PUT failed: ${putRes.status} — ${errBody.slice(0, 200)}` })
      }
    }

    // Vérification : relire l'objet réellement stocké via la resourceUrl et comparer
    // sa taille à ce qu'on a uploadé. Détecte un PUT « 200 mais objet vide/tronqué »
    // — la cause d'une galerie vide avec un token pourtant valide. Best-effort :
    // si la lecture échoue (propagation, HEAD non supporté) on n'invalide pas le post.
    let uploadedSize = null
    try {
      const headRes = await fetchRetry('SV-E:verify', token, { method: 'GET', headers: { Range: 'bytes=0-0' } }, { tries: 2, timeoutMs: 15000 })
      const cr = headRes.headers.get('content-range')   // ex: "bytes 0-0/1234567"
      const total = cr && cr.includes('/') ? Number(cr.split('/')[1]) : Number(headRes.headers.get('content-length'))
      if (Number.isFinite(total)) uploadedSize = total
      console.log(`${SV} [SV-E:verify] objet stocké = ${uploadedSize} octets (attendu ${bytes.length})`)
      if (Number.isFinite(total) && total < 50_000) {
        return res.status(200).json({ ok: false, error: `${SV}[SV-E007] Objet GéeLark vide/tronqué (${total} octets, attendu ${bytes.length}). Le PUT a échoué silencieusement.` })
      }
    } catch (e) {
      console.warn(`${SV} [SV-E:verify] vérification ignorée: ${e?.message ?? e}`)
    }

    console.log(`${SV} [OK] token=${token.slice(0, 40)} uploadedSize=${uploadedSize}`)
    return res.status(200).json({ ok: true, token, uploadedSize })
  } catch (err) {
    const msg = err?.message ?? String(err)
    console.error(`${SV} exception:`, msg)
    return res.status(200).json({ ok: false, error: `${SV}[SV-E000] ${msg}` })
  }
}
