// Client GeeLark minimal pour l'app desktop. Contrairement à l'app web (bloquée
// par CORS → relais serverless), l'app Electron tourne avec webSecurity:false :
// le renderer appelle donc directement openapi.geelark.com. Aucun IPC nécessaire.
//
// Porté fidèlement des primitives de electron-app/src/lib/geelark.ts (warmup natif,
// démarrage/arrêt de téléphone, sonde de tâche RPA). Best-effort, jamais de secret loggé.

import storyFlowDef from './geelarkStoryFlow.json'
import photoFlowDef from './geelarkPhotoFlow.json'
import warmupFlowDef from './geelarkWarmupFlow.json'
import loginFlowDef from './geelarkLoginFlow.json'
import reelsFlowDef from './geelarkReelsFlow.json'
import trialFlowDef from './geelarkTrialFlow.json'
import { IS_WEB } from './platform'

const BASE = 'https://openapi.geelark.com/open/v1'

export function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }

export interface GeelarkPhone {
  id: string
  serialName?: string | null
  name?: string | null
  serialNo?: string | null
  groupName?: string | null
  group?: { name?: string | null } | null
  remark?: string | null
  status: number // 0=running, 1=stopped, 2=starting, 3=stopping
}

// Statut GeeLark (nombre) → libellé lisible ('online'/'offline').
export function geelarkStatusLabel(status: number): string {
  return (status === 0 || status === 2) ? 'online' : 'offline'
}

async function geelarkFetch(path: string, body: unknown, bearer: string): Promise<Record<string, unknown>> {
  // WEB : relais serverless (bypass CORS). Electron : appel direct.
  if (IS_WEB) {
    const res = await fetch('/api/geelark', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'POST', url: `${BASE}${path}`, headers: { Authorization: `Bearer ${bearer}` }, body: body ?? {} }),
    })
    const j = await res.json() as { ok: boolean; error?: string; data?: unknown }
    if (!j.ok) throw new Error(j.error || 'GeeLark (relais) : échec')
    return (j.data ?? {}) as Record<string, unknown>
  }
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

// Annule une tâche RPA GeeLark (programmée ou en attente). /rpa/task/cancel { id }.
export async function cancelGeelarkTask(bearer: string, taskId: string): Promise<boolean> {
  try {
    const res = await geelarkFetch('/rpa/task/cancel', { id: taskId }, bearer)
    return Number(res['code']) === 0
  } catch { return false }
}

// Statut de plusieurs tâches d'un coup. /rpa/task/batchQuery { ids } (max 100).
// Renvoie une map taskId → status GeeLark (0=en attente/planifié, 2=en cours, 3=fini, 4=échec…).
export async function batchQueryTasks(bearer: string, ids: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      const res = await geelarkFetch('/rpa/task/batchQuery', { ids: chunk }, bearer)
      const d = (res['data'] ?? res) as Record<string, unknown>
      const list = ((d['items'] ?? d['list'] ?? d['tasks'] ?? d['records'] ?? []) as Array<Record<string, unknown>>)
      for (const it of list) { const id = String(it['id'] ?? it['taskId'] ?? ''); if (id) out[id] = Number(it['status']) }
    }
  } catch { /* best-effort */ }
  return out
}

export async function stopPhones(bearer: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const res = await geelarkFetch('/phone/stop', { ids }, bearer)
  const data = (res['data'] as Record<string, unknown>) ?? {}
  const success = Number(data['successAmount'] ?? ids.length)
  return Number.isFinite(success) ? success : ids.length
}

