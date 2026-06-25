import { registerStartedPhonesAuto } from './phoneWatch'

const BASE = 'https://openapi.geelark.com/open/v1'

// Raw phone shape returned by GéeLark API
export interface GeelarkProxy {
  type?:     string  // socks5 | http | https
  server?:   string
  port?:     number
  username?: string
  password?: string
}

export interface GeelarkPhone {
  id:          string
  serialNo?:   string | null
  serialName?: string | null  // display name in GéeLark UI
  name?:       string | null
  group?:      { name?: string } | null
  groupName?:  string | null
  status:      number  // 0=running, 1=stopped, 2=starting, 3=stopping
  remark?:     string | null
  proxy?:      GeelarkProxy | null  // proxy assigné au téléphone (renvoyé par /phone/list)
}

// Récupère le proxy de chaque téléphone (mappé par geelark_id) via /phone/list.
// Utilisé par le scanner : la requête IG d'un compte passe par SON proxy.
export async function fetchPhoneProxies(bearer: string): Promise<Map<string, GeelarkProxy>> {
  const phones = await fetchAllPhones(bearer)
  const m = new Map<string, GeelarkProxy>()
  for (const p of phones) {
    if (p.proxy && p.proxy.server) m.set(p.id, p.proxy)
  }
  return m
}

function authHeaders(bearer: string) {
  return { Authorization: `Bearer ${bearer}` }
}

// Call GéeLark: uses Electron IPC proxy on desktop, Vercel /api/geelark proxy on web.
async function geelarkFetch(method: 'GET' | 'POST', path: string, body?: unknown, bearer?: string) {
  const url = `${BASE}${path}`
  const headers = bearer ? authHeaders(bearer) : undefined

  if (window.electronAPI?.geelarkRequest) {
    const result = await window.electronAPI.geelarkRequest({ method, url, headers, body })
    if (!result.ok) throw new Error(result.error ?? 'Network error')
    return result.data as Record<string, unknown>
  }

  // Web fallback: route through Vercel proxy (bypasses CORS)
  const res = await fetch('/api/geelark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, url, headers: headers ?? {}, body }),
  })
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
  const result = await res.json()
  if (!result.ok) throw new Error(result.error ?? 'Network error')
  return result.data as Record<string, unknown>
}

// Fetch all phones (paginates automatically).
// Throws a descriptive error if the API rejects the token.
export async function fetchAllPhones(bearer: string): Promise<GeelarkPhone[]> {
  const items: GeelarkPhone[] = []
  let page = 1
  while (true) {
    const d = await geelarkFetch('POST', '/phone/list', { page, pageSize: 50 }, bearer)
    if (d['code'] !== 0) {
      const msg = d['msg'] ?? d['message'] ?? `code ${d['code']}`
      throw new Error(`GéeLark API: ${msg}`)
    }
    const batch = ((d['data'] as Record<string, unknown>)?.['items'] ?? []) as GeelarkPhone[]
    const total = ((d['data'] as Record<string, unknown>)?.['total'] ?? 0) as number
    items.push(...batch)
    if (items.length >= total || batch.length === 0) break
    page++
  }
  return items
}

// GéeLark: 0=running, 1=stopped, 2=starting, 3=stopping
// Treat 0 and 2 as online (phone is up or booting)
export function geelarkStatusLabel(status: number): string {
  return (status === 0 || status === 2) ? 'online' : 'offline'
}

// Stop a single phone (best-effort — never throws).
export async function stopPhone(bearer: string, phoneId: string): Promise<void> {
  try {
    await geelarkFetch('POST', '/phone/stop', { ids: [phoneId] }, bearer)
  } catch { /* ignore */ }
}

// Stop several phones in one call. Returns how many GéeLark reported stopped.
export async function stopPhones(bearer: string, phoneIds: string[]): Promise<number> {
  if (phoneIds.length === 0) return 0
  const res = await geelarkFetch('POST', '/phone/stop', { ids: phoneIds }, bearer)
  const data = (res?.data ?? res) as Record<string, unknown>
  const success = Number((data?.successAmount ?? data?.successDetails ?? phoneIds.length))
  return Number.isFinite(success) ? success : phoneIds.length
}

// Lightweight: fetch only the status of all phones (same endpoint, minimal processing)
export async function fetchPhoneStatuses(bearer: string): Promise<Map<string, string>> {
  const phones = await fetchAllPhones(bearer)
  return new Map(phones.map(p => [p.id, geelarkStatusLabel(p.status)]))
}

// ── Custom RPA flow ──────────────────────────────────────────────────────────
export interface RpaFlow { id: string; title?: string; remark?: string }

// List the user's custom RPA flows so they can pick "IG comment" in settings
export async function listRpaFlows(bearer: string): Promise<RpaFlow[]> {
  const items: RpaFlow[] = []
  let page = 1
  while (true) {
    const d = await geelarkFetch('POST', '/task/rpa/flow/list', { page, pageSize: 50 }, bearer)
    if (d['code'] !== 0) throw new Error(`GéeLark: ${d['msg'] ?? d['message'] ?? d['code']}`)
    const batch = ((d['data'] as Record<string, unknown>)?.['items'] ?? []) as RpaFlow[]
    const total = ((d['data'] as Record<string, unknown>)?.['total'] ?? 0) as number
    items.push(...batch)
    if (items.length >= total || batch.length === 0) break
    page++
  }
  return items
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// Like sleep but rejects immediately if the AbortSignal fires.
function sleepOrAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Annulé')); return }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Annulé')) }, { once: true })
  })
}

// ── Direct phone shell (Android adb-style commands) ─────────────────────────
// Retries up to maxRetries times when GéeLark reports the phone shell isn't ready.
// Pass maxRetries:2 for quick one-shot operations (e.g. extraction).
async function shellExec(
  bearer: string,
  phoneId: string,
  cmd: string,
  opts?: { maxRetries?: number; signal?: AbortSignal },
): Promise<{ output: string; status: number }> {
  const maxRetries = opts?.maxRetries ?? 6
  const signal     = opts?.signal
  // Broad "not ready yet" pattern — include numeric error codes GéeLark uses (10xxx range)
  const NOT_READY  = /not running|not started|unavailable|not ready|phone.*start|en cours de démarrage|starting/i

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (signal?.aborted) throw new Error('Annulé')
    const d = await geelarkFetch('POST', '/shell/execute', { id: phoneId, cmd }, bearer)
    if (d['code'] === 0) {
      const data = (d['data'] as Record<string, unknown>) ?? {}
      return { output: String(data['output'] ?? ''), status: Number(data['status'] ?? -1) }
    }
    const code = Number(d['code'] ?? -1)
    const msg  = String(d['msg'] ?? d['message'] ?? code)
    // Treat GéeLark error codes 10001-10099 (phone not ready range) as retryable
    // 42002 = "phone is not running" — shell daemon not yet up (phone still booting)
    const isNotReady = NOT_READY.test(msg) || (code >= 10001 && code <= 10099) || code === 42002
    if (isNotReady && attempt < maxRetries - 1) {
      await sleepOrAbort(4000 + attempt * 2000, signal)
      continue
    }
    throw new Error(`GéeLark shell: ${msg} (code ${code}, cmd="${cmd.slice(0, 60)}")`)
  }
  throw new Error('GéeLark shell: téléphone non prêt après plusieurs tentatives')
}

// ⚠️ NE PAS appeler juste avant un RPA instagramPubReels.
// `cmd locale set-app-locales` redémarre le process Instagram sur les téléphones
// Android 13+ où la commande prend effet → l'RPA démarre sur une app en plein
// redémarrage et échoue (posting OK sur certains comptes, KO sur d'autres).
// Historique : ajoutée/revert plusieurs fois car « broke phones ». Conservée
// uniquement pour un usage hors chemin de posting (ex: setup manuel).
export async function forceInstagramEnglish(bearer: string, phoneId: string): Promise<void> {
  try {
    await shellExec(bearer, phoneId,
      'cmd locale set-app-locales com.instagram.android --locales en-US',
      { maxRetries: 1 },
    )
    await sleepOrAbort(1000)
  } catch { /* non-critical */ }
}

async function ensurePhoneRunning(
  bearer: string,
  phoneId: string,
  log?: (m: string) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  // Check if phone is currently stopping — wait before trying to start
  try {
    const phones = await fetchAllPhones(bearer)
    const p = phones.find(x => x.id === phoneId)
    if (p) {
      const st = Number(p.status ?? -1)
      const label = st === 0 ? 'en marche' : st === 1 ? 'arrêté' : st === 2 ? 'démarrage en cours' : st === 3 ? 'arrêt en cours' : `inconnu(${st})`
      log?.(`📱 Statut: ${label} [raw=${st}] — ${p.serialName ?? p.name ?? p.id}`)
      if (st === 3) {
        log?.('⏳ En cours d\'arrêt — attente 15s…')
        await sleepOrAbort(15000, signal)
      }
    }
  } catch { /* ignore — still attempt start */ }

  // Always send start command (GéeLark no-ops if already running)
  log?.('📱 Envoi commande de démarrage…')
  const startRes = await geelarkFetch('POST', '/phone/start', { ids: [phoneId] }, bearer)
  // Filet anti-coût : inscrit ce téléphone (démarré par l'automation) pour que le
  // watchdog serveur l'éteigne après 5 min si l'app se ferme avant l'auto-stop.
  registerStartedPhonesAuto([phoneId], { reason: 'ensurePhoneRunning' }).catch(() => {})
  const code    = Number(startRes['code'] ?? -1)
  const success = Number((startRes['data'] as Record<string, unknown>)?.['successAmount'] ?? 0)
  const failed  = Number((startRes['data'] as Record<string, unknown>)?.['failAmount'] ?? 0)
  const msg     = String(startRes['msg'] ?? startRes['message'] ?? '')
  log?.(`  → code=${code}, démarrés=${success}, échecs=${failed}${msg ? ` (${msg})` : ''}`)

  if (code !== 0 && success === 0 && failed > 0) {
    log?.(`❌ Impossible de démarrer: ${msg || code}`)
    return false
  }

  // Phase 1: wait for phone status=1 (running) via status API — max 120s
  log?.('⏳ Attente démarrage du téléphone (max 120s)…')
  let statusReady = false
  for (let i = 0; i < 24; i++) {
    if (signal?.aborted) throw new Error('Annulé')
    await sleepOrAbort(5000, signal)
    try {
      const phones = await fetchAllPhones(bearer)
      const p = phones.find(x => x.id === phoneId)
      const st = Number(p?.status ?? -1)
      if (st === 0) {
        log?.('  📱 Téléphone démarré (status=0)')
        statusReady = true
        break
      }
      const label = st === 2 ? 'démarrage…' : st === 1 ? 'arrêté ?' : `status=${st}`
      log?.(`  ⏳ ${label} (${(i + 1) * 5}s écoulées)`)
    } catch { /* ignore polling errors */ }
  }
  if (!statusReady) {
    log?.('  ⚠️ Status API n\'a pas confirmé le démarrage — tentative shell quand même')
  }

  // Phase 2: wait for shell daemon to accept commands — max 120s
  await warmupShellDelay(bearer, phoneId, log, signal)
  return true
}

// After the phone reaches status=1, wait for the shell daemon to accept commands.
// Retries the probe up to 30 times (150s total) before giving up.
async function warmupShellDelay(
  bearer: string,
  phoneId: string,
  log?: (m: string) => void,
  signal?: AbortSignal,
) {
  log?.('  ⏳ Attente initialisation du shell (max 150s)…')

  for (let attempt = 0; attempt < 30; attempt++) {
    if (signal?.aborted) throw new Error('Annulé')
    await sleepOrAbort(5000, signal)

    try {
      const r   = await geelarkFetch('POST', '/shell/execute', { id: phoneId, cmd: 'echo SHELL_OK' }, bearer)
      const code = Number(r['code'])
      const out  = String((r['data'] as Record<string, unknown>)?.['output'] ?? '')
      if (code === 0 && out.includes('SHELL_OK')) {
        log?.('  ✅ Shell prêt')
        return
      }
      const errMsg = String(r['msg'] ?? r['message'] ?? '')
      log?.(`  ↻ Shell pas encore prêt (code=${code}${errMsg ? ` "${errMsg}"` : ''}) — nouvel essai dans 5s… (${attempt + 1}/30)`)
    } catch (e) {
      log?.(`  ↻ Shell probe erreur: ${e instanceof Error ? e.message : String(e)} — nouvel essai…`)
    }
  }

  log?.('  ⚠️ Shell toujours indisponible après 150s — poursuite quand même (les commandes réessaieront)')
}

// Reply to an Instagram comment by driving the cloud phone via shell commands.
// Auto-starts the phone if needed.
export async function replyToIgCommentViaPhone(
  bearer: string,
  phoneId: string,
  shortcode: string,
  username: string,
  replyText: string,
  log?: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  return withPhoneAutoStop(bearer, phoneId, 5 * 60_000, '5min', log ?? (() => {}),
    () => _replyToIgCommentViaPhoneInner(bearer, phoneId, shortcode, username, replyText, log))
}

