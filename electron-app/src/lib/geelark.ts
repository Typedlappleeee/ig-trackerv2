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

// ── Direct phone shell (Android adb-style commands) ─────────────────────────
// Lets us run `am start`, `input tap`, `input text`, `uiautomator dump` etc.
// Retries up to 6 times when GéeLark reports the phone shell isn't ready yet.
async function shellExec(bearer: string, phoneId: string, cmd: string): Promise<{ output: string; status: number }> {
  const NOT_READY = /not running|not started|unavailable|not ready|phone.*start/i
  for (let attempt = 0; attempt < 6; attempt++) {
    const d = await geelarkFetch('POST', '/shell/execute', { id: phoneId, cmd }, bearer)
    if (d['code'] === 0) {
      const data = (d['data'] as Record<string, unknown>) ?? {}
      return { output: String(data['output'] ?? ''), status: Number(data['status'] ?? -1) }
    }
    const msg = String(d['msg'] ?? d['message'] ?? d['code'] ?? '')
    if (NOT_READY.test(msg) && attempt < 5) {
      await sleep(5000 + attempt * 2000)
      continue
    }
    throw new Error(`GéeLark shell: ${msg}`)
  }
  throw new Error('GéeLark shell: téléphone non prêt après plusieurs tentatives')
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Ensure the cloud phone is running. Starts it if needed and polls until ready.
async function ensurePhoneRunning(bearer: string, phoneId: string, log?: (m: string) => void): Promise<boolean> {
  // Status: 0=stopped, 1=running, 2=starting, 3=stopping
  const phones = await fetchAllPhones(bearer)
  const p = phones.find(x => x.id === phoneId)
  if (!p) throw new Error(`phone ${phoneId} not found`)
  if (p.status === 1) {
    // Phone is already running but shell daemon may need a moment to accept connections
    log?.('📱 Téléphone déjà démarré, stabilisation (5s)…')
    await sleep(5000)
    return true
  }

  log?.('📱 Démarrage du téléphone…')
  await geelarkFetch('POST', '/phone/start', { ids: [phoneId] }, bearer)

  // Poll for up to 120s until phone reports running
  for (let i = 0; i < 60; i++) {
    await sleep(2000)
    const list = await fetchAllPhones(bearer)
    const cur  = list.find(x => x.id === phoneId)
    if (cur?.status === 1) {
      log?.('✅ Téléphone démarré, attente boot Android (15s)…')
      await sleep(15000)
      return true
    }
  }
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
  // ── 1. Wake & unlock screen ────────────────────────────────────────────────
  log('📱 Réveil de l\'écran…')
  await shellExec(bearer, phoneId, 'input keyevent 224')          // KEYCODE_WAKEUP
  await sleep(800)
  await shellExec(bearer, phoneId, 'input swipe 540 1700 540 800 400') // swipe to unlock
  await sleep(1500)

  // ── 2. Download profile picture first (before opening IG) ─────────────────
  if (config.profilePicUrl?.trim()) {
    log('🖼 Téléchargement de la photo de profil…')
    const dlResult = await shellExec(bearer, phoneId,
      `curl -s -L --max-time 30 -o /sdcard/DCIM/Camera/sf_pfp.jpg "${config.profilePicUrl.trim()}" && echo OK`)
    log(`   curl: ${dlResult.output.trim() || 'aucune sortie'}`)
    await shellExec(bearer, phoneId,
      'am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/Camera/sf_pfp.jpg')
    await sleep(2000)
  }

  // ── 3. Open Edit Profile via deep link (most direct route) ─────────────────
  log('🔗 Ouverture Edit Profile…')
  await shellExec(bearer, phoneId,
    'am start -a android.intent.action.VIEW -d "https://www.instagram.com/accounts/edit/" -p com.instagram.android')
  await sleep(7000)

  let xml = await dumpXml(bearer, phoneId)
  log(`📋 XML reçu : ${xml.length} chars`)

  const onEditScreen =
    /biography|full_name|edit.*profile|modifier.*profil/i.test(xml)

  if (!onEditScreen) {
    // ── 4. Fallback: navigate manually ──────────────────────────────────────
    log('↩️ Deep link raté — navigation manuelle…')
    await shellExec(bearer, phoneId, 'am force-stop com.instagram.android')
    await sleep(1000)
    await shellExec(bearer, phoneId,
      'am start -n com.instagram.android/.activity.MainTabActivity')
    await sleep(7000)

    xml = await dumpXml(bearer, phoneId)
    log(`📋 XML home : ${xml.length} chars, aperçu: ${xml.substring(0, 300)}`)

    // Tap profile tab — try by text, by resource-id, then coordinate fallback
    const profilePt =
      findByText(xml, 'Profile', 'Profil') ??
      findByResourceId(xml, 'profile_tab', 'tab_avatar', 'ig_bottom_bar_profile', 'navigation_profile')
    if (profilePt) {
      log(`👤 Profile tab trouvé à ${profilePt}`)
      await shellExec(bearer, phoneId, `input tap ${profilePt[0]} ${profilePt[1]}`)
    } else {
      log('👤 Profile tab non trouvé — tap coordonnée (1010, 1870)')
      await shellExec(bearer, phoneId, 'input tap 1010 1870')
    }
    await sleep(4000)

    xml = await dumpXml(bearer, phoneId)
    log(`📋 XML profil : aperçu: ${xml.substring(0, 300)}`)

    const editPt =
      findByText(xml, 'Edit profile', 'Modifier le profil', 'Edit Profile') ??
      findByResourceId(xml, 'edit_profile_button', 'button_edit_profile', 'edit_profile', 'profile_header_edit_btn')
    if (!editPt) {
      log('❌ Bouton Edit Profile introuvable. Contenu XML:\n' + xml.substring(0, 800))
      return
    }
    log(`✏️ Edit Profile trouvé à ${editPt}`)
    await shellExec(bearer, phoneId, `input tap ${editPt[0]} ${editPt[1]}`)
    await sleep(5000)
    xml = await dumpXml(bearer, phoneId)
    log(`📋 XML edit screen : ${xml.length} chars`)
  }

  // ── 5. Profile picture ────────────────────────────────────────────────────
  if (config.profilePicUrl?.trim()) {
    const changePhotoPt =
      findByText(xml, 'Change profile photo', 'Changer la photo de profil', 'Edit picture', 'Change photo', 'Modifier la photo') ??
      findByResourceId(xml, 'change_avatar', 'profile_photo_change_btn', 'change_photo_btn')
    if (changePhotoPt) {
      log('🖼 Tap Change photo…')
      await shellExec(bearer, phoneId, `input tap ${changePhotoPt[0]} ${changePhotoPt[1]}`)
      await sleep(2500)
      const xml2 = await dumpXml(bearer, phoneId)
      const galleryPt =
        findByText(xml2, 'Choose from library', 'Choisir dans la bibliothèque', 'Gallery', 'Galerie', 'Photo library', 'Choose from Gallery', 'New profile photo') ??
        findByResourceId(xml2, 'choose_from_library', 'gallery_option')
      if (galleryPt) {
        await shellExec(bearer, phoneId, `input tap ${galleryPt[0]} ${galleryPt[1]}`)
        await sleep(3500)
        const xml3 = await dumpXml(bearer, phoneId)
        // Most recent photo is top-left of the gallery grid
        const firstPhoto =
          findByResourceId(xml3, 'gallery_item', 'photo_grid_item', 'image_grid_item') ??
          findByResourceId(xml3, 'thumbnail_image')
        if (firstPhoto) {
          await shellExec(bearer, phoneId, `input tap ${firstPhoto[0]} ${firstPhoto[1]}`)
        } else {
          log('📷 Tap première photo galerie (coordonnée 180,650)')
          await shellExec(bearer, phoneId, 'input tap 180 650')
        }
        await sleep(2500)
        // Confirm crop / Next
        const xml4 = await dumpXml(bearer, phoneId)
        const nextPt = findByText(xml4, 'Next', 'Suivant', 'Done', 'Terminé', 'OK', 'Confirm') ??
                       findByResourceId(xml4, 'next_button', 'done_button', 'action_next')
        if (nextPt) {
          await shellExec(bearer, phoneId, `input tap ${nextPt[0]} ${nextPt[1]}`)
          await sleep(3000)
        }
      } else {
        log('⚠️ Option galerie non trouvée')
      }
      xml = await dumpXml(bearer, phoneId)
    } else {
      log('⚠️ Bouton Change photo non trouvé')
    }
  }

  // ── 6. Set name ───────────────────────────────────────────────────────────
  if (config.profileName?.trim()) {
    log(`📝 Nom → "${config.profileName}"`)
    const namePt =
      findByResourceId(xml, 'full_name', 'name_field', 'name') ??
      findByText(xml, 'Name', 'Nom', 'Full name', 'Nom complet')
    if (namePt) {
      await clearAndType(bearer, phoneId, namePt, config.profileName.trim(), log)
    } else {
      log('⚠️ Champ Nom non trouvé — XML contenu: ' + xml.substring(0, 500))
    }
  }

  // ── 7. Set bio ────────────────────────────────────────────────────────────
  if (config.bio?.trim()) {
    log('📝 Bio…')
    xml = await dumpXml(bearer, phoneId)
    const bioPt =
      findByResourceId(xml, 'biography', 'bio', 'bio_field', 'biography_field') ??
      findByText(xml, 'Bio', 'Biography', 'Biographie')
    if (bioPt) {
      await clearAndType(bearer, phoneId, bioPt, config.bio.trim(), log)
    } else {
      log('⚠️ Champ Bio non trouvé')
    }
  }

  // ── 8. Dismiss keyboard then save ─────────────────────────────────────────
  await shellExec(bearer, phoneId, 'input keyevent 4')  // BACK dismisses keyboard
  await sleep(600)

  log('💾 Sauvegarde…')
  xml = await dumpXml(bearer, phoneId)
  const savePt =
    findByText(xml, 'Done', 'Terminé', 'Save', 'Sauvegarder', 'Submit', 'Confirm') ??
    findByResourceId(xml, 'action_done', 'save_button', 'done_button', 'submit_button')
  if (savePt) {
    await shellExec(bearer, phoneId, `input tap ${savePt[0]} ${savePt[1]}`)
  } else {
    // Action bar "Done" is usually top-right ~(1030, 115) on 1080px screen
    log('⚠️ Bouton Save non trouvé — tap top-right (1030, 115)')
    await shellExec(bearer, phoneId, 'input tap 1030 115')
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
