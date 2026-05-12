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
async function shellExec(bearer: string, phoneId: string, cmd: string): Promise<{ output: string; status: number }> {
  const d = await geelarkFetch('POST', '/shell/execute', { id: phoneId, cmd }, bearer)
  if (d['code'] !== 0) throw new Error(`GéeLark shell: ${d['msg'] ?? d['code']}`)
  const data = (d['data'] as Record<string, unknown>) ?? {}
  return { output: String(data['output'] ?? ''), status: Number(data['status'] ?? -1) }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Ensure the cloud phone is running. Starts it if needed and polls until ready.
async function ensurePhoneRunning(bearer: string, phoneId: string, log?: (m: string) => void): Promise<boolean> {
  // Status: 0=stopped, 1=running, 2=starting, 3=stopping
  const phones = await fetchAllPhones(bearer)
  const p = phones.find(x => x.id === phoneId)
  if (!p) throw new Error(`phone ${phoneId} not found`)
  if (p.status === 1) return true

  log?.('📱 Démarrage du téléphone…')
  await geelarkFetch('POST', '/phone/start', { ids: [phoneId] }, bearer)

  // Poll for up to 90s until phone reports running
  for (let i = 0; i < 45; i++) {
    await sleep(2000)
    const list = await fetchAllPhones(bearer)
    const cur  = list.find(x => x.id === phoneId)
    if (cur?.status === 1) {
      log?.('✅ Téléphone démarré, attente boot Android (8s)…')
      await sleep(8000)
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

async function tapText(bearer: string, phoneId: string, xml: string, ...texts: string[]): Promise<boolean> {
  const pt = findByText(xml, ...texts)
  if (!pt) return false
  await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`)
  return true
}

// ── Profile update (name + bio + optional pic) ───────────────────────────────
async function updateInstagramProfile(
  bearer: string,
  phoneId: string,
  config: Pick<WarmupConfig, 'profileName' | 'bio' | 'profilePicUrl'>,
  log: (m: string) => void,
) {
  log('📲 Ouverture d\'Instagram…')
  await shellExec(bearer, phoneId, 'am start -n com.instagram.android/.activity.MainTabActivity')
  await sleep(5000)

  // Navigate to profile tab
  log('👤 Navigation vers le profil…')
  let xml = await dumpXml(bearer, phoneId)
  let profileTab = findByText(xml, 'Profile', 'Profil') ?? findByResourceId(xml, 'tab_avatar', 'profile_tab')
  if (!profileTab) {
    // Fallback: tap bottom-right of screen (profile tab position)
    await shellExec(bearer, phoneId, 'input tap 1000 1900')
  } else {
    await shellExec(bearer, phoneId, `input tap ${profileTab[0]} ${profileTab[1]}`)
  }
  await sleep(3000)

  // Tap Edit Profile
  log('✏️ Ouverture de l\'édition du profil…')
  xml = await dumpXml(bearer, phoneId)
  const editBtn = findByText(xml, 'Edit profile', 'Modifier le profil', 'Edit Profile', 'Modifier') ??
                  findByResourceId(xml, 'edit_profile_button', 'button_edit_profile')
  if (!editBtn) { log('⚠️ Bouton Edit Profile non trouvé'); return }
  await shellExec(bearer, phoneId, `input tap ${editBtn[0]} ${editBtn[1]}`)
  await sleep(3000)

  xml = await dumpXml(bearer, phoneId)

  // Profile picture
  if (config.profilePicUrl?.trim()) {
    log('🖼 Téléchargement de la photo de profil…')
    await shellExec(bearer, phoneId,
      `curl -s -L -o /sdcard/sf_pfp.jpg "${config.profilePicUrl.trim()}"`)
    await sleep(2000)
    const changePhoto = findByText(xml, 'Change profile photo', 'Changer la photo de profil', 'Edit picture', 'Modifier la photo') ??
                        findByResourceId(xml, 'change_avatar', 'profile_photo_change_btn')
    if (changePhoto) {
      await shellExec(bearer, phoneId, `input tap ${changePhoto[0]} ${changePhoto[1]}`)
      await sleep(2000)
      const xml2 = await dumpXml(bearer, phoneId)
      const gallery = findByText(xml2, 'Choose from library', 'Choisir dans la bibliothèque', 'Gallery', 'Galerie', 'New profile photo')
      if (gallery) {
        await shellExec(bearer, phoneId, `input tap ${gallery[0]} ${gallery[1]}`)
        await sleep(3000)
        // Use content provider intent to pick the downloaded image
        await shellExec(bearer, phoneId,
          'am start -a android.intent.action.VIEW -d "file:///sdcard/sf_pfp.jpg" -t image/jpeg')
        await sleep(2000)
      }
    }
    xml = await dumpXml(bearer, phoneId)
  }

  // Set name
  if (config.profileName?.trim()) {
    log(`📝 Mise à jour du nom : "${config.profileName}"`)
    const nameField = findByResourceId(xml, 'full_name', 'name_field') ??
                      findByText(xml, 'Name', 'Nom')
    if (nameField) {
      await shellExec(bearer, phoneId, `input tap ${nameField[0]} ${nameField[1]}`)
      await sleep(500)
      await shellExec(bearer, phoneId, 'input keyevent 123') // KEYCODE_MOVE_END
      await shellExec(bearer, phoneId, 'input keyevent --longpress 67') // long DEL
      await sleep(200)
      await shellExec(bearer, phoneId, 'input keyevent 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28') // DEL x50
      const nameEscaped = config.profileName.trim().replace(/ /g, '%s')
      await shellExec(bearer, phoneId, `input text "${nameEscaped}"`)
      await sleep(400)
    }
  }

  // Set bio
  if (config.bio?.trim()) {
    log(`📝 Mise à jour de la bio…`)
    xml = await dumpXml(bearer, phoneId)
    const bioField = findByResourceId(xml, 'biography', 'bio_field', 'biography_field') ??
                     findByText(xml, 'Bio', 'Biography')
    if (bioField) {
      await shellExec(bearer, phoneId, `input tap ${bioField[0]} ${bioField[1]}`)
      await sleep(500)
      await shellExec(bearer, phoneId, 'input keyevent 123')
      await shellExec(bearer, phoneId, 'input keyevent 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28 28')
      const bioEscaped = config.bio.trim().replace(/\n/g, ' ').replace(/ /g, '%s')
      await shellExec(bearer, phoneId, `input text "${bioEscaped}"`)
      await sleep(400)
    }
  }

  // Save
  log('💾 Sauvegarde du profil…')
  xml = await dumpXml(bearer, phoneId)
  const saveBtn = findByText(xml, 'Done', 'Terminé', 'Save', 'Sauvegarder', 'Submit') ??
                  findByResourceId(xml, 'action_done', 'save_button', 'done_button')
  if (saveBtn) {
    await shellExec(bearer, phoneId, `input tap ${saveBtn[0]} ${saveBtn[1]}`)
    await sleep(3000)
    log('✅ Profil mis à jour')
  }
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