async function _replyToIgCommentViaPhoneInner(
  bearer: string,
  phoneId: string,
  shortcode: string,
  username: string,
  replyText: string,
  log?: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log)
    if (!ready) return { ok: false, error: 'phone_failed_to_start' }

    const url = `https://www.instagram.com/p/${shortcode}/`
    log?.('🔗 Ouverture du post…')
    await shellExec(bearer, phoneId,
      `am start -a android.intent.action.VIEW -d "${url}" -p com.instagram.android`)
    await sleep(7000)

    // 2. Dump the UI
    const dumpFile = '/sdcard/window_dump.xml'
    await shellExec(bearer, phoneId, `uiautomator dump ${dumpFile}`)
    const xml = (await shellExec(bearer, phoneId, `cat ${dumpFile}`)).output

    // 3. Find the "Add a comment" / "Ajouter un commentaire" input box bounds
    const findBoundsByContent = (text: string): [number, number] | null => {
      const re = new RegExp(`(?:content-desc|text)="${text}[^"]*"[^/]*?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i')
      const m = xml.match(re)
      if (!m) return null
      return [Math.floor((+m[1] + +m[3]) / 2), Math.floor((+m[2] + +m[4]) / 2)]
    }
    const findBoundsByResourceId = (id: string): [number, number] | null => {
      const re = new RegExp(`resource-id="[^"]*${id}[^"]*"[^/]*?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`)
      const m = xml.match(re)
      if (!m) return null
      return [Math.floor((+m[1] + +m[3]) / 2), Math.floor((+m[2] + +m[4]) / 2)]
    }

    let commentBox = findBoundsByContent('Comment') || findBoundsByContent('Ajouter un commentaire') || findBoundsByContent('Add a comment') || findBoundsByResourceId('comment_text')
    if (!commentBox) {
      // Fallback: open comments first by tapping the comment icon on feed
      const commentIcon = findBoundsByContent('Comment') || findBoundsByContent('Commentaires')
      if (!commentIcon) return { ok: false, error: 'comment_box_not_found' }
      await shellExec(bearer, phoneId, `input tap ${commentIcon[0]} ${commentIcon[1]}`)
      await sleep(2500)
      const xml2 = (await shellExec(bearer, phoneId, `uiautomator dump ${dumpFile} && cat ${dumpFile}`)).output
      const m2 = xml2.match(/(?:content-desc|text)="(?:Add a comment|Ajouter un commentaire)[^"]*"[^/]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i)
      if (!m2) return { ok: false, error: 'comment_box_still_not_found' }
      commentBox = [Math.floor((+m2[1] + +m2[3]) / 2), Math.floor((+m2[2] + +m2[4]) / 2)]
    }

    // 4. Tap the comment box to focus it
    await shellExec(bearer, phoneId, `input tap ${commentBox[0]} ${commentBox[1]}`)
    await sleep(1200)

    // 5. Type the reply (prefix with @mention so original commenter is notified
    //    even though this is a top-level comment — most stable cross-IG-versions)
    const escaped = `@${username} ${replyText}`.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/ /g, '%s')
    await shellExec(bearer, phoneId, `input text "${escaped}"`)
    await sleep(600)

    // 6. Find and tap the Post / Publier button
    const dumpAfter = (await shellExec(bearer, phoneId, `uiautomator dump ${dumpFile} && cat ${dumpFile}`)).output
    const sendMatch = dumpAfter.match(/(?:content-desc|text)="(?:Post|Publier|Send|Envoyer)"[^/]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i)
    if (!sendMatch) return { ok: false, error: 'send_button_not_found' }
    const sendX = Math.floor((+sendMatch[1] + +sendMatch[3]) / 2)
    const sendY = Math.floor((+sendMatch[2] + +sendMatch[4]) / 2)
    await shellExec(bearer, phoneId, `input tap ${sendX} ${sendY}`)
    await sleep(1500)

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Warmup helpers ───────────────────────────────────────────────────────────

export interface WarmupConfig {
  profileName?:    string
  bio?:            string
  profilePicUrl?:  string
  browseMinutes:   number
  likePosts:       boolean
  watchReels:      boolean
  followSuggested: boolean
}

// Parse bounds string "[x1,y1][x2,y2]" → center point
function parseBoundsCenter(bounds: string): [number, number] | null {
  const m = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
  if (!m) return null
  return [Math.floor((+m[1] + +m[3]) / 2), Math.floor((+m[2] + +m[4]) / 2)]
}

// Find element center by matching text/content-desc in UIAutomator XML
function extractBoundsFromElement(element: string): [number, number] | null {
  const m = element.match(/bounds="(\[[^\]]+\]\[[^\]]+\])"/)
  return m ? parseBoundsCenter(m[1]) : null
}

function findByText(xml: string, ...texts: string[]): [number, number] | null {
  for (const text of texts) {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match the full element tag so bounds order doesn't matter
    const re = new RegExp(`<[^>]*(?:text|content-desc)="${escaped}"[^>]*>`)
    const m = xml.match(re)
    if (m) {
      const pt = extractBoundsFromElement(m[0])
      if (pt) return pt
    }
  }
  return null
}

// Partial / contains match — useful when the attribute value has extra words
// (e.g. content-desc="Link sticker" when we search for "link")
function findByTextPartial(xml: string, ...keywords: string[]): [number, number] | null {
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`<[^>]*(?:text|content-desc)="[^"]*${escaped}[^"]*"[^>]*>`, 'i')
    const m = xml.match(re)
    if (m) {
      const pt = extractBoundsFromElement(m[0])
      if (pt) return pt
    }
  }
  return null
}

function findByResourceId(xml: string, ...ids: string[]): [number, number] | null {
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`<[^>]*resource-id="[^"]*${escaped}[^"]*"[^>]*>`)
    const m = xml.match(re)
    if (m) {
      const pt = extractBoundsFromElement(m[0])
      if (pt) return pt
    }
  }
  return null
}

async function dumpXml(bearer: string, phoneId: string): Promise<string> {
  const f = '/sdcard/sf_dump.xml'
  const { output } = await shellExec(bearer, phoneId, `uiautomator dump ${f} && cat ${f}`)
  return output
}

// Find every EditText node in the dump, with its current text and center point.
// Sorted top-to-bottom (by Y). Used to target the sticker-text field precisely:
// the URL field contains "http…", the sticker-text field is the other one.
interface EditField { text: string; center: [number, number]; y: number; focused: boolean }
function findEditTextFields(xml: string): EditField[] {
  const fields: EditField[] = []
  // Match any node whose class is an EditText (Instagram uses EditText subclasses)
  const re = /<node\b[^>]*class="[^"]*EditText[^"]*"[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const node = m[0]
    const boundsM = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    if (!boundsM) continue
    const x1 = +boundsM[1], y1 = +boundsM[2], x2 = +boundsM[3], y2 = +boundsM[4]
    const textM = node.match(/\btext="([^"]*)"/)
    fields.push({
      text: textM ? textM[1] : '',
      center: [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)],
      y: y1,
      focused: /\bfocused="true"/.test(node),
    })
  }
  return fields.sort((a, b) => a.y - b.y)
}

// Tap the field, triple-tap to select all existing text, delete it, then type new text.
// Handles spaces and common special characters safely for Android `input text`.
async function clearAndType(
  bearer: string,
  phoneId: string,
  point: [number, number],
  text: string,
  log: (m: string) => void,
) {
  // Tap to focus the field
  await shellExec(bearer, phoneId, `input tap ${point[0]} ${point[1]}`)
  await sleep(500)
  // Double-tap to ensure focus + position cursor
  await shellExec(bearer, phoneId, `input tap ${point[0]} ${point[1]}`)
  await sleep(400)

  // Select all existing text: CTRL+A (keyevent 277 = A with META_CTRL)
  await shellExec(bearer, phoneId, 'input keyevent --longpress 29')  // long-press A = select all
  await sleep(300)
  // Also try CTRL+A via key combination for more compatibility
  await shellExec(bearer, phoneId, 'input keycombination 113 29')    // CTRL(113) + A(29)
  await sleep(200)
  // Delete selected text
  await shellExec(bearer, phoneId, 'input keyevent 67')  // KEYCODE_DEL
  await sleep(200)

  // Belt-and-suspenders: move to end then delete 200 chars backwards
  await shellExec(bearer, phoneId, 'input keyevent 123') // KEYCODE_MOVE_END
  await sleep(100)
  for (let i = 0; i < 20; i++) {
    await shellExec(bearer, phoneId, 'input keyevent 67 67 67 67 67 67 67 67 67 67')
    await sleep(40)
  }
  await sleep(200)

  // Type new text (spaces → %s, shell chars escaped)
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g,  '\\"')
    .replace(/'/g,  "\\'")
    .replace(/&/g,  '\\&')
    .replace(/</g,  '\\<')
    .replace(/>/g,  '\\>')
    .replace(/\|/g, '\\|')
    .replace(/;/g,  '\\;')
    .replace(/`/g,  '\\`')
    .replace(/\$/g, '\\$')
    .replace(/!/g,  '\\!')
    .replace(/\n/g, '%s')
    .replace(/ /g,  '%s')
  await shellExec(bearer, phoneId, `input text "${escaped}"`)
  await sleep(400)
  log(`   ✏️ "${text.substring(0, 40)}${text.length > 40 ? '…' : ''}"`)
}

// ── Profile update via Account Center ────────────────────────────────────────
export interface MassEditConfig {
  profileName?:   string  // display name
  username?:      string  // @handle
  bio?:           string
  profilePicUrl?: string
}

// Helper: tap Save / Done in top-right toolbar then press BACK
async function saveFieldAndBack(
  bearer: string, phoneId: string, sw: number, sh: number, log: (m: string) => void,
) {
  await shellExec(bearer, phoneId, 'input keyevent 4') // dismiss keyboard
  await sleep(600)
  const xml = await dumpXml(bearer, phoneId)
  const savePt =
    findByText(xml, 'Save', 'Sauvegarder', 'Done', 'Terminé') ??
    findByResourceId(xml, 'save_button', 'action_done', 'done_button', 'submit_button')
  if (savePt) {
    log(`   💾 Save à ${savePt}`)
    await shellExec(bearer, phoneId, `input tap ${savePt[0]} ${savePt[1]}`)
  } else {
    const sx = Math.floor(sw * 0.9)
    const sy = Math.floor(sh * 0.055)
    log(`   💾 Save non trouvé → tap (${sx},${sy})`)
    await shellExec(bearer, phoneId, `input tap ${sx} ${sy}`)
  }
  await sleep(2500)
  await shellExec(bearer, phoneId, 'input keyevent 4') // back to list
  await sleep(1500)
}

export async function updateInstagramProfile(
  bearer: string,
  phoneId: string,
  config: MassEditConfig,
  log: (m: string) => void,
) {
  return withPhoneAutoStop(bearer, phoneId, 5 * 60_000, '5min', log,
    () => _updateInstagramProfileInner(bearer, phoneId, config, log))
}

