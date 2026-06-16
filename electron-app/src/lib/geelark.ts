const BASE = 'https://openapi.geelark.com/open/v1'

// Raw phone shape returned by GéeLark API
export interface GeelarkPhone {
  id:          string
  serialNo?:   string | null
  serialName?: string | null  // display name in GéeLark UI
  name?:       string | null
  group?:      { name?: string } | null
  groupName?:  string | null
  status:      number  // 0=running, 1=stopped, 2=starting, 3=stopping
  remark?:     string | null
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

// Ensure the cloud phone is running. Mirrors MassPosting's approach:
// always send /phone/start then wait 30s flat (polling status is unreliable).
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

export async function postInstagramStory(
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
  // Always save as jpg on phone (Instagram accepts JPEG; avoids PNG classification issues)
  const imgPath = '/sdcard/DCIM/Camera/sf_story.jpg'
  let imgOnPhone = false

  // PRIMARY: upload to GeeLark CDN server-side (Vercel → GeeLark S3), then wget on phone.
  // Same mechanism as mass posting — CDN URLs are always reachable from GeeLark phones.
  try {
    log('   ☁️ Upload CDN GeeLark (côté serveur)…')
    const upRes = await fetch('/api/geelark-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedUrl: config.imageUrl, bearer }),
    })
    const upData: { ok: boolean; token?: string; error?: string } = upRes.ok
      ? await upRes.json()
      : { ok: false, error: `HTTP ${upRes.status}` }

    if (upData.ok && upData.token) {
      const cdnUrl = upData.token
      log('   📲 Téléchargement depuis CDN GeeLark…')
      await shellExec(bearer, phoneId,
        `mkdir -p /sdcard/DCIM/Camera && ` +
        `(curl -fsSLk --max-time 90 -o '${imgPath}' '${cdnUrl}' 2>/dev/null || ` +
        ` wget -q --no-check-certificate --timeout=90 -O '${imgPath}' '${cdnUrl}' 2>/dev/null)`)
      const ck = await shellExec(bearer, phoneId, `wc -c < '${imgPath}' 2>/dev/null || echo 0`)
      const sz = parseInt(ck.output.trim().split(/\s+/)[0] ?? '0', 10) || 0
      if (sz > 2000) {
        log(`   ✅ Image via CDN GeeLark (${sz} octets)`)
        imgOnPhone = true
      } else {
        log(`   ⚠️ CDN wget: ${sz} octets — passage au fallback base64`)
      }
    } else {
      log(`   ⚠️ CDN upload: ${upData.error ?? 'échec inconnu'}`)
    }
  } catch (e) {
    log(`   ⚠️ CDN: ${e instanceof Error ? e.message : String(e)}`)
  }

  // FALLBACK: download in browser, compress with OffscreenCanvas, push via base64 chunks.
  if (!imgOnPhone) {
    log('   🔄 Fallback base64…')
    let imgBase64: string | null = null

    const bufToB64 = (buf: ArrayBuffer): string => {
      const u8 = new Uint8Array(buf)
      let b64 = ''
      for (let i = 0; i < u8.length; i += 8192)
        b64 += btoa(String.fromCharCode(...u8.subarray(i, Math.min(i + 8192, u8.length))))
      return b64
    }

    // Download image client-side
    try {
      const resp = await fetch(config.imageUrl)
      if (resp.ok) {
        imgBase64 = bufToB64(await resp.arrayBuffer())
        log(`   📥 Image téléchargée (${Math.round(imgBase64.length / 1024)} KB)`)
      }
    } catch { /* ignore */ }

    // Compress via OffscreenCanvas (no DOM needed, no data: URL size limit)
    if (imgBase64) {
      try {
        const mimeIn = _imgExt === 'png' ? 'image/png' : 'image/jpeg'
        const binStr = atob(imgBase64)
        const u8in = new Uint8Array(binStr.length)
        for (let i = 0; i < binStr.length; i++) u8in[i] = binStr.charCodeAt(i)
        const inBlob = new Blob([u8in], { type: mimeIn })
        const bitmap = await createImageBitmap(inBlob)
        const MAX_W = 1080, MAX_H = 1920
        let w = bitmap.width, h = bitmap.height
        if (w > MAX_W || h > MAX_H) {
          const r = Math.min(MAX_W / w, MAX_H / h)
          w = Math.round(w * r); h = Math.round(h * r)
        }
        const oc = new OffscreenCanvas(w, h)
        const ctx = oc.getContext('2d')!
        ctx.drawImage(bitmap, 0, 0, w, h)
        const outBlob = await oc.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
        const outBuf = await outBlob.arrayBuffer()
        const compressed = bufToB64(outBuf)
        log(`   🗜️ Compression: ${Math.round(imgBase64.length / 1024)} KB → ${Math.round(compressed.length / 1024)} KB JPEG`)
        imgBase64 = compressed
      } catch (e) {
        log(`   ⚠️ Compression ignorée (${e instanceof Error ? e.message : String(e)})`)
      }
    }

    // Push via base64 shell chunks
    if (imgBase64) {
      const CHUNK = 2000, BATCH = 6
      const chunks: string[] = []
      for (let i = 0; i < imgBase64.length; i += CHUNK) chunks.push(imgBase64.slice(i, i + CHUNK))
      log(`   📤 Push base64: ${chunks.length} chunks…`)
      await shellExec(bearer, phoneId,
        `mkdir -p /sdcard/DCIM/Camera && printf '%s' '${chunks[0]}' > '${imgPath}.b64'`)
      for (let b = 1; b < chunks.length; b += BATCH) {
        const cmd = chunks.slice(b, b + BATCH).map(c => `printf '%s' '${c}' >> '${imgPath}.b64'`).join(' && ')
        await shellExec(bearer, phoneId, cmd)
      }
      await shellExec(bearer, phoneId,
        `base64 -d < '${imgPath}.b64' > '${imgPath}' 2>/dev/null || ` +
        `base64 --decode < '${imgPath}.b64' > '${imgPath}' 2>/dev/null; ` +
        `rm -f '${imgPath}.b64'`)
    }

    const ck2 = await shellExec(bearer, phoneId, `wc -c < '${imgPath}' 2>/dev/null || echo 0`)
    const sz2 = parseInt(ck2.output.trim().split(/\s+/)[0] ?? '0', 10) || 0
    if (sz2 > 2000) { imgOnPhone = true; log(`   ✅ Image via base64 (${sz2} octets)`) }
    else { log(`   ❌ Fallback base64: ${sz2} octets`) }
  }

