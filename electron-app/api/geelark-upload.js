// Server-side GéeLark video upload proxy.
// Accepts: POST { signedUrl, bearer }              — fetch direct, no admin key needed
//       or POST { storagePath, bucket, bearer }    — Supabase service role key required
// Returns: { ok, token } or { ok: false, error }

const { createClient } = require('@supabase/supabase-js')

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true })
    }
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const { storagePath, bucket = 'content', bearer, signedUrl } = req.body ?? {}
    if ((!storagePath && !signedUrl) || !bearer) {
      return res.status(400).json({ ok: false, error: 'Missing storagePath/signedUrl or bearer' })
    }

    let bytes
    if (signedUrl) {
      // Signed URL already contains auth token — fetch directly, no service role key needed
      const dlRes = await fetch(signedUrl)
      if (!dlRes.ok) {
        return res.status(200).json({ ok: false, error: `Download failed: ${dlRes.status}` })
      }
      bytes = Buffer.from(await dlRes.arrayBuffer())
    } else {
      const supabase = getSupabaseAdmin()
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr || !blob) {
        return res.status(200).json({ ok: false, error: 'Supabase download failed: ' + (dlErr?.message ?? 'unknown') })
      }
      bytes = Buffer.from(await blob.arrayBuffer())
    }

    const glUrlRes = await fetch('https://openapi.geelark.com/open/v1/upload/getUrl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ fileType: 'mp4' }),
    })
    if (!glUrlRes.ok) {
      return res.status(200).json({ ok: false, error: `GéeLark URL error: ${glUrlRes.status}` })
    }
    const glData = await glUrlRes.json()
    if (glData.code !== 0) {
      return res.status(200).json({ ok: false, error: `GéeLark error: ${glData.msg ?? glData.code}` })
    }
    const d = glData.data ?? {}
    const uploadUrl = d.uploadUrl
    const token     = d.resourceUrl  // resourceUrl is what gets passed to the post task as "video"
    if (!uploadUrl || !token) {
      return res.status(200).json({
        ok: false,
        error: 'No uploadUrl/resourceUrl from GéeLark. Keys: ' + Object.keys(d).join(','),
      })
    }

    // Step 3: PUT video bytes to GéeLark's S3 URL
    // Try with no Content-Type first (some presigned URLs don't sign Content-Type)
    let putRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: bytes,
    })
    if (!putRes.ok) {
      const errBody = await putRes.text().catch(() => '')
      console.error('S3 PUT failed (no content-type):', putRes.status, errBody.slice(0, 500))
      // Retry with explicit Content-Type
      putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: bytes,
      })
      if (!putRes.ok) {
        const errBody2 = await putRes.text().catch(() => '')
        console.error('S3 PUT failed (with content-type):', putRes.status, errBody2.slice(0, 500))
        return res.status(200).json({
          ok: false,
          error: `S3 PUT failed: ${putRes.status} — ${errBody2.slice(0, 200)}`,
        })
      }
    }

    return res.status(200).json({ ok: true, token })
  } catch (err) {
    const msg = err?.message ?? String(err)
    console.error('geelark-upload error', msg)
    return res.status(200).json({ ok: false, error: msg })
  }
}