async function _updateInstagramProfileInner(
  bearer: string,
  phoneId: string,
  config: MassEditConfig,
  log: (m: string) => void,
) {
  const ready = await ensurePhoneRunning(bearer, phoneId, log)
  if (!ready) throw new Error('Téléphone non démarré')

  // ── Wake + unlock ──────────────────────────────────────────────────────────
  log('📱 Réveil écran…')
  await shellExec(bearer, phoneId, 'input keyevent 224')
  await sleep(800)
  await shellExec(bearer, phoneId, 'input swipe 540 1700 540 800 400')
  await sleep(1500)

  // ── Screen size ────────────────────────────────────────────────────────────
  const { output: sizeOut } = await shellExec(bearer, phoneId, 'wm size')
  const sm = sizeOut.match(/(\d+)x(\d+)/)
  const sw = sm ? parseInt(sm[1]) : 1080
  const sh = sm ? parseInt(sm[2]) : 2340
  const cx = Math.floor(sw / 2)
  log(`📐 Écran: ${sw}x${sh}`)

  // ── Download profile picture if needed ────────────────────────────────────
  if (config.profilePicUrl?.trim()) {
    log('🖼 Téléchargement photo…')
    const dl = await shellExec(bearer, phoneId,
      `curl -s -L --max-time 30 -o /sdcard/DCIM/Camera/sf_pfp.jpg "${config.profilePicUrl.trim()}" && echo DONE`)
    log(`   curl → ${dl.output.trim() || 'no output'}`)
    await shellExec(bearer, phoneId,
      'am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/Camera/sf_pfp.jpg')
    await sleep(2000)
  }

  // ── Open Instagram ─────────────────────────────────────────────────────────
  log('📲 Lancement Instagram…')
  await shellExec(bearer, phoneId, 'am force-stop com.instagram.android')
  await sleep(1200)
  await shellExec(bearer, phoneId, 'am start -n com.instagram.android/.activity.MainTabActivity')
  await sleep(8000)

  // ── Profile tab ───────────────────────────────────────────────────────────
  let xml = await dumpXml(bearer, phoneId)
  const profileTabPt =
    findByText(xml, 'Profile', 'Profil') ??
    findByResourceId(xml, 'profile_tab', 'tab_avatar', 'navigation_profile',
      'ig_bottom_bar_profile', 'tabIcon5', 'tab_icon_profile')
  if (profileTabPt) {
    await shellExec(bearer, phoneId, `input tap ${profileTabPt[0]} ${profileTabPt[1]}`)
  } else {
    await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.92)} ${Math.floor(sh * 0.965)}`)
  }
  await sleep(4000)

  // ── Hamburger menu (☰ top-right) ─────────────────────────────────────────
  log('☰ Ouverture menu…')
  xml = await dumpXml(bearer, phoneId)
  const menuPt =
    findByResourceId(xml, 'action_bar_overflow_button', 'hamburger_button',
      'options_list_button', 'header_options_button', 'ig_nav_bar_overflow') ??
    findByText(xml, 'Options')
  if (menuPt) {
    await shellExec(bearer, phoneId, `input tap ${menuPt[0]} ${menuPt[1]}`)
  } else {
    await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.95)} ${Math.floor(sh * 0.055)}`)
  }
  await sleep(2500)

  // ── Account Center — directement visible dans le panneau hamburger ────────
  log('🏛 Account Center…')
  xml = await dumpXml(bearer, phoneId)
  let acPt =
    findByText(xml, 'Account Center', 'Centre de comptes', 'Accounts Center',
      'Meta Account Center') ??
    findByResourceId(xml, 'account_center_row', 'accounts_center', 'account_center')

  if (!acPt) {
    // Sur certaines versions Instagram, Account Center est sous "Settings and privacy"
    const settingsPt =
      findByText(xml, 'Settings and privacy', 'Paramètres et confidentialité',
        'Settings', 'Paramètres') ??
      findByResourceId(xml, 'settings_row', 'settings_privacy', 'settings_and_privacy')
    if (settingsPt) {
      await shellExec(bearer, phoneId, `input tap ${settingsPt[0]} ${settingsPt[1]}`)
      await sleep(3000)
      xml = await dumpXml(bearer, phoneId)
      acPt =
        findByText(xml, 'Account Center', 'Centre de comptes', 'Accounts Center',
          'Meta Account Center') ??
        findByResourceId(xml, 'account_center_row', 'accounts_center', 'account_center')
      if (!acPt) {
        // Scroll down pour trouver Account Center
        await shellExec(bearer, phoneId,
          `input swipe ${cx} ${Math.floor(sh * 0.7)} ${cx} ${Math.floor(sh * 0.3)} 600`)
        await sleep(1000)
        xml = await dumpXml(bearer, phoneId)
        acPt = findByText(xml, 'Account Center', 'Centre de comptes', 'Accounts Center',
          'Meta Account Center')
      }
    }
  }

  if (acPt) {
    await shellExec(bearer, phoneId, `input tap ${acPt[0]} ${acPt[1]}`)
  } else {
    throw new Error('Account Center non trouvé')
  }
  await sleep(4000)

  // ── Cliquer sur le profil (compte Instagram) ──────────────────────────────
  log('👤 Sélection du profil…')
  xml = await dumpXml(bearer, phoneId)

  // Étape 1 : si on est dans Account Center et qu'il y a "Profile and personal details"
  const profDetailsPt =
    findByText(xml, 'Profile and personal details', 'Profil et informations personnelles',
      'Personal details', 'Profile information', 'Profile details') ??
    findByResourceId(xml, 'profile_details_row', 'personal_details', 'profile_info_row')

  if (profDetailsPt) {
    await shellExec(bearer, phoneId, `input tap ${profDetailsPt[0]} ${profDetailsPt[1]}`)
    await sleep(3000)
    xml = await dumpXml(bearer, phoneId)
  }

  // Étape 2 : on est sur l'écran "Profiles" (ou similaire) qui liste le compte Instagram.
  // Le compte apparaît comme une ligne "username / Instagram" cliquable.
  // On cherche la ligne Instagram (sublabel "Instagram" ou par resource-id).
  const igAccountPt =
    findByText(xml, 'Instagram') ??  // sublabel "Instagram" sur la ligne du compte
    findByResourceId(xml, 'account_item', 'profile_account_row', 'account_row',
      'ig_account', 'instagram_account', 'linked_account') ??
    null

  if (igAccountPt) {
    log(`   Compte trouvé à ${igAccountPt}`)
    await shellExec(bearer, phoneId, `input tap ${igAccountPt[0]} ${igAccountPt[1]}`)
  } else {
    // Fallback : le compte est toujours la première ligne de la liste (~33% hauteur)
    log(`   Compte non trouvé → tap coordonnée (${cx}, ${Math.floor(sh * 0.33)})`)
    await shellExec(bearer, phoneId, `input tap ${cx} ${Math.floor(sh * 0.33)}`)
  }
  await sleep(3500)

  // ── We are now on the edit screen: Name · Username · Profile picture · Avatar
  log('📋 Écran édition profil…')
  xml = await dumpXml(bearer, phoneId)
  log(`   XML: ${xml.length} chars`)

  // ── Edit Name ─────────────────────────────────────────────────────────────
  if (config.profileName?.trim()) {
    log(`📝 Nom → "${config.profileName}"`)
    const namePt =
      findByText(xml, 'Name', 'Nom', 'Surnom', 'Full name', 'Nom complet') ??
      findByResourceId(xml, 'name_row', 'full_name_row', 'display_name_row')
    if (namePt) {
      await shellExec(bearer, phoneId, `input tap ${namePt[0]} ${namePt[1]}`)
    } else {
      await shellExec(bearer, phoneId, `input tap ${cx} ${Math.floor(sh * 0.22)}`)
    }
    await sleep(2500)
    // Find the text input field on the Name edit screen
    const nameXml = await dumpXml(bearer, phoneId)
    const nameFieldPt =
      findByResourceId(nameXml, 'full_name', 'name', 'name_field', 'edit_text',
        'text_input', 'input_field') ??
      [cx, Math.floor(sh * 0.35)] as [number, number]
    await clearAndType(bearer, phoneId, nameFieldPt, config.profileName.trim(), log)
    await saveFieldAndBack(bearer, phoneId, sw, sh, log)
    // Re-dump after returning to list
    xml = await dumpXml(bearer, phoneId)
  }

  // ── Edit Username ─────────────────────────────────────────────────────────
  if (config.username?.trim()) {
    log(`📝 Pseudo → "@${config.username.replace(/^@/, '')}"`)
    const cleanUsername = config.username.trim().replace(/^@/, '')
    const usernamePt =
      findByText(xml, 'Username', 'Nom d\'utilisateur', 'Pseudo') ??
      findByResourceId(xml, 'username_row', 'username', 'handle_row')
    if (usernamePt) {
      await shellExec(bearer, phoneId, `input tap ${usernamePt[0]} ${usernamePt[1]}`)
    } else {
      await shellExec(bearer, phoneId, `input tap ${cx} ${Math.floor(sh * 0.32)}`)
    }
    await sleep(2500)
    const usernameXml = await dumpXml(bearer, phoneId)
    const usernameFieldPt =
      findByResourceId(usernameXml, 'username', 'username_field', 'edit_text',
        'text_input', 'handle_field') ??
      [cx, Math.floor(sh * 0.35)] as [number, number]
    await clearAndType(bearer, phoneId, usernameFieldPt, cleanUsername, log)
    await saveFieldAndBack(bearer, phoneId, sw, sh, log)
    xml = await dumpXml(bearer, phoneId)
  }

  // ── Edit Profile picture ──────────────────────────────────────────────────
  if (config.profilePicUrl?.trim()) {
    log('🖼 Changement photo de profil…')
    const picPt =
      findByText(xml, 'Profile picture', 'Photo de profil', 'Profile photo',
        'Photo de profil ou avatar') ??
      findByResourceId(xml, 'profile_picture_row', 'profile_photo_row', 'avatar_row')
    if (picPt) {
      await shellExec(bearer, phoneId, `input tap ${picPt[0]} ${picPt[1]}`)
    } else {
      await shellExec(bearer, phoneId, `input tap ${cx} ${Math.floor(sh * 0.42)}`)
    }
    await sleep(3000)

    // Options screen: "Choose from library" / "Take a new photo" etc.
    const picXml = await dumpXml(bearer, phoneId)
    const galPt =
      findByText(picXml, 'Choose from library', 'Choisir dans la bibliothèque',
        'Gallery', 'Galerie', 'Photo library', 'Choose from Gallery',
        'Choose from your photos', 'Choisir dans vos photos', 'Import') ??
      findByResourceId(picXml, 'gallery_option', 'choose_library', 'library_option',
        'choose_from_library')
    if (galPt) {
      log(`   Galerie à ${galPt}`)
      await shellExec(bearer, phoneId, `input tap ${galPt[0]} ${galPt[1]}`)
    } else {
      await shellExec(bearer, phoneId, `input tap ${cx} ${Math.floor(sh * 0.55)}`)
    }
    await sleep(4000)

    // Select first (most recent) photo — top-left of grid
    log('📷 Sélection première photo…')
    await shellExec(bearer, phoneId,
      `input tap ${Math.floor(sw * 0.17)} ${Math.floor(sh * 0.28)}`)
    await sleep(2500)

    // Confirm / Next
    const confirmXml = await dumpXml(bearer, phoneId)
    const nextPt =
      findByText(confirmXml, 'Next', 'Suivant', 'Done', 'Terminé', 'OK') ??
      findByResourceId(confirmXml, 'action_next', 'next_button', 'done_button')
    if (nextPt) {
      await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`)
    } else {
      await shellExec(bearer, phoneId,
        `input tap ${Math.floor(sw * 0.9)} ${Math.floor(sh * 0.055)}`)
    }
    await sleep(4000)
    log('   ✅ Photo changée')
  }

  // ── Bio (via Edit Profile — Account Center doesn't expose bio) ────────────
  if (config.bio?.trim()) {
    log('📝 Bio → retour vers Edit Profile…')
    // Force-restart Instagram and go to Edit Profile
    await shellExec(bearer, phoneId, 'am force-stop com.instagram.android')
    await sleep(1200)
    await shellExec(bearer, phoneId, 'am start -n com.instagram.android/.activity.MainTabActivity')
    await sleep(8000)

    xml = await dumpXml(bearer, phoneId)
    const profTab2 =
      findByText(xml, 'Profile', 'Profil') ??
      findByResourceId(xml, 'profile_tab', 'tab_avatar', 'navigation_profile',
        'ig_bottom_bar_profile', 'tabIcon5')
    if (profTab2) {
      await shellExec(bearer, phoneId, `input tap ${profTab2[0]} ${profTab2[1]}`)
    } else {
      await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.92)} ${Math.floor(sh * 0.965)}`)
    }
    await sleep(4000)

    xml = await dumpXml(bearer, phoneId)
    const editProfPt =
      findByText(xml, 'Edit profile', 'Modifier le profil', 'Edit Profile') ??
      findByResourceId(xml, 'edit_profile_button', 'button_edit_profile', 'edit_profile')
    if (editProfPt) {
      await shellExec(bearer, phoneId, `input tap ${editProfPt[0]} ${editProfPt[1]}`)
    } else {
      await shellExec(bearer, phoneId, `input tap ${cx} ${Math.floor(sh * 0.22)}`)
    }
    await sleep(5000)

    xml = await dumpXml(bearer, phoneId)
    const bioPt =
      findByResourceId(xml, 'biography', 'bio', 'profile_bio', 'about') ??
      findByText(xml, 'Biographie', 'Bio', 'Biography', 'À propos', 'About')
    if (bioPt) {
      await clearAndType(bearer, phoneId, bioPt, config.bio.trim(), log)
    } else {
      await clearAndType(bearer, phoneId, [cx, Math.floor(sh * 0.42)], config.bio.trim(), log)
    }
    await sleep(500)

    await shellExec(bearer, phoneId, 'input keyevent 4')
    await sleep(800)
    xml = await dumpXml(bearer, phoneId)
    const saveBioPt =
      findByText(xml, 'Done', 'Terminé', 'Save', 'Sauvegarder') ??
      findByResourceId(xml, 'action_done', 'save_button', 'done_button')
    if (saveBioPt) {
      await shellExec(bearer, phoneId, `input tap ${saveBioPt[0]} ${saveBioPt[1]}`)
    } else {
      await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.93)} ${Math.floor(sh * 0.06)}`)
    }
    await sleep(3000)
    log('   ✅ Bio sauvegardée')
  }

  log('✅ Toutes les modifications terminées !')
}

// ── Instagram Story with link sticker (ADB UI automation) ────────────────────
// GéeLark has no native story endpoint, so we drive the Instagram app directly
// via UIAutomator: download the image to the phone gallery, open the story
// camera, pick the image, add a "Link" sticker with the chosen URL + label,
// drag it to the bottom-right, then publish to "Your story".
//
// This relies on Instagram's UI and is inherently fragile across IG versions —
// every step has a resource-id/text lookup with a coordinate fallback, and the
// log() callback narrates each action so the flow can be tuned when IG changes.
export interface StoryConfig {
  imageUrl: string            // public/signed URL of the image to post
  linkUrl:  string            // destination URL for the link sticker
  linkText?: string           // optional custom label shown on the sticker
  dryRun?:  boolean           // run every step but stop right before publishing
}

// Wrap any phone operation with an auto-stop safety timer.
// The phone is stopped after `ms` milliseconds regardless of what happens.
async function withPhoneAutoStop<T>(
  bearer: string,
  phoneId: string,
  ms: number,
  label: string,
  log: (m: string) => void,
  fn: () => Promise<T>,
): Promise<T> {
  const timer = setTimeout(() => {
    log(`⏱ Timeout ${label} — arrêt automatique du téléphone`)
    stopPhone(bearer, phoneId).catch(() => {})
  }, ms)
  try {
    return await fn()
  } finally {
    clearTimeout(timer)
  }
}

export async function postInstagramStory(
  bearer: string,
  phoneId: string,
  config: StoryConfig,
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  return withPhoneAutoStop(bearer, phoneId, 5 * 60_000, '5min', log,
    () => _postInstagramStoryInner(bearer, phoneId, config, log))
}

async function _postInstagramStoryInner(
  bearer: string,
  phoneId: string,
  config: StoryConfig,
  log: (m: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  const ready = await ensurePhoneRunning(bearer, phoneId, log)
  if (!ready) throw new Error('Téléphone non démarré')

  // ── Wake + unlock ──────────────────────────────────────────────────────────
  log('📱 Réveil écran…')
  await shellExec(bearer, phoneId, 'input keyevent 224')
  await sleep(800)
  await shellExec(bearer, phoneId, 'input swipe 540 1700 540 800 400')
  await sleep(1200)

  // ── Screen size ────────────────────────────────────────────────────────────
  const { output: sizeOut } = await shellExec(bearer, phoneId, 'wm size')
  const sm = sizeOut.match(/(\d+)x(\d+)/)
  const sw = sm ? parseInt(sm[1]) : 1080
  const sh = sm ? parseInt(sm[2]) : 2340
  const cx = Math.floor(sw / 2)
  log(`📐 Écran: ${sw}x${sh}`)

  // ── 0. Wipe the gallery ────────────────────────────────────────────────────
  // Stale photos/videos make Instagram's story picker grab the wrong (old) media
  // — exactly like the post flow, we start from an empty gallery so the only
  // file present is the one we push next. This is the main story-bug fix.
  log('🧹 Nettoyage de la galerie…')
  await shellExec(bearer, phoneId,
    `find /sdcard/DCIM /sdcard/Pictures /sdcard/Download /sdcard/Movies -type f ` +
    `\\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' ` +
    `-o -iname '*.gif' -o -iname '*.heic' -o -iname '*.mp4' -o -iname '*.mov' \\) ` +
    `-delete 2>/dev/null; ` +
    `rm -rf /sdcard/DCIM/Camera/* 2>/dev/null; true`)
  // Purge the MediaStore so IG's picker doesn't show "ghost" tiles for the files
  // we just deleted. A directory MEDIA_SCANNER_SCAN_FILE does NOT remove entries
  // of already-deleted files — it only indexes existing ones — so stale rows
  // survive and render as black, non-selectable thumbnails. Delete the rows
  // directly via the media content provider (GeeLark phones run rooted/system).
  await shellExec(bearer, phoneId,
    `content delete --uri content://media/external/images/media 2>/dev/null; ` +
    `content delete --uri content://media/external/video/media 2>/dev/null; ` +
    `content delete --uri content://media/external/file 2>/dev/null; true`)
  // Then trigger a fresh volume scan so the now-empty gallery is reflected.
  await shellExec(bearer, phoneId,
    `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/Camera 2>/dev/null; ` +
    `am broadcast -a android.intent.action.MEDIA_MOUNTED -d file:///sdcard 2>/dev/null; true`)
  // Grant Instagram FULL media access. Without this, Android 13/14 hands IG only
  // partial "Selected photos" access, so a freshly-pushed file is invisible /
  // non-selectable in the picker. Granting up-front avoids that and the fragile
  // "Allow" popup tap. Unknown perms on older Android just no-op.
  await shellExec(bearer, phoneId,
    `pm grant com.instagram.android android.permission.READ_MEDIA_IMAGES 2>/dev/null; ` +
    `pm grant com.instagram.android android.permission.READ_MEDIA_VIDEO 2>/dev/null; ` +
    `pm grant com.instagram.android android.permission.READ_MEDIA_VISUAL_USER_SELECTED 2>/dev/null; ` +
    `pm grant com.instagram.android android.permission.READ_EXTERNAL_STORAGE 2>/dev/null; ` +
    `pm grant com.instagram.android android.permission.WRITE_EXTERNAL_STORAGE 2>/dev/null; true`)
  await sleep(1500)

  // ── 1. Push image to phone gallery ────────────────────────────────────────
  log('🖼 Chargement de l\'image…')
  const _imgExt = (() => {
    try {
      const p = new URL(config.imageUrl).pathname
      const m = /\.(png|gif|webp|bmp|heic|heif|jpe?g)$/i.exec(p)
      if (m) return m[1].toLowerCase().replace('jpeg', 'jpg')
    } catch { /* ignore */ }
    return 'jpg'
  })()
  // The file extension on the phone MUST match the actual bytes we push.
  // We convert to PNG (preferred) via canvas below; if that fails we fall back
  // to the original bytes and keep their real extension. A png-named file that
  // actually contains jpg bytes (or vice-versa) makes Android's media scanner
  // mis-classify it → Instagram's gallery can't open it → "image n'upload pas".
  let outExt = 'png'

  // Download the image server-side (via /api/proxy) to avoid CORS, then compress
  // client-side and push as base64 chunks via shell. Target: < 200 KB JPEG so the
  // push takes ~5 seconds instead of hanging with 2600+ chunks.
  const bufToB64 = (buf: ArrayBuffer | Uint8Array): string => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    let b64 = ''
    // chunk size MUST be a multiple of 3 so btoa segments concatenate without mid-string '=' padding
    for (let i = 0; i < u8.length; i += 8190)
      b64 += btoa(String.fromCharCode(...u8.subarray(i, Math.min(i + 8190, u8.length))))
    return b64
  }

  let imgBase64: string | null = null

  // Download: try /api/proxy (server-side, no CORS) then direct fetch
  try {
    const pr = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: config.imageUrl }),
    })
    if (pr.ok) {
      const d = await pr.json()
      if (d.ok && d.dataUrl) {
        const comma = (d.dataUrl as string).indexOf(',')
        if (comma !== -1) imgBase64 = (d.dataUrl as string).slice(comma + 1)
      }
    }
  } catch { /* fallthrough */ }
  if (!imgBase64) {
    try {
      const resp = await fetch(config.imageUrl)
      if (resp.ok) imgBase64 = bufToB64(await resp.arrayBuffer())
    } catch { /* fallthrough */ }
  }

  if (!imgBase64) {
    return { ok: false, error: 'Impossible de télécharger l\'image (réseau)' }
  }
  log(`   📥 Image: ${Math.round(imgBase64.length / 1024)} KB`)

  // Always produce a 720×1280 (9:16) JPEG with the image centered on a black
  // background. This prevents Instagram from cropping non-9:16 source images.
  // 720×1280 keeps file size small (~150-300 KB) for fast base64 push.
  // Try OffscreenCanvas first (no DOM), fall back to DOM canvas.
  const STORY_W = 720, STORY_H = 1280
  let compressed: string | null = null

  const drawCentered = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, srcW: number, srcH: number, drawFn: (dx: number, dy: number, dw: number, dh: number) => void) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, STORY_W, STORY_H)
    const scale = Math.min(STORY_W / srcW, STORY_H / srcH)
    const dw = Math.round(srcW * scale)
    const dh = Math.round(srcH * scale)
    const dx = Math.round((STORY_W - dw) / 2)
    const dy = Math.round((STORY_H - dh) / 2)
    drawFn(dx, dy, dw, dh)
  }

  // Attempt 1: OffscreenCanvas (no DOM dependency)
  try {
    const mimeIn = _imgExt === 'png' ? 'image/png' : 'image/jpeg'
    const binStr = atob(imgBase64)
    const u8in = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) u8in[i] = binStr.charCodeAt(i)
    const bitmap = await createImageBitmap(new Blob([u8in], { type: mimeIn }))
    const oc = new OffscreenCanvas(STORY_W, STORY_H)
    const ctx = oc.getContext('2d')!
    drawCentered(ctx, bitmap.width, bitmap.height, (dx, dy, dw, dh) => ctx.drawImage(bitmap, dx, dy, dw, dh))
    const blob = await oc.convertToBlob({ type: 'image/jpeg', quality: 0.88 })
    compressed = bufToB64(await blob.arrayBuffer())
    if (compressed) log(`   🗜️ 9:16 OffscreenCanvas: ${Math.round(imgBase64.length / 1024)} KB → ${Math.round(compressed.length / 1024)} KB`)
  } catch (e) {
    log(`   ⚠️ OffscreenCanvas: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Attempt 2: DOM Canvas (fallback)
  if (!compressed) {
    try {
      const mimeIn = _imgExt === 'png' ? 'image/png' : 'image/jpeg'
      const c2 = await new Promise<string | null>((resolve) => {
        const binStr = atob(imgBase64!)
        const u8 = new Uint8Array(binStr.length)
        for (let i = 0; i < binStr.length; i++) u8[i] = binStr.charCodeAt(i)
        const blobUrl = URL.createObjectURL(new Blob([u8], { type: mimeIn }))
        const img = new Image()
        img.onload = () => {
          URL.revokeObjectURL(blobUrl)
          const cv = document.createElement('canvas')
          cv.width = STORY_W; cv.height = STORY_H
          const ctx = cv.getContext('2d')!
          drawCentered(ctx, img.naturalWidth, img.naturalHeight, (dx, dy, dw, dh) => ctx.drawImage(img, dx, dy, dw, dh))
          const dataUrl = cv.toDataURL('image/jpeg', 0.88)
          resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
        }
        img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null) }
        img.src = blobUrl
      })
      if (c2) { compressed = c2; log(`   🗜️ 9:16 Canvas DOM: ${Math.round(imgBase64.length / 1024)} KB → ${Math.round(c2.length / 1024)} KB`) }
    } catch (e) {
      log(`   ⚠️ Canvas DOM: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Always push the 9:16-padded JPEG. Fall back to raw original only if both canvas methods failed.
  outExt = compressed ? 'jpg' : _imgExt
  const pushData = compressed ?? imgBase64
  const imgPath = `/sdcard/DCIM/Camera/sf_story.${outExt}`

  // Push image via base64 chunks (cross-network, no CDN dependency).
  log(`   📤 Push image (${Math.round(pushData.length / 1024)} KB)…`)
  const CHUNK = 3000, BATCH = 20
  const chunks: string[] = []
  for (let i = 0; i < pushData.length; i += CHUNK) chunks.push(pushData.slice(i, i + CHUNK))
  log(`   📦 ${chunks.length} chunks…`)
  await shellExec(bearer, phoneId,
    `mkdir -p /sdcard/DCIM/Camera && printf '%s' '${chunks[0]}' > '${imgPath}.b64'`)
  for (let b = 1; b < chunks.length; b += BATCH) {
    const cmd = chunks.slice(b, b + BATCH).map(c => `printf '%s' '${c}' >> '${imgPath}.b64'`).join(' && ')
    await shellExec(bearer, phoneId, cmd)
  }
  await shellExec(bearer, phoneId,
    `base64 -d < '${imgPath}.b64' > '${imgPath}' 2>/dev/null || base64 --decode < '${imgPath}.b64' > '${imgPath}' 2>/dev/null; rm -f '${imgPath}.b64'`)
  const ck = await shellExec(bearer, phoneId, `wc -c < '${imgPath}' 2>/dev/null || echo 0`)
  const sz = parseInt(ck.output.trim().split(/\s+/)[0] ?? '0', 10) || 0
  log(`   📎 Fichier: ${sz} octets`)
  if (sz < 2000) {
    return { ok: false, error: `Image non transférée sur le téléphone (${sz} octets)` }
  }

  // Force media scanner so Instagram's gallery picker sees the new file.
  // touch -m sets current timestamp → file appears FIRST in "Recents".
  // Two scan methods for compatibility across Android versions.
  await shellExec(bearer, phoneId,
    `touch -m '${imgPath}' && ` +
    `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${imgPath} 2>/dev/null; ` +
    `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${imgPath}" 2>/dev/null`)
  await sleep(6000)

  // ── 2. Open Instagram + the story camera ───────────────────────────────────
  log('📲 Lancement Instagram…')
  await shellExec(bearer, phoneId, 'am force-stop com.instagram.android')
  await sleep(1200)

  // Most reliable path: Instagram's dedicated story-camera deep link. This jumps
  // straight to the capture screen and skips the fragile home-feed avatar tap.
  log('🎬 Ouverture de la caméra story…')
  await shellExec(bearer, phoneId,
    'am start -a android.intent.action.VIEW -d "instagram://story-camera" com.instagram.android')
  await sleep(7000)

  // Verify we actually reached the camera. If we're still on the home feed
  // (the deep link was ignored on this IG build), tap the "Your story" avatar.
  let xml = await dumpXml(bearer, phoneId)
  const onCamera =
    findByResourceId(xml, 'gallery_button', 'camera_gallery', 'gallery_thumbnail', 'capture_button', 'camera_shutter_button') ??
    findByText(xml, 'Gallery', 'Galerie', 'Story', 'Boomerang', 'Layout')
  if (!onCamera) {
    log('   ↩︎ Deep link ignoré — tap sur l\'avatar « Your story »…')
    // Open the regular home feed first.
    await shellExec(bearer, phoneId,
      'am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ' +
      '-n com.instagram.android/com.instagram.android.activity.MainTabActivity')
    await sleep(6000)
    xml = await dumpXml(bearer, phoneId)
    // The story-tray avatar carries a "+ Your story" content-desc; the clickable
    // node is the avatar circle, NOT the text label below it. Match the avatar /
    // plus badge resource-ids first, then fall back to the tray's left edge.
    const storyEntry =
      findByResourceId(xml, 'feed_tab_avatar_plus', 'tab_story_camera', 'tab_bar_camera_button', 'avatar_image_view') ??
      findByText(xml, 'Your story', 'Votre story', 'Add to story', 'Ajouter à la story') ??
      findByTextPartial(xml, 'your story', 'votre story')
    if (storyEntry) {
      await shellExec(bearer, phoneId, `input tap ${storyEntry[0]} ${storyEntry[1]}`)
    } else {
      // First avatar in the stories tray: top-left, just under the app bar.
      await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.12)} ${Math.floor(sh * 0.13)}`)
    }
    await sleep(5000)
  }

  // Android/IG permission prompts ("Allow access to photos") silently block the
  // flow if not dismissed — accept them whenever they appear.
  async function dismissPermissionDialog() {
    const permXml = await dumpXml(bearer, phoneId)
    const allowPt =
      findByText(permXml, 'Allow', 'Autoriser', 'Allow all', 'Tout autoriser',
        'While using the app', 'Lorsque l\'application est utilisée', 'Continue', 'Continuer') ??
      findByResourceId(permXml, 'permission_allow_button', 'permission_allow_all_button',
        'permission_allow_foreground_only_button')
    if (allowPt) {
      log('   ✓ Popup de permission détectée — acceptation…')
      await shellExec(bearer, phoneId, `input tap ${allowPt[0]} ${allowPt[1]}`)
      await sleep(2000)
      return true
    }
    return false
  }

  await dismissPermissionDialog()

  // ── 3. Pick the uploaded image from the gallery ────────────────────────────
  log('🖼 Sélection de l\'image dans la galerie…')
  xml = await dumpXml(bearer, phoneId)
  const galleryBtn =
    findByResourceId(xml, 'gallery_button', 'camera_gallery', 'gallery_thumbnail', 'media_thumbnail_tray') ??
    findByText(xml, 'Gallery', 'Galerie')
  if (galleryBtn) {
    await shellExec(bearer, phoneId, `input tap ${galleryBtn[0]} ${galleryBtn[1]}`)
  } else {
    // Gallery thumbnail sits bottom-left of the capture button
    await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.13)} ${Math.floor(sh * 0.88)}`)
  }
  await sleep(2500)
  await dismissPermissionDialog()

  // Tap the first (most-recent) gallery image — the one we just uploaded.
  // Parse ALL grid items and pick the topmost-leftmost one (smallest y then x),
  // because the XML order doesn't always match the visual left→right order.
  xml = await dumpXml(bearer, phoneId)
  const firstThumb = (() => {
    const re = /resource-id="[^"]*(?:gallery_grid_item|media_picker_grid_item)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g
    let best: [number, number] | null = null
    let bestScore = Infinity
    let m: RegExpExecArray | null
    while ((m = re.exec(xml)) !== null) {
      const x1 = +m[1], y1 = +m[2], x2 = +m[3], y2 = +m[4]
      const score = y1 * 10000 + x1 // top row first, then leftmost
      if (score < bestScore) { bestScore = score; best = [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)] }
    }
    // Fallback: top-left of the grid (below the gallery header)
    return best ?? [Math.floor(sw * 0.25), Math.floor(sh * 0.30)] as [number, number]
  })()
  log(`   👆 Tap galerie: ${firstThumb[0]},${firstThumb[1]}`)
  await shellExec(bearer, phoneId, `input tap ${firstThumb[0]} ${firstThumb[1]}`)
  await sleep(3500)

  // ── 4. Open the sticker tray and choose the Link sticker ───────────────────
  log('🔗 Ajout du sticker lien…')
  xml = await dumpXml(bearer, phoneId)
  const stickerBtn =
    findByResourceId(xml, 'sticker_button', 'sticker_tray_button', 'asset_button') ??
    findByText(xml, 'Sticker', 'Autocollant', 'Stickers')
  if (stickerBtn) {
    await shellExec(bearer, phoneId, `input tap ${stickerBtn[0]} ${stickerBtn[1]}`)
  } else {
    // Sticker icon (smiley face) — top-right toolbar of the story editor
    await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.78)} ${Math.floor(sh * 0.05)}`)
  }
  await sleep(3500) // extra time for tray to fully load

  xml = await dumpXml(bearer, phoneId)
  const linkSticker =
    findByText(xml, 'Link', 'Lien', 'LINK', 'LIEN', 'Link sticker', 'Sticker lien', 'Add a link', 'Ajouter un lien') ??
    findByTextPartial(xml, 'link', 'lien') ??
    findByResourceId(xml, 'link_sticker', 'sticker_link')
  if (linkSticker) {
    await shellExec(bearer, phoneId, `input tap ${linkSticker[0]} ${linkSticker[1]}`)
  } else {
    // Search the sticker tray for "link"/"lien" via the built-in search bar
    const searchPt =
      findByResourceId(xml, 'search_bar', 'sticker_search', 'search_box', 'search_input') ??
      findByTextPartial(xml, 'search', 'recherch', 'cherch')
    if (searchPt) {
      await shellExec(bearer, phoneId, `input tap ${searchPt[0]} ${searchPt[1]}`)
      await sleep(900)
      // Try "lien" first (French IG), then "link"
      await shellExec(bearer, phoneId, `input text "lien"`)
      await sleep(2000)
      let xml2 = await dumpXml(bearer, phoneId)
      let lk2 =
        findByText(xml2, 'Link', 'Lien', 'LINK', 'LIEN', 'Link sticker', 'Add a link', 'Ajouter un lien') ??
        findByTextPartial(xml2, 'link', 'lien') ??
        findByResourceId(xml2, 'link_sticker', 'sticker_link')
      if (!lk2) {
        // Clear and try English "link"
        await shellExec(bearer, phoneId, 'input keyevent --longpress 67') // long del to clear
        await sleep(400)
        await shellExec(bearer, phoneId, `input text "link"`)
        await sleep(2000)
        xml2 = await dumpXml(bearer, phoneId)
        lk2 =
          findByText(xml2, 'Link', 'Lien', 'LINK', 'LIEN', 'Link sticker', 'Add a link', 'Ajouter un lien') ??
          findByTextPartial(xml2, 'link', 'lien') ??
          findByResourceId(xml2, 'link_sticker', 'sticker_link')
      }
      if (lk2) {
        await shellExec(bearer, phoneId, `input tap ${lk2[0]} ${lk2[1]}`)
      } else {
        log('   ❌ Sticker lien introuvable après recherche')
        return { ok: false, error: 'Sticker lien introuvable — le sticker "Lien" est peut-être absent de ce compte Instagram' }
      }
    } else {
      // No search bar found — try tapping top-left of the tray then searching
      await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.5)} ${Math.floor(sh * 0.35)}`)
      await sleep(600)
      log('   ❌ Barre de recherche de stickers introuvable')
      return { ok: false, error: 'Sticker lien introuvable — barre de recherche non détectée' }
    }
  }
  await sleep(2500)

  // ── 5. Type the URL (+ optional custom label) ──────────────────────────────
  log('⌨️  Saisie de l\'URL…')
  xml = await dumpXml(bearer, phoneId)
  const urlField =
    findByResourceId(xml, 'link_url', 'url_edit_text', 'web_url', 'link_edit_text') ??
    findByText(xml, 'URL', 'https://') ??
    [cx, Math.floor(sh * 0.32)] as [number, number]
  await shellExec(bearer, phoneId, `input tap ${urlField[0]} ${urlField[1]}`)
  await sleep(900)
  await shellExec(bearer, phoneId, `input text "${escapeForInputText(config.linkUrl)}"`)
  await sleep(1200)

  // Optional custom sticker text — replaces the default "LINK"/"LIEN" label.
  // Robust multi-method writer with verification + diagnostics. We locate the
  // sticker-text EditText, focus it (double-tap), clear it, then try several
  // input methods IN SEQUENCE, re-reading the field after each to see which one
  // actually wrote. This handles both the focus issue and Unicode (accents/
  // emojis) which `input text` cannot type.
  if (config.linkText?.trim()) {
    const wanted = config.linkText.trim()
    const ascii  = toAsciiFallback(wanted)            // accents stripped, emojis dropped
    const needle = ascii.toLowerCase()                // accent-insensitive verify needle
    log(`   ✏️  Texte du sticker: "${wanted}"${ascii !== wanted ? ` (ascii: "${ascii}")` : ''}`)

    // Read the current sticker-text field (non-URL EditText). Returns null if none.
    const readTextField = async (): Promise<EditField | null> => {
      const fields = findEditTextFields(await dumpXml(bearer, phoneId))
      // Diagnostic: list every editable field so we can see the real layout.
      log(`   🔎 ${fields.length} champ(s): ${fields.map(f => `[${f.center[0]},${f.center[1]} foc=${f.focused ? 1 : 0} "${f.text.slice(0, 20)}"]`).join(' ')}`)
      return fields.find(f => !/https?:\/\/|www\./i.test(f.text)) ?? (fields.length >= 2 ? fields[1] : null)
    }

    // Has the caption landed in a non-URL field?
    const present = (fields: EditField[]) =>
      needle.length > 0 && fields.some(f => !/https?:\/\//i.test(f.text) && toAsciiFallback(f.text).toLowerCase().includes(needle))

    // Focus + clear the given field.
    const focusAndClear = async (pt: [number, number]) => {
      await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`); await sleep(400)
      await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`); await sleep(400)
      await shellExec(bearer, phoneId, 'input keyevent 123'); await sleep(120) // MOVE_END
      for (let i = 0; i < 3; i++) { await shellExec(bearer, phoneId, 'input keyevent 67 67 67 67 67 67 67 67 67 67'); await sleep(60) }
      await sleep(120)
    }

    // Re-read & report whether the caption is present now.
    const verify = async (): Promise<boolean> => {
      const after = findEditTextFields(await dumpXml(bearer, phoneId))
      return present(after)
    }

    let done = false
    // Locate field once (with a reveal-tap if only the URL field is visible).
    let field = await readTextField()
    if (!field) {
      const dump = await dumpXml(bearer, phoneId)
      const revealPt =
        findByResourceId(dump, 'customize_sticker_text', 'link_sticker_text', 'sticker_text_edit', 'caption_text_view', 'sticker_text') ??
        findByText(dump, 'Customize sticker text', 'Personnaliser le texte du sticker', 'Personnaliser le texte', 'Sticker text', 'Texte du sticker') ??
        findByTextPartial(dump, 'customize sticker', 'personnalis', 'sticker text', 'texte du sticker')
      if (revealPt) {
        log('   ↪︎ Ouverture du champ « texte du sticker »…')
        await shellExec(bearer, phoneId, `input tap ${revealPt[0]} ${revealPt[1]}`); await sleep(800)
        field = await readTextField()
      }
    }

    if (field) {
      const pt = field.center
      log(`   🎯 Champ ciblé: ${pt[0]},${pt[1]}`)

      // ── Method 1: plain `input text` (ASCII). This is the proven path — it's
      // exactly how the URL is typed — so if focus is fine it WILL write text. ──
      if (!done && ascii.length > 0) {
        await focusAndClear(pt)
        await shellExec(bearer, phoneId, `input text "${escapeForInputText(ascii)}"`)
        await sleep(700)
        if (await verify()) { log('   ✓ Saisi via input text (ASCII)'); done = true }
        else log('   … input text ASCII n\'a rien écrit')
      }

      // ── Method 2: clipboard set-text + CTRL+V (Unicode-safe, keeps emojis). ──
      if (!done) {
        await focusAndClear(pt)
        const shellSafe = wanted.replace(/'/g, `'\\''`)
        const setRes = await shellExec(bearer, phoneId, `cmd clipboard set-text '${shellSafe}'`)
        log(`   📋 cmd clipboard → "${(setRes.output || '').trim().slice(0, 60)}"`)
        await sleep(300)
        await shellExec(bearer, phoneId, 'input keycombination 113 50') // CTRL+V
        await sleep(700)
        if (await verify()) { log('   ✓ Saisi via presse-papier (CTRL+V)'); done = true }
        else log('   … CTRL+V n\'a rien collé')
      }

      // ── Method 3: clipboard + long-press → "Coller/Paste" menu. ──
      if (!done) {
        await focusAndClear(pt)
        await shellExec(bearer, phoneId, `input swipe ${pt[0]} ${pt[1]} ${pt[0]} ${pt[1]} 700`) // long-press
        await sleep(700)
        const menu = await dumpXml(bearer, phoneId)
        const pastePt = findByText(menu, 'Paste', 'Coller', 'PASTE', 'COLLER') ?? findByTextPartial(menu, 'paste', 'coller')
        if (pastePt) {
          await shellExec(bearer, phoneId, `input tap ${pastePt[0]} ${pastePt[1]}`)
          await sleep(700)
          if (await verify()) { log('   ✓ Saisi via menu Coller'); done = true }
          else log('   … menu Coller n\'a rien collé')
        } else {
          log('   … menu Coller introuvable')
        }
      }
    } else {
      log('   ⚠ Champ texte du sticker introuvable')
    }

    if (!done) log('   ⚠ Texte du sticker non écrit — publication quand même')
  }

  // Confirm the link (Done / Terminé / checkmark in top-right)
  xml = await dumpXml(bearer, phoneId)
  const donePt =
    findByText(xml, 'Done', 'Terminé', 'OK') ??
    findByResourceId(xml, 'done_button', 'action_done', 'confirm_button')
  if (donePt) {
    await shellExec(bearer, phoneId, `input tap ${donePt[0]} ${donePt[1]}`)
  } else {
    await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.9)} ${Math.floor(sh * 0.06)}`)
  }
  await sleep(2500)

  // ── 6. Drag the link sticker to the bottom-right ───────────────────────────
  log('↘️  Positionnement du sticker en bas à droite…')
  // After "Done", IG places the sticker somewhere in the center of the canvas.
  // The exact vertical position varies by IG version (25%–55% down the screen).
  // We try multiple starting Y positions with a 1800ms hold (long-press + drag).
  // The target is the bottom-right quadrant: 78% right, 82% down.
  const _dragTX = Math.floor(sw * 0.78)
  const _dragTY = Math.floor(sh * 0.82)
  // First, try to find the sticker node in the XML (works on some IG builds).
  {
    const sxml = await dumpXml(bearer, phoneId)
    // Link stickers carry text from linkText or "LINK" / "LIEN" resource ids.
    const stickerNode =
      findByResourceId(sxml, 'link_sticker_view', 'sticker_view', 'interactive_sticker') ??
      (config.linkText ? findByText(sxml, config.linkText) : null) ??
      findByText(sxml, 'LINK', 'LIEN', 'Open', 'Ouvrir')
    if (stickerNode) {
      log(`   🎯 Sticker trouvé via XML: ${stickerNode[0]},${stickerNode[1]}`)
      await shellExec(bearer, phoneId,
        `input swipe ${stickerNode[0]} ${stickerNode[1]} ${_dragTX} ${_dragTY} 1800`)
      await sleep(1200)
    } else {
      // Fallback: sweep through likely vertical positions (25% → 55%)
      for (const startFrac of [0.30, 0.40, 0.50, 0.25, 0.55]) {
        const sy = Math.floor(sh * startFrac)
        await shellExec(bearer, phoneId,
          `input swipe ${cx} ${sy} ${_dragTX} ${_dragTY} 1800`)
        await sleep(600)
      }
      await sleep(900)
    }
  }

  // ── 7. Publish to "Your story" ─────────────────────────────────────────────
  if (config.dryRun) {
    log('🧪 Mode test : toutes les étapes ont fonctionné — arrêt AVANT publication.')
    log('   (image téléchargée, caméra story, galerie, sticker lien, URL saisie)')
    await shellExec(bearer, phoneId, 'am force-stop com.instagram.android').catch(() => {})
    return { ok: true }
  }
  log('🚀 Publication de la story…')
  xml = await dumpXml(bearer, phoneId)
  const sharePt =
    findByText(xml, 'Your story', 'Votre story', 'Share', 'Partager', 'Add to story', 'Ajouter à la story') ??
    findByResourceId(xml, 'share_story_button', 'your_story_button', 'send_button')
  if (sharePt) {
    await shellExec(bearer, phoneId, `input tap ${sharePt[0]} ${sharePt[1]}`)
  } else {
    // "Your story" button sits bottom-left of the share screen
    await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.2)} ${Math.floor(sh * 0.93)}`)
  }
  await sleep(5000)

  // ── Verify we left the editor (best-effort) ────────────────────────────────
  // Only check editor-specific elements. "Your story" must NOT be in this list:
  // after a successful publish IG returns to the home feed, whose story tray
  // contains "Your story" — matching it produced false "failed" results on
  // stories that were actually published.
  const finalXml = (await dumpXml(bearer, phoneId)).toLowerCase()
  const stillEditing = /sticker_button|sticker_tray_button|link_url|url_edit_text|link_edit_text/.test(finalXml)
  if (stillEditing) {
    log('   ⚠️ L\'éditeur semble encore ouvert — vérifie manuellement.')
    return { ok: false, error: 'Publication non confirmée (UI Instagram a peut-être changé)' }
  }

  log('✅ Story publiée !')
  return { ok: true }
}

// ── Warmup actions (browse / like / reels / follow) ──────────────────────────
async function runWarmupActions(
  bearer: string,
  phoneId: string,
  config: Pick<WarmupConfig, 'browseMinutes' | 'likePosts' | 'watchReels' | 'followSuggested'>,
  log: (m: string) => void,
  abortSignal: { abort: boolean },
) {
  const endTime = Date.now() + config.browseMinutes * 60 * 1000
  let likeCount = 0
  let followCount = 0

  // ── Wake + unlock — sans ça, tous les taps/swipes partent dans le vide ─────
  log('📱 Réveil de l\'écran…')
  await shellExec(bearer, phoneId, 'input keyevent 224')
  await sleep(800)
  await shellExec(bearer, phoneId, 'input swipe 540 1700 540 800 400')
  await sleep(1000)

  // Dismiss permission / "Not now" popups that block all interaction
  async function dismissPopups(xml: string): Promise<boolean> {
    const pt =
      findByText(xml, 'Not now', 'Plus tard', 'Not Now', 'Pas maintenant',
        'Allow', 'Autoriser', 'Continue', 'Continuer', 'OK', 'Skip', 'Ignorer') ??
      findByResourceId(xml, 'permission_allow_button', 'negative_button', 'primary_button_row')
    if (pt) {
      await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`)
      await sleep(1500)
      return true
    }
    return false
  }

  // ── Open Instagram and VERIFY it's actually in the foreground ──────────────
  log('📱 Ouverture du fil d\'actualité…')
  for (let attempt = 0; attempt < 3; attempt++) {
    await shellExec(bearer, phoneId, 'am start -n com.instagram.android/.activity.MainTabActivity')
    await sleep(5000)
    const xml = await dumpXml(bearer, phoneId)
    if (await dismissPopups(xml)) continue   // popup éjectée → re-vérifier
    if (/com\.instagram\.android/.test(xml)) { log('   ✅ Instagram ouvert'); break }
    if (attempt === 2) { log('   ⚠️ Instagram ne semble pas au premier plan — on continue quand même') }
    else {
      log('   ↻ Instagram pas encore visible — nouvel essai…')
      await shellExec(bearer, phoneId, 'am force-stop com.instagram.android')
      await sleep(2000)
    }
  }

  while (Date.now() < endTime && !abortSignal.abort) {
    // Scroll the feed
    const swipeY1 = 1400 + Math.floor(Math.random() * 200)
    const swipeY2 = 400  + Math.floor(Math.random() * 200)
    const swipeDuration = 600 + Math.floor(Math.random() * 400)
    await shellExec(bearer, phoneId, `input swipe 540 ${swipeY1} 540 ${swipeY2} ${swipeDuration}`)
    await sleep(1500 + Math.floor(Math.random() * 2000))

    if (abortSignal.abort) break

    // Randomly like posts
    if (config.likePosts && Math.random() < 0.35) {
      const xml = await dumpXml(bearer, phoneId)
      // Une popup peut être apparue en plein scroll — l'éjecter d'abord
      if (await dismissPopups(xml)) continue
      // Resource-id uniquement : matcher le TEXTE « Like » tape sur les
      // compteurs de likes (ouvre la liste des likers) — c'était le bug.
      const likeBtn = findByResourceId(xml, 'row_feed_button_like', 'like_button')
      if (likeBtn) {
        await shellExec(bearer, phoneId, `input tap ${likeBtn[0]} ${likeBtn[1]}`)
        likeCount++
        log(`❤️ Like (${likeCount})`)
      } else {
        // Fallback humain : double-tap au centre du média = like Instagram.
        // Les deux taps dans UNE commande shell (un aller-retour HTTP entre
        // deux taps serait trop lent pour compter comme double-tap).
        await shellExec(bearer, phoneId, 'input tap 540 760 && input tap 540 760')
        likeCount++
        log(`❤️ Like (double-tap) (${likeCount})`)
      }
      await sleep(800 + Math.floor(Math.random() * 500))
    }

    // Randomly follow suggested accounts
    if (config.followSuggested && Math.random() < 0.1 && followCount < 3) {
      const xml = await dumpXml(bearer, phoneId)
      const followBtn = findByText(xml, 'Follow', 'Suivre', 'S\'abonner')
      if (followBtn) {
        await shellExec(bearer, phoneId, `input tap ${followBtn[0]} ${followBtn[1]}`)
        followCount++
        log(`➕ Follow (${followCount})`)
        await sleep(1000)
      }
    }

    // Occasionally watch reels
    if (config.watchReels && Math.random() < 0.2 && !abortSignal.abort) {
      log('🎬 Ouverture des Reels…')
      const xml = await dumpXml(bearer, phoneId)
      const reelsTab = findByText(xml, 'Reels', 'Réels') ??
                       findByResourceId(xml, 'clips_tab', 'reels_tab')
      if (reelsTab) {
        await shellExec(bearer, phoneId, `input tap ${reelsTab[0]} ${reelsTab[1]}`)
        await sleep(3000)
        // Watch 3–5 reels by swiping up
        const reelCount = 3 + Math.floor(Math.random() * 3)
        for (let r = 0; r < reelCount && !abortSignal.abort; r++) {
          await sleep(4000 + Math.floor(Math.random() * 4000))
          await shellExec(bearer, phoneId, 'input swipe 540 1400 540 400 500')
        }
        // Go back to feed
        await shellExec(bearer, phoneId, 'am start -n com.instagram.android/.activity.MainTabActivity')
        await sleep(3000)
      }
    }
  }

  log(`✅ Warmup terminé — ${likeCount} likes, ${followCount} follows`)
}

