// Server-side (Deno / Supabase Edge Function) port of the Instagram Story
// automation that lives in the browser at electron-app/src/lib/geelark.ts.
//
// Differences from the browser version:
//   - GeeLark API calls go directly via fetch (no /api/geelark proxy, no window/Electron).
//   - Image download is a direct fetch (no /api/proxy, no CORS in Deno).
//   - Image resize/compression uses ImageScript (no Canvas / OffscreenCanvas).
//   - All AbortSignal / sleepOrAbort logic dropped (not needed server-side).
//
// This module is self-contained: it does not import from the browser geelark.ts.

import { decode } from 'https://deno.land/x/imagescript@1.2.17/mod.ts'
import { encodeBase64 as base64Encode } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

// ── GeeLark API helper ───────────────────────────────────────────────────────
const GEELARK = 'https://openapi.geelark.com/open/v1'

async function gFetch(bearer: string, path: string, body: unknown): Promise<Record<string, any>> {
  const r = await fetch(`${GEELARK}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return await r.json().catch(() => ({}))
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── Phone listing ────────────────────────────────────────────────────────────
async function fetchAllPhones(
  bearer: string,
): Promise<Array<{ id: string; status: number; serialName?: string; name?: string }>> {
  const items: any[] = []
  let page = 1
  while (true) {
    const d = await gFetch(bearer, '/phone/list', { page, pageSize: 50 })
    if (d['code'] !== 0) break
    const batch = (d['data']?.items ?? []) as any[]
    const total = (d['data']?.total ?? 0) as number
    items.push(...batch)
    if (items.length >= total || batch.length === 0) break
    page++
  }
  return items
}

// ── Direct phone shell (Android adb-style commands) ─────────────────────────
// Retries up to maxRetries times when GéeLark reports the phone shell isn't ready.
async function shellExec(
  bearer: string,
  phoneId: string,
  cmd: string,
  opts?: { maxRetries?: number },
): Promise<{ output: string; status: number }> {
  const maxRetries = opts?.maxRetries ?? 6
  // Broad "not ready yet" pattern — include numeric error codes GéeLark uses (10xxx range)
  const NOT_READY = /not running|not started|unavailable|not ready|phone.*start|en cours de démarrage|starting/i

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const d = await gFetch(bearer, '/shell/execute', { id: phoneId, cmd })
    if (d['code'] === 0) {
      const data = (d['data'] as Record<string, unknown>) ?? {}
      return { output: String(data['output'] ?? ''), status: Number(data['status'] ?? -1) }
    }
    const code = Number(d['code'] ?? -1)
    const msg = String(d['msg'] ?? d['message'] ?? code)
    // Treat GéeLark error codes 10001-10099 (phone not ready range) as retryable
    // 42002 = "phone is not running" — shell daemon not yet up (phone still booting)
    const isNotReady = NOT_READY.test(msg) || (code >= 10001 && code <= 10099) || code === 42002
    if (isNotReady && attempt < maxRetries - 1) {
      await sleep(4000 + attempt * 2000)
      continue
    }
    throw new Error(`GéeLark shell: ${msg} (code ${code}, cmd="${cmd.slice(0, 60)}")`)
  }
  throw new Error('GéeLark shell: téléphone non prêt après plusieurs tentatives')
}

// Ensure the cloud phone is running. Mirrors MassPosting's approach:
// always send /phone/start then wait for status + shell readiness.
async function ensurePhoneRunning(
  bearer: string,
  phoneId: string,
  log?: (m: string) => void,
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
        await sleep(15000)
      }
    }
  } catch { /* ignore — still attempt start */ }

  // Always send start command (GéeLark no-ops if already running)
  log?.('📱 Envoi commande de démarrage…')
  const startRes = await gFetch(bearer, '/phone/start', { ids: [phoneId] })
  const code = Number(startRes['code'] ?? -1)
  const success = Number((startRes['data'] as Record<string, unknown>)?.['successAmount'] ?? 0)
  const failed = Number((startRes['data'] as Record<string, unknown>)?.['failAmount'] ?? 0)
  const msg = String(startRes['msg'] ?? startRes['message'] ?? '')
  log?.(`  → code=${code}, démarrés=${success}, échecs=${failed}${msg ? ` (${msg})` : ''}`)

  if (code !== 0 && success === 0 && failed > 0) {
    log?.(`❌ Impossible de démarrer: ${msg || code}`)
    return false
  }

  // Phase 1: wait for phone status=0 (running) via status API — max 120s
  log?.('⏳ Attente démarrage du téléphone (max 120s)…')
  let statusReady = false
  for (let i = 0; i < 24; i++) {
    await sleep(5000)
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

  // Phase 2: wait for shell daemon to accept commands — max 150s
  await warmupShellDelay(bearer, phoneId, log)
  return true
}

// After the phone reaches status=0, wait for the shell daemon to accept commands.
// Retries the probe up to 30 times (150s total) before giving up.
async function warmupShellDelay(
  bearer: string,
  phoneId: string,
  log?: (m: string) => void,
) {
  log?.('  ⏳ Attente initialisation du shell (max 150s)…')

  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(5000)

    try {
      const r = await gFetch(bearer, '/shell/execute', { id: phoneId, cmd: 'echo SHELL_OK' })
      const code = Number(r['code'])
      const out = String((r['data'] as Record<string, unknown>)?.['output'] ?? '')
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

// ── Pure UIAutomator XML helpers (ported verbatim) ───────────────────────────

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

// Dump uiautomator robuste (cf. client) : cat systématique + réessais → corrige
// les échecs intermittents de story dus à un dump vide.
async function dumpXml(bearer: string, phoneId: string, log?: (m: string) => void): Promise<string> {
  const f = '/sdcard/sf_dump.xml'
  let last = ''
  for (let attempt = 0; attempt < 4; attempt++) {
    const { output } = await shellExec(
      bearer, phoneId,
      `uiautomator dump ${f} >/dev/null 2>&1; cat ${f} 2>/dev/null`,
    )
    last = output
    const nodes = (output.match(/<node\b/g) || []).length
    if (output.includes('<hierarchy') && nodes > 1) return output
    log?.(`   ⏳ Lecture d'écran incomplète (essai ${attempt + 1}/4) — nouvel essai…`)
    await sleep(1300)
  }
  return last
}

