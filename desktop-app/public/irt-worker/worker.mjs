// ScaleFlow · programme SERVEUR iRemoTech (PC éteint).
// Installé par install.sh (même dossier). Il prend les sessions en attente (table irt_server_runs), ouvre le moteur de
// ScaleFlow (page irt-worker.html du site, toujours la dernière version) dans un navigateur sans écran, fait tourner
// chaque iPhone et écrit le journal ligne par ligne (irt_server_logs). Les appels iRemoTech partent directement d'ici.
//
// Variables (fichier /etc/sf-irt-worker.env) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (Supabase › Project Settings › API)
//   SF_ORIGIN   site ScaleFlow (défaut https://scaleflow.company)
//   MAX_RUNS    sessions en même temps (défaut 4) — jamais deux sessions sur le même iPhone
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { hostname, homedir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants (voir /etc/sf-irt-worker.env)'); process.exit(1) }
const ORIGIN = (process.env.SF_ORIGIN || 'https://scaleflow.company').replace(/\/$/, '')
const MAX_RUNS = Math.max(1, Number(process.env.MAX_RUNS) || 4)
const WORKER_ID = process.env.WORKER_ID || hostname()
const IRT = 'https://api.iremotech.com/v1'
const VERSION = '1'
const db = createClient(URL_, KEY, { auth: { persistSession: false } })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const now = () => new Date().toISOString()
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ── Navigateur partagé (profil gardé : mémos du moteur, ex. clavier iOS déjà réglé) ─────────────────────────
let ctx = null
async function browser() {
  if (ctx) return ctx
  ctx = await chromium.launchPersistentContext(join(homedir(), '.sf-irt-worker', 'profile'), { headless: true })
  ctx.on('close', () => { ctx = null })
  return ctx
}

// Relais iRemoTech : la page appelle /api/iremotech (comme le site) → on répond ici, en direct (plus rapide).
async function irtRelay(route) {
  let q = {}
  try { q = JSON.parse(route.request().postData() || '{}') } catch { /* corps vide */ }
  const H = { Authorization: `Bearer ${q.apiKey}` }
  const dev = encodeURIComponent(q.deviceId || '')
  let out
  try {
    if (q.op === 'devices') { const r = await fetch(`${IRT}/devices`, { headers: H }); out = { ok: r.ok, status: r.status, data: await r.json().catch(() => null) } }
    else if (q.op === 'usage') { const r = await fetch(`${IRT}/usage`, { headers: H }); out = { ok: r.ok, status: r.status, data: await r.json().catch(() => null) } }
    else if (q.op === 'snapshot') {
      const r = await fetch(`${IRT}/devices/${dev}/snapshot`, { headers: H })
      out = r.ok ? { ok: true, dataUrl: 'data:image/jpeg;base64,' + Buffer.from(await r.arrayBuffer()).toString('base64') } : { ok: false, status: r.status, error: `snapshot ${r.status} — ${(await r.text().catch(() => '')).slice(0, 200)}` }
    }
    else if (q.op === 'action') { const r = await fetch(`${IRT}/devices/${dev}/actions`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(q.body || {}) }); out = { ok: r.ok, status: r.status, data: await r.json().catch(() => null) } }
    else if (q.op === 'automation') { const r = await fetch(`${IRT}/devices/${dev}/automations`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(q.body || {}) }); out = { ok: r.ok, status: r.status, data: await r.json().catch(() => null) } }
    else if (q.op === 'jobs') { const r = await fetch(`${IRT}/devices/${dev}/automations?limit=${q.limit || 50}`, { headers: H }); out = { ok: r.ok, status: r.status, data: await r.json().catch(() => null) } }
    else if (q.op === 'job') { const r = await fetch(`${IRT}/automations/${encodeURIComponent(q.jobId)}`, { headers: H }); out = { ok: r.ok, status: r.status, data: await r.json().catch(() => null) } }
    else if (q.op === 'media') {
      const src = await fetch(q.mediaUrl)
      if (!src.ok) out = { ok: false, error: `média ${src.status}` }
      else {
        const bytes = Buffer.from(await src.arrayBuffer())
        const r = await fetch(`${IRT}/devices/${dev}/media?filename=${encodeURIComponent(q.filename || 'video.mp4')}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/octet-stream' }, body: bytes })
        out = { ok: r.ok, status: r.status, data: await r.json().catch(() => null) }
      }
    }
    else out = { ok: false, error: `op ${q.op} non gérée sur le serveur` }
  } catch (e) { out = { ok: false, error: String(e) } }
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(out) })
}

// ── Une session ───────────────────────────────────────────────────────────────────────────────────────────
const active = new Map() // runId → true
async function apiKeyFor(run) {
  const read = async (table, col, val) => {
    const { data } = await db.from(table).select('iremotech_config').eq(col, val).maybeSingle()
    return data?.iremotech_config?.api_key ?? null
  }
  return (run.org_id ? await read('org_config', 'org_id', run.org_id) : null) ?? await read('app_config', 'user_id', run.user_id)
}

async function runSession(run) {
  active.set(run.id, true)
  const buf = []
  let done = 0, ok = 0, cancel = false
  const total = (run.plan?.phones ?? []).reduce((n, p) => n + (p.jobs?.length ?? 0), 0)
  const flush = async () => {
    if (!buf.length) return
    const rows = buf.splice(0, buf.length).map(line => ({ run_id: run.id, line, at: now() }))
    const { error } = await db.from('irt_server_logs').insert(rows)
    if (error) log('journal non écrit :', error.message)
  }
  const flushTimer = setInterval(() => void flush(), 2000)
  const beat = setInterval(async () => {
    const { data } = await db.from('irt_server_runs').update({ heartbeat_at: now(), progress: { total, done, ok } }).eq('id', run.id).select('cancel_requested').maybeSingle()
    if (data?.cancel_requested) cancel = true
  }, 10000)
  let page = null
  let status = 'done', error = null
  try {
    const key = await apiKeyFor(run)
    if (!key) throw new Error('aucune clé iRemoTech enregistrée pour cet espace (ScaleFlow › iRemoTech › ⚙ Clé iRemoTech)')
    const c = await browser()
    page = await c.newPage()
    await page.route('**/api/iremotech', irtRelay)
    await page.exposeFunction('wlog', (_id, line) => { buf.push(String(line)) })
    await page.exposeFunction('wstop', async () => {
      if (cancel) return true
      const { data } = await db.from('irt_server_runs').select('cancel_requested').eq('id', run.id).maybeSingle()
      if (data?.cancel_requested) cancel = true
      return cancel
    })
    await page.exposeFunction('wmedia', async (_id, v) => {
      if (v.storage_path) { const { data } = await db.storage.from('content').createSignedUrl(v.storage_path, 3600); return data?.signedUrl ?? null }
      return v.file_url ?? null
    })
    await page.exposeFunction('wbump', async (_id, mediaId) => {
      const { data } = await db.from('content_bank').select('used_count').eq('id', mediaId).maybeSingle()
      await db.from('content_bank').update({ used_count: (data?.used_count ?? 0) + 1 }).eq('id', mediaId)
    })
    await page.exposeFunction('wtick', (_id, good) => { done++; if (good) ok++ })
    await page.goto(`${ORIGIN}/irt-worker.html?v=${Date.now()}`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.irtReady === true, null, { timeout: 120000 })
    const engine = await page.evaluate(() => window.irtVersion)
    buf.push(`▶ Session sur le serveur ${WORKER_ID} · moteur ScaleFlow ${engine} · ${run.plan.phones.length} iPhone(s) · ${total} post(s)`)
    const runPhone = p => page.evaluate(([id, k, ph, o]) => window.irtRunPhone(id, k, ph, o), [run.id, key, p, run.plan.opts])
    if (run.plan.opts?.parallel) await Promise.all(run.plan.phones.map(p => runPhone(p).catch(e => { buf.push(`[${p.name}] ❌ ${String(e).slice(0, 200)}`) })))
    else for (const p of run.plan.phones) { if (cancel) break; await runPhone(p).catch(e => { buf.push(`[${p.name}] ❌ ${String(e).slice(0, 200)}`) }) }
    if (cancel) status = 'cancelled'
    buf.push(cancel ? `⏹ Session arrêtée : ${ok}/${total} publié(s)` : `🏁 Session terminée : ${ok}/${total} publié(s)`)
  } catch (e) {
    status = 'failed'; error = e instanceof Error ? e.message : String(e)
    buf.push(`❌ Session interrompue : ${error}`)
  } finally {
    clearInterval(flushTimer); clearInterval(beat)
    await flush()
    await db.from('irt_server_runs').update({ status, error, finished_at: now(), heartbeat_at: now(), progress: { total, done, ok } }).eq('id', run.id)
    if (page) await page.close().catch(() => undefined)
    active.delete(run.id)
    log(`session ${run.id} : ${status} (${ok}/${total})`)
  }
}

// ── Boucle principale ─────────────────────────────────────────────────────────────────────────────────────
async function heartbeat() {
  await db.from('irt_workers').upsert({ id: WORKER_ID, last_seen: now(), version: VERSION, active_runs: active.size }, { onConflict: 'id' })
}
async function recoverStale() {
  // sessions « en cours » de CE serveur au démarrage = interrompues (redémarrage) ; ailleurs, plus de battement depuis 10 min.
  // JAMAIS relancées toutes seules : un post a pu partir (risque de double publication).
  const msg = 'Interrompue (serveur redémarré ou arrêté) : vérifie les comptes avant de relancer.'
  await db.from('irt_server_runs').update({ status: 'failed', error: msg, finished_at: now() }).eq('status', 'running').eq('worker_id', WORKER_ID)
  await db.from('irt_server_runs').update({ status: 'failed', error: msg, finished_at: now() }).eq('status', 'running').lt('heartbeat_at', new Date(Date.now() - 10 * 60_000).toISOString())
}

log(`Serveur iRemoTech ScaleFlow ${WORKER_ID} · site ${ORIGIN} · ${MAX_RUNS} session(s) max`)
await recoverStale()
await heartbeat()
setInterval(() => void heartbeat().catch(() => undefined), 30_000)
// Mise à jour du programme : toutes les heures, si une nouvelle version est publiée ET qu'aucune session ne tourne,
// on s'arrête proprement → le service redémarre et télécharge la nouvelle version (ExecStartPre).
setInterval(async () => {
  if (active.size) return
  try {
    const remote = await (await fetch(`${ORIGIN}/irt-worker/worker.mjs?v=${Date.now()}`)).text()
    const mine = await readFile(fileURLToPath(import.meta.url), 'utf8')
    if (remote.includes('ScaleFlow · programme SERVEUR iRemoTech') && remote !== mine && !active.size) { log('nouvelle version publiée → redémarrage'); process.exit(0) }
  } catch { /* hors ligne : on garde la version actuelle */ }
}, 60 * 60_000)
for (;;) {
  try {
    if (active.size < MAX_RUNS) {
      const { data, error } = await db.rpc('irt_claim_run', { p_worker: WORKER_ID })
      if (error) log('file des sessions :', error.message)
      const run = Array.isArray(data) ? data[0] : data
      if (run?.id) { log(`session ${run.id} prise (${run.title ?? ''})`); void runSession(run); continue }
    }
  } catch (e) { log('boucle :', String(e)) }
  await sleep(5000)
}
