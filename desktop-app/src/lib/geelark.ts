// Client GeeLark minimal pour l'app desktop. Contrairement à l'app web (bloquée
// par CORS → relais serverless), l'app Electron tourne avec webSecurity:false :
// le renderer appelle donc directement openapi.geelark.com. Aucun IPC nécessaire.
//
// Porté fidèlement des primitives de electron-app/src/lib/geelark.ts (warmup natif,
// démarrage/arrêt de téléphone, sonde de tâche RPA). Best-effort, jamais de secret loggé.

import storyFlowDef from './geelarkStoryFlow.json'
import loginFlowDef from './geelarkLoginFlow.json'

const BASE = 'https://openapi.geelark.com/open/v1'

export function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }

export interface GeelarkPhone {
  id: string
  serialName?: string | null
  name?: string | null
  status: number // 0=running, 1=stopped, 2=starting, 3=stopping
}

async function geelarkFetch(path: string, body: unknown, bearer: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) throw new Error(`GeeLark HTTP ${res.status}`)
  return (await res.json()) as Record<string, unknown>
}

// Liste paginée des téléphones GeeLark. Lève une erreur claire si le token est refusé.
export async function fetchAllPhones(bearer: string): Promise<GeelarkPhone[]> {
  const items: GeelarkPhone[] = []
  let page = 1
  while (true) {
    const d = await geelarkFetch('/phone/list', { page, pageSize: 50 }, bearer)
    const code = Number(d['code'] ?? -1)
    if (code !== 0) throw new Error(`GeeLark : ${d['msg'] ?? d['message'] ?? `code ${code}`}`)
    const data = (d['data'] as Record<string, unknown>) ?? {}
    const batch = ((data['items'] ?? []) as GeelarkPhone[])
    const total = Number(data['total'] ?? 0)
    items.push(...batch)
    if (items.length >= total || batch.length === 0) break
    page++
  }
  return items
}

export async function startPhones(bearer: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const res = await geelarkFetch('/phone/start', { ids }, bearer)
  const data = (res['data'] as Record<string, unknown>) ?? {}
  const success = Number(data['successAmount'] ?? ids.length)
  return Number.isFinite(success) ? success : ids.length
}

export async function stopPhones(bearer: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const res = await geelarkFetch('/phone/stop', { ids }, bearer)
  const data = (res['data'] as Record<string, unknown>) ?? {}
  const success = Number(data['successAmount'] ?? ids.length)
  return Number.isFinite(success) ? success : ids.length
}

