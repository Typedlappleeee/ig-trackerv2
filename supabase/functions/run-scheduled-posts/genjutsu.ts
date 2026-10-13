// Genjutsu (Higgsfield) — « recréer un Reel avec mes images » (motion transfer).
// La vidéo source (Banque ou Reel de la Veille) garde ses mouvements, cadrages et timing ;
// le casting est reconstruit à partir de 1 à 8 images de référence (Banque).
// API asynchrone : submit → request_id + status_url → poll → video.url (MP4).
// À la fin, la vidéo est copiée dans la Banque (dossier « IA ») — une seule fois par request_id.
// Clé : saisie dans l'app (table sf_secrets) ou secrets HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET. Super-admin seulement.
// Docs : https://docs.higgsfield.ai/docs/models/genjutsu/motion-transfer
// deno-lint-ignore-file no-explicit-any

const API = 'https://api.higgsfield.ai'
const MODEL = 'higgsfield/genjutsu/motion-transfer/v1.0'
const RESOLUTIONS = ['480p', '720p', '1080p'] as const

// Clé : secrets d'environnement, sinon celle saisie dans l'app (table sf_secrets, « ID:SECRET »).
async function authHeader(db: any): Promise<string | null> {
  const id = Deno.env.get('HIGGSFIELD_KEY_ID') ?? ''
  const secret = Deno.env.get('HIGGSFIELD_KEY_SECRET') ?? ''
  if (id && secret) return `Key ${id}:${secret}`
  const { data } = await db.from('sf_secrets').select('value').eq('name', 'higgsfield').maybeSingle()
  const v = String(data?.value ?? '').trim()
  return /^[^:\s]+:[^:\s]+$/.test(v) ? `Key ${v}` : null
}

/** Ligne de la Banque appartenant à l'utilisateur (perso) ou à son organisation. */
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
async function isMember(db: any, orgId: string, userId: string): Promise<boolean> {
  const { data } = await db.from('organization_members').select('user_id').eq('org_id', orgId).eq('user_id', userId).maybeSingle()
  if (data) return true
  const own = await db.from('organizations').select('id').eq('id', orgId).eq('owner_id', userId).maybeSingle()
  return !!own.data
}

const json = (b: unknown) => b

export async function genjutsuSubmit(db: any, userId: string, body: any): Promise<unknown> {
  const auth = await authHeader(db)
  if (!auth) return json({ ok: false, error: 'missing_key' })
  const orgId: string | null = typeof body.org_id === 'string' ? body.org_id : null
  if (orgId && !(await isMember(db, orgId, userId))) return json({ ok: false, error: 'Organisation non autorisée.' })

  // Vidéo source : Banque (URL signée 6 h) ou Reel de la Veille (URL vidéo fraîche).
  let videoUrl: string | null = null
  if (typeof body.bank_id === 'string') {
    const row = await ownRow(db, body.bank_id, userId, orgId)
    if (!row) return json({ ok: false, error: 'Vidéo source introuvable dans ta Banque.' })
    videoUrl = await publicUrl(db, row)
  } else if (typeof body.reel_code === 'string') {
    const { reelMedia } = await import('./viral.ts')
    videoUrl = (await reelMedia(body.reel_code))?.videoUrl ?? null
  }
  if (!videoUrl) return json({ ok: false, error: 'Impossible de récupérer la vidéo source.' })

  // Images de référence (1 à 8) depuis la Banque.
  const ids: string[] = Array.isArray(body.image_ids) ? body.image_ids.filter((x: unknown) => typeof x === 'string').slice(0, 8) : []
  if (!ids.length) return json({ ok: false, error: 'Ajoute au moins une image de référence.' })
  const imageUrls: string[] = []
  for (const id of ids) {
    const row = await ownRow(db, id, userId, orgId)
    const u = row ? await publicUrl(db, row) : null
    if (u) imageUrls.push(u)
  }
  if (!imageUrls.length) return json({ ok: false, error: 'Images de référence introuvables.' })

  const resolution = RESOLUTIONS.includes(body.resolution) ? body.resolution : '720p'
  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 2000) : ''
  const r = await fetch(`${API}/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ video_url: videoUrl, image_urls: imageUrls, prompt, resolution }),
  }).catch(() => null)
  if (!r) return json({ ok: false, error: 'Higgsfield injoignable.' })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j?.request_id) return json({ ok: false, error: `Higgsfield : ${j?.detail ?? j?.message ?? j?.error ?? `HTTP ${r.status}`}` })
  return json({ ok: true, request_id: String(j.request_id), status_url: String(j.status_url ?? ''), status: j.status ?? 'queued', images: imageUrls.length })
}

export async function genjutsuStatus(db: any, userId: string, body: any): Promise<unknown> {
  const auth = await authHeader(db)
  if (!auth) return json({ ok: false, error: 'missing_key' })
  const requestId = typeof body.request_id === 'string' ? body.request_id : ''
  const statusUrl = typeof body.status_url === 'string' ? body.status_url : ''
  // Anti-SSRF : on n'interroge que l'API Higgsfield.
  if (!requestId || !/^https:\/\/api\.higgsfield\.ai\//.test(statusUrl)) return json({ ok: false, error: 'Requête invalide.' })
  const orgId: string | null = typeof body.org_id === 'string' ? body.org_id : null
  if (orgId && !(await isMember(db, orgId, userId))) return json({ ok: false, error: 'Organisation non autorisée.' })

  const r = await fetch(statusUrl, { headers: { Authorization: auth } }).catch(() => null)
  if (!r) return json({ ok: false, error: 'Higgsfield injoignable.' })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) return json({ ok: false, error: `Higgsfield : ${j?.detail ?? j?.message ?? `HTTP ${r.status}`}` })
  const status = String(j.status ?? 'unknown')
  if (status !== 'completed') return json({ ok: true, status, error: j?.error ?? null })

  const videoUrl: string | null = j?.video?.url ?? null
  if (!videoUrl || !/^https:\/\//i.test(videoUrl)) return json({ ok: false, status: 'failed', error: 'Résultat sans vidéo.' })

  // Copie dans la Banque, une seule fois (marqueur dans notes).
  const tag = `genjutsu:${requestId}`
  const existing = await db.from('content_bank').select('id').eq('notes', tag).maybeSingle()
  if (existing.data?.id) return json({ ok: true, status, video_url: videoUrl, bank_id: existing.data.id })
  const dl = await fetch(videoUrl).catch(() => null)
  if (!dl || !dl.ok) return json({ ok: true, status, video_url: videoUrl, bank_id: null, warn: 'Vidéo prête, mais copie dans la Banque impossible.' })
  const bytes = new Uint8Array(await dl.arrayBuffer())
  const scope = orgId ? `orgs/${orgId}` : `users/${userId}`
  const path = `videos/${scope}/${crypto.randomUUID()}.mp4`
  const up = await db.storage.from('content').upload(path, bytes, { contentType: 'video/mp4', upsert: false })
  if (up.error) return json({ ok: true, status, video_url: videoUrl, bank_id: null, warn: `Copie Banque impossible : ${up.error.message}` })
  const title = (typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Genjutsu').slice(0, 120)
  const ins = await db.from('content_bank').insert({
    user_id: userId, org_id: orgId, title, storage_path: path, file_url: null, folder: 'IA', duration: null, tags: ['genjutsu'], notes: tag, used_count: 0,
  }).select('id').maybeSingle()
  return json({ ok: true, status, video_url: videoUrl, bank_id: ins.data?.id ?? null, warn: ins.error ? `Copie Banque : ${ins.error.message}` : undefined })
}
