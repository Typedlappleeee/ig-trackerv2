// Server-side GéeLark video upload proxy.
// Downloads the video from Supabase using the service role key (no CORS issues),
// then uploads to GéeLark's presigned S3 URL.
// Accepts: POST { storagePath, bucket, bearer }
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
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const { storagePath, bucket = 'content', bearer } = req.body ?? {}
    if (!storagePath || !bearer) {
      return res.status(400).json({ ok: false, error: 'Missing storagePath or bearer' })
    }

    const supabase = getSupabaseAdmin()

    // Step 1: Download from Supabase (server-side, no CORS)
    const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
    if (dlErr || !blob) {
      return res.status(200).json({ ok: false, error: 'Supabase download failed: ' + (dlErr?.message ?? 'unknown') })
    }

    const bytes = Buffer.from(await blob.arrayBuffer())

    // Step 2: Get presigned upload URL from GéeLark
    const ext = storagePath.split('.').pop()?.toLowerCase() ?? 'mp4'
    const fileType = ['mp4','mov','webm','avi','mkv'].includes(ext) ? ext : 'mp4'

    const glUrlRes = await fetch('https://openapi.geelark.com/open/v1/upload/getUrl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ fileType }),
    })
    if (!glUrlRes.ok) {
      return res.status(200).json({ ok: false, error: `GéeLark URL error: ${glUrlRes.status}` })
    }
    const glData = await glUrlRes.json()
    if (glData.code !== 0) {
      return res.status(200).json({ ok: false, error: `GéeLark error: ${glData.msg ?? glData.code}` })
    }
    const uploadUrl = glData.data?.uploadUrl
    const token     = glData.data?.token
    if (!uploadUrl || !token) {
      return res.status(200).json({ ok: false, error: 'No uploadUrl/token from GéeLark' })
    }

    // Step 3: PUT video bytes to GéeLark's S3 URL
    const mime = fileType === 'mp4' ? 'video/mp4'
               : fileType === 'mov' ? 'video/quicktime'
               : fileType === 'webm' ? 'video/webm'
               : 'application/octet-stream'

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: bytes,
    })
    if (!putRes.ok) {
      return res.status(200).json({ ok: false, error: `S3 PUT failed: ${putRes.status}` })
    }

    return res.status(200).json({ ok: true, token })
  } catch (err) {
    const msg = err?.message ?? String(err)
    console.error('geelark-upload error', msg)
    return res.status(200).json({ ok: false, error: msg })
  }
}