// Éteint UN téléphone de façon SÛRE (anti-coût) : réessaie et VÉRIFIE l'extinction.
// Le simple /phone/stop peut échouer/ne pas prendre → le téléphone restait allumé
// après une erreur. Ici on retente jusqu'à 4 fois et on confirme via /phone/list.
export async function stopPhoneSurely(bearer: string, phoneId: string, log?: (m: string) => void): Promise<boolean> {
  // Signal FIABLE = la réponse de /phone/stop (code 0 / successAmount) : GeeLark a
  // ACCEPTÉ l'arrêt → il éteindra le téléphone (l'extinction réelle prend quelques s).
  // On ne se base PAS sur /phone/list (trop lent à refléter → faux « non confirmée »).
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await geelarkFetch('/phone/stop', { ids: [phoneId] }, bearer)
      const code = Number(res['code'] ?? -1)
      const data = (res['data'] as Record<string, unknown>) ?? {}
      const success = Number(data['successAmount'] ?? (code === 0 ? 1 : 0))
      const failed = Number(data['failAmount'] ?? 0)
      if (code === 0 && failed === 0) { log?.('📴 Téléphone éteint.'); return true }
      if (success > 0) { log?.('📴 Téléphone éteint.'); return true }
    } catch { /* réseau — on retente */ }
    if (attempt < 4) { log?.(`  ↻ Arrêt refusé — nouvelle tentative (${attempt}/3)…`); await sleep(4000) }
  }
  // Dernier recours : peut-être DÉJÀ éteint (le stop a été accepté mais renvoyé une
  // erreur car le tel n'était plus démarré) → on vérifie l'état réel.
  try {
    const phones = await fetchAllPhones(bearer)
    const st = Number(phones.find(p => p.id === phoneId)?.status ?? -1)
    if (st !== 0 && st !== 2) { log?.('📴 Téléphone éteint.'); return true }  // 0=démarré, 2=démarrage
  } catch { /* ignore */ }
  log?.('⚠️ Arrêt non confirmé — le watchdog serveur éteindra le téléphone.')
  return false
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
    // WEB : relais /api/rotate (CORS + certificats auto-signés gérés côté serveur).
    const res = IS_WEB
      ? await fetch(`/api/rotate?url=${encodeURIComponent(clean)}`)
      : await fetch(clean, { method: 'GET' })
    const ok = IS_WEB ? (await res.json().then((j: any) => !!j.ok).catch(() => res.ok)) : res.ok
    log?.(ok ? '🔄 Rotation IP : nouvelle IP demandée ✓' : `⚠ Rotation IP : réponse ${res.status}`)
    return ok
  } catch { log?.('⚠ Rotation IP : proxy injoignable — on continue'); return false }
}
export async function rotateAllProxies(urls: string[], log?: (m: string) => void): Promise<void> {
  const list = (urls ?? []).map(u => (u ?? '').trim()).filter(u => /^https?:\/\//i.test(u))
  if (list.length === 0) return
  await Promise.all(list.map(u => rotateProxyIp(u, log)))
  log?.('⏳ Nouvelle IP en cours d\'attribution — attente 12 s…')
  await sleep(ROTATION_SETTLE_MS)
}

// Extrait la vraie raison d'échec d'un /phone/start (msg global + détails par tel).
function startFailReason(startRes: Record<string, unknown>): string {
  const data = (startRes['data'] as Record<string, unknown>) ?? {}
  const details = (data['failDetails'] ?? data['failList'] ?? data['details']) as Array<Record<string, unknown>> | undefined
  const d0 = Array.isArray(details) ? details[0] : undefined
  const raw = String(d0?.['msg'] ?? d0?.['message'] ?? startRes['msg'] ?? startRes['message'] ?? `code ${startRes['code']}`)
  // Traduit les causes GeeLark fréquentes en message clair.
  if (/concurren|simultan|running.*limit|limit.*running|max.*phone|quota/i.test(raw)) {
    return 'limite de téléphones simultanés GeeLark atteinte — baisse « Téléphones simultanés » ou attends que d\'autres finissent'
  }
  return raw
}

// Tente de démarrer un téléphone (avec 1 relance sur échec transitoire). Renvoie la
// raison réelle en cas d'échec (au lieu d'un générique « non démarré »).
async function tryStartPhone(bearer: string, phoneId: string, log: (m: string) => void): Promise<{ ok: boolean; reason?: string }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const startRes = await geelarkFetch('/phone/start', { ids: [phoneId] }, bearer)
    const code = Number(startRes['code'] ?? -1)
    const success = Number((startRes['data'] as Record<string, unknown>)?.['successAmount'] ?? 0)
    const failed = Number((startRes['data'] as Record<string, unknown>)?.['failAmount'] ?? 0)
    if (code === 0 || success > 0) return { ok: true }
    if (failed > 0 || code !== 0) {
      const reason = startFailReason(startRes)
      if (attempt < 2) { log(`  ↻ Démarrage refusé (${reason}) — nouvelle tentative dans 10 s…`); await sleep(10000); continue }
      log(`  ❌ Démarrage impossible : ${reason}`)
      return { ok: false, reason }
    }
    return { ok: true }
  }
  return { ok: true }
}

// Démarre un téléphone et attend qu'il soit en marche (status=0), max 120 s.
// rotationUrls : si fourni, on rote l'IP AVANT le boot (le tel démarre sur la nouvelle IP).
// Renvoie { ok, reason? } — reason = vraie cause GeeLark si le démarrage échoue.
async function ensurePhoneRunning(bearer: string, phoneId: string, log: (m: string) => void, rotationUrls?: string[], skipStart?: boolean): Promise<{ ok: boolean; reason?: string }> {
  // skipStart : le lot a déjà été démarré en UN SEUL appel /phone/start groupé
  // (évite 12 /phone/start simultanés que GeeLark refuse en partie). On attend juste.
  if (!skipStart) {
    if (rotationUrls && rotationUrls.length) await rotateAllProxies(rotationUrls, log)
    log('📱 Démarrage du téléphone…')
    const started = await tryStartPhone(bearer, phoneId, log)
    if (!started.ok) return started
  }

  log('⏳ Attente du démarrage (max 120 s)…')
  for (let i = 0; i < 24; i++) {
    await sleep(5000)
    try {
      const phones = await fetchAllPhones(bearer)
      const st = Number(phones.find(x => x.id === phoneId)?.status ?? -1)
      if (st === 0) { log('  ✅ Téléphone démarré'); return { ok: true } }
    } catch { /* ignore polling errors */ }
  }
  log('  ⚠️ Démarrage non confirmé — on poursuit quand même')
  return { ok: true }
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
    if ([4, 7, 8].includes(st)) {
      const fd = (it['failDesc'] ?? it['failMsg'] ?? it['msg']) as string | undefined
      log(`   ❌ Tâche échouée : ${fd ?? `statut ${st}`}`)
      return { ok: false, error: fd ?? `statut ${st}` }
    }
  }
  log('   ⏳ Délai dépassé — la tâche peut continuer côté GeeLark.')
  return { ok: true }
}