// ── Rotation d'IP proxy (best-effort, ne throw jamais) ───────────────────────
// Appelle le « Change IP URL » du fournisseur (ex. dongle 4G / Prox'Easy). En
// Electron (webSecurity:false) le GET direct passe. Laisse le temps à la nouvelle
// IP de s'attribuer avant le boot.
export const ROTATION_SETTLE_MS = 12000
export async function rotateProxyIp(url: string, log?: (m: string) => void): Promise<boolean> {
  const clean = (url ?? '').trim()
  if (!/^https?:\/\//i.test(clean)) return false
  try {
    const res = await fetch(clean, { method: 'GET' })
    log?.(res.ok ? '🔄 Rotation IP : nouvelle IP demandée ✓' : `⚠ Rotation IP : réponse ${res.status}`)
    return res.ok
  } catch { log?.('⚠ Rotation IP : proxy injoignable — on continue'); return false }
}
export async function rotateAllProxies(urls: string[], log?: (m: string) => void): Promise<void> {
  const list = (urls ?? []).map(u => (u ?? '').trim()).filter(u => /^https?:\/\//i.test(u))
  if (list.length === 0) return
  await Promise.all(list.map(u => rotateProxyIp(u, log)))
  log?.('⏳ Nouvelle IP en cours d\'attribution — attente 12 s…')
  await sleep(ROTATION_SETTLE_MS)
}

// Démarre un téléphone et attend qu'il soit en marche (status=0), max 120 s.
// rotationUrls : si fourni, on rote l'IP AVANT le boot (le tel démarre sur la nouvelle IP).
async function ensurePhoneRunning(bearer: string, phoneId: string, log: (m: string) => void, rotationUrls?: string[]): Promise<boolean> {
  if (rotationUrls && rotationUrls.length) await rotateAllProxies(rotationUrls, log)
  log('📱 Démarrage du téléphone…')
  const startRes = await geelarkFetch('/phone/start', { ids: [phoneId] }, bearer)
  const code = Number(startRes['code'] ?? -1)
  const success = Number((startRes['data'] as Record<string, unknown>)?.['successAmount'] ?? 0)
  const failed = Number((startRes['data'] as Record<string, unknown>)?.['failAmount'] ?? 0)
  if (code !== 0 && success === 0 && failed > 0) { log('❌ Impossible de démarrer le téléphone'); return false }

  log('⏳ Attente du démarrage (max 120 s)…')
  for (let i = 0; i < 24; i++) {
    await sleep(5000)
    try {
      const phones = await fetchAllPhones(bearer)
      const st = Number(phones.find(x => x.id === phoneId)?.status ?? -1)
      if (st === 0) { log('  ✅ Téléphone démarré'); return true }
    } catch { /* ignore polling errors */ }
  }
  log('  ⚠️ Démarrage non confirmé — on poursuit quand même')
  return true
}

// Sonde une tâche RPA jusqu'à complétion. Statuts GeeLark : 3=Done, 4=Failed, 7/8=annulé/erreur.
async function pollRpaTask(bearer: string, taskId: string, log: (m: string) => void, timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(15000)
    let q: Record<string, unknown>
    try { q = await geelarkFetch('/task/query', { ids: [taskId] }, bearer) } catch { continue }
    const d = (q['data'] ?? q) as Record<string, unknown>
    const list = ((d['items'] ?? d['list'] ?? d['tasks'] ?? d['records'] ?? []) as Array<Record<string, unknown>>)
    const it = list.find(x => String(x['id'] ?? x['taskId']) === String(taskId)) ?? list[0]
    if (!it) continue
    const st = Number(it['status'])
    if (st === 3) { log('   ✅ Tâche terminée'); return { ok: true } }
    if ([4, 7, 8].includes(st)) return { ok: false, error: (it['failDesc'] as string) ?? `statut ${st}` }
  }
  log('   ⏳ Délai dépassé — la tâche peut continuer côté GeeLark.')
  return { ok: true }
}

// Warmup IA natif (instagramWarmup) : GeeLark pilote un warmup humain côté serveur.
// browseVideo = nombre de vidéos parcourues (1-100). Démarre le téléphone, lance la
// tâche, la suit, puis éteint le téléphone (anti-coût). Best-effort.
export async function warmupAccountNative(
  bearer: string,
  phoneId: string,
  config: { browseVideo: number; keyword?: string; rotationUrls?: string[] },
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log, config.rotationUrls)
    if (!ready) return { ok: false, error: 'Téléphone non démarré' }
    const browseVideo = Math.max(1, Math.min(100, Math.round(config.browseVideo)))
    log(`🔥 Création de la tâche de warmup (${browseVideo} vidéos${config.keyword ? `, mot-clé « ${config.keyword} »` : ''})…`)
    const res = await geelarkFetch('/rpa/task/instagramWarmup', {
      id: phoneId,
      scheduleAt: Math.floor(Date.now() / 1000) + 5,
      browseVideo,
      ...(config.keyword?.trim() ? { keyword: config.keyword.trim() } : {}),
      name: 'ScaleFlow warmup',
    }, bearer)
    if (Number(res['code']) !== 0) return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string
    if (!taskId) return { ok: false, error: 'Pas de taskId renvoyé par GeeLark' }
    log('   Tâche créée — warmup en cours…')
    const r = await pollRpaTask(bearer, taskId, log, 25 * 60_000)
    return r
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  } finally {
    // Anti-coût : on éteint toujours le téléphone à la fin.
    try { await stopPhones(bearer, [phoneId]); log('📴 Téléphone éteint.') } catch { /* ignore */ }
  }
}