// Escape text for use inside an Android `input text "..."` shell command.
// Rules: the string is passed as a double-quoted shell argument, so only
// the chars special in that context need escaping.  Single quote ' is
// NOT special inside double quotes — escaping it as \' would inject a
// literal backslash which Android keyboards often map to / or other chars.
function escapeForInputText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')  // \ → \\ (must be first)
    .replace(/"/g,  '\\"')   // " → \"
    // ' is literal inside "…" — no escaping needed
    .replace(/&/g,  '\\&')
    .replace(/</g,  '\\<')
    .replace(/>/g,  '\\>')
    .replace(/\|/g, '\\|')
    .replace(/;/g,  '\\;')
    .replace(/`/g,  '\\`')
    .replace(/\$/g, '\\$')
    .replace(/!/g,  '\\!')
    .replace(/ /g,  '%s')
}

// Strip diacritics (é→e, à→a…) and drop any remaining non-ASCII (emojis).
// Used as a last-resort fallback when clipboard paste is unavailable, because
// Android `input text` silently drops non-ASCII characters.
function toAsciiFallback(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove accents
    .replace(/[^\x00-\x7F]/g, '')                     // drop emojis / other unicode
}

// ── Instagram login automation ───────────────────────────────────────────────
// Modern Instagram often redirects the login flow to a Chrome Custom Tab.
// When Chrome opens, ADB `input text` targets the wrong app and nothing gets typed.
// Strategy:
//   1. Force-stop both Instagram AND Chrome before starting.
//   2. Launch Instagram main activity (not LoginActivity — that triggers Chrome redirect).
//   3. If Chrome still appears in the XML dump, kill it and re-launch Instagram.
//   4. Look for the "Log in with email or phone number" button (switches to native login).
//   5. Type credentials directly into the (empty) native fields — no clearAndType needed.
//   6. Submit with ENTER (keyevent 66) — more reliable than finding the button.
//   7. Wait 15s then verify: still on login page → failure, home indicators → success.
export async function loginInstagramAccount(
  bearer: string,
  phoneId: string,
  email: string,
  password: string,
  log: (m: string) => void,
  abortSignal: { abort: boolean },
  totpSecret?: string,
): Promise<{ ok: boolean; error?: string }> {
  return withPhoneAutoStop(bearer, phoneId, 5 * 60_000, '5min', log,
    () => _loginInstagramAccountInner(bearer, phoneId, email, password, log, abortSignal, totpSecret))
}

async function _loginInstagramAccountInner(
  bearer: string,
  phoneId: string,
  email: string,
  password: string,
  log: (m: string) => void,
  abortSignal: { abort: boolean },
  totpSecret?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log)
    if (!ready) return { ok: false, error: 'Téléphone non démarré' }
    if (abortSignal.abort) return { ok: false, error: 'Annulé' }

    // Kill Instagram AND Chrome — Chrome Custom Tabs steal the login flow in newer IG
    log('🔄 Arrêt d\'Instagram et Chrome…')
    await shellExec(bearer, phoneId, 'am force-stop com.instagram.android')
    await shellExec(bearer, phoneId, 'am force-stop com.android.chrome')
    await shellExec(bearer, phoneId, 'am force-stop com.google.android.chrome')
    await sleep(1500)

    // Wait 1 minute before opening Instagram to let the phone fully settle
    log('⏳ Attente 60s avant ouverture d\'Instagram…')
    for (let s = 60; s > 0; s -= 10) {
      if (abortSignal.abort) return { ok: false, error: 'Annulé' }
      log(`  ⏳ ${s}s…`)
      await sleep(s > 10 ? 10000 : s * 1000)
    }

    const { output: sizeOut } = await shellExec(bearer, phoneId, 'wm size')
    const sm = sizeOut.match(/(\d+)x(\d+)/)
    const sw = sm ? parseInt(sm[1]) : 1080
    const sh = sm ? parseInt(sm[2]) : 2340

    // Use MainTabActivity — LoginActivity immediately redirects to Chrome in recent IG builds
    log('📲 Lancement d\'Instagram (MainActivity)…')
    await shellExec(bearer, phoneId,
      'am start -n com.instagram.android/.activity.MainTabActivity')
    await sleep(10000)

    let xml = await dumpXml(bearer, phoneId)
    log(`📋 XML initial (${xml.length} chars): ${xml.substring(0, 300)}`)

    // If Chrome opened anyway, kill it and bring Instagram back
    const chromeOpen = xml.includes('com.android.chrome') || xml.includes('com.google.android.chrome')
    if (chromeOpen) {
      log('⚠️ Chrome détecté — fermeture et retour Instagram…')
      await shellExec(bearer, phoneId, 'am force-stop com.android.chrome')
      await shellExec(bearer, phoneId, 'am force-stop com.google.android.chrome')
      await sleep(500)
      await shellExec(bearer, phoneId,
        'am start -n com.instagram.android/.activity.MainTabActivity')
      await sleep(6000)
      xml = await dumpXml(bearer, phoneId)
      log(`📋 XML après fermeture Chrome (${xml.length} chars)`)
    }

    // Some IG builds show a social-login screen first with "Log in with email" link
    // Handle "Join Instagram" onboarding screen (fresh install) — tap "I already have a profile"
    const alreadyHavePt = findByText(xml,
      'I already have a profile', 'J\'ai déjà un profil', 'J\'ai déjà un compte',
      'Already have an account', 'Log in', 'Se connecter',
    )
    if (alreadyHavePt) {
      log('📲 Écran "Join Instagram" détecté — tap "I already have a profile"…')
      await shellExec(bearer, phoneId, `input tap ${alreadyHavePt[0]} ${alreadyHavePt[1]}`)
      await sleep(4000)
      xml = await dumpXml(bearer, phoneId)
      log(`📋 XML après tap (${xml.length} chars)`)
    }

    const emailLoginPt = findByText(xml,
      'Log in with email or phone number',
      'Log in with phone or email',
      'Use email or phone number',
      'Se connecter avec un e-mail ou un numéro de téléphone',
      'Connexion avec un e-mail ou un numéro de téléphone',
    )
    if (emailLoginPt) {
      log('📧 Tap "Log in with email or phone number"…')
      await shellExec(bearer, phoneId, `input tap ${emailLoginPt[0]} ${emailLoginPt[1]}`)
      await sleep(3000)
      xml = await dumpXml(bearer, phoneId)
      log(`📋 XML après sélection email (${xml.length} chars)`)
    }

    // ── Saisie identifiant ─────────────────────────────────────────────────
    log('📧 Saisie de l\'identifiant…')
    const usernamePt: [number, number] =
      findByResourceId(xml,
        'login_username', 'username', 'email_phone_field',
        'com.instagram.android:id/login_username') ??
      findByText(xml,
        'Phone number, username, or email',
        'Username, email or mobile number',
        'Numéro de téléphone, nom d\'utilisateur ou adresse e-mail',
        'Username or email', 'Identifiant ou e-mail',
        'Email address', 'Adresse e-mail') ??
      [Math.floor(sw / 2), Math.floor(sh * 0.42)]

    log(`   Champ identifiant à [${usernamePt[0]},${usernamePt[1]}]`)
    await shellExec(bearer, phoneId, `input tap ${usernamePt[0]} ${usernamePt[1]}`)
    await sleep(1000)
    await shellExec(bearer, phoneId, `input text "${escapeForInputText(email)}"`)
    await sleep(800)

    // ── Après l'email : Next ou champ password direct ─────────────────────
    await sleep(800)

    // Re-dump to detect whether this is a 2-screen flow (email → Next → password)
    // or a single-screen flow (both fields visible at once)
    xml = await dumpXml(bearer, phoneId)

    // Check for Next/Continue button (2-screen Instagram login flow)
    const nextAfterEmail = findByText(xml,
      'Next', 'Suivant', 'Continue', 'Continuer', 'Next step',
    ) ?? findByResourceId(xml, 'next_button', 'action_next', 'button_next')

    if (nextAfterEmail) {
      log('➡️ Bouton Next détecté — Instagram login en 2 étapes')
      await shellExec(bearer, phoneId, `input tap ${nextAfterEmail[0]} ${nextAfterEmail[1]}`)
      await sleep(3000)
      xml = await dumpXml(bearer, phoneId)
      log(`📋 XML après Next (${xml.length} chars)`)
    }

    // Find password field in updated XML
    const passwordPt: [number, number] | null =
      findByResourceId(xml,
        'password', 'login_password', 'com.instagram.android:id/password',
        'com.instagram.android:id/login_password') ??
      findByText(xml, 'Password', 'Mot de passe', 'Enter password') ??
      (nextAfterEmail
        ? [Math.floor(sw / 2), Math.floor(sh * 0.42)] as [number, number]
        : null)

    if (passwordPt) {
      log(`🔑 Champ password à [${passwordPt[0]},${passwordPt[1]}] — double tap pour focus`)
      await shellExec(bearer, phoneId, `input tap ${passwordPt[0]} ${passwordPt[1]}`)
      await sleep(400)
      await shellExec(bearer, phoneId, `input tap ${passwordPt[0]} ${passwordPt[1]}`)
      await sleep(600)
    } else {
      // Single-screen fallback: TAB from email field
      log('🔑 Champ password non trouvé — TAB depuis email')
      await shellExec(bearer, phoneId, 'input keyevent 61')
      await sleep(700)
    }

    // ── Saisie mot de passe ────────────────────────────────────────────────
    log('🔑 Saisie du mot de passe…')
    await shellExec(bearer, phoneId, `input text "${escapeForInputText(password)}"`)
    await sleep(800)

    // ── Soumission : bouton Log In ────────────────────────────────────────
    log('🔐 Tap bouton Log in…')
    xml = await dumpXml(bearer, phoneId)
    const loginBtn = findByText(xml, 'Log in', 'Log In', 'Se connecter', 'Sign in', 'Connexion') ??
                     findByResourceId(xml, 'log_in_button', 'login_button', 'button_text')
    if (loginBtn) {
      log(`   Bouton Log in à [${loginBtn[0]},${loginBtn[1]}]`)
      await shellExec(bearer, phoneId, `input tap ${loginBtn[0]} ${loginBtn[1]}`)
    } else {
      log('   Bouton non trouvé → ENTER')
      await shellExec(bearer, phoneId, 'input keyevent 66')
    }
    log('⏳ Connexion en cours… (attente 15s)')
    await sleep(15000)

    if (abortSignal.abort) return { ok: false, error: 'Annulé' }

    // ── Vérification post-connexion ────────────────────────────────────────
    xml = await dumpXml(bearer, phoneId)
    log(`📋 XML post-login (${xml.length} chars): ${xml.substring(0, 300)}`)
    let xmlLower = xml.toLowerCase()

    // Still on the login page = credentials were not accepted
    const loginPageIndicators = [
      'login_username', 'email_phone_field',
      'phone number, username, or email',
      'username, email or mobile number',
      'numéro de téléphone, nom d\'utilisateur',
    ]
    if (loginPageIndicators.some(p => xmlLower.includes(p))) {
      log('❌ Toujours sur la page de connexion — identifiants refusés ou champs non remplis')
      return { ok: false, error: 'Connexion échouée — la page de login est toujours visible (identifiants incorrects ?)' }
    }

    const errPatterns = [
      'incorrect password', 'mot de passe incorrect',
      'was incorrect', 'try again later', 'réessayer plus tard',
      'unusual login attempt', 'connexion inhabituelle',
      'wrong password', "couldn't find your account",
    ]
    for (const pat of errPatterns) {
      if (xmlLower.includes(pat)) {
        log(`❌ Erreur détectée: "${pat}"`)
        return { ok: false, error: `Login échoué — ${pat}` }
      }
    }

    const homeIndicators = [
      'home_tab', 'ig_bottom_bar', 'navigation_bar',
      'reels_tab', 'clips_tab', 'explore_tab',
    ]
    if (homeIndicators.some(p => xmlLower.includes(p))) {
      log('✅ Connexion réussie !')
      return { ok: true }
    }

    // ── "Check your notifications" OR "Choose a way to confirm" challenge ────
    const isDeviceApproval = [
      'check your notifications on another device',
      'vérifiez vos notifications sur un autre appareil',
      'waiting for approval', 'en attente d\'approbation',
      'approve from the other device', 'approuver depuis l\'autre appareil',
      'choose a way to confirm', 'choisissez une méthode de confirmation',
      'these are your available confirmation methods',
    ].some(p => xmlLower.includes(p))

    if (isDeviceApproval) {
      if (!totpSecret?.trim()) {
        log('⚠️ Challenge confirmation — aucun secret TOTP configuré')
        return { ok: false, error: 'Challenge détecté — configure le secret TOTP pour l\'automatiser' }
      }

      let xmlChallenge = xml

      // If it's the "waiting for approval" screen, tap "Try another way" first
      const needsTryAnother = [
        'check your notifications on another device',
        'waiting for approval', 'en attente d\'approbation',
        'approve from the other device',
      ].some(p => xmlLower.includes(p))

      if (needsTryAnother) {
        log('📱 Tap "Try another way"…')
        const tryAnotherPt =
          findByText(xml, 'Try another way', 'Essayer une autre méthode', 'Try another method') ??
          [Math.floor(sw / 2), Math.floor(sh * 0.75)]
        await shellExec(bearer, phoneId, `input tap ${tryAnotherPt[0]} ${tryAnotherPt[1]}`)
        await sleep(4000)
        xmlChallenge = await dumpXml(bearer, phoneId)
        log(`📋 XML écran choix méthode (${xmlChallenge.length} chars)`)
      } else {
        log('📱 Écran "Choose a way to confirm" détecté directement')
      }

      // Select "Authentication app" radio button
      const authAppPt =
        findByText(xmlChallenge,
          'Authentication app', 'Authenticator app',
          'Application d\'authentification', 'App d\'authentification',
          'Get a code from your authenticator app',
        ) ?? [Math.floor(sw / 2), Math.floor(sh * 0.38)]
      log(`   Tap "Authentication app" à [${authAppPt[0]},${authAppPt[1]}]…`)
      await shellExec(bearer, phoneId, `input tap ${authAppPt[0]} ${authAppPt[1]}`)
      await sleep(1500)

      // "Continue" button is at the bottom of the same screen (~95% height)
      const xmlAfterSelect = await dumpXml(bearer, phoneId)
      log(`📋 XML après sélection (${xmlAfterSelect.length} chars): ${xmlAfterSelect.substring(0, 400)}`)
      const continuePt =
        findByText(xmlAfterSelect, 'Continue', 'Continuer', 'Next', 'Suivant') ??
        findByResourceId(xmlAfterSelect, 'continue_button', 'next_button', 'primary_button') ??
        [Math.floor(sw / 2), Math.floor(sh * 0.94)]
      log(`   Tap "Continue" à [${continuePt[0]},${continuePt[1]}]…`)
      await shellExec(bearer, phoneId, `input tap ${continuePt[0]} ${continuePt[1]}`)
      await sleep(4000)

      // Now on the TOTP code entry screen
      xml = await dumpXml(bearer, phoneId)
      xmlLower = xml.toLowerCase()
      log(`📋 XML écran TOTP (${xml.length} chars)`)
    }

    // ── 2FA screen detection ───────────────────────────────────────────────
    const twoFaPatterns = [
      'two-factor', 'two_factor', '2-step', '2 step',
      'authentification à deux', 'double authentification',
      'confirmation_code', 'two_factor_confirmation',
      'enter the 6-digit', 'entrez le code à 6',
      'enter confirmation code', 'entrez le code de confirmation',
      'get a login code', 'obtenez un code',
      'security code', 'code de sécurité',
      'authentication code', 'code d\'authentification',
      'confirm your identity', 'confirmez votre identité',
    ]
    const is2FA = twoFaPatterns.some(p => xmlLower.includes(p))

    if (is2FA && totpSecret?.trim()) {
      log('🔐 Écran 2FA détecté — génération du code TOTP…')
      const { generateTOTP } = await import('./totp')
      const code = await generateTOTP(totpSecret.trim())
      log(`🔢 Code TOTP généré : ${code}`)

      // Find the 6-digit input field
      const codePt: [number, number] =
        findByResourceId(xml,
          'two_factor_confirmation_code_field', 'confirmation_code',
          'security_code', 'auth_code', 'otp_code') ??
        findByText(xml, '______', 'Enter code', 'Entrez le code', 'Code') ??
        [Math.floor(sw / 2), Math.floor(sh * 0.45)]

      log(`   Champ code à [${codePt[0]},${codePt[1]}]`)
      await shellExec(bearer, phoneId, `input tap ${codePt[0]} ${codePt[1]}`)
      await sleep(600)
      await shellExec(bearer, phoneId, `input text "${code}"`)
      await sleep(600)

      // Re-dump XML to get confirm button (the button might only appear after filling)
      const xml2 = await dumpXml(bearer, phoneId)
      const confirmPt =
        findByText(xml2, 'Confirm', 'Confirmer', 'Submit', 'Valider', 'Verify', 'Vérifier', 'Next', 'Suivant', 'Continue') ??
        findByResourceId(xml2, 'confirmation_button', 'submit_button', 'verify_button', 'next_button')
      if (confirmPt) {
        log(`   Bouton confirmation à [${confirmPt[0]},${confirmPt[1]}]`)
        await shellExec(bearer, phoneId, `input tap ${confirmPt[0]} ${confirmPt[1]}`)
      } else {
        log('   Bouton non trouvé → ENTER')
        await shellExec(bearer, phoneId, 'input keyevent 66')
      }

      log('⏳ Validation du code 2FA (12s)…')
      await sleep(12000)

      const xml3 = await dumpXml(bearer, phoneId)
      const xmlLower3 = xml3.toLowerCase()
      const badCode = ['incorrect code', 'code incorrect', 'wrong code', 'invalid code',
                       'code invalide', 'code expiré', 'expired code']
      if (badCode.some(p => xmlLower3.includes(p))) {
        return { ok: false, error: 'Code 2FA refusé — secret TOTP incorrect ou code expiré' }
      }
      // Still on the 2FA screen = code was rejected
      const still2FA = twoFaPatterns.some(p => xmlLower3.includes(p))
      if (still2FA) {
        return { ok: false, error: 'Code 2FA refusé — toujours sur l\'écran 2FA' }
      }
      // Any other screen (home, onboarding, permissions…) = success
      log('✅ Connexion réussie avec 2FA !')
      return { ok: true }
    }

    if (is2FA) {
      log('⚠️ Écran 2FA détecté mais aucun secret TOTP configuré')
      return { ok: false, error: 'Écran 2FA — configure le secret TOTP dans le Warmup pour l\'automatiser' }
    }

    // Unknown state
    log('⚠️ État inconnu après connexion — vérifier le téléphone')
    return { ok: false, error: 'État inconnu après connexion — vérifier manuellement' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────
export async function warmupAccount(
  bearer: string,
  phoneId: string,
  config: WarmupConfig,
  log: (m: string) => void,
  abortSignal: { abort: boolean },
): Promise<{ ok: boolean; error?: string }> {
  // Auto-stop: browse duration + 3 min safety margin
  const warmupMs = (config.browseMinutes * 60 + 3 * 60) * 1000
  return withPhoneAutoStop(bearer, phoneId, warmupMs, `${config.browseMinutes + 3}min`, log,
    () => _warmupAccountInner(bearer, phoneId, config, log, abortSignal))
}

async function _warmupAccountInner(
  bearer: string,
  phoneId: string,
  config: WarmupConfig,
  log: (m: string) => void,
  abortSignal: { abort: boolean },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log)
    if (!ready) return { ok: false, error: 'Téléphone non démarré après 120s — vérifier GéeLark et l\'ID du téléphone' }

    const hasProfileUpdate = config.profileName || config.bio || config.profilePicUrl
    if (hasProfileUpdate) {
      await updateInstagramProfile(bearer, phoneId, config, log)
    }

    if (abortSignal.abort) return { ok: true }

    if (config.browseMinutes > 0) {
      await runWarmupActions(bearer, phoneId, config, log, abortSignal)
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Extract Instagram sessionid from GéeLark phone shell ─────────────────────
// Accepts an external AbortSignal for cancellation. Times out after 3 minutes.
export async function extractInstagramSessionId(
  bearer: string,
  geelarkId: string,
  log: (m: string) => void,
  externalSignal?: AbortSignal,
): Promise<string | null> {
  // Internal 3-minute timeout + external cancel merged into one signal
  const timeoutCtrl = new AbortController()
  const timeoutId   = setTimeout(() => timeoutCtrl.abort(), 3 * 60 * 1000)

  // Merge external signal with internal timeout
  const signal = timeoutCtrl.signal
  externalSignal?.addEventListener('abort', () => timeoutCtrl.abort(), { once: true })

  // Shell options: only 2 retries (phone should already be up) with short delays
  const sh = (cmd: string) => shellExec(bearer, geelarkId, cmd, { maxRetries: 2, signal })

  try {
    // ── Step 1: ensure phone is running ──────────────────────────────────────
    const running = await ensurePhoneRunning(bearer, geelarkId, log, signal)
    if (!running) {
      log('❌ Impossible de démarrer le téléphone — abandon')
      return null
    }
    if (signal.aborted) throw new Error('Annulé')

    const tmp = '/sdcard/sf_ig_cookies.db'

    // Possible cookie DB paths (varies by Android/WebView version)
    const cookiePaths = [
      '/data/data/com.instagram.android/app_webview/Default/Cookies',
      '/data/data/com.instagram.android/app_webview/Cookies',
      '/data/data/com.instagram.android/app_chrome/Default/Cookies',
      '/data/data/com.instagram.android/databases/webview_cookies.db',
    ]

    // ── Step 2: SQLite cookie DB ──────────────────────────────────────────────
    log('─── Méthode 1 : base SQLite WebView ───')
    for (const path of cookiePaths) {
      if (signal.aborted) throw new Error('Annulé')
      log(`  📂 Test chemin: ${path.split('/').pop()}`)
      const cp = await sh(`cp "${path}" "${tmp}" 2>/dev/null && echo OK || echo FAIL`)
      log(`     → cp: ${cp.output.trim()}`)
      if (!cp.output.includes('OK')) continue

      log('  📋 Fichier trouvé — lecture sqlite3…')
      const sql = await sh(
        `sqlite3 "${tmp}" "SELECT value FROM cookies WHERE name='sessionid' LIMIT 1;" 2>/dev/null`)
      const v1 = sql.output.trim()
      log(`     → sqlite3 output (${v1.length} chars): ${v1.slice(0, 30) || '(vide)'}`)
      if (v1.length > 20) {
        await sh(`rm -f "${tmp}"`)
        log('✅ sessionid extrait via sqlite3 !')
        return v1
      }

      log('  📋 sqlite3 vide — essai strings+awk…')
      const str = await sh(
        `strings -n 8 "${tmp}" | awk 'prev=="sessionid"{print;exit}{prev=$0}' 2>/dev/null`)
      const v2 = str.output.trim()
      log(`     → strings/awk output (${v2.length} chars): ${v2.slice(0, 30) || '(vide)'}`)
      if (v2.length > 20) {
        await sh(`rm -f "${tmp}"`)
        log('✅ sessionid extrait via strings/awk !')
        return v2
      }

      log('  📋 strings/awk vide — essai grep pattern…')
      const grep = await sh(
        `cat "${tmp}" | strings | grep -E "^[0-9]{8,15}%3A[A-Za-z0-9_%-]{20,}$" | head -1 2>/dev/null`)
      const v3 = grep.output.trim()
      log(`     → grep output (${v3.length} chars): ${v3.slice(0, 30) || '(vide)'}`)
      if (v3.length > 20) {
        await sh(`rm -f "${tmp}"`)
        log('✅ sessionid extrait via grep pattern !')
        return v3
      }

      await sh(`rm -f "${tmp}"`)
      log(`  ⚠️ Fichier copié mais sessionid non trouvé (path: ${path.split('/').slice(-3).join('/')})`)
    }

    // ── Step 3: shared_prefs XML ──────────────────────────────────────────────
    if (signal.aborted) throw new Error('Annulé')
    log('─── Méthode 2 : shared_prefs XML ───')
    const prefs = await sh(
      `grep -rh "sessionid" /data/data/com.instagram.android/shared_prefs/ 2>/dev/null | grep -oE "[0-9]{8,15}%3A[A-Za-z0-9_%.-]{20,}" | head -1`)
    const v4 = prefs.output.trim()
    log(`  → shared_prefs output (${v4.length} chars): ${v4.slice(0, 30) || '(vide)'}`)
    if (v4.length > 20) {
      log('✅ sessionid extrait via shared_prefs !')
      return v4
    }

    // ── Step 4: diagnostic find ───────────────────────────────────────────────
    if (signal.aborted) throw new Error('Annulé')
    log('─── Diagnostic : fichiers disponibles ───')
    const bin = await sh(
      `find /data/data/com.instagram.android -name "*.db" -o -name "Cookies" 2>/dev/null | head -20`)
    const files = bin.output.trim()
    if (files) {
      log('  Fichiers trouvés:')
      files.split('\n').forEach(f => log(`    ${f}`))
    } else {
      log('  ⚠️ Aucun fichier accessible — le shell manque probablement de droits root')
    }

    log('❌ sessionid non trouvé après toutes les méthodes')
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'Annulé' || signal.aborted) {
      log('🛑 Extraction annulée')
    }
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── Instagram account creation automation ────────────────────────────────────
export interface CreateAccountConfig {
  firstName:   string
  email:       string
  password:    string
  username?:   string  // if empty, accepts Instagram's suggestion
  birthDay?:   number  // 1-31
  birthMonth?: number  // 1-12
  birthYear?:  number  // e.g. 1995
}

export async function createInstagramAccount(
  bearer: string,
  phoneId: string,
  account: CreateAccountConfig,
  onVerificationNeeded: (email: string) => Promise<string>,
  log: (m: string) => void,
  signal?: AbortSignal,
  onPhoneNeeded?: () => Promise<string>,
): Promise<{ ok: boolean; username?: string; error?: string }> {
  const aborted = () => signal?.aborted ?? false

  try {
    const ready = await ensurePhoneRunning(bearer, phoneId, log, signal)
    if (!ready) return { ok: false, error: 'Téléphone non démarré' }
    if (aborted()) return { ok: false, error: 'Annulé' }

    const { output: sizeOut } = await shellExec(bearer, phoneId, 'wm size', { signal })
    const sm = sizeOut.match(/(\d+)x(\d+)/)
    const sw = sm ? parseInt(sm[1]) : 1080
    const sh = sm ? parseInt(sm[2]) : 2340

    log('🔄 Arrêt d\'Instagram et Chrome…')
    await shellExec(bearer, phoneId, 'am force-stop com.instagram.android', { signal })
    await shellExec(bearer, phoneId, 'am force-stop com.android.chrome', { signal })
    await shellExec(bearer, phoneId, 'am force-stop com.google.android.chrome', { signal })
    await sleepOrAbort(2000, signal)

    log('📲 Lancement d\'Instagram…')
    await shellExec(bearer, phoneId,
      'am start -n com.instagram.android/.activity.MainTabActivity', { signal })
    await sleepOrAbort(9000, signal)
    if (aborted()) return { ok: false, error: 'Annulé' }

    let xml = await dumpXml(bearer, phoneId)

    // If Chrome opened, kill it and re-launch Instagram
    if (xml.includes('com.android.chrome') || xml.includes('com.google.android.chrome')) {
      log('⚠️ Chrome détecté — fermeture…')
      await shellExec(bearer, phoneId, 'am force-stop com.android.chrome', { signal })
      await shellExec(bearer, phoneId, 'am force-stop com.google.android.chrome', { signal })
      await sleepOrAbort(500, signal)
      await shellExec(bearer, phoneId,
        'am start -n com.instagram.android/.activity.MainTabActivity', { signal })
      await sleepOrAbort(6000, signal)
      xml = await dumpXml(bearer, phoneId)
    }

    // ── Trouver et taper le bouton "Créer un compte" / "Sign up" ──────────────
    let signupPt =
      findByText(xml,
        'Create new account', 'Créer un compte', 'Create account', 'Sign up',
        "S'inscrire", 'New account', 'Nouveau compte', 'Get started', 'Commencer',
      ) ??
      findByTextPartial(xml, 'Create', 'Créer', 'Sign up', 'Inscrire')

    if (signupPt) {
      log(`📝 Tap "Créer un compte" [${signupPt[0]},${signupPt[1]}]…`)
      await shellExec(bearer, phoneId, `input tap ${signupPt[0]} ${signupPt[1]}`, { signal })
      await sleepOrAbort(5000, signal)
      xml = await dumpXml(bearer, phoneId)
    } else {
      log('⚠️ Bouton inscription non trouvé — deep link…')
      await shellExec(bearer, phoneId,
        'am start -a android.intent.action.VIEW -d "https://www.instagram.com/accounts/emailsignup/" -p com.instagram.android',
        { signal })
      await sleepOrAbort(7000, signal)
      xml = await dumpXml(bearer, phoneId)
    }
    log(`📋 Écran inscription (${xml.length} chars)`)
    if (aborted()) return { ok: false, error: 'Annulé' }

    // ── Saisie du prénom ────────────────────────────────────────────────────
    log('📝 Saisie du prénom…')
    const namePt: [number, number] =
      findByResourceId(xml, 'full_name', 'name', 'first_name', 'fullName') ??
      findByText(xml,
        'Full name', 'Nom complet', 'First name', 'Prénom', 'Name', 'Nom',
        'Enter your name', 'Entrez votre nom',
      ) ??
      [Math.floor(sw / 2), Math.floor(sh * 0.40)]

    await clearAndType(bearer, phoneId, namePt, account.firstName, log)
    await sleepOrAbort(800, signal)

    xml = await dumpXml(bearer, phoneId)
    let nextPt: [number, number] =
      findByText(xml, 'Next', 'Suivant', 'Continue', 'Continuer') ??
      findByResourceId(xml, 'next_button', 'primary_button', 'button_next') ??
      [Math.floor(sw / 2), Math.floor(sh * 0.90)]
    await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`, { signal })
    await sleepOrAbort(5000, signal)
    xml = await dumpXml(bearer, phoneId)
    if (aborted()) return { ok: false, error: 'Annulé' }

    // ── Anniversaire ────────────────────────────────────────────────────────
    const xmlLower1 = xml.toLowerCase()
    const hasBirthday = ['birthday', 'date of birth', 'birth', 'anniversaire', 'naissance',
      'age', 'âge', 'how old'].some(p => xmlLower1.includes(p))

    if (hasBirthday) {
      log('🎂 Écran anniversaire…')
      const day   = account.birthDay   ?? 15
      const month = account.birthMonth ?? 6
      const year  = account.birthYear  ?? 1995

      const monthPt = findByResourceId(xml, 'month', 'birthday_month') ??
                      findByText(xml, 'Month', 'Mois', 'MM')
      const dayPt   = findByResourceId(xml, 'day', 'birthday_day') ??
                      findByText(xml, 'Day', 'Jour', 'DD')
      const yearPt  = findByResourceId(xml, 'year', 'birthday_year') ??
                      findByText(xml, 'Year', 'Année', 'YYYY')

      if (monthPt && dayPt && yearPt) {
        await clearAndType(bearer, phoneId, monthPt, String(month), log)
        await sleepOrAbort(400, signal)
        await clearAndType(bearer, phoneId, dayPt, String(day), log)
        await sleepOrAbort(400, signal)
        await clearAndType(bearer, phoneId, yearPt, String(year), log)
        await sleepOrAbort(600, signal)
      } else {
        log('  ⚠️ Champs anniversaire non trouvés — valeur par défaut conservée')
      }

      xml = await dumpXml(bearer, phoneId)
      nextPt =
        findByText(xml, 'Next', 'Suivant', 'Continue', 'Continuer') ??
        findByResourceId(xml, 'next_button', 'primary_button') ??
        [Math.floor(sw / 2), Math.floor(sh * 0.90)]
      await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`, { signal })
      await sleepOrAbort(5000, signal)
      xml = await dumpXml(bearer, phoneId)
      if (aborted()) return { ok: false, error: 'Annulé' }
    }

    // ── Choix email vs téléphone ────────────────────────────────────────────
    const xmlLower2 = xml.toLowerCase()
    if (['mobile number', 'phone number', 'email', 'numéro de téléphone', 'téléphone'].some(p => xmlLower2.includes(p))) {
      const useEmailPt =
        findByText(xml,
          'Sign up with email', 'Use email', 'Use email address',
          "S'inscrire avec un e-mail", 'Utiliser une adresse e-mail',
          'Use email instead', 'Email address',
        ) ??
        findByTextPartial(xml, 'email', 'e-mail')

      if (useEmailPt) {
        log('📧 Sélection "Utiliser email"…')
        await shellExec(bearer, phoneId, `input tap ${useEmailPt[0]} ${useEmailPt[1]}`, { signal })
        await sleepOrAbort(3000, signal)
        xml = await dumpXml(bearer, phoneId)
      }
    }

    // ── Saisie de l'email ───────────────────────────────────────────────────
    log('📧 Saisie de l\'email…')
    const emailPt: [number, number] =
      findByResourceId(xml, 'email', 'email_address', 'email_phone', 'email_field') ??
      findByText(xml,
        'Email', 'E-mail', 'Email address', 'Adresse e-mail',
        'Mobile number or email', 'Phone number or email',
      ) ??
      [Math.floor(sw / 2), Math.floor(sh * 0.42)]

    await clearAndType(bearer, phoneId, emailPt, account.email, log)
    await sleepOrAbort(800, signal)

    xml = await dumpXml(bearer, phoneId)
    nextPt =
      findByText(xml, 'Next', 'Suivant', 'Continue', 'Continuer') ??
      findByResourceId(xml, 'next_button', 'primary_button', 'button_next') ??
      [Math.floor(sw / 2), Math.floor(sh * 0.90)]
    await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`, { signal })
    await sleepOrAbort(6000, signal)
    xml = await dumpXml(bearer, phoneId)
    if (aborted()) return { ok: false, error: 'Annulé' }

    // ── Vérification par numéro de téléphone (Instagram insiste parfois) ──
    // Détecte l'écran "Enter your phone number" pendant l'inscription et demande
    // le numéro à l'utilisateur via onPhoneNeeded, puis saisit le code SMS.
    const PHONE_REQ_KEYWORDS = [
      'enter your phone number', 'enter your mobile number',
      'entrez votre numéro de téléphone', 'entrez votre numéro',
      'verify with your phone', 'vérifiez avec votre téléphone',
      'add your phone number to sign up', 'phone number to continue',
      'we need your phone number', 'numéro de téléphone pour continuer',
    ]
    if (PHONE_REQ_KEYWORDS.some(p => xml.toLowerCase().includes(p))) {
      log('📱 Instagram demande un numéro de téléphone pour vérification…')
      if (!onPhoneNeeded) {
        return { ok: false, error: "Instagram exige un numéro de téléphone — configure onPhoneNeeded" }
      }
      const phoneNumber = await onPhoneNeeded()
      if (!phoneNumber?.trim()) return { ok: false, error: 'Numéro de téléphone non fourni' }
      if (aborted()) return { ok: false, error: 'Annulé' }

      log(`📞 Saisie du numéro: ${phoneNumber.trim()}`)
      const phonePt: [number, number] =
        findByResourceId(xml, 'phone_number', 'mobile_number', 'phone_field', 'phone') ??
        findByText(xml,
          'Phone number', 'Mobile number', 'Numéro de téléphone',
          'Enter phone number', 'Enter your number',
        ) ??
        [Math.floor(sw / 2), Math.floor(sh * 0.42)]

      await clearAndType(bearer, phoneId, phonePt, phoneNumber.trim(), log)
      await sleepOrAbort(800, signal)

      xml = await dumpXml(bearer, phoneId)
      nextPt =
        findByText(xml, 'Next', 'Suivant', 'Continue', 'Continuer', 'Send code', 'Envoyer le code') ??
        findByResourceId(xml, 'next_button', 'primary_button') ??
        [Math.floor(sw / 2), Math.floor(sh * 0.90)]
      await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`, { signal })
      await sleepOrAbort(6000, signal)
      xml = await dumpXml(bearer, phoneId)
      log(`📋 Après numéro (${xml.length} chars)`)
      if (aborted()) return { ok: false, error: 'Annulé' }
      // Le code SMS sera capturé par la boucle de vérification ci-dessous
    }

    // ── Code de vérification (jusqu'à 3 tentatives) ────────────────────────
    const VERIF_KEYWORDS = [
      'confirmation code', 'verification code', 'enter the code',
      'code de confirmation', 'code de vérification', 'entrez le code',
      'confirmation_code', 'verify your email', 'vérifiez votre adresse',
      'check your email', 'check your inbox', 'we sent a code',
      'we sent you a code', 'enter the 6-digit', 'code à 6',
      'security code', 'code de sécurité', 'enter confirmation',
    ]

    for (let codeAttempt = 0; codeAttempt < 3; codeAttempt++) {
      const xmlL = xml.toLowerCase()
      if (!VERIF_KEYWORDS.some(p => xmlL.includes(p))) break

      log(`📬 Code de vérification requis (tentative ${codeAttempt + 1}/3)…`)
      const verificationCode = await onVerificationNeeded(account.email)
      if (!verificationCode?.trim()) return { ok: false, error: 'Code de vérification non fourni' }
      if (aborted()) return { ok: false, error: 'Annulé' }

      log(`🔢 Saisie du code: ${verificationCode.trim()}`)
      const codePt: [number, number] =
        findByResourceId(xml,
          'confirmation_code', 'verification_code', 'code',
          'email_confirmation_code', 'security_code', 'otp',
        ) ??
        findByText(xml, 'Enter code', 'Entrez le code', 'Code') ??
        [Math.floor(sw / 2), Math.floor(sh * 0.45)]

      await clearAndType(bearer, phoneId, codePt, verificationCode.trim(), log)
      await sleepOrAbort(1000, signal)

      xml = await dumpXml(bearer, phoneId)
      nextPt =
        findByText(xml, 'Next', 'Suivant', 'Confirm', 'Confirmer', 'Continue', 'Continuer') ??
        findByResourceId(xml, 'next_button', 'primary_button', 'confirmation_button') ??
        [Math.floor(sw / 2), Math.floor(sh * 0.90)]
      await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`, { signal })
      await sleepOrAbort(7000, signal)
      xml = await dumpXml(bearer, phoneId)
      log(`📋 Après code tentative ${codeAttempt + 1} (${xml.length} chars)`)
      if (aborted()) return { ok: false, error: 'Annulé' }

      const xmlAfterCode = xml.toLowerCase()
      if (['incorrect code', 'code incorrect', 'wrong code', 'expired', 'expiré',
        'invalid code', 'code invalide'].some(p => xmlAfterCode.includes(p))) {
        if (codeAttempt === 2) return { ok: false, error: 'Code de vérification invalide (3 tentatives)' }
        log('⚠️ Code invalide — nouvelle tentative…')
        // Loop continues: re-asks the user for a new code
        continue
      }

      break  // Code accepté
    }

    // ── Mot de passe ────────────────────────────────────────────────────────
    const xmlLower5 = xml.toLowerCase()
    if (['password', 'mot de passe', 'create a password', 'create password', 'choose a password']
      .some(p => xmlLower5.includes(p))) {
      log('🔑 Saisie du mot de passe…')
      const passPt: [number, number] =
        findByResourceId(xml, 'password', 'new_password', 'create_password') ??
        findByText(xml, 'Password', 'Mot de passe', 'Create password', 'Créer un mot de passe') ??
        [Math.floor(sw / 2), Math.floor(sh * 0.42)]

      await clearAndType(bearer, phoneId, passPt, account.password, log)
      await sleepOrAbort(800, signal)

      xml = await dumpXml(bearer, phoneId)
      nextPt =
        findByText(xml, 'Next', 'Suivant', 'Continue', 'Continuer') ??
        findByResourceId(xml, 'next_button', 'primary_button') ??
        [Math.floor(sw / 2), Math.floor(sh * 0.90)]
      await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`, { signal })
      await sleepOrAbort(5000, signal)
      xml = await dumpXml(bearer, phoneId)
      if (aborted()) return { ok: false, error: 'Annulé' }
    }

    // ── Username ────────────────────────────────────────────────────────────
    const xmlLower6 = xml.toLowerCase()
    let finalUsername: string | undefined

    if (['username', 'nom d\'utilisateur', 'choose a username', 'choisir un nom',
      'create a username'].some(p => xmlLower6.includes(p))) {

      if (account.username) {
        log(`👤 Saisie du username: ${account.username}…`)
        const uPt: [number, number] =
          findByResourceId(xml, 'username', 'username_field', 'username_input') ??
          findByText(xml, 'Username', "Nom d'utilisateur") ??
          [Math.floor(sw / 2), Math.floor(sh * 0.42)]
        await clearAndType(bearer, phoneId, uPt, account.username, log)
        finalUsername = account.username
        await sleepOrAbort(1000, signal)
      } else {
        const suggestMatch = xml.match(/text="([a-z0-9._]{3,30})"[^>]*resource-id="[^"]*username/i)
        if (suggestMatch) finalUsername = suggestMatch[1]
        log(`👤 Username suggéré accepté: ${finalUsername ?? '?'}`)
      }

      xml = await dumpXml(bearer, phoneId)
      nextPt =
        findByText(xml, 'Next', 'Suivant', 'Continue', 'Continuer') ??
        findByResourceId(xml, 'next_button', 'primary_button') ??
        [Math.floor(sw / 2), Math.floor(sh * 0.90)]
      await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`, { signal })
      await sleepOrAbort(5000, signal)
      xml = await dumpXml(bearer, phoneId)
      if (aborted()) return { ok: false, error: 'Annulé' }
    }

    // ── Skip/bypass tous les écrans optionnels et challenges ──────────────
    // Instagram peut montrer: photo de profil, suggestions d'amis, notifications,
    // "save your login info", "add phone number", challenges de sécurité, etc.
    // On itère 12 fois max pour tout bypasser jusqu'à atteindre le feed.
    for (let i = 0; i < 12; i++) {
      if (aborted()) return { ok: false, error: 'Annulé' }
      const xmlL = xml.toLowerCase()

      // ── Home atteint ──────────────────────────────────────────────────────
      if (['home_tab', 'ig_bottom_bar', 'reels_tab', 'clips_tab', 'explore_tab']
        .some(p => xmlL.includes(p))) {
        log('🏠 Page d\'accueil atteinte — compte créé !')
        return { ok: true, username: finalUsername }
      }

      // ── Challenge "add phone number for security" → tap "Not now" ─────────
      if (['add your phone number', 'ajouter votre numéro', 'ajoutez votre numéro',
        'add a phone number', 'phone number for security'].some(p => xmlL.includes(p))) {
        log('📵 Popup "Add phone number" — skip…')
        const pt = findByText(xml, 'Not now', 'Pas maintenant', 'Skip', 'Ignorer',
          "I'll add later", 'Later') ??
          [Math.floor(sw / 2), Math.floor(sh * 0.80)]
        await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`, { signal })
        await sleepOrAbort(2500, signal)
        xml = await dumpXml(bearer, phoneId)
        continue
      }

      // ── "Save your login info" → "Not now" ──────────────────────────────
      if (['save your login', 'enregistrer vos informations', 'save login info',
        'remembering your password'].some(p => xmlL.includes(p))) {
        log('💾 Popup "Save login info" — skip…')
        const pt = findByText(xml, 'Not now', 'Pas maintenant', 'Not Now') ??
          [Math.floor(sw / 2), Math.floor(sh * 0.75)]
        await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`, { signal })
        await sleepOrAbort(2500, signal)
        xml = await dumpXml(bearer, phoneId)
        continue
      }

      // ── "Turn on notifications" → "Not now" ──────────────────────────────
      if (['turn on notifications', 'activer les notifications',
        'allow notifications', 'get notified'].some(p => xmlL.includes(p))) {
        log('🔔 Popup notifications — skip…')
        const pt = findByText(xml, 'Not now', 'Pas maintenant', 'Skip', 'Ignorer') ??
          [Math.floor(sw / 2), Math.floor(sh * 0.75)]
        await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`, { signal })
        await sleepOrAbort(2500, signal)
        xml = await dumpXml(bearer, phoneId)
        continue
      }

      // ── "Confirm it's you" / unusual activity challenge ──────────────────
      if (['confirm it\'s you', 'confirmez que c\'est vous',
        'unusual activity', 'activité inhabituelle',
        'suspicious activity', 'we detected', 'we noticed'].some(p => xmlL.includes(p))) {
        log("⚠️ Challenge 'Confirm it's you' — tentative skip / later…")
        const pt =
          findByText(xml, "I'll confirm later", 'Plus tard', 'Later', 'Skip',
            'Not now', 'Dismiss', 'Close') ??
          findByTextPartial(xml, 'later', 'plus tard', 'skip')
        if (pt) {
          await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`, { signal })
          await sleepOrAbort(3000, signal)
          xml = await dumpXml(bearer, phoneId)
          continue
        }
        // Can't bypass — press Back and hope for the best
        await shellExec(bearer, phoneId, 'input keyevent 4', { signal })
        await sleepOrAbort(2500, signal)
        xml = await dumpXml(bearer, phoneId)
        continue
      }

      // ── "Allow access to contacts/gallery" system permission dialog ───────
      if (['allow instagram', 'allow access', 'autoriser instagram', 'autoriser l\'accès',
        'while using the app', 'only this time'].some(p => xmlL.includes(p))) {
        log('📂 Popup permission système — deny…')
        const denyPt =
          findByText(xml, "Don't allow", 'Deny', 'Refuser', 'Not now', 'No thanks') ??
          findByTextPartial(xml, "don't allow", 'deny', 'refuser')
        if (denyPt) {
          await shellExec(bearer, phoneId, `input tap ${denyPt[0]} ${denyPt[1]}`, { signal })
        } else {
          await shellExec(bearer, phoneId, 'input keyevent 4', { signal })
        }
        await sleepOrAbort(2000, signal)
        xml = await dumpXml(bearer, phoneId)
        continue
      }

      // ── Generic skip / not now ────────────────────────────────────────────
      const skipPt =
        findByText(xml,
          'Skip', 'Ignorer', 'Not now', 'Pas maintenant',
          'Skip for now', 'Ignorer pour l\'instant',
          "I'll do this later", 'Later', 'Plus tard',
          'Skip All', 'Maybe later', 'No thanks',
        ) ??
        findByTextPartial(xml, 'Skip', 'Ignorer', 'Not now', 'Later')

      if (skipPt) {
        log(`⏭️ Tap "Ignorer" [${skipPt[0]},${skipPt[1]}]…`)
        await shellExec(bearer, phoneId, `input tap ${skipPt[0]} ${skipPt[1]}`, { signal })
        await sleepOrAbort(3000, signal)
        xml = await dumpXml(bearer, phoneId)
        continue
      }

      // ── Generic next / continue ───────────────────────────────────────────
      const contPt =
        findByText(xml, 'Next', 'Suivant', 'Continue', 'Continuer', 'Done', 'Finish', 'OK') ??
        findByResourceId(xml, 'next_button', 'primary_button', 'continue_button')

      if (contPt) {
        log(`➡️ Tap "Suivant" [${contPt[0]},${contPt[1]}]…`)
        await shellExec(bearer, phoneId, `input tap ${contPt[0]} ${contPt[1]}`, { signal })
        await sleepOrAbort(3000, signal)
        xml = await dumpXml(bearer, phoneId)
        continue
      }

      // Aucun bouton trouvé → back
      await shellExec(bearer, phoneId, 'input keyevent 4', { signal })
      await sleepOrAbort(2000, signal)
      xml = await dumpXml(bearer, phoneId)
    }

    const xmlFinal = xml.toLowerCase()
    if (['home_tab', 'ig_bottom_bar', 'reels_tab', 'clips_tab', 'explore_tab']
      .some(p => xmlFinal.includes(p))) {
      return { ok: true, username: finalUsername }
    }

    log('⚠️ État final incertain — le compte a probablement été créé')
    return { ok: true, username: finalUsername }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`❌ Erreur: ${msg}`)
    return { ok: false, error: msg }
  }
}

// ── TikTok video posting via ADB automation ──────────────────────────────────
export interface TikTokPostConfig {
  videoUrl: string   // public/signed URL accessible from the phone
  caption:  string
}

export async function postTikTokVideoAdb(
  bearer: string,
  phoneId: string,
  config: TikTokPostConfig,
  log: (m: string) => void,
  signal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  return withPhoneAutoStop(bearer, phoneId, 5 * 60_000, '5min', log,
    () => _postTikTokVideoAdbInner(bearer, phoneId, config, log, signal))
}

async function _postTikTokVideoAdbInner(
  bearer: string,
  phoneId: string,
  config: TikTokPostConfig,
  log: (m: string) => void,
  signal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  const { videoUrl, caption } = config

  try {
    // ── 1. Ensure phone is running ──────────────────────────────────────────
    log('📱 Démarrage du téléphone…')
    const started = await ensurePhoneRunning(bearer, phoneId, log, signal)
    if (!started) return { ok: false, error: 'Impossible de démarrer le téléphone' }

    // ── 2. Get screen dimensions ────────────────────────────────────────────
    const { output: sizeOut } = await shellExec(bearer, phoneId, 'wm size', { signal })
    // "Physical size: 1080x1920" or "Override size: 1080x2340"
    const sizeMatch = sizeOut.match(/(\d+)x(\d+)/)
    const sw = sizeMatch ? parseInt(sizeMatch[1], 10) : 1080
    const sh = sizeMatch ? parseInt(sizeMatch[2], 10) : 1920
    log(`📐 Écran: ${sw}×${sh}`)

    // ── 3. Force stop TikTok ────────────────────────────────────────────────
    log('🛑 Fermeture de TikTok…')
    await shellExec(bearer, phoneId, 'am force-stop com.zhiliaoapp.musically', { signal, maxRetries: 2 })
    await shellExec(bearer, phoneId, 'am force-stop com.ss.android.ugc.aweme', { signal, maxRetries: 2 })
    await sleepOrAbort(1000, signal)

    // ── 4. Download video to phone ──────────────────────────────────────────
    log('⬇️ Téléchargement de la vidéo…')
    await shellExec(bearer, phoneId, 'mkdir -p /sdcard/DCIM/TikTok', { signal, maxRetries: 2 })

    const dlDest = '/sdcard/DCIM/TikTok/sf_tt_video.mp4'
    // Try wget first
    const { output: wgetOut, status: wgetStatus } = await shellExec(
      bearer, phoneId,
      `wget -q -O ${dlDest} "${videoUrl}" 2>&1; echo "EXIT:$?"`,
      { signal, maxRetries: 2 },
    )
    const wgetOk = wgetStatus === 0 && !wgetOut.includes('ERROR') && !wgetOut.includes('failed')
    if (!wgetOk) {
      log('   wget échoué, essai avec curl…')
      const { output: curlOut } = await shellExec(
        bearer, phoneId,
        `curl -fsSL -o ${dlDest} "${videoUrl}" 2>&1; echo "EXIT:$?"`,
        { signal, maxRetries: 2 },
      )
      if (curlOut.includes('curl: (') || curlOut.includes('EXIT:1')) {
        return { ok: false, error: `Téléchargement impossible: ${curlOut.slice(0, 120)}` }
      }
      log('   ✅ Vidéo téléchargée via curl')
    } else {
      log('   ✅ Vidéo téléchargée via wget')
    }

    // ── 5. Scan media library ───────────────────────────────────────────────
    log('📚 Scan bibliothèque média…')
    await shellExec(
      bearer, phoneId,
      `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${dlDest}`,
      { signal, maxRetries: 2 },
    )

    // ── 6. Wait for scan ────────────────────────────────────────────────────
    await sleepOrAbort(3000, signal)

    // ── 7. Open TikTok ──────────────────────────────────────────────────────
    log('🎵 Ouverture de TikTok…')
    const { status: launchStatus } = await shellExec(
      bearer, phoneId,
      'am start -n com.zhiliaoapp.musically/.main.MainActivity',
      { signal, maxRetries: 2 },
    )
    if (launchStatus !== 0) {
      log('   Essai package alternatif (aweme)…')
      await shellExec(
        bearer, phoneId,
        'am start -n com.ss.android.ugc.aweme/.main.MainActivity',
        { signal, maxRetries: 2 },
      )
    }

    // ── 8. Wait for app to load ─────────────────────────────────────────────
    await sleepOrAbort(8000, signal)

    // ── 9. Tap "+" create button ────────────────────────────────────────────
    log('➕ Tap bouton créer…')
    let xml = await dumpXml(bearer, phoneId)
    let createPt =
      findByResourceId(xml, 'creation_btn', 'tab_add', 'action_create') ??
      findByText(xml, '+', 'Créer', 'Create') ??
      [Math.floor(sw / 2), Math.floor(sh * 0.92)] as [number, number]
    log(`   Tap [${createPt[0]},${createPt[1]}]`)
    await shellExec(bearer, phoneId, `input tap ${createPt[0]} ${createPt[1]}`, { signal })

    // ── 10. Wait ────────────────────────────────────────────────────────────
    await sleepOrAbort(4000, signal)

    // ── 11. Tap "Upload" / "Gallery" ────────────────────────────────────────
    log('📁 Tap galerie / upload…')
    xml = await dumpXml(bearer, phoneId)
    let uploadPt =
      findByText(xml, 'Upload', 'Gallery', 'Télécharger', 'Galerie') ??
      findByTextPartial(xml, 'upload', 'galerie') ??
      [Math.floor(sw * 0.85), Math.floor(sh * 0.85)] as [number, number]
    log(`   Tap [${uploadPt[0]},${uploadPt[1]}]`)
    await shellExec(bearer, phoneId, `input tap ${uploadPt[0]} ${uploadPt[1]}`, { signal })

    // ── 12. Wait ────────────────────────────────────────────────────────────
    await sleepOrAbort(3000, signal)

    // ── 13. Select first video in gallery ───────────────────────────────────
    log('🎬 Sélection première vidéo…')
    xml = await dumpXml(bearer, phoneId)
    let videoPt =
      findByResourceId(xml, 'gallery_grid_item', 'media_picker_grid_item', 'item_video') ??
      [Math.floor(sw * 0.17), Math.floor(sh * 0.30)] as [number, number]
    log(`   Tap [${videoPt[0]},${videoPt[1]}]`)
    await shellExec(bearer, phoneId, `input tap ${videoPt[0]} ${videoPt[1]}`, { signal })

    // ── 14. Wait ────────────────────────────────────────────────────────────
    await sleepOrAbort(3000, signal)

    // ── 15. Tap "Next" / "Suivant" ──────────────────────────────────────────
    log('➡️ Tap Suivant (1)…')
    xml = await dumpXml(bearer, phoneId)
    let nextPt =
      findByText(xml, 'Next', 'Suivant') ??
      [Math.floor(sw * 0.87), Math.floor(sh * 0.06)] as [number, number]
    log(`   Tap [${nextPt[0]},${nextPt[1]}]`)
    await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`, { signal })

    // ── 16. Wait — may show Sounds or Trim screen ───────────────────────────
    await sleepOrAbort(4000, signal)

    // ── 17. Tap "Next" again if still on trim/sounds screen ─────────────────
    xml = await dumpXml(bearer, phoneId)
    const nextPt2 = findByText(xml, 'Next', 'Suivant')
    if (nextPt2) {
      log('➡️ Tap Suivant (2 — écran trim/sons)…')
      log(`   Tap [${nextPt2[0]},${nextPt2[1]}]`)
      await shellExec(bearer, phoneId, `input tap ${nextPt2[0]} ${nextPt2[1]}`, { signal })
    }

    // ── 18. Wait for caption screen ─────────────────────────────────────────
    await sleepOrAbort(4000, signal)

    // ── 19. Find and fill caption field ─────────────────────────────────────
    log('✏️ Saisie de la légende…')
    xml = await dumpXml(bearer, phoneId)
    const captionPt =
      findByResourceId(xml, 'caption', 'text_input', 'edit_text_desc') ??
      findByText(xml, 'Describe...', 'Ajouter une description', 'Caption') ??
      [Math.floor(sw / 2), Math.floor(sh * 0.35)] as [number, number]
    log(`   Champ légende [${captionPt[0]},${captionPt[1]}]`)
    // Pre-tap: ferme une éventuelle popup qui se serait ouverte sur cet écran
    await shellExec(bearer, phoneId, `input tap ${captionPt[0]} ${captionPt[1]}`, { signal })
    await sleepOrAbort(700, signal)
    await clearAndType(bearer, phoneId, captionPt, caption, log)

    // ── 20. Wait briefly ────────────────────────────────────────────────────
    await sleepOrAbort(1000, signal)

    // ── 21-22. Find and tap Post button ─────────────────────────────────────
    log('🚀 Tap Publier…')
    xml = await dumpXml(bearer, phoneId)
    const postPt =
      findByText(xml, 'Post', 'Publier', 'Publish') ??
      findByResourceId(xml, 'btn_post', 'post_button') ??
      [Math.floor(sw * 0.85), Math.floor(sh * 0.12)] as [number, number]
    log(`   Tap [${postPt[0]},${postPt[1]}]`)
    await shellExec(bearer, phoneId, `input tap ${postPt[0]} ${postPt[1]}`, { signal })

    // ── 23. Wait for upload + publish ───────────────────────────────────────
    await sleepOrAbort(15000, signal)

    // ── 24. Check for success ────────────────────────────────────────────────
    xml = await dumpXml(bearer, phoneId)
    const xmlLow = xml.toLowerCase()
    // Post button gone = success; or home tab visible
    const postGone = !findByText(xml, 'Post', 'Publier', 'Publish') && !findByResourceId(xml, 'btn_post', 'post_button')
    const homeVisible = ['home_tab', 'tab_home', 'for_you', 'pour_toi', 'following_tab'].some(p => xmlLow.includes(p))

    if (postGone || homeVisible) {
      log('✅ Vidéo publiée avec succès')
      return { ok: true }
    }

    // Check for explicit error
    const errorVisible = ['failed', 'erreur', 'error', 'retry', 'réessayer'].some(p => xmlLow.includes(p))
    if (errorVisible) {
      return { ok: false, error: 'TikTok a signalé une erreur lors de la publication' }
    }

    // Uncertain state — likely still uploading (large video) — treat as success
    log('⚠️ État incertain — la vidéo est probablement en cours d\'envoi')
    return { ok: true }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`❌ Erreur: ${msg}`)
    return { ok: false, error: msg }
  }
}