// Warmup via flow RPA GeeLark CUSTOM (fourni) : recherche mot-clé + Reels, avec
// like/comment/follow aléatoires. Lève « Not logged in » si le compte n'est pas
// connecté (au lieu de finir en 2 s en silence comme le warmup natif).
const WARMUP_FLOW_VERSION = 'v1'
const _warmupFlowCache = new Map<string, Promise<string | null>>()
async function ensureWarmupFlowId(bearer: string, log: (m: string) => void): Promise<string | null> {
  const cached = _warmupFlowCache.get(bearer)
  if (cached) return cached
  const p = (async (): Promise<string | null> => {
    const lsK = `sf-warmup-flowid:${bearer.slice(-14)}`, lsV = `sf-warmup-flowver:${bearer.slice(-14)}`
    let stored: string | null = null, ver: string | null = null
    try { stored = localStorage.getItem(lsK); ver = localStorage.getItem(lsV) } catch { /* ignore */ }
    if (stored && ver === WARMUP_FLOW_VERSION) return stored
    log(stored ? '🔄 Mise à jour du flow « Warmup »…' : '📥 Import du flow « Warmup » dans GeeLark…')
    try {
      const res = await geelarkFetch('/task/flow/import', { gal: JSON.stringify(warmupFlowDef) }, bearer)
      if (Number(res['code']) !== 0) { log(`⚠ Import flow warmup : ${res['msg'] ?? res['code']}`); return null }
      const id = (res['data'] as Record<string, unknown>)?.['id'] as string | undefined
      if (id) { try { localStorage.setItem(lsK, id); localStorage.setItem(lsV, WARMUP_FLOW_VERSION) } catch { /* ignore */ } return id }
      return null
    } catch (e) { log(`⚠ Import flow warmup : ${e instanceof Error ? e.message : String(e)}`); return null }
  })()
  _warmupFlowCache.set(bearer, p)
  p.then(v => { if (!v) _warmupFlowCache.delete(bearer) }).catch(() => _warmupFlowCache.delete(bearer))
  return p
}

// Démarre le téléphone → lance le flow warmup (Reels + interactions) → suit → éteint.
export async function warmupAccountNative(
  bearer: string,
  phoneId: string,
  config: { browseVideo: number; keyword?: string; rotationUrls?: string[] },
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const flowId = await ensureWarmupFlowId(bearer, log)
    if (!flowId) return { ok: false, error: 'Flow warmup indisponible' }
    const ready = await ensurePhoneRunning(bearer, phoneId, log, config.rotationUrls)
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
    const n = Math.max(1, Math.min(100, Math.round(config.browseVideo)))
    const kw = config.keyword?.trim()
    log(`🔥 Lancement du warmup (${n} vidéos${kw ? `, mot-clé « ${kw} »` : ''})…`)
    // Sans mot-clé : on N'ENVOIE PAS SearchKeyword → le flow prend la branche
    // « parcourir les Reels » (sinon la branche recherche boucle sur une liste vide).
    const paramMap: Record<string, unknown> = kw ? { NumberOfVideosViewed: n, SearchKeyword: [kw] } : { NumberOfVideosViewed: n }
    const res = await geelarkFetch('/task/rpa/add', {
      id: phoneId, flowId, scheduleAt: Math.floor(Date.now() / 1000) + 3, name: 'Warmup Scaleflow', paramMap,
    }, bearer)
    if (Number(res['code']) !== 0) return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string
    if (!taskId) return { ok: false, error: 'Pas de taskId renvoyé par GeeLark' }
    log('   Tâche créée — warmup en cours…')
    return await pollRpaTask(bearer, taskId, log, 25 * 60_000)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  } finally {
    await stopPhoneSurely(bearer, phoneId, log)
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
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
    log('🔐 Connexion via RPA…')
    const paramMap = { User: creds.email, Password: creds.password, Key: (creds.totp ?? '').replace(/[\s=]/g, '').toUpperCase() }
    const res = await geelarkFetch('/task/rpa/add', { id: phoneId, flowId, scheduleAt: Math.floor(Date.now() / 1000) + 3, name: 'Login Scaleflow', paramMap }, bearer)
    if (Number(res['code']) !== 0) return { ok: false, error: `GeeLark login : ${res['msg'] ?? res['code']}` }
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string
    if (!taskId) return { ok: false, error: 'Pas de taskId renvoyé' }
    log('   Tâche créée — connexion en cours…')
    const r = await pollRpaTask(bearer, taskId, log, 10 * 60_000)
    // IMPORTANT : après un login réussi, on laisse Instagram ÉCRIRE la session sur
    // le disque avant d'éteindre. Sinon on coupait le tel juste après la 2FA et la
    // session n'était pas persistée → compte déconnecté au redémarrage.
    if (r.ok) { log('   💾 Sauvegarde de la session (20 s)…'); await sleep(20000) }
    return r
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  } finally {
    await stopPhoneSurely(bearer, phoneId, log)
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
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
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
    await stopPhoneSurely(bearer, phoneId, log)
  }
}