// ── Auto-login Instagram via flow RPA GeeLark ────────────────────────────────
const LOGIN_FLOW_VERSION = '1'
const _loginFlowCache = new Map<string, Promise<string | null>>()
async function ensureLoginFlowId(bearer: string, log: (m: string) => void): Promise<string | null> {
  const cached = _loginFlowCache.get(bearer)
  if (cached) return cached
  const p = (async (): Promise<string | null> => {
    let stored: string | null = null, ver: string | null = null
    try { stored = localStorage.getItem(`sf-login-flowid:${bearer.slice(-14)}`); ver = localStorage.getItem(`sf-login-flowver:${bearer.slice(-14)}`) } catch { /* ignore */ }
    if (stored && ver === LOGIN_FLOW_VERSION) return stored
    log('📥 Import du flow « Login » dans GeeLark…')
    try {
      const res = await geelarkFetch('/task/flow/import', { gal: JSON.stringify(loginFlowDef) }, bearer)
      if (Number(res['code']) !== 0) { log(`⚠ Import flow login : ${res['msg'] ?? res['code']}`); return null }
      const id = (res['data'] as Record<string, unknown>)?.['id'] as string | undefined
      if (id) { try { localStorage.setItem(`sf-login-flowid:${bearer.slice(-14)}`, id); localStorage.setItem(`sf-login-flowver:${bearer.slice(-14)}`, LOGIN_FLOW_VERSION) } catch { /* ignore */ } return id }
      return null
    } catch (e) { log(`⚠ Import flow login : ${e instanceof Error ? e.message : String(e)}`); return null }
  })()
  _loginFlowCache.set(bearer, p)
  p.then(v => { if (!v) _loginFlowCache.delete(bearer) }).catch(() => _loginFlowCache.delete(bearer))
  return p
}

// Connecte un compte IG sur UN téléphone via le flow RPA (User/Password/Key 2FA).
export async function loginInstagramOnPhone(
  bearer: string, phoneId: string,
  creds: { email: string; password: string; totp?: string; rotationUrls?: string[] },
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const flowId = await ensureLoginFlowId(bearer, log)
    if (!flowId) return { ok: false, error: 'Flow login indisponible' }
    const ready = await ensurePhoneRunning(bearer, phoneId, log, creds.rotationUrls)
    if (!ready) return { ok: false, error: 'Téléphone non démarré' }
    log('🔐 Connexion via RPA…')
    const paramMap = { User: creds.email, Password: creds.password, Key: (creds.totp ?? '').replace(/[\s=]/g, '').toUpperCase() }
    const res = await geelarkFetch('/task/rpa/add', { id: phoneId, flowId, scheduleAt: Math.floor(Date.now() / 1000) + 3, name: 'Login Scaleflow', paramMap }, bearer)
    if (Number(res['code']) !== 0) return { ok: false, error: `GeeLark login : ${res['msg'] ?? res['code']}` }
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string
    if (!taskId) return { ok: false, error: 'Pas de taskId renvoyé' }
    log('   Tâche créée — connexion en cours…')
    return await pollRpaTask(bearer, taskId, log, 10 * 60_000)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  } finally {
    try { await stopPhones(bearer, [phoneId]); log('📴 Téléphone éteint.') } catch { /* ignore */ }
  }
}

