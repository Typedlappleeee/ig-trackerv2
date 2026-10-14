// Genjutsu (Higgsfield) — « recréer un Reel avec mes images » (motion transfer), pour tous.
// La vidéo source (Banque ou Reel de la Veille) garde mouvements, cadrages et timing ;
// le casting est reconstruit à partir de 1 à 8 images de référence (Banque ou un Modèle).
// File côté serveur (table genjutsu_jobs) : UNE génération à la fois par espace (perso ou
// organisation), avancée par l'app ouverte (« tick ») ET par le cron (app fermée).
// Clé : celle de l'espace (table api_keys, saisie dans l'app). Le super-admin garde en repli
// la clé globale (sf_secrets / secrets d'env) — jamais utilisée pour les autres.
// Docs : https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer
// deno-lint-ignore-file no-explicit-any

const API = 'https://api.higgsfield.ai'
const MODEL = 'higgsfield/genjutsu/motion-transfer/v1.0'
const RESOLUTIONS = ['480p', '720p', '1080p']
const ACTIVE = ['queued', 'in_progress']
const KEY_RE = /^[^:\s]+:[^:\s]+$/

async function isSuper(db: any, userId: string): Promise<boolean> {
  const { data } = await db.from('profiles').select('email, is_super_admin').eq('id', userId).maybeSingle()
  return !!data?.is_super_admin || data?.email === 'tintin.aunea@gmail.com'
}
/** Clé Higgsfield de l'espace ; repli global réservé au super-admin. */
async function keyFor(db: any, userId: string, orgId: string | null): Promise<string | null> {
  let q = db.from('api_keys').select('value').eq('provider', 'higgsfield')
  q = orgId ? q.eq('org_id', orgId) : q.is('org_id', null).eq('owner_id', userId)
  const { data } = await q.maybeSingle()
  const v = String(data?.value ?? '').trim()
  if (KEY_RE.test(v)) return `Key ${v}`
  if (!(await isSuper(db, userId))) return null
  const id = Deno.env.get('HIGGSFIELD_KEY_ID') ?? '', secret = Deno.env.get('HIGGSFIELD_KEY_SECRET') ?? ''
  if (id && secret) return `Key ${id}:${secret}`
  const g = await db.from('sf_secrets').select('value').eq('name', 'higgsfield').maybeSingle()
  const gv = String(g.data?.value ?? '').trim()
  return KEY_RE.test(gv) ? `Key ${gv}` : null
}
async function inSpace(db: any, orgId: string | null, userId: string): Promise<boolean> {
  if (!orgId) return true
  const m = await db.from('organization_members').select('user_id').eq('org_id', orgId).eq('user_id', userId).maybeSingle()
  if (m.data) return true
  const o = await db.from('organizations').select('id').eq('id', orgId).eq('owner_id', userId).maybeSingle()
  return !!o.data
}
/** Ligne de la Banque de l'espace (perso ou organisation). */
async function ownRow(db: any, id: string, userId: string, orgId: string | null) {
  const { data } = await db.from('content_bank').select('id, user_id, org_id, storage_path, file_url, title').eq('id', id).maybeSingle()
  if (!data) return null
  if (orgId ? data.org_id !== orgId : (data.user_id !== userId || data.org_id !== null)) return null
  return data as { id: string; storage_path: string | null; file_url: string | null; title: string }
}
async function publicUrl(db: any, row: { storage_path: string | null; file_url: string | null }): Promise<string | null> {
  if (row.storage_path) {
    const { data } = await db.storage.from('content').createSignedUrl(row.storage_path, 6 * 3600)
    return data?.signedUrl ?? null
  }
  return row.file_url && /^https:\/\//i.test(row.file_url) ? row.file_url : null
}
const scopeQ = (q: any, userId: string, orgId: string | null) => orgId ? q.eq('org_id', orgId) : q.eq('user_id', userId).is('org_id', null)
const upd = (db: any, id: string, patch: Record<string, unknown>) => db.from('genjutsu_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)

/** Envoie un job à Higgsfield. */
async function submitJob(db: any, job: any, auth: string): Promise<void> {
  let videoUrl: string | null = null
  if (job.source?.bank_id) {
    const row = await ownRow(db, job.source.bank_id, job.user_id, job.org_id)
    videoUrl = row ? await publicUrl(db, row) : null
  } else if (job.source?.reel_code) {
    const { reelMedia } = await import('./viral.ts')
    videoUrl = (await reelMedia(job.source.reel_code))?.videoUrl ?? null
  }
  if (!videoUrl) { await upd(db, job.id, { status: 'failed', error: 'Vidéo source introuvable (Reel supprimé ou fichier absent).' }); return }
  const imageUrls: string[] = []
  for (const id of (job.image_ids ?? []).slice(0, 8)) {
    const row = await ownRow(db, String(id), job.user_id, job.org_id)
    const u = row ? await publicUrl(db, row) : null
    if (u) imageUrls.push(u)
  }
  if (!imageUrls.length) { await upd(db, job.id, { status: 'failed', error: 'Images de référence introuvables dans la Banque.' }); return }
  const r = await fetch(`${API}/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', 'Idempotency-Key': job.id },
    body: JSON.stringify({ video_url: videoUrl, image_urls: imageUrls, prompt: job.prompt ?? '', resolution: RESOLUTIONS.includes(job.resolution) ? job.resolution : '720p' }),
  }).catch(() => null)
  if (!r) { await upd(db, job.id, { error: 'Higgsfield injoignable, nouvel essai au prochain passage.' }); return }
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j?.request_id) {
    const msg = j?.detail ?? j?.message ?? j?.error ?? `HTTP ${r.status}`
    await upd(db, job.id, { status: 'failed', error: `Higgsfield : ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`.slice(0, 400) })
    return
  }
  await upd(db, job.id, { status: String(j.status ?? 'queued'), request_id: String(j.request_id), status_url: String(j.status_url ?? ''), error: null })
}

/** Suit un job envoyé ; à la fin, copie la vidéo dans la Banque (dossier « IA »), une seule fois. */
async function pollJob(db: any, job: any, auth: string): Promise<void> {
  if (!/^https:\/\/api\.higgsfield\.ai\//.test(job.status_url ?? '')) { await upd(db, job.id, { status: 'failed', error: 'Suivi impossible.' }); return }
  const r = await fetch(job.status_url, { headers: { Authorization: auth } }).catch(() => null)
  if (!r) return
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) return
  const status = String(j.status ?? job.status)
  if (status === 'failed' || status === 'nsfw' || status === 'cancelled') {
    await upd(db, job.id, { status: 'failed', error: status === 'nsfw' ? 'Refusé par Higgsfield (contenu).' : String(j?.error ?? 'Échec de la génération.').slice(0, 400) }); return
  }
  if (status !== 'completed') { if (status !== job.status) await upd(db, job.id, { status }); return }
  const videoUrl: string | null = j?.video?.url ?? null
  if (!videoUrl || !/^https:\/\//i.test(videoUrl)) { await upd(db, job.id, { status: 'failed', error: 'Résultat sans vidéo.' }); return }
  let bankId: string | null = null, warn: string | null = null
  const dl = await fetch(videoUrl).catch(() => null)
  if (dl && dl.ok) {
    const bytes = new Uint8Array(await dl.arrayBuffer())
    const scope = job.org_id ? `orgs/${job.org_id}` : `users/${job.user_id}`
    const path = `videos/${scope}/${crypto.randomUUID()}.mp4`
    const up = await db.storage.from('content').upload(path, bytes, { contentType: 'video/mp4', upsert: false })
    if (!up.error) {
      const ins = await db.from('content_bank').insert({
        user_id: job.user_id, org_id: job.org_id, title: String(job.title ?? 'Genjutsu').slice(0, 120), storage_path: path, file_url: null,
        folder: 'IA', duration: null, tags: ['genjutsu'], notes: `genjutsu:${job.request_id}`, used_count: 0,
      }).select('id').maybeSingle()
      bankId = ins.data?.id ?? null
      if (ins.error) warn = `Copie Banque : ${ins.error.message}`
    } else warn = `Copie Banque impossible : ${up.error.message}`
  } else warn = 'Vidéo prête, mais copie dans la Banque impossible.'
  await upd(db, job.id, { status: 'completed', video_url: videoUrl, bank_id: bankId, error: warn })
}

/** Fait avancer la file d'un espace : suit l'envoi en cours, sinon envoie le suivant. */
export async function tickSpace(db: any, userId: string, orgId: string | null, deadline: number): Promise<{ missingKey?: boolean }> {
  const { data: jobs } = await scopeQ(db.from('genjutsu_jobs').select('*').in('status', ['waiting', ...ACTIVE]), userId, orgId).order('created_at', { ascending: true }).limit(60)
  if (!jobs?.length) return {}
  const auth = await keyFor(db, userId, orgId) ?? await keyFor(db, jobs[0].user_id, orgId)
  if (!auth) return { missingKey: true }
  for (const j of jobs.filter((x: any) => ACTIVE.includes(x.status))) { if (Date.now() > deadline) return {}; await pollJob(db, j, auth) }
  const still = await scopeQ(db.from('genjutsu_jobs').select('id').in('status', ACTIVE), userId, orgId).limit(1)
  if (still.data?.length || Date.now() > deadline) return {}
  const next = jobs.find((x: any) => x.status === 'waiting')
  if (next) await submitJob(db, next, auth)
  return {}
}

/** Actions de l'app : enqueue / tick / remove. Tout utilisateur connecté, dans SON espace. */
export async function genjutsuAction(db: any, userId: string, body: any): Promise<unknown> {
  const orgId: string | null = typeof body.org_id === 'string' ? body.org_id : null
  if (!(await inSpace(db, orgId, userId))) return { ok: false, error: 'Organisation non autorisée.' }

  if (body.genjutsu === 'enqueue') {
    if (!(await keyFor(db, userId, orgId))) return { ok: false, error: 'missing_key' }
    let imageIds: string[] = Array.isArray(body.image_ids) ? body.image_ids.filter((x: unknown) => typeof x === 'string') : []
    let modelId: string | null = null
    if (typeof body.model_id === 'string') {
      const m = await scopeQ(db.from('genjutsu_models').select('id, image_ids').eq('id', body.model_id), userId, orgId).maybeSingle()
      if (!m.data) return { ok: false, error: 'Modèle introuvable.' }
      modelId = m.data.id; imageIds = (m.data.image_ids ?? []).map(String)
    }
    imageIds = imageIds.slice(0, 8)
    if (!imageIds.length) return { ok: false, error: 'Choisis un modèle ou au moins une image de référence.' }
    const sources = (Array.isArray(body.sources) ? body.sources : []).slice(0, 50)
      .map((s: any) => typeof s?.reel_code === 'string' && /^[A-Za-z0-9_-]{5,40}$/.test(s.reel_code) ? { source: { reel_code: s.reel_code }, title: s.title, thumb: s.thumb }
        : typeof s?.bank_id === 'string' ? { source: { bank_id: s.bank_id }, title: s.title, thumb: s.thumb } : null)
      .filter(Boolean)
    if (!sources.length) return { ok: false, error: 'Ajoute au moins un Reel à recréer.' }
    const resolution = RESOLUTIONS.includes(body.resolution) ? body.resolution : '720p'
    const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 2000) : ''
    const now = Date.now()
    const rows = sources.map((s: any, i: number) => ({
      user_id: userId, org_id: orgId, status: 'waiting', source: s.source, image_ids: imageIds, model_id: modelId, resolution, prompt,
      title: String(s.title ?? 'Genjutsu').slice(0, 120), thumb: typeof s.thumb === 'string' && /^https:\/\//.test(s.thumb) ? s.thumb.slice(0, 2000) : null,
      created_at: new Date(now + i).toISOString(),
    }))
    const ins = await db.from('genjutsu_jobs').insert(rows)
    if (ins.error) return { ok: false, error: /relation|does not exist|schema cache/i.test(ins.error.message) ? 'missing_sql' : ins.error.message }
    await tickSpace(db, userId, orgId, Date.now() + 25_000)
    return { ok: true, count: rows.length }
  }

  if (body.genjutsu === 'tick') {
    const r = await tickSpace(db, userId, orgId, Date.now() + 25_000)
    return { ok: true, ...(r.missingKey ? { error: 'missing_key' } : {}) }
  }

  if (body.genjutsu === 'remove' && typeof body.job_id === 'string') {
    const j = await scopeQ(db.from('genjutsu_jobs').select('id, status').eq('id', body.job_id), userId, orgId).maybeSingle()
    if (!j.data) return { ok: false, error: 'Génération introuvable.' }
    if (ACTIVE.includes(j.data.status)) return { ok: false, error: 'Génération en cours : elle ne peut plus être retirée.' }
    await db.from('genjutsu_jobs').delete().eq('id', j.data.id)
    return { ok: true }
  }
  return { ok: false, error: 'Action inconnue.' }
}

/** Cron (chaque minute) : fait avancer les files des espaces actifs, même app fermée. */
export async function genjutsuCron(db: any, deadline: number): Promise<number> {
  const { data } = await db.from('genjutsu_jobs').select('user_id, org_id').in('status', ['waiting', ...ACTIVE]).order('created_at').limit(300)
  if (!data?.length) return 0
  const seen = new Set<string>(); let n = 0
  for (const r of data) {
    const k = r.org_id ? `o:${r.org_id}` : `u:${r.user_id}`
    if (seen.has(k)) continue
    seen.add(k)
    if (Date.now() > deadline || n >= 10) break
    await tickSpace(db, r.user_id, r.org_id, deadline); n++
  }
  return n
}