// Programme un cross-post pour une heure FUTURE (tâche GeeLark, PC éteint — cf.
// scheduleReelOnPhone). Aucun boot/poll/stop : GeeLark exécute à l'heure prévue.
export async function scheduleCrossOnPhone(
  bearer: string, phoneId: string, platform: CrossPlatform,
  opts: { mediaResourceUrl: string; isImage?: boolean; caption?: string },
  scheduleAtUnix: number, _log: (m: string) => void,
): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  const cfg = CROSS_PLATFORMS.find(p => p.key === platform)!
  try {
    let endpoint = cfg.endpoint
    let mediaField: 'video' | 'images' = 'video'
    if (platform === 'threads' && opts.isImage) { endpoint = '/rpa/task/threadsImage'; mediaField = 'images' }
    const res = await geelarkFetch(endpoint, {
      id: phoneId, scheduleAt: scheduleAtUnix,
      title: (opts.caption ?? '').slice(0, 500), [mediaField]: [opts.mediaResourceUrl], name: `ScaleFlow ${cfg.label} (programmé)`.slice(0, 128),
    }, bearer)
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string | undefined
    if (Number(res['code']) === 0 && taskId) return { ok: true, taskId }
    return { ok: false, error: `GeeLark (${cfg.label}) : ${res['msg'] ?? res['code']}` }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' } }
}

// Édition de profil Instagram native (instagramEdit) sur UN téléphone.
export async function editProfileOnPhone(
  bearer: string, phoneId: string,
  fields: { nickname?: string; biography?: string; linkURL?: string; linkTitle?: string },
  log: (m: string) => void,
  rotationUrls?: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log, rotationUrls)
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
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
    await stopPhoneSurely(bearer, phoneId, log)
  }
}

// ── Publication de Reels (Mass Posting) ──────────────────────────────────────
// WEB : l'upload (getUrl + PUT présigné OSS) est CORS-bloqué côté navigateur →
// on délègue au relais /api/geelark-upload qui télécharge le média et le PUT côté serveur.
async function uploadViaProxy(fileUrl: string, bearer: string, fileType: string, log: (m: string) => void): Promise<string | null> {
  try {
    const res = await fetch('/api/geelark-upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedUrl: fileUrl, bearer, fileType }),
    })
    // La réponse peut être une page d'erreur Vercel (non-JSON) — on lit le texte
    // d'abord pour remonter le VRAI message (statut + cause) au lieu de « Unexpected token ».
    const text = await res.text()
    let j: { ok?: boolean; token?: string; error?: string }
    try { j = JSON.parse(text) as typeof j }
    catch {
      const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
      const hint = res.status === 504 ? ' (timeout serveur — vidéo trop lourde/lente)' : res.status >= 500 ? ' (erreur/crash fonction serverless)' : ''
      log(`   ⚠ upload (relais) : HTTP ${res.status}${hint} — ${snippet}`)
      return null
    }
    if (j.ok && j.token) { log('   ✅ Média hébergé (relais).'); return j.token }
    log(`   ⚠ upload (relais) : ${j.error ?? 'échec'}`); return null
  } catch (e) { log(`   ⚠ upload (relais) échoué : ${e instanceof Error ? e.message : String(e)}`); return null }
}

