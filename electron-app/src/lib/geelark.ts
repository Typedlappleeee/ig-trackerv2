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

// Call GéeLark through the Electron main-process proxy to bypass CORS.
async function geelarkFetch(method: 'GET' | 'POST', path: string, body?: unknown, bearer?: string) {
  if (!window.electronAPI?.geelarkRequest) {
    throw new Error('electronAPI not available')
  }
  const result = await window.electronAPI.geelarkRequest({
    method,
    url: `${BASE}${path}`,
    headers: bearer ? authHeaders(bearer) : undefined,
    body,
  })
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
  const NOT_READY  = /not running|not started|unavailable|not ready|phone.*start/i

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (signal?.aborted) throw new Error('Annulé')
    const d = await geelarkFetch('POST', '/shell/execute', { id: phoneId, cmd }, bearer)
    if (d['code'] === 0) {
      const data = (d['data'] as Record<string, unknown>) ?? {}
      return { output: String(data['output'] ?? ''), status: Number(data['status'] ?? -1) }
    }
    const msg = String(d['msg'] ?? d['message'] ?? d['code'] ?? '')
    if (NOT_READY.test(msg) && attempt < maxRetries - 1) {
      await sleepOrAbort(4000 + attempt * 2000, signal)
      continue
    }
    throw new Error(`GéeLark shell: ${msg}`)
  }
  throw new Error('GéeLark shell: téléphone non prêt après plusieurs tentatives')
}

// Ensure the cloud phone is running. Starts it if needed and polls until ready.
// After reaching running state, probes the shell with `echo OK` to confirm it's accepting commands.
async function ensurePhoneRunning(
  bearer: string,
  phoneId: string,
  log?: (m: string) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  // Coerce status to number — GéeLark JSON sometimes returns strings
  const numStatus = (v: unknown) => Number(v ?? -1)
  const STATUS_LABELS: Record<number, string> = { 0: 'arrêté', 1: 'en cours', 2: 'démarrage', 3: 'arrêt en cours' }

  log?.('🔎 Vérification du statut du téléphone…')
  const phones = await fetchAllPhones(bearer)
  const p = phones.find(x => x.id === phoneId)
  if (!p) {
    log?.(`❌ Téléphone ${phoneId} introuvable dans GéeLark (${phones.length} téléphones récupérés)`)
    throw new Error(`phone ${phoneId} not found`)
  }

  const st = numStatus(p.status)
  log?.(`📱 Statut: ${STATUS_LABELS[st] ?? `inconnu (${st})`}`)

  // Already running → probe shell directly
  if (st === 1) {
    log?.('📱 Téléphone déjà démarré — sonde du shell…')
    return probeShellReady(bearer, phoneId, log, signal)
  }

  // Status 3 = stopping — wait a bit before trying to start
  if (st === 3) {
    log?.('⏳ Téléphone en cours d\'arrêt — attente 10s…')
    await sleepOrAbort(10000, signal)
  }

  // Status 2 = already starting — skip the /phone/start call and just poll
  if (st !== 2) {
    log?.('📱 Envoi de la commande de démarrage…')
    const startRes = await geelarkFetch('POST', '/phone/start', { ids: [phoneId] }, bearer)
    const code       = Number(startRes['code'] ?? -1)
    const success    = Number((startRes['data'] as Record<string, unknown>)?.['successAmount'] ?? 0)
    const failed     = Number((startRes['data'] as Record<string, unknown>)?.['failAmount'] ?? 0)
    log?.(`  → code=${code}, démarrés=${success}, échecs=${failed}`)
    if (code !== 0) {
      log?.(`  ❌ Erreur API: ${startRes['msg'] ?? startRes['message'] ?? code}`)
    }
  } else {
    log?.('📱 Démarrage déjà en cours (statut 2) — attente…')
  }

  // Poll up to 120s for status === 1
  let reached = false
  for (let i = 0; i < 60; i++) {
    if (signal?.aborted) throw new Error('Annulé')
    await sleepOrAbort(2000, signal)
    const list = await fetchAllPhones(bearer)
    const cur  = list.find(x => x.id === phoneId)
    const curSt = numStatus(cur?.status)
    const curLabel = STATUS_LABELS[curSt] ?? `inconnu (${curSt})`
    if (i % 5 === 0) log?.(`⏳ ${i * 2}s — statut: ${curLabel}`)
    if (curSt === 1) { reached = true; break }
  }

  if (!reached) {
    log?.('❌ Timeout 120s : téléphone non démarré')
    return false
  }

  log?.('✅ Téléphone démarré — sonde du shell…')
  return probeShellReady(bearer, phoneId, log, signal)
}