// Escape text for use inside an Android `input text "..."` shell command.
// Rules: the string is passed as a double-quoted shell argument, so only
// the chars special in that context need escaping.  Single quote ' is
// NOT special inside double quotes — escaping it as \' would inject a
// literal backslash which Android keyboards often map to / or other chars.
function escapeForInputText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')  // \ → \\ (must be first)
    .replace(/"/g, '\\"')    // " → \"
    // ' is literal inside "…" — no escaping needed
    .replace(/&/g, '\\&')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/\|/g, '\\|')
    .replace(/;/g, '\\;')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/!/g, '\\!')
    .replace(/ /g, '%s')
}

// Enlève accents/emojis pour la saisie via `input text` (qui ne tape pas l'Unicode).
function toAsciiFallback(text: string): string {
  return text
    .normalize('NFD').replace(/\p{Mn}/gu, '')  // accents (diacritiques combinants)
    .replace(/[^\x00-\x7F]/g, '')              // reste non-ASCII (emojis…)
    .trim()
}

// Champs EditText du dump (texte + centre). Sert à cibler le champ « texte du sticker »
// (celui qui ne contient pas l'URL http…).
interface EditField { text: string; center: [number, number]; y: number }
function findEditTextFields(xml: string): EditField[] {
  const fields: EditField[] = []
  const re = /<node\b[^>]*class="[^"]*EditText[^"]*"[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const el = m[0]
    const tb = el.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    if (!tb) continue
    const cx = Math.floor((+tb[1] + +tb[3]) / 2)
    const cy = Math.floor((+tb[2] + +tb[4]) / 2)
    const tx = el.match(/text="([^"]*)"/)
    fields.push({ text: tx ? tx[1] : '', center: [cx, cy], y: +tb[2] })
  }
  return fields.sort((a, b) => a.y - b.y)
}

