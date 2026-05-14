// Get a GéeLark presigned S3 upload URL without proxying any video data.
// Accepts: POST { bearer }
// Returns: { ok, uploadUrl, token } or { ok: false, error }
// The client then fetches the video itself and PUTs directly to uploadUrl.

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const { bearer } = req.body ?? {}
    if (!bearer) {
      return res.status(400).json({ ok: false, error: 'Missing bearer' })
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
    console.log('GéeLark /upload/getUrl response:', JSON.stringify(glData))

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

    return res.status(200).json({ ok: true, uploadUrl, token })
  } catch (err) {
    const msg = err?.message ?? String(err)
    console.error('geelark-geturl error', msg)
    return res.status(200).json({ ok: false, error: msg })
  }
}