// Probes the shell with `echo OK` every 5s until it responds (max 10 attempts = 50s).
// This replaces fixed sleep() so we know the shell daemon is truly ready.
async function probeShellReady(
  bearer: string,
  phoneId: string,
  log?: (m: string) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    if (signal?.aborted) throw new Error('Annulé')
    try {
      const r = await geelarkFetch('POST', '/shell/execute', { id: phoneId, cmd: 'echo SHELL_OK' }, bearer)
      if (Number(r['code']) === 0) {
        const out = String((r['data'] as Record<string, unknown>)?.['output'] ?? '')
        if (out.includes('SHELL_OK')) {
          log?.(`✅ Shell prêt (tentative ${i + 1})`)
          return true
        }
      }
    } catch { /* shell not ready yet */ }
    log?.(`  ⏳ Shell pas encore prêt — attente 5s… (${i + 1}/10)`)
    await sleepOrAbort(5000, signal)
  }
  log?.('❌ Shell inaccessible après 50s')
  return false
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
  await shellExec(bearer, phoneId, `input tap ${point[0]} ${point[1]}`)
  await sleep(600)
  // Triple-tap selects all text in most Android text fields
  await shellExec(bearer, phoneId, `input tap ${point[0]} ${point[1]}`)
  await sleep(120)
  await shellExec(bearer, phoneId, `input tap ${point[0]} ${point[1]}`)
  await sleep(300)
  // Delete the selection (or clear char by char if no selection)
  await shellExec(bearer, phoneId, 'input keyevent 67')  // DEL
  await sleep(100)
  // Belt-and-suspenders: MOVE_END then 150 individual DEL keycodes
  await shellExec(bearer, phoneId, 'input keyevent 123') // KEYCODE_MOVE_END
  for (let i = 0; i < 15; i++) {
    await shellExec(bearer, phoneId, 'input keyevent 67 67 67 67 67 67 67 67 67 67')
    await sleep(50)
  }
  await sleep(200)
  // Escape for Android shell: spaces → %s, dangerous shell chars escaped
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
async function updateInstagramProfile(
  bearer: string,
  phoneId: string,
  config: Pick<WarmupConfig, 'profileName' | 'bio' | 'profilePicUrl'>,
  log: (m: string) => void,
) {
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

  // ── Set name ───────────────────────────────────────────────────────────────
  if (config.profileName?.trim()) {
    log(`📝 Nom → "${config.profileName}"`)
    const namePt =
      findByResourceId(xml, 'full_name') ??
      findByText(xml, 'Name', 'Nom', 'Full name', 'Nom complet')
    if (namePt) {
      log(`   champ à ${namePt}`)
      await clearAndType(bearer, phoneId, namePt, config.profileName.trim(), log)
    } else {
      // Name field is typically ~22-25% from top in Edit Profile scroll view
      const ny = Math.floor(sh * 0.23)
      log(`   non trouvé → tap (${cx},${ny})`)
      await clearAndType(bearer, phoneId, [cx, ny], config.profileName.trim(), log)
    }
  }

  // ── Set bio ────────────────────────────────────────────────────────────────
  if (config.bio?.trim()) {
    log('📝 Bio…')
    xml = await dumpXml(bearer, phoneId)
    const bioPt =
      findByResourceId(xml, 'biography') ??
      findByText(xml, 'Bio', 'Biography', 'Biographie')
    if (bioPt) {
      log(`   champ à ${bioPt}`)
      await clearAndType(bearer, phoneId, bioPt, config.bio.trim(), log)
    } else {
      const by = Math.floor(sh * 0.40)
      log(`   non trouvé → tap (${cx},${by})`)
      await clearAndType(bearer, phoneId, [cx, by], config.bio.trim(), log)
    }
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
    if (!ready) return { ok: false, error: 'Le téléphone n\'a pas pu démarrer dans le délai imparti' }

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
