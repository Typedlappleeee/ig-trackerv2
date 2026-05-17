const BASE = 'https://openapi.geelark.com/open/v1'

// Raw phone shape returned by GéeLark API
export interface GeelarkPhone {
  id:          string
  serialNo?:   string | null
  serialName?: string | null  // display name in GéeLark UI
  name?:       string | null
  group?:      { name?: string } | null
  groupName?:  string | null
  status:      number  // 0=stopped/offline, 1=running/online
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

// GéeLark: 0=stopped, 1=running, 2=starting, 3=stopping
// Treat 1 and 2 as online (phone is up or booting)
export function geelarkStatusLabel(status: number): string {
  return (status === 1 || status === 2) ? 'online' : 'offline'
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
      const label = st === 0 ? 'arrêté' : st === 1 ? 'en marche' : st === 2 ? 'démarrage en cours' : st === 3 ? 'arrêt en cours' : `inconnu(${st})`
      log?.(`📱 Statut: ${label} [raw=${st}] — ${p.serialName ?? p.name ?? p.id}`)
      if (st === 3) {
        log?.('⏳ En cours d\'arrêt — attente 15s…')
        await sleepOrAbort(15000, signal)
      }
    }
  } catch { /* ignore — still attempt start */ }

  // Always send start command (same as MassPosting — GéeLark no-ops if already running)
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

  // Flat 30s wait then verify shell — same approach as MassPosting
  log?.('⏳ Boot en cours — attente 30s…')
  await sleepOrAbort(30000, signal)

  await warmupShellDelay(bearer, phoneId, log, signal)
  return true
}

