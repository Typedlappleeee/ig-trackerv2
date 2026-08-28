// Client GeeLark minimal pour l'app desktop. Contrairement à l'app web (bloquée
// par CORS → relais serverless), l'app Electron tourne avec webSecurity:false :
// le renderer appelle donc directement openapi.geelark.com. Aucun IPC nécessaire.
//
// Porté fidèlement des primitives de electron-app/src/lib/geelark.ts (warmup natif,
// démarrage/arrêt de téléphone, sonde de tâche RPA). Best-effort, jamais de secret loggé.

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

// Démarre un téléphone et attend qu'il soit en marche (status=0), max 120 s.
async function ensurePhoneRunning(bearer: string, phoneId: string, log: (m: string) => void): Promise<boolean> {
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
  config: { browseVideo: number; keyword?: string },
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log)
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
