// GeeLark webhook receiver.
// GeeLark POSTs here when an RPA task finishes: { type, taskId|taskIds, result }.
// We DON'T replace any safety net — we accelerate it: when a task completes we
// set the matching post's stop_phones_at = now(), so the existing cron sweep
// (run-scheduled-posts, step "1ter") powers the phones off within ~1 min instead
// of waiting the 5-15 min safety timeout. The watchdog + sweep remain the
// absolute guarantee that phones never stay on.
//
// Registered URL form: https://<site>/api/geelark-callback?s=<GEELARK_CALLBACK_SECRET>

module.exports.config = { maxDuration: 15 }

const { createClient } = require('@supabase/supabase-js')

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

module.exports = async (req, res) => {
  // Always answer fast so GeeLark doesn't retry; do the work best-effort.
  if (req.method === 'GET') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  // Optional shared-secret gate (set GEELARK_CALLBACK_SECRET in Vercel and put
  // ?s=<secret> in the registered callback URL). If unset, accept all (the
  // payload only ever triggers an earlier phone-stop, never anything dangerous).
  const secret = process.env.GEELARK_CALLBACK_SECRET
  if (secret && String(req.query?.s ?? '') !== secret) {
    return res.status(200).json({ ok: false, error: 'bad secret' })
  }

  try {
    const body = req.body ?? {}
    // type 6 = RPA task complete. Collect task id(s) from either shape.
    const ids = []
    if (body.taskId) ids.push(String(body.taskId))
    if (Array.isArray(body.taskIds)) for (const t of body.taskIds) ids.push(String(t))
    if (ids.length === 0) return res.status(200).json({ ok: true, skipped: 'no taskId' })

    const db = getSupabaseAdmin()
    // Only running posts can have phones still on — small set.
    const { data: running } = await db.from('scheduled_posts')
      .select('id, result, stop_phones_at')
      .eq('status', 'running')
      .limit(50)

    const nowIso = new Date().toISOString()
    let matched = 0
    for (const post of running ?? []) {
      const result = typeof post.result === 'string' ? safeParse(post.result) : (post.result ?? {})
      const taskIds = Array.isArray(result?.geelark_task_ids) ? result.geelark_task_ids.map(String) : []
      if (taskIds.length === 0) continue
      if (!ids.some(id => taskIds.includes(id))) continue
      matched++
      // Bring the safety stop forward to "now" so the next sweep powers phones off.
      // Never push it later than it already is.
      const cur = post.stop_phones_at ? new Date(post.stop_phones_at).getTime() : Infinity
      if (Date.now() <= cur) {
        await db.from('scheduled_posts').update({ stop_phones_at: nowIso }).eq('id', post.id).then(() => {}, () => {})
      }
    }
    return res.status(200).json({ ok: true, matched })
  } catch (err) {
    // Never fail loudly — the cron safety net still covers phone shutdown.
    return res.status(200).json({ ok: false, error: String(err?.message ?? err) })
  }
}

function safeParse(s) { try { return JSON.parse(s) } catch { return {} } }
