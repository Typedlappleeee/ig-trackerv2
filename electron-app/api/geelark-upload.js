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

const SV = '[SERVER-v3]'

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
      const dlRes = await fetch(signedUrl)
      if (!dlRes.ok) {
        return res.status(200).json({ ok: false, error: `${SV}[SV-E002] Fetch vidéo échoué: ${dlRes.status}` })
      }
      bytes = Buffer.from(await dlRes.arrayBuffer())
      console.log(`${SV} [SV-A] fetch ok, ${bytes.length} bytes`)
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

    const glUrlRes = await fetch('https://openapi.geelark.com/open/v1/upload/getUrl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ fileType: 'mp4' }),
    })
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

    let putRes = await fetch(uploadUrl, { method: 'PUT', body: bytes })
    if (!putRes.ok) {
      putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes })
      if (!putRes.ok) {
        const errBody = await putRes.text().catch(() => '')
        return res.status(200).json({ ok: false, error: `${SV}[SV-E006] S3 PUT failed: ${putRes.status} — ${errBody.slice(0, 200)}` })
      }
    }

    console.log(`${SV} [OK] token=${token.slice(0, 40)}`)
    return res.status(200).json({ ok: true, token })
  } catch (err) {
    const msg = err?.message ?? String(err)
    console.error(`${SV} exception:`, msg)
    return res.status(200).json({ ok: false, error: `${SV}[SV-E000] ${msg}` })
  }
}