// Héberge une vidéo chez GeeLark : /upload/getUrl → PUT des octets → resourceUrl.
// Les templates RPA n'acceptent QUE des URL hébergées par GeeLark, pas une URL
// externe. Les vidéos DOIVENT être uploadées en fileType 'mp4' (les templates IG/
// TikTok/Threads refusent .mov/.webm) — voir CLAUDE.md.
export async function geelarkUploadVideo(
  bearer: string, fileUrl: string, log: (m: string) => void,
): Promise<string | null> {
  try {
    log('⬆️ Envoi de la vidéo vers GeeLark…')
    if (IS_WEB) return await uploadViaProxy(fileUrl, bearer, 'mp4', log)
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
const STORY_FLOW_VERSION = 'v17'
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

// ── Reels via flow RPA custom (nécessaire pour la MINIATURE/couverture) ──────
// Le natif instagramPubReels ne gère pas la cover NI les Reels d'essai (« Trial ») ;
// on importe un flow custom (mis en cache) et on le lance avec un paramMap
// { Caption, Video, Cover, Trial }. Le flow coche le toggle « Trial » de l'écran final
// en s'ancrant sur le TEXTE « Trial » (robuste à la position, même si la légende scrolle).
// v11 : ajout du bloc Trial → bump de version pour forcer la ré-import du flow.
const REELS_FLOW_VERSION = 'v11'
const _reelsFlowCache = new Map<string, Promise<string | null>>()
function reelsFlowLsKey(b: string) { return `sf-reels-flowid:${b.slice(-14)}` }
function reelsFlowVerKey(b: string) { return `sf-reels-flowver:${b.slice(-14)}` }
async function ensureReelsFlowId(bearer: string, log: (m: string) => void): Promise<string | null> {
  const cached = _reelsFlowCache.get(bearer)
  if (cached) return cached
  const p = (async (): Promise<string | null> => {
    let stored: string | null = null, ver: string | null = null
    try { stored = localStorage.getItem(reelsFlowLsKey(bearer)); ver = localStorage.getItem(reelsFlowVerKey(bearer)) } catch { /* ignore */ }
    if (stored && ver === REELS_FLOW_VERSION) return stored
    log(stored ? '🔄 Mise à jour du flow « Reels »…' : '📥 Import du flow « Reels » dans GeeLark…')
    try {
      const res = await geelarkFetch('/task/flow/import', { gal: JSON.stringify(reelsFlowDef) }, bearer)
      if (Number(res['code']) !== 0) { log(`⚠ Import flow Reels : ${res['msg'] ?? res['code']}`); return null }
      const id = (res['data'] as Record<string, unknown>)?.['id'] as string | undefined
      if (id) { try { localStorage.setItem(reelsFlowLsKey(bearer), id); localStorage.setItem(reelsFlowVerKey(bearer), REELS_FLOW_VERSION) } catch { /* ignore */ } return id }
      return null
    } catch (e) { log(`⚠ Import flow Reels : ${e instanceof Error ? e.message : String(e)}`); return null }
  })()
  _reelsFlowCache.set(bearer, p)
  p.then(v => { if (!v) _reelsFlowCache.delete(bearer) }).catch(() => _reelsFlowCache.delete(bearer))
  return p
}

// ── Reels d'ESSAI (« Trial ») via flow RPA dédié ─────────────────────────────
// Flow propre et testé (fourni) : upload vidéo → partage vers Instagram → légende →
// SI Trial=true, scroll + clic sur le toggle « Trial » + « Close » → Share.
// paramMap : { Video: [resourceUrl], Caption, Trial: true }.
// v2 : garde-fou « Trial absent » → throwException (post annulé + remboursé) au lieu
// de publier un Reel normal quand le compte n'est pas éligible aux Reels d'essai.
const TRIAL_FLOW_VERSION = 'v2'
const _trialFlowCache = new Map<string, Promise<string | null>>()
function trialFlowLsKey(b: string) { return `sf-trial-flowid:${b.slice(-14)}` }
function trialFlowVerKey(b: string) { return `sf-trial-flowver:${b.slice(-14)}` }
async function ensureTrialFlowId(bearer: string, log: (m: string) => void): Promise<string | null> {
  const cached = _trialFlowCache.get(bearer)
  if (cached) return cached
  const p = (async (): Promise<string | null> => {
    let stored: string | null = null, ver: string | null = null
    try { stored = localStorage.getItem(trialFlowLsKey(bearer)); ver = localStorage.getItem(trialFlowVerKey(bearer)) } catch { /* ignore */ }
    if (stored && ver === TRIAL_FLOW_VERSION) return stored
    log(stored ? '🔄 Mise à jour du flow « Trial »…' : '📥 Import du flow « Trial » dans GeeLark…')
    try {
      const res = await geelarkFetch('/task/flow/import', { gal: JSON.stringify(trialFlowDef) }, bearer)
      if (Number(res['code']) !== 0) { log(`⚠ Import flow Trial : ${res['msg'] ?? res['code']}`); return null }
      const id = (res['data'] as Record<string, unknown>)?.['id'] as string | undefined
      if (id) { try { localStorage.setItem(trialFlowLsKey(bearer), id); localStorage.setItem(trialFlowVerKey(bearer), TRIAL_FLOW_VERSION) } catch { /* ignore */ } return id }
      return null
    } catch (e) { log(`⚠ Import flow Trial : ${e instanceof Error ? e.message : String(e)}`); return null }
  })()
  _trialFlowCache.set(bearer, p)
  p.then(v => { if (!v) _trialFlowCache.delete(bearer) }).catch(() => _trialFlowCache.delete(bearer))
  return p
}

// Héberge une IMAGE chez GeeLark (garde l'extension réelle — les images, contrairement
// aux vidéos, ne sont pas forcées en mp4). Renvoie le resourceUrl hébergé.
export async function geelarkUploadImage(bearer: string, fileUrl: string, log: (m: string) => void): Promise<string | null> {
  try {
    const ext = (fileUrl.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase()
    log('⬆️ Envoi de l\'image vers GeeLark…')
    if (IS_WEB) return await uploadViaProxy(fileUrl, bearer, ext, log)
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

// Héberge chez GeeLark une image fournie EN BASE64 (JPEG) — ex. une frame de la vidéo
// capturée côté navigateur comme miniature. `base64` = sans le préfixe data:.
export async function geelarkUploadImageData(bearer: string, base64: string, log: (m: string) => void): Promise<string | null> {
  try {
    log('⬆️ Envoi de la miniature vers GeeLark…')
    if (IS_WEB) {
      const res = await fetch('/api/geelark-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataBase64: base64, bearer, fileType: 'jpg' }),
      })
      const text = await res.text()
      let j: { ok?: boolean; token?: string; error?: string }
      try { j = JSON.parse(text) as typeof j } catch { log(`   ⚠ miniature (relais) : HTTP ${res.status}`); return null }
      if (j.ok && j.token) { log('   ✅ Miniature hébergée.'); return j.token }
      log(`   ⚠ miniature (relais) : ${j.error ?? 'échec'}`); return null
    }
    const res = await geelarkFetch('/upload/getUrl', { fileType: 'jpg' }, bearer)
    if (Number(res['code']) !== 0) { log(`   ⚠ upload/getUrl : ${res['msg'] ?? res['code']}`); return null }
    const d = res['data'] as { uploadUrl?: string; resourceUrl?: string } | undefined
    if (!d?.uploadUrl || !d?.resourceUrl) { log('   ⚠ pas d\'URL d\'upload'); return null }
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const put = await fetch(d.uploadUrl, { method: 'PUT', body: bytes })
    if (!put.ok) { log(`   ⚠ envoi miniature : HTTP ${put.status}`); return null }
    log('   ✅ Miniature hébergée.')
    return d.resourceUrl
  } catch (e) { log(`   ⚠ upload miniature échoué : ${e instanceof Error ? e.message : String(e)}`); return null }
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
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
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
    await stopPhoneSurely(bearer, phoneId, log)
  }
}

// Programme une story pour une heure FUTURE (tâche GeeLark, PC éteint — cf.
// scheduleReelOnPhone). Aucun boot/poll/stop : GeeLark exécute à l'heure prévue.
export async function scheduleStoryOnPhone(
  bearer: string, phoneId: string,
  opts: { imageResourceUrl: string; linkUrl: string; linkText?: string },
  scheduleAtUnix: number, log: (m: string) => void,
): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  try {
    const flowId = await ensureStoryFlowId(bearer, log)
    if (!flowId) return { ok: false, error: 'Flow story indisponible' }
    const paramMap = {
      Media: [opts.imageResourceUrl], Link: opts.linkUrl ?? '', NameLink: opts.linkText ?? '',
      AddtoHighlights: false, CreateHighlights: '', AddtoHighlightName: '',
    }
    const res = await geelarkFetch('/task/rpa/add', {
      id: phoneId, flowId, scheduleAt: scheduleAtUnix, name: 'Story Scaleflow (programmé)', paramMap,
    }, bearer)
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string | undefined
    if (Number(res['code']) === 0 && taskId) return { ok: true, taskId }
    return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' } }
}

// ── Post PHOTO (feed) via flow RPA GeeLark « Instagram Photo post » ───────────
// Media = 1 image (photo simple) ou plusieurs (carrousel). Caption = description.
// MusicID laissé vide → post feed normal (pas d'audio Reels).
const PHOTO_FLOW_VERSION = 'v1'
const _photoFlowCache = new Map<string, Promise<string | null>>()
function photoFlowLsKey(b: string) { return `sf-photo-flowid:${b.slice(-14)}` }
function photoFlowVerKey(b: string) { return `sf-photo-flowver:${b.slice(-14)}` }

async function ensurePhotoFlowId(bearer: string, log: (m: string) => void): Promise<string | null> {
  const cached = _photoFlowCache.get(bearer)
  if (cached) return cached
  const p = (async (): Promise<string | null> => {
    let stored: string | null = null, ver: string | null = null
    try { stored = localStorage.getItem(photoFlowLsKey(bearer)); ver = localStorage.getItem(photoFlowVerKey(bearer)) } catch { /* ignore */ }
    if (stored && ver === PHOTO_FLOW_VERSION) return stored
    log(stored ? '🔄 Mise à jour du flow « Photo »…' : '📥 Import du flow « Photo » dans GeeLark…')
    try {
      const res = await geelarkFetch('/task/flow/import', { gal: JSON.stringify(photoFlowDef) }, bearer)
      if (Number(res['code']) !== 0) { log(`⚠ Import flow photo : ${res['msg'] ?? res['code']}`); return null }
      const id = (res['data'] as Record<string, unknown>)?.['id'] as string | undefined
      if (id) { try { localStorage.setItem(photoFlowLsKey(bearer), id); localStorage.setItem(photoFlowVerKey(bearer), PHOTO_FLOW_VERSION) } catch { /* ignore */ } return id }
      return null
    } catch (e) { log(`⚠ Import flow photo : ${e instanceof Error ? e.message : String(e)}`); return null }
  })()
  _photoFlowCache.set(bearer, p)
  p.then(v => { if (!v) _photoFlowCache.delete(bearer) }).catch(() => _photoFlowCache.delete(bearer))
  return p
}

// Publie une PHOTO (ou carrousel) sur UN téléphone : import flow → démarre →
// tâche RPA (Media + Caption) → suit → éteint (anti-coût).
export async function postPhotoToPhone(
  bearer: string,
  phoneId: string,
  opts: { imageResourceUrls: string[]; caption?: string; rotationUrls?: string[] },
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!opts.imageResourceUrls?.length) return { ok: false, error: 'Aucune image' }
    const flowId = await ensurePhotoFlowId(bearer, log)
    if (!flowId) return { ok: false, error: 'Flow photo indisponible' }
    const ready = await ensurePhoneRunning(bearer, phoneId, log, opts.rotationUrls)
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }
    log('🖼 Lancement du post photo…')
    const paramMap = { Media: opts.imageResourceUrls, Caption: opts.caption ?? '', MusicID: '' }
    const res = await geelarkFetch('/task/rpa/add', {
      id: phoneId, flowId, scheduleAt: Math.floor(Date.now() / 1000) + 3, name: 'Photo Scaleflow', paramMap,
    }, bearer)
    if (Number(res['code']) !== 0) return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string
    if (!taskId) return { ok: false, error: 'Pas de taskId renvoyé' }
    log('   Tâche créée — publication en cours…')
    return await pollRpaTask(bearer, taskId, log, 15 * 60_000)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  } finally {
    await stopPhoneSurely(bearer, phoneId, log)
  }
}