// After the phone reaches status=1, wait for the shell daemon to accept commands.
// Retries the probe up to 12 times (60s total) before giving up.
async function warmupShellDelay(
  bearer: string,
  phoneId: string,
  log?: (m: string) => void,
  signal?: AbortSignal,
) {
  log?.('  ⏳ Attente initialisation du shell (max 60s)…')

  for (let attempt = 0; attempt < 12; attempt++) {
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
      log?.(`  ↻ Shell pas encore prêt (code=${code}${errMsg ? ` "${errMsg}"` : ''}) — nouvel essai dans 5s…`)
    } catch (e) {
      log?.(`  ↻ Shell probe erreur: ${e instanceof Error ? e.message : String(e)} — nouvel essai…`)
    }
  }

  log?.('  ⚠️ Shell toujours indisponible après 60s — poursuite quand même (les commandes réessaieront)')
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
function findByText(xml: string, ...texts: string[]): [number, number] | null {
  for (const text of texts) {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?:text|content-desc)="${escaped}"[^>]*bounds="(\\[[^\\]]+\\]\\[[^\\]]+\\])"`)
    const m = xml.match(re)
    if (m) return parseBoundsCenter(m[1])
  }
  return null
}

function findByResourceId(xml: string, ...ids: string[]): [number, number] | null {
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`resource-id="[^"]*${escaped}[^"]*"[^>]*bounds="(\\[[^\\]]+\\]\\[[^\\]]+\\])"`)
    const m = xml.match(re)
    if (m) return parseBoundsCenter(m[1])
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

// ── Profile update (name + bio + optional pic) ───────────────────────────────
export interface MassEditConfig {
  profileName?: string
  bio?:         string
  profilePicUrl?: string
}

export async function updateInstagramProfile(
  bearer: string,
  phoneId: string,
  config: MassEditConfig,
  log: (m: string) => void,
) {
  // ── Start phone first (same pattern as login/warmup) ──────────────────────
  const ready = await ensurePhoneRunning(bearer, phoneId, log)
  if (!ready) throw new Error('Téléphone non démarré')

  // ── Wake + unlock ──────────────────────────────────────────────────────────
  log('📱 Réveil de l\'écran…')
  await shellExec(bearer, phoneId, 'input keyevent 224')
  await sleep(800)
  await shellExec(bearer, phoneId, 'input swipe 540 1700 540 800 400')
  await sleep(1500)

  // ── Detect screen size ─────────────────────────────────────────────────────
  const { output: sizeOut } = await shellExec(bearer, phoneId, 'wm size')
  const sm = sizeOut.match(/(\d+)x(\d+)/)
  const sw = sm ? parseInt(sm[1]) : 1080
  const sh = sm ? parseInt(sm[2]) : 2340
  const cx = Math.floor(sw / 2)
  log(`📐 Écran: ${sw}x${sh}`)

  // ── Download profile picture ───────────────────────────────────────────────
  if (config.profilePicUrl?.trim()) {
    log('🖼 Téléchargement PDP…')
    const dl = await shellExec(bearer, phoneId,
      `curl -s -L --max-time 30 -o /sdcard/DCIM/Camera/sf_pfp.jpg "${config.profilePicUrl.trim()}" && echo DONE`)
    log(`   curl → ${dl.output.trim() || 'no output'}`)
    await shellExec(bearer, phoneId,
      'am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/Camera/sf_pfp.jpg')
    await sleep(2000)
  }

  // ── Open Instagram fresh ───────────────────────────────────────────────────
  log('📲 Lancement Instagram…')
  await shellExec(bearer, phoneId, 'am force-stop com.instagram.android')
  await sleep(1200)
  await shellExec(bearer, phoneId,
    'am start -n com.instagram.android/.activity.MainTabActivity')
  await sleep(8000)

  // ── Tap profile tab (rightmost icon in bottom nav) ─────────────────────────
  let xml = await dumpXml(bearer, phoneId)
  log(`📋 Home XML: ${xml.length} chars`)

  const profilePt =
    findByText(xml, 'Profile', 'Profil') ??
    findByResourceId(xml, 'profile_tab', 'tab_avatar', 'navigation_profile',
      'ig_bottom_bar_profile', 'tabIcon5', 'tab_icon_profile')
  if (profilePt) {
    log(`👤 Profile tab à ${profilePt}`)
    await shellExec(bearer, phoneId, `input tap ${profilePt[0]} ${profilePt[1]}`)
  } else {
    // rightmost bottom-nav icon: ~92% of width, ~97% of height
    const tx = Math.floor(sw * 0.92)
    const ty = Math.floor(sh * 0.965)
    log(`👤 Profile tab non trouvé → coordonnée (${tx},${ty})`)
    await shellExec(bearer, phoneId, `input tap ${tx} ${ty}`)
  }
  await sleep(4000)

  // ── Tap Edit Profile button ────────────────────────────────────────────────
  xml = await dumpXml(bearer, phoneId)
  log(`📋 Profile XML: ${xml.length} chars — aperçu: ${xml.substring(0, 200)}`)

  const editPt =
    findByText(xml, 'Edit profile', 'Modifier le profil', 'Edit Profile') ??
    findByResourceId(xml, 'edit_profile_button', 'button_edit_profile',
      'profile_header_edit_btn', 'edit_profile')
  if (editPt) {
    log(`✏️ Edit Profile à ${editPt}`)
    await shellExec(bearer, phoneId, `input tap ${editPt[0]} ${editPt[1]}`)
  } else {
    // Edit profile is usually a button just below follower counts, ~22% from top
    const ex = cx
    const ey = Math.floor(sh * 0.22)
    log(`✏️ Edit Profile non trouvé → coordonnée (${ex},${ey})`)
    await shellExec(bearer, phoneId, `input tap ${ex} ${ey}`)
  }
  await sleep(5000)

  xml = await dumpXml(bearer, phoneId)
  log(`📋 Edit screen XML: ${xml.length} chars — aperçu: ${xml.substring(0, 300)}`)

  // ── Profile picture ────────────────────────────────────────────────────────
  if (config.profilePicUrl?.trim()) {
    log('🖼 Tap Change photo…')
    const cppPt =
      findByText(xml, 'Change profile photo', 'Changer la photo de profil',
        'Edit picture', 'Change photo', 'Modifier la photo') ??
      findByResourceId(xml, 'change_avatar', 'change_photo_btn',
        'profile_photo_change_btn', 'change_profile_photo')
    if (cppPt) {
      log(`   trouvé à ${cppPt}`)
      await shellExec(bearer, phoneId, `input tap ${cppPt[0]} ${cppPt[1]}`)
    } else {
      // Profile picture sits near top-center; "Change photo" text is just below it
      const ppx = cx
      const ppy = Math.floor(sh * 0.13)
      log(`   non trouvé → tap (${ppx},${ppy})`)
      await shellExec(bearer, phoneId, `input tap ${ppx} ${ppy}`)
    }
    await sleep(2500)

    // Bottom sheet — pick Gallery
    const xml2 = await dumpXml(bearer, phoneId)
    log(`📋 Bottom sheet: ${xml2.length} chars`)
    const galPt =
      findByText(xml2, 'Choose from library', 'Choisir dans la bibliothèque',
        'Gallery', 'Galerie', 'Photo library', 'Choose from Gallery') ??
      findByResourceId(xml2, 'gallery_option', 'choose_library', 'library_option')
    if (galPt) {
      log(`   Galerie à ${galPt}`)
      await shellExec(bearer, phoneId, `input tap ${galPt[0]} ${galPt[1]}`)
    } else {
      // Bottom sheet items start around 50-60% of screen height
      const gx = cx
      const gy = Math.floor(sh * 0.55)
      log(`   Galerie non trouvée → tap (${gx},${gy})`)
      await shellExec(bearer, phoneId, `input tap ${gx} ${gy}`)
    }
    await sleep(4000)

    // Select first (most recent) photo — top-left of grid
    log('📷 Sélection première photo…')
    const pix = Math.floor(sw * 0.17)
    const piy = Math.floor(sh * 0.28)
    await shellExec(bearer, phoneId, `input tap ${pix} ${piy}`)
    await sleep(2500)

    // Confirm / Next
    const xml3 = await dumpXml(bearer, phoneId)
    const nextPt =
      findByText(xml3, 'Next', 'Suivant', 'Done', 'Terminé', 'OK') ??
      findByResourceId(xml3, 'action_next', 'next_button', 'done_button')
    if (nextPt) {
      log(`   Next à ${nextPt}`)
      await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`)
    } else {
      const nx = Math.floor(sw * 0.9)
      const ny = Math.floor(sh * 0.06)
      log(`   Next non trouvé → tap (${nx},${ny})`)
      await shellExec(bearer, phoneId, `input tap ${nx} ${ny}`)
    }
    await sleep(4000)

    // Re-dump after picture change
    xml = await dumpXml(bearer, phoneId)
    log(`📋 Après PDP: ${xml.length} chars`)
  }

  // ── Set name (Surnom) ─────────────────────────────────────────────────────
  if (config.profileName?.trim()) {
    log(`📝 Surnom → "${config.profileName}"`)
    xml = await dumpXml(bearer, phoneId)
    log(`📋 XML edit (name): ${xml.length} chars`)
    const namePt =
      findByResourceId(xml, 'full_name', 'name', 'profile_name', 'display_name') ??
      findByText(xml, 'Surnom', 'Name', 'Nom', 'Full name', 'Nom complet', 'Nickname', 'Display name')
    if (namePt) {
      log(`   champ Surnom à [${namePt[0]},${namePt[1]}]`)
      await clearAndType(bearer, phoneId, namePt, config.profileName.trim(), log)
    } else {
      const ny = Math.floor(sh * 0.28)
      log(`   Surnom non trouvé → tap coordonnée (${cx},${ny})`)
      await clearAndType(bearer, phoneId, [cx, ny], config.profileName.trim(), log)
    }
    await sleep(500)
  }

  // ── Set bio (Biographie) ───────────────────────────────────────────────────
  if (config.bio?.trim()) {
    log(`📝 Biographie → "${config.bio.substring(0, 30)}…"`)
    xml = await dumpXml(bearer, phoneId)
    log(`📋 XML edit (bio): ${xml.length} chars`)
    const bioPt =
      findByResourceId(xml, 'biography', 'bio', 'profile_bio', 'about') ??
      findByText(xml, 'Biographie', 'Bio', 'Biography', 'À propos', 'About')
    if (bioPt) {
      log(`   champ Bio à [${bioPt[0]},${bioPt[1]}]`)
      await clearAndType(bearer, phoneId, bioPt, config.bio.trim(), log)
    } else {
      const by = Math.floor(sh * 0.42)
      log(`   Bio non trouvée → tap coordonnée (${cx},${by})`)
      await clearAndType(bearer, phoneId, [cx, by], config.bio.trim(), log)
    }
    await sleep(500)
  }

  // ── Dismiss keyboard then Save ─────────────────────────────────────────────
  await shellExec(bearer, phoneId, 'input keyevent 4')
  await sleep(800)

  log('💾 Sauvegarde…')
  xml = await dumpXml(bearer, phoneId)
  const savePt =
    findByText(xml, 'Done', 'Terminé', 'Save', 'Sauvegarder') ??
    findByResourceId(xml, 'action_done', 'save_button', 'done_button', 'submit_button')
  if (savePt) {
    log(`   Save à ${savePt}`)
    await shellExec(bearer, phoneId, `input tap ${savePt[0]} ${savePt[1]}`)
  } else {
    // Toolbar Done is top-right: ~93% width, ~6% height
    const sx = Math.floor(sw * 0.93)
    const sy = Math.floor(sh * 0.06)
    log(`   Save non trouvé → tap top-right (${sx},${sy})`)
    await shellExec(bearer, phoneId, `input tap ${sx} ${sy}`)
  }
  await sleep(3000)
  log('✅ Profil sauvegardé !')
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

  // Go to home feed
  log('📱 Ouverture du fil d\'actualité…')
  await shellExec(bearer, phoneId, 'am start -n com.instagram.android/.activity.MainTabActivity')
  await sleep(4000)

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
      const likeBtn = findByResourceId(xml, 'row_feed_button_like') ??
                      findByText(xml, 'Like', "J'aime")
      if (likeBtn) {
        await shellExec(bearer, phoneId, `input tap ${likeBtn[0]} ${likeBtn[1]}`)
        likeCount++
        log(`❤️ Like (${likeCount})`)
        await sleep(800 + Math.floor(Math.random() * 500))
      }
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
function escapeForInputText(text: string): string {
  return text
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
    const xmlLower = xml.toLowerCase()

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
      if (homeIndicators.some(p => xmlLower3.includes(p))) {
        log('✅ Connexion réussie avec 2FA !')
        return { ok: true }
      }
      return { ok: false, error: 'État inconnu après validation 2FA — vérifier manuellement' }
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
