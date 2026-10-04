// Relai d'ACTIONS iRemoTech en Edge (faible latence, proche de l'utilisateur,
// sans cold-start) — sert uniquement aux taps/swipes/scroll pour un contrôle
// plus réactif. Le reste (snapshot/devices/usage/media) reste sur /api/iremotech
// (Node, car il manipule des Buffers). Pas de CORS côté iRemoTech → il FAUT ce
// relai, on ne peut pas appeler l'API direct depuis le navigateur.
export const config = { runtime: 'edge' }

const BASE = (globalThis.process?.env?.IREMOTECH_API_BASE || 'https://api.iremotech.com/v1').replace(/\/$/, '')

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)
  let body
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }
  const { deviceId, action, apiKey } = body || {}
  const KEY = (typeof apiKey === 'string' && apiKey.trim()) ? apiKey.trim() : (globalThis.process?.env?.IREMOTECH_API_KEY || '')
  if (!KEY) return json({ ok: false, error: 'Clé iRemoTech absente' }, 200)
  try {
    const r = await fetch(`${BASE}/devices/${encodeURIComponent(String(deviceId || ''))}/actions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(action || {}),
    })
    let data = null
    try { data = await r.json() } catch { /* corps vide/non-JSON */ }
    return json({ ok: r.ok, status: r.status, data }, 200)
  } catch (e) {
    return json({ ok: false, error: (e && e.message) ? e.message : String(e) }, 200)
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}