// ── Cross-posting multi-plateforme (+ TikTok) ────────────────────────────────
// Réutilise upload → boot → RPA → poll pour publier une vidéo sur d'autres réseaux.
// ⚠ Noms d'endpoints selon la convention documentée GeeLark — le message d'erreur
// remonte tel quel si un template diffère selon la version de l'API.
export type CrossPlatform = 'tiktok' | 'threads' | 'facebook' | 'youtube' | 'x' | 'reddit' | 'pinterest'
export const CROSS_PLATFORMS: { key: CrossPlatform; label: string; endpoint: string; emoji: string }[] = [
  { key: 'tiktok', label: 'TikTok', endpoint: '/rpa/task/tiktokPublish', emoji: '🎵' },
  { key: 'threads', label: 'Threads', endpoint: '/rpa/task/threadsVideo', emoji: '🧵' },
  { key: 'facebook', label: 'Facebook Reels', endpoint: '/rpa/task/facebookReels', emoji: '📘' },
  { key: 'youtube', label: 'YouTube Shorts', endpoint: '/rpa/task/youtubePubShort', emoji: '▶️' },
  { key: 'x', label: 'X (Twitter)', endpoint: '/rpa/task/xPublish', emoji: '✖️' },
  { key: 'reddit', label: 'Reddit', endpoint: '/rpa/task/redditVideo', emoji: '👽' },
  { key: 'pinterest', label: 'Pinterest', endpoint: '/rpa/task/pinterestVideo', emoji: '📌' },
]

export async function crossPostToPhone(
  bearer: string, phoneId: string, platform: CrossPlatform,
  opts: { mediaResourceUrl: string; isImage?: boolean; caption?: string; rotationUrls?: string[] },
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = CROSS_PLATFORMS.find(p => p.key === platform)!
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log, opts.rotationUrls)
    if (!ready) return { ok: false, error: 'Téléphone non démarré' }
    let endpoint = cfg.endpoint
    let mediaField: 'video' | 'images' = 'video'
    if (platform === 'threads' && opts.isImage) { endpoint = '/rpa/task/threadsImage'; mediaField = 'images' }
    log(`📤 Publication ${cfg.label}…`)
    const res = await geelarkFetch(endpoint, {
      id: phoneId, scheduleAt: Math.floor(Date.now() / 1000) + 5,
      title: (opts.caption ?? '').slice(0, 500), [mediaField]: [opts.mediaResourceUrl], name: `ScaleFlow ${cfg.label}`.slice(0, 128),
    }, bearer)
    if (Number(res['code']) !== 0) return { ok: false, error: `GeeLark (${cfg.label}) : ${res['msg'] ?? res['code']}` }
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string
    if (!taskId) return { ok: false, error: 'Pas de taskId renvoyé' }
    log('   Tâche créée — publication en cours…')
    return await pollRpaTask(bearer, taskId, log, 8 * 60_000)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  } finally {
    try { await stopPhones(bearer, [phoneId]); log('📴 Téléphone éteint.') } catch { /* ignore */ }
  }
}

// Édition de profil Instagram native (instagramEdit) sur UN téléphone.
export async function editProfileOnPhone(
  bearer: string, phoneId: string,
  fields: { nickname?: string; biography?: string; linkURL?: string; linkTitle?: string },
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log)
    if (!ready) return { ok: false, error: 'Téléphone non démarré' }
    log('✏️ Création de la tâche d\'édition de profil…')
    const res = await geelarkFetch('/rpa/task/instagramEdit', {
      id: phoneId, scheduleAt: Math.floor(Date.now() / 1000) + 5, name: 'ScaleFlow profile edit',
      ...(fields.nickname?.trim() ? { nickname: fields.nickname.trim() } : {}),
      ...(fields.biography != null ? { biography: fields.biography } : {}),
      ...(fields.linkURL?.trim() ? { linkURL: fields.linkURL.trim() } : {}),
      ...(fields.linkTitle?.trim() ? { linkTitle: fields.linkTitle.trim() } : {}),
    }, bearer)
    if (Number(res['code']) !== 0) return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string
    if (!taskId) return { ok: false, error: 'Pas de taskId renvoyé' }
    log('   Tâche créée — édition en cours…')
    return await pollRpaTask(bearer, taskId, log, 8 * 60_000)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  } finally {
    try { await stopPhones(bearer, [phoneId]); log('📴 Téléphone éteint.') } catch { /* ignore */ }
  }
}

