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

// Reply to an Instagram comment by driving the cloud phone via shell commands.
// 1. Opens the post via deep link
// 2. Dumps UI to find the comment box
// 3. Types reply text (with @mention so the original commenter is notified)
// 4. Taps Send
//
// This is robust to phone resolution because we read uiautomator XML to get
// real element bounds — no hard-coded coordinates.
export async function replyToIgCommentViaPhone(
  bearer: string,
  phoneId: string,
  shortcode: string,
  username: string,
  replyText: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://www.instagram.com/p/${shortcode}/`
    // 1. Open the IG post via deep link
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