// ── Live screenshot ───────────────────────────────────────────────────────────
// Takes a screenshot of the phone screen and returns it as a base64 PNG data URL.
// Uses screencap + base64 via shell. Returns null on failure.
export async function takeScreenshot(bearer: string, phoneId: string): Promise<string | null> {
  const url  = `${BASE}/shell/execute`
  const body = { id: phoneId, cmd: 'screencap -p /data/local/tmp/sf_sc.png && base64 /data/local/tmp/sf_sc.png' }

  try {
    let d: Record<string, unknown>

    if (window.electronAPI?.geelarkRequest) {
      // Electron: direct IPC call, no timeout issue
      const result = await window.electronAPI.geelarkRequest({
        method: 'POST', url,
        headers: { Authorization: `Bearer ${bearer}` },
        body,
      })
      if (!result.ok) return null
      d = result.data as Record<string, unknown>
    } else {
      // Web: use dedicated screenshot endpoint (25s timeout)
      const res = await fetch('/api/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          headers: { Authorization: `Bearer ${bearer}` },
          body,
        }),
      })
      if (!res.ok) return null
      const result = await res.json()
      if (!result.ok) return null
      d = result.data as Record<string, unknown>
    }

    if (Number(d['code']) !== 0) return null
    const raw = String((d['data'] as Record<string, unknown>)?.['output'] ?? '').trim()
    if (!raw) return null
    return `data:image/png;base64,${raw.replace(/\s+/g, '')}`
  } catch {
    return null
  }
}