// ── Story posting (server port of postInstagramStory) ────────────────────────

export interface StoryServerConfig {
  imageUrl: string
  linkUrl: string
  linkText?: string
  dryRun?: boolean
}

export async function postStoryServer(
  bearer: string,
  phoneId: string,
  config: StoryServerConfig,
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
  // Stale media makes IG's story picker grab the wrong file — clear everything
  // first so the only photo present is the one we push next (story-bug fix).
  log('🧹 Nettoyage de la galerie…')
  await shellExec(bearer, phoneId,
    `find /sdcard/DCIM /sdcard/Pictures /sdcard/Download /sdcard/Movies -type f ` +
    `\\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' ` +
    `-o -iname '*.gif' -o -iname '*.heic' -o -iname '*.mp4' -o -iname '*.mov' \\) ` +
    `-delete 2>/dev/null; rm -rf /sdcard/DCIM/Camera/* 2>/dev/null; true`)
  // Purge stale MediaStore rows so IG's picker doesn't show black, non-selectable
  // "ghost" tiles for the files we just deleted (a directory scan won't remove
  // already-deleted entries). GeeLark phones run rooted/system → content delete OK.
  await shellExec(bearer, phoneId,
    `content delete --uri content://media/external/images/media 2>/dev/null; ` +
    `content delete --uri content://media/external/video/media 2>/dev/null; ` +
    `content delete --uri content://media/external/file 2>/dev/null; true`)
  await shellExec(bearer, phoneId,
    `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/DCIM/Camera 2>/dev/null; ` +
    `am broadcast -a android.intent.action.MEDIA_MOUNTED -d file:///sdcard 2>/dev/null; true`)
  // Grant IG full media access so a freshly-pushed file is visible/selectable on
  // Android 13/14 (default partial "Selected photos" access hides new files).
  await shellExec(bearer, phoneId,
    `pm grant com.instagram.android android.permission.READ_MEDIA_IMAGES 2>/dev/null; ` +
    `pm grant com.instagram.android android.permission.READ_MEDIA_VIDEO 2>/dev/null; ` +
    `pm grant com.instagram.android android.permission.READ_MEDIA_VISUAL_USER_SELECTED 2>/dev/null; ` +
    `pm grant com.instagram.android android.permission.READ_EXTERNAL_STORAGE 2>/dev/null; ` +
    `pm grant com.instagram.android android.permission.WRITE_EXTERNAL_STORAGE 2>/dev/null; true`)
  await sleep(1500)

  // ── 1. Push image to phone gallery ────────────────────────────────────────
  log('🖼 Chargement de l\'image…')
  // The file extension MUST match the actual bytes. We re-encode to PNG below;
  // if that fails we push the raw bytes under their original extension so the
  // file content matches its name (else Android mis-classifies it → IG can't
  // open it from the gallery).
  const origExt = (() => {
    try {
      const p = new URL(config.imageUrl).pathname
      const m = /\.(png|gif|webp|bmp|heic|heif|jpe?g)$/i.exec(p)
      if (m) return m[1].toLowerCase().replace('jpeg', 'jpg')
    } catch { /* ignore */ }
    return 'jpg'
  })()

  // Download the image directly (no CORS in Deno), then resize/compress with
  // ImageScript. Target: small PNG so the base64 push is fast.
  let originalBytes: Uint8Array
  try {
    const resp = await fetch(config.imageUrl)
    if (!resp.ok) {
      return { ok: false, error: `Impossible de télécharger l'image (HTTP ${resp.status})` }
    }
    originalBytes = new Uint8Array(await resp.arrayBuffer())
  } catch (e) {
    return { ok: false, error: `Impossible de télécharger l'image (réseau): ${e instanceof Error ? e.message : String(e)}` }
  }
  log(`   📥 Image: ${Math.round(originalBytes.length / 1024)} KB`)

  // Resize so longest side <= 1280 (enough for stories), keep aspect, encode PNG.
  let pushData: string // base64
  let outExt = 'jpg'
  try {
    const img = await decode(originalBytes)
    const MAX = 1280
    const w = img.width
    const h = img.height
    if (w > MAX || h > MAX) {
      const r = Math.min(MAX / w, MAX / h)
      img.resize(Math.round(w * r), Math.round(h * r))
    }
    // JPEG ~q82 ≈ 300-500 KB (PNG would be 3-5 MB → 1000+ shell chunks → corruption)
    const jpeg = await img.encodeJPEG(82)
    pushData = base64Encode(jpeg)
    log(`   🗜️ ImageScript: ${Math.round(originalBytes.length / 1024)} KB → ${Math.round((pushData.length * 3) / 4 / 1024)} KB (JPEG)`)
  } catch (e) {
    // Fallback: push the raw downloaded bytes, keep their real extension.
    log(`   ⚠️ ImageScript: ${e instanceof Error ? e.message : String(e)} — push brut (.${origExt})`)
    pushData = base64Encode(originalBytes)
    outExt = origExt
  }
  let imgPath = `/sdcard/DCIM/Camera/sf_story.${outExt}`
  let sz = 0

  // ── Primary transfer: let the PHONE download the image itself (like posting) ─
  // Far more reliable than streaming hundreds of base64 chunks through the shell
  // (the real cause of failed story uploads). Phone has internet + the signed URL
  // is reachable, so curl/wget just works. Fetches the original (no padding).
  if (/^https?:\/\//i.test(config.imageUrl)) {
    const dlPath = `/sdcard/DCIM/Camera/sf_story.${origExt}`
    const urlEsc = config.imageUrl.replace(/'/g, `'\\''`)
    // Jusqu'à 3 tentatives (DNS/proxy du téléphone parfois pas prêt après le boot).
    for (let dlTry = 0; dlTry < 3 && sz < 2000; dlTry++) {
      log(`   📤 Téléchargement direct par le téléphone${dlTry ? ` (essai ${dlTry + 1}/3)` : ''}…`)
      await shellExec(bearer, phoneId,
        `mkdir -p /sdcard/DCIM/Camera; ` +
        `curl -L -s -o '${dlPath}' '${urlEsc}' 2>/dev/null || ` +
        `wget -q -O '${dlPath}' '${urlEsc}' 2>/dev/null || ` +
        `toybox wget -O '${dlPath}' '${urlEsc}' 2>/dev/null; true`)
      const ckd = await shellExec(bearer, phoneId, `wc -c < '${dlPath}' 2>/dev/null || echo 0`)
      const szd = parseInt(ckd.output.trim().split(/\s+/)[0] ?? '0', 10) || 0
      if (szd >= 2000) {
        imgPath = dlPath
        sz = szd
        log(`   ✅ Image téléchargée par le téléphone: ${szd} octets`)
      } else {
        log(`   ⚠️ Téléchargement direct échoué (${szd} o)${dlTry < 2 ? ' — nouvel essai…' : ' — bascule base64…'}`)
        await shellExec(bearer, phoneId, `rm -f '${dlPath}' 2>/dev/null; true`)
        if (dlTry < 2) await sleep(1500)
      }
    }
  }

  // ── Fallback transfer: base64 chunks (base64 chars are safe in single quotes) ─
  if (sz < 2000) {
    log(`   📤 Push base64: ${Math.round(pushData.length / 1024)} KB (.${outExt})`)
    const CHUNK = 3000, BATCH = 20
    const chunks: string[] = []
    for (let i = 0; i < pushData.length; i += CHUNK) chunks.push(pushData.slice(i, i + CHUNK))
    log(`   📦 ${chunks.length} chunks × ${BATCH}…`)
    await shellExec(bearer, phoneId,
      `mkdir -p /sdcard/DCIM/Camera && printf '%s' '${chunks[0]}' > '${imgPath}.b64'`)
    for (let b = 1; b < chunks.length; b += BATCH) {
      const cmd = chunks.slice(b, b + BATCH).map(c => `printf '%s' '${c}' >> '${imgPath}.b64'`).join(' && ')
      await shellExec(bearer, phoneId, cmd)
    }
    await shellExec(bearer, phoneId,
      `base64 -d < '${imgPath}.b64' > '${imgPath}' 2>/dev/null || base64 --decode < '${imgPath}.b64' > '${imgPath}' 2>/dev/null; rm -f '${imgPath}.b64'`)
    const ck = await shellExec(bearer, phoneId, `wc -c < '${imgPath}' 2>/dev/null || echo 0`)
    sz = parseInt(ck.output.trim().split(/\s+/)[0] ?? '0', 10) || 0
  }
  log(`   📎 Fichier: ${sz} octets`)
  if (sz < 2000) {
    return { ok: false, error: `Image non transférée sur le téléphone (${sz} octets)` }
  }

  // Force media scanner (Android 13/15 ignore le broadcast → on combine plusieurs
  // méthodes : broadcast, content insert dans le MediaStore, et su si rooté).
  {
    const nowSec = Math.floor(Date.now() / 1000)
    const outExt2 = imgPath.split('.').pop() || 'jpg'
    await shellExec(bearer, phoneId, `touch -m '${imgPath}' 2>/dev/null; true`)
    await shellExec(bearer, phoneId,
      `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${imgPath} 2>/dev/null; ` +
      `content insert --uri content://media/external/images/media ` +
      `--bind _data:s:${imgPath} --bind mime_type:s:image/jpeg ` +
      `--bind _display_name:s:sf_story.${outExt2} --bind date_added:i:${nowSec} --bind date_modified:i:${nowSec} 2>/dev/null; ` +
      `su -c 'am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${imgPath}' 2>/dev/null; ` +
      `su -c 'content call --uri content://media --method scan_volume --arg external_primary' 2>/dev/null; true`)
  }
  await sleep(5000)

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
  const firstThumb: [number, number] = (() => {
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
    return best ?? [Math.floor(sw * 0.25), Math.floor(sh * 0.30)]
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

  const KW_FIND = ['link', 'lien', 'url', 'add a link', 'ajouter un lien', 'sticker lien', 'link sticker']
  const findLink = (x: string): [number, number] | null =>
    findByResourceId(x, 'link_sticker', 'sticker_link', 'link_sticker_id') ??
    findByTextPartial(x, ...KW_FIND)

  let linkSticker = findLink(xml)

  if (!linkSticker) {
    const searchPt: [number, number] =
      findByResourceId(xml, 'search_bar', 'sticker_search', 'search_box', 'search_input', 'search_edit_text') ??
      findByTextPartial(xml, 'search', 'recherch', 'cherch') ??
      [cx, Math.floor(sh * 0.14)]
    log(`   🔎 Recherche du sticker via la barre (${searchPt[0]},${searchPt[1]})…`)
    await shellExec(bearer, phoneId, `input tap ${searchPt[0]} ${searchPt[1]}`)
    await sleep(1000)

    for (const term of ['link', 'lien', 'url']) {
      await shellExec(bearer, phoneId, 'input keyevent 123'); await sleep(120)
      for (let i = 0; i < 3; i++) { await shellExec(bearer, phoneId, 'input keyevent 67 67 67 67 67 67 67 67'); await sleep(50) }
      await shellExec(bearer, phoneId, `input text "${term}"`)
      await sleep(2200)
      const xs = await dumpXml(bearer, phoneId)
      linkSticker = findLink(xs)
      if (linkSticker) { log(`   ✓ Sticker « Lien » trouvé (recherche « ${term} »)`); break }
    }

    if (!linkSticker) {
      const xs = await dumpXml(bearer, phoneId)
      const descs = Array.from(xs.matchAll(/content-desc="([^"]+)"/g)).map(m => m[1]).filter(Boolean).slice(0, 40)
      log(`   🧭 Diagnostic tiroir stickers — content-desc vus : ${descs.join(' | ').slice(0, 400)}`)
      linkSticker = [Math.floor(sw * 0.2), Math.floor(sh * 0.28)]
      log(`   ↪︎ Aucun libellé trouvé — tap du 1er résultat (${linkSticker[0]},${linkSticker[1]})`)
    }
  }

  await shellExec(bearer, phoneId, `input tap ${linkSticker[0]} ${linkSticker[1]}`)
  await sleep(2500)

  // ── 5. Type the URL (+ optional custom label) ──────────────────────────────
  log('⌨️  Saisie de l\'URL…')
  xml = await dumpXml(bearer, phoneId)
  const urlField: [number, number] =
    findByResourceId(xml, 'link_url', 'url_edit_text', 'web_url', 'link_edit_text') ??
    findByText(xml, 'URL', 'https://') ??
    [cx, Math.floor(sh * 0.32)]
  await shellExec(bearer, phoneId, `input tap ${urlField[0]} ${urlField[1]}`)
  await sleep(900)
  await shellExec(bearer, phoneId, `input text "${escapeForInputText(config.linkUrl)}"`)
  await sleep(1200)

  // Optional custom sticker text — replaces the default "LINK"/"LIEN" label.
  // Writer robuste (porté du client) : localise le champ « texte du sticker »,
  // le focus/vide, puis tente PLUSIEURS méthodes de saisie EN SÉQUENCE en relisant
  // le champ après chaque tentative pour voir laquelle a réellement écrit. Gère le
  // focus ET l'Unicode (accents/emojis) que `input text` ne sait pas taper.
  if (config.linkText?.trim()) {
    const wanted = config.linkText.trim()
    const ascii  = toAsciiFallback(wanted)
    const needle = ascii.toLowerCase()
    log(`   ✏️  Texte du sticker: "${wanted}"${ascii !== wanted ? ` (ascii: "${ascii}")` : ''}`)
    await sleep(600)

    const readTextField = async (): Promise<EditField | null> => {
      const fields = findEditTextFields(await dumpXml(bearer, phoneId))
      return fields.find(f => !/https?:\/\/|www\./i.test(f.text)) ?? (fields.length >= 2 ? fields[1] : null)
    }
    const present = (fields: EditField[]) =>
      needle.length > 0 && fields.some(f => !/https?:\/\//i.test(f.text) && toAsciiFallback(f.text).toLowerCase().includes(needle))
    const focusAndClear = async (pt: [number, number]) => {
      await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`); await sleep(400)
      await shellExec(bearer, phoneId, `input tap ${pt[0]} ${pt[1]}`); await sleep(400)
      await shellExec(bearer, phoneId, 'input keyevent 123'); await sleep(120) // MOVE_END
      for (let i = 0; i < 3; i++) { await shellExec(bearer, phoneId, 'input keyevent 67 67 67 67 67 67 67 67 67 67'); await sleep(60) }
      await sleep(120)
    }
    const verify = async (): Promise<boolean> => present(findEditTextFields(await dumpXml(bearer, phoneId)))

    let done = false
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

      // Méthode 1 : input text (ASCII) — le chemin éprouvé (comme l'URL).
      if (!done && ascii.length > 0) {
        await focusAndClear(pt)
        await shellExec(bearer, phoneId, `input text "${escapeForInputText(ascii)}"`)
        await sleep(700)
        if (await verify()) { log('   ✓ Saisi via input text (ASCII)'); done = true }
        else log('   … input text ASCII n\'a rien écrit')
      }
      // Méthode 2 : presse-papier + CTRL+V (Unicode, garde accents/emojis).
      if (!done) {
        await focusAndClear(pt)
        const shellSafe = wanted.replace(/'/g, `'\\''`)
        await shellExec(bearer, phoneId, `cmd clipboard set-text '${shellSafe}'`).catch(() => ({ output: '', status: -1 }))
        await sleep(300)
        await shellExec(bearer, phoneId, 'input keycombination 113 50') // CTRL+V
        await sleep(700)
        if (await verify()) { log('   ✓ Saisi via presse-papier (CTRL+V)'); done = true }
        else log('   … CTRL+V n\'a rien collé')
      }
      // Méthode 3 : presse-papier + long-press → menu Coller/Paste.
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

    if (!done) log('   ⚠ Texte du sticker non écrit — publication avec le libellé par défaut')
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