// Programme un post photo pour une heure FUTURE (GeeLark, PC éteint).
export async function schedulePhotoOnPhone(
  bearer: string, phoneId: string,
  opts: { imageResourceUrls: string[]; caption?: string },
  scheduleAtUnix: number, log: (m: string) => void,
): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  try {
    if (!opts.imageResourceUrls?.length) return { ok: false, error: 'Aucune image' }
    const flowId = await ensurePhotoFlowId(bearer, log)
    if (!flowId) return { ok: false, error: 'Flow photo indisponible' }
    const paramMap = { Media: opts.imageResourceUrls, Caption: opts.caption ?? '', MusicID: '' }
    const res = await geelarkFetch('/task/rpa/add', {
      id: phoneId, flowId, scheduleAt: scheduleAtUnix, name: 'Photo Scaleflow (programmé)', paramMap,
    }, bearer)
    const taskId = (res['data'] as Record<string, unknown>)?.['taskId'] as string | undefined
    if (Number(res['code']) === 0 && taskId) return { ok: true, taskId }
    return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' } }
}

// Publie un Reel sur UN téléphone : démarre → tâche native instagramPubReels →
// suit jusqu'au bout → éteint (anti-coût). `videoResourceUrl` doit être une URL
// hébergée par GeeLark (voir geelarkUploadVideo). Best-effort, ne throw jamais.
// Programme un Reel sur GeeLark pour une heure FUTURE : on crée juste la tâche RPA
// avec un scheduleAt futur. GeeLark démarre le téléphone et exécute la tâche dans le
// cloud À L'HEURE PRÉVUE, même PC/onglet fermés (aucun boot/poll/stop côté client).
// Renvoie le taskId pour suivi éventuel. trial → flow Trial ; cover → flow miniature ;
// sinon natif instagramPubReels.
export async function scheduleReelOnPhone(
  bearer: string,
  phoneId: string,
  videoResourceUrl: string,
  caption: string,
  scheduleAtUnix: number,
  log: (m: string) => void,
  trial?: boolean,
  coverResourceUrl?: string,
): Promise<{ ok: boolean; taskId?: string; error?: string }> {
  const taskIdOf = (res: Record<string, unknown>): string | undefined => {
    const d = res['data'] as Record<string, unknown> | undefined
    return (d?.['taskId'] ?? d?.['id']) as string | undefined
  }
  try {
    if (trial) {
      const flowId = await ensureTrialFlowId(bearer, log).catch(() => null)
      if (flowId) {
        const res = await geelarkFetch('/task/rpa/add', {
          id: phoneId, flowId, scheduleAt: scheduleAtUnix, name: 'Reels Trial Scaleflow (programmé)',
          paramMap: { Video: [videoResourceUrl], Caption: caption ?? '', Trial: true },
        }, bearer)
        const taskId = taskIdOf(res)
        if (Number(res['code']) === 0 && taskId) return { ok: true, taskId }
        return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
      }
    }
    if (coverResourceUrl && !trial) {
      const flowId = await ensureReelsFlowId(bearer, log).catch(() => null)
      if (flowId) {
        const res = await geelarkFetch('/task/rpa/add', {
          id: phoneId, flowId, scheduleAt: scheduleAtUnix, name: 'Reels Scaleflow (programmé)',
          paramMap: { Caption: caption ?? '', Video: [videoResourceUrl], Cover: [coverResourceUrl] },
        }, bearer)
        const taskId = taskIdOf(res)
        if (Number(res['code']) === 0 && taskId) return { ok: true, taskId }
      }
    }
    const res = await geelarkFetch('/rpa/task/instagramPubReels', {
      id: phoneId, scheduleAt: scheduleAtUnix, description: caption ?? '', video: [videoResourceUrl],
    }, bearer)
    const taskId = taskIdOf(res)
    if (Number(res['code']) === 0 && taskId) return { ok: true, taskId }
    return { ok: false, error: `GeeLark : ${res['msg'] ?? res['code']}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' }
  }
}

export async function postReelToPhone(
  bearer: string,
  phoneId: string,
  videoResourceUrl: string,
  caption: string,
  log: (m: string) => void,
  rotationUrls?: string[],
  trial?: boolean,
  coverResourceUrl?: string,   // miniature/couverture (URL GeeLark) — via flow custom
  skipStart?: boolean,         // le lot a déjà été démarré en groupe → ne pas re-start
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log, rotationUrls, skipStart)
    if (!ready.ok) return { ok: false, error: ready.reason ?? 'Téléphone non démarré' }

    // Reel d'ESSAI (« Trial ») → flow RPA dédié (propre et testé) : upload → partage →
    // légende → coche le toggle « Trial » si demandé → Share. paramMap { Video, Caption, Trial }.
    if (trial) {
      const flowId = await ensureTrialFlowId(bearer, log).catch(() => null)
      if (flowId) {
        log('🎬 Création de la tâche Reels (essai · non-abonnés)…')
        const res = await geelarkFetch('/task/rpa/add', {
          id: phoneId, flowId, scheduleAt: Math.floor(Date.now() / 1000) + 5, name: 'Reels Trial Scaleflow',
          paramMap: { Video: [videoResourceUrl], Caption: caption ?? '', Trial: true },
        }, bearer)
        if (Number(res['code']) === 0) {
          const d = res['data'] as Record<string, unknown> | undefined
          const taskId = (d?.['taskId'] ?? d?.['id']) as string | undefined
          if (taskId) {
            log('   Tâche créée — publication en cours…')
            const r = await pollRpaTask(bearer, taskId, log, 20 * 60_000)
            // Le flow jette « TRIAL_UNAVAILABLE » si le toggle « Trial » n'apparaît pas
            // (compte non éligible) → post NON publié → on remonte un message clair
            // (échec → crédit remboursé par la phase settle).
            if (!r.ok && /TRIAL_UNAVAILABLE/i.test(r.error ?? '')) {
              log('   ⛔ Reel d\'essai indisponible sur ce compte — post annulé.')
              return { ok: false, error: 'Reel d\'essai indisponible sur ce compte — post annulé (crédit remboursé)' }
            }
            return r
          }
        }
        log(`   ⚠ Flow Trial indisponible (${res['msg'] ?? res['code']}) — repli publication simple.`)
      } else {
        log('   ⚠ Flow Trial indisponible — repli publication simple.')
      }
    }

    // Une MINIATURE (sans essai) → flow RPA custom (le natif ne gère pas la cover).
    if (coverResourceUrl && !trial) {
      const flowId = await ensureReelsFlowId(bearer, log).catch(() => null)
      if (flowId) {
        log('🎬 Création de la tâche Reels (avec miniature)…')
        const res = await geelarkFetch('/task/rpa/add', {
          id: phoneId, flowId, scheduleAt: Math.floor(Date.now() / 1000) + 5, name: 'Reels Scaleflow',
          paramMap: { Caption: caption ?? '', Video: [videoResourceUrl], Cover: [coverResourceUrl] },
        }, bearer)
        if (Number(res['code']) === 0) {
          const d = res['data'] as Record<string, unknown> | undefined
          const taskId = (d?.['taskId'] ?? d?.['id']) as string | undefined
          if (taskId) { log('   Tâche créée — publication en cours…'); return await pollRpaTask(bearer, taskId, log, 20 * 60_000) }
        }
        log(`   ⚠ Flow miniature indisponible (${res['msg'] ?? res['code']}) — repli publication simple.`)
      } else {
        log('   ⚠ Flow miniature indisponible — repli publication simple.')
      }
    }

    // Natif (sans miniature ni essai) OU repli si le flow a échoué.
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
    await stopPhoneSurely(bearer, phoneId, log)
  }
}