// ── Publication de Reels (Mass Posting) ──────────────────────────────────────
// Héberge une vidéo chez GeeLark : /upload/getUrl → PUT des octets → resourceUrl.
// Les templates RPA n'acceptent QUE des URL hébergées par GeeLark, pas une URL
// externe. Les vidéos DOIVENT être uploadées en fileType 'mp4' (les templates IG/
// TikTok/Threads refusent .mov/.webm) — voir CLAUDE.md.
export async function geelarkUploadVideo(
  bearer: string, fileUrl: string, log: (m: string) => void,
): Promise<string | null> {
  try {
    log('⬆️ Envoi de la vidéo vers GeeLark…')
    const res = await geelarkFetch('/upload/getUrl', { fileType: 'mp4' }, bearer)
    if (Number(res['code']) !== 0) { log(`   ⚠ upload/getUrl : ${res['msg'] ?? res['code']}`); return null }
    const d = res['data'] as { uploadUrl?: string; resourceUrl?: string } | undefined
    if (!d?.uploadUrl || !d?.resourceUrl) { log('   ⚠ pas d\'URL d\'upload renvoyée'); return null }
    const bytes = await (await fetch(fileUrl)).arrayBuffer()
    const put = await fetch(d.uploadUrl, { method: 'PUT', body: bytes })
    if (!put.ok) { log(`   ⚠ envoi du média : HTTP ${put.status}`); return null }
    log('   ✅ Vidéo hébergée.')
    return d.resourceUrl
  } catch (e) {
    log(`   ⚠ upload vidéo échoué : ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

// ── Story via RPA custom GeeLark ─────────────────────────────────────────────
// La story n'a pas d'endpoint natif : on importe un flow RPA (« Story Scaleflow »)
// dans le compte GeeLark (une seule fois, mis en cache), puis on l'exécute par
// téléphone via /task/rpa/add avec un paramMap (image + lien + texte du sticker).
const STORY_FLOW_VERSION = 'v10'
const _storyFlowCache = new Map<string, Promise<string | null>>()
function storyFlowLsKey(b: string) { return `sf-story-flowid:${b.slice(-14)}` }
function storyFlowVerKey(b: string) { return `sf-story-flowver:${b.slice(-14)}` }

async function ensureStoryFlowId(bearer: string, log: (m: string) => void): Promise<string | null> {
  const cached = _storyFlowCache.get(bearer)
  if (cached) return cached
  const p = (async (): Promise<string | null> => {
    let stored: string | null = null, ver: string | null = null
    try { stored = localStorage.getItem(storyFlowLsKey(bearer)); ver = localStorage.getItem(storyFlowVerKey(bearer)) } catch { /* ignore */ }
    if (stored && ver === STORY_FLOW_VERSION) return stored
    log(stored ? '🔄 Mise à jour du flow « Story »…' : '📥 Import du flow « Story » dans GeeLark…')
    try {
      const res = await geelarkFetch('/task/flow/import', { gal: JSON.stringify(storyFlowDef) }, bearer)
      if (Number(res['code']) !== 0) { log(`⚠ Import flow story : ${res['msg'] ?? res['code']}`); return null }
      const id = (res['data'] as Record<string, unknown>)?.['id'] as string | undefined
      if (id) { try { localStorage.setItem(storyFlowLsKey(bearer), id); localStorage.setItem(storyFlowVerKey(bearer), STORY_FLOW_VERSION) } catch { /* ignore */ } return id }
      return null
    } catch (e) { log(`⚠ Import flow story : ${e instanceof Error ? e.message : String(e)}`); return null }
  })()
  _storyFlowCache.set(bearer, p)
  p.then(v => { if (!v) _storyFlowCache.delete(bearer) }).catch(() => _storyFlowCache.delete(bearer))
  return p
}

// Héberge une IMAGE chez GeeLark (garde l'extension réelle — les images, contrairement
// aux vidéos, ne sont pas forcées en mp4). Renvoie le resourceUrl hébergé.
export async function geelarkUploadImage(bearer: string, fileUrl: string, log: (m: string) => void): Promise<string | null> {
  try {
    const ext = (fileUrl.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase()
    log('⬆️ Envoi de l\'image vers GeeLark…')
    const res = await geelarkFetch('/upload/getUrl', { fileType: ext }, bearer)
    if (Number(res['code']) !== 0) { log(`   ⚠ upload/getUrl : ${res['msg'] ?? res['code']}`); return null }
    const d = res['data'] as { uploadUrl?: string; resourceUrl?: string } | undefined
    if (!d?.uploadUrl || !d?.resourceUrl) { log('   ⚠ pas d\'URL d\'upload'); return null }
    const bytes = await (await fetch(fileUrl)).arrayBuffer()
    const put = await fetch(d.uploadUrl, { method: 'PUT', body: bytes })
    if (!put.ok) { log(`   ⚠ envoi image : HTTP ${put.status}`); return null }
    log('   ✅ Image hébergée.')
    return d.resourceUrl
  } catch (e) { log(`   ⚠ upload image échoué : ${e instanceof Error ? e.message : String(e)}`); return null }
}

// Publie une Story sur UN téléphone : import flow (si besoin) → démarre → tâche RPA
// story (image + lien sticker propre au compte + texte) → suit → éteint (anti-coût).
export async function postStoryToPhone(
  bearer: string,
  phoneId: string,
  opts: { imageResourceUrl: string; linkUrl: string; linkText?: string; rotationUrls?: string[] },
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const flowId = await ensureStoryFlowId(bearer, log)
    if (!flowId) return { ok: false, error: 'Flow story indisponible' }
    const ready = await ensurePhoneRunning(bearer, phoneId, log, opts.rotationUrls)
    if (!ready) return { ok: false, error: 'Téléphone non démarré' }
    log('📸 Lancement de la story…')
    const paramMap = {
      Media: [opts.imageResourceUrl],
      Link: opts.linkUrl ?? '',
      NameLink: opts.linkText ?? '',
      AddtoHighlights: false, CreateHighlights: '', AddtoHighlightName: '',
    }
    const res = await geelarkFetch('/task/rpa/add', {
      id: phoneId, flowId, scheduleAt: Math.floor(Date.now() / 1000) + 3, name: 'Story Scaleflow', paramMap,
    }, bearer)
    if (Number(res['code']) !== 0) return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string
    if (!taskId) return { ok: false, error: 'Pas de taskId renvoyé' }
    log('   Tâche créée — story en cours…')
    return await pollRpaTask(bearer, taskId, log, 15 * 60_000)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  } finally {
    try { await stopPhones(bearer, [phoneId]); log('📴 Téléphone éteint.') } catch { /* ignore */ }
  }
}

// Publie un Reel sur UN téléphone : démarre → tâche native instagramPubReels →
// suit jusqu'au bout → éteint (anti-coût). `videoResourceUrl` doit être une URL
// hébergée par GeeLark (voir geelarkUploadVideo). Best-effort, ne throw jamais.
export async function postReelToPhone(
  bearer: string,
  phoneId: string,
  videoResourceUrl: string,
  caption: string,
  log: (m: string) => void,
  rotationUrls?: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log, rotationUrls)
    if (!ready) return { ok: false, error: 'Téléphone non démarré' }
    log('🎬 Création de la tâche de publication Reels…')
    const res = await geelarkFetch('/rpa/task/instagramPubReels', {
      id: phoneId,
      scheduleAt: Math.floor(Date.now() / 1000) + 5,
      description: caption ?? '',
      video: [videoResourceUrl],
    }, bearer)
    if (Number(res['code']) !== 0) return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string
    if (!taskId) return { ok: false, error: 'Pas de taskId renvoyé par GeeLark' }
    log('   Tâche créée — publication en cours…')
    return await pollRpaTask(bearer, taskId, log, 20 * 60_000)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  } finally {
    try { await stopPhones(bearer, [phoneId]); log('📴 Téléphone éteint.') } catch { /* ignore */ }
  }
}