  if (!imgOnPhone) {
    return { ok: false, error: 'Impossible de transférer l\'image sur le téléphone' }
  }

  // Force media scanner so Instagram's gallery picker sees the new file.
  // touch -m ensures the file has the current timestamp → appears FIRST in "Recents".
  await shellExec(bearer, phoneId,
    `touch -m '${imgPath}' && am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${imgPath}`)
  await sleep(4000)

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
    // Sticker icon lives in the top-right toolbar
    await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.78)} ${Math.floor(sh * 0.06)}`)
  }
  await sleep(2500)

  xml = await dumpXml(bearer, phoneId)
  const linkSticker =
    findByText(xml, 'Link', 'Lien', 'LINK', 'LIEN', 'Link sticker', 'Sticker lien', 'Add a link', 'Ajouter un lien') ??
    findByTextPartial(xml, 'link') ??
    findByResourceId(xml, 'link_sticker', 'sticker_link')
  if (linkSticker) {
    await shellExec(bearer, phoneId, `input tap ${linkSticker[0]} ${linkSticker[1]}`)
  } else {
    // Search the sticker tray for "link" via its built-in search bar
    const searchPt =
      findByResourceId(xml, 'search_bar', 'sticker_search', 'search_box') ??
      findByTextPartial(xml, 'search', 'recherch')
    if (searchPt) {
      await shellExec(bearer, phoneId, `input tap ${searchPt[0]} ${searchPt[1]}`)
      await sleep(900)
      await shellExec(bearer, phoneId, `input text "link"`)
      await sleep(1800)
      const xml2 = await dumpXml(bearer, phoneId)
      const lk2 =
        findByText(xml2, 'Link', 'Lien', 'LINK', 'LIEN', 'Link sticker', 'Add a link', 'Ajouter un lien') ??
        findByTextPartial(xml2, 'link') ??
        findByResourceId(xml2, 'link_sticker', 'sticker_link')
      if (lk2) await shellExec(bearer, phoneId, `input tap ${lk2[0]} ${lk2[1]}`)
      else { log('   ❌ Sticker lien introuvable après recherche'); return { ok: false, error: 'Sticker lien introuvable' } }
    } else {
      log('   ❌ Barre de recherche de stickers introuvable'); return { ok: false, error: 'Sticker lien introuvable' }
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

  // Optional custom sticker text
  if (config.linkText?.trim()) {
    xml = await dumpXml(bearer, phoneId)
    const customPt =
      findByText(xml, 'Customize sticker text', 'Personnaliser le texte', 'Sticker text', 'Texte du sticker') ??
      findByResourceId(xml, 'customize_sticker_text', 'link_sticker_text', 'sticker_text_edit')
    if (customPt) {
      await shellExec(bearer, phoneId, `input tap ${customPt[0]} ${customPt[1]}`)
      await sleep(900)
      await shellExec(bearer, phoneId, `input text "${escapeForInputText(config.linkText.trim())}"`)
      await sleep(1000)
    }
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
  // After "Done", IG places the sticker in the upper-center area (~25-35% down).
  // A 1200ms swipe acts as long-press+drag which triggers the drag handle.
  await shellExec(bearer, phoneId,
    `input swipe ${cx} ${Math.floor(sh * 0.28)} ${Math.floor(sw * 0.78)} ${Math.floor(sh * 0.85)} 1200`)
  await sleep(800)
  // Second pass in case the first swipe missed — try from a slightly lower start
  await shellExec(bearer, phoneId,
    `input swipe ${cx} ${Math.floor(sh * 0.38)} ${Math.floor(sw * 0.78)} ${Math.floor(sh * 0.85)} 1200`)
  await sleep(1500)

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
