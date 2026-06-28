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

async function dumpXml(bearer: string, phoneId: string): Promise<string> {
  const f = '/sdcard/sf_dump.xml'
  const { output } = await shellExec(bearer, phoneId, `uiautomator dump ${f} && cat ${f}`)
  return output
}

// Diagnostic : logge chaque nœud cliquable (resource-id court + content-desc +
// texte + centre x,y). Indispensable pour calibrer les taps sur les versions /
// langues d'Instagram où la détection par resource-id/texte échoue.
function logClickables(xml: string, log: (m: string) => void, tag: string): void {
  const re = /<node\b[^>]*\/?>/g
  let m: RegExpExecArray | null
  const lines: string[] = []
  while ((m = re.exec(xml)) !== null) {
    const el = m[0]
    if (!/clickable="true"/.test(el)) continue
    const rid = (/resource-id="([^"]*)"/.exec(el)?.[1] ?? '').split('/').pop() ?? ''
    const desc = /content-desc="([^"]*)"/.exec(el)?.[1] ?? ''
    const txt = /text="([^"]*)"/.exec(el)?.[1] ?? ''
    const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(el)
    if (!b) continue
    const cx = Math.floor((+b[1] + +b[3]) / 2)
    const cy = Math.floor((+b[2] + +b[4]) / 2)
    if (!rid && !desc && !txt) continue
    lines.push(`      • [${rid}|${desc}|${txt}] @${cx},${cy}`)
  }
  log(`   🔬 ${tag} — ${lines.length} éléments cliquables :`)
  for (const l of lines.slice(0, 50)) log(l)
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
    log('   📤 Téléchargement direct par le téléphone…')
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
      log(`   ⚠️ Téléchargement direct échoué (${szd} o) — bascule base64…`)
      await shellExec(bearer, phoneId, `rm -f '${dlPath}' 2>/dev/null; true`)
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

  // Force media scanner so Instagram's gallery picker sees the new file.
  // touch -m ensures the file has the current timestamp → appears FIRST in "Recents".
  await shellExec(bearer, phoneId,
    `touch -m '${imgPath}' && am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${imgPath}`)
  await sleep(4000)

  // ── 2. « Share to Story » : ouvre IG avec l'image DÉJÀ chargée dans le ──────
  // compositeur de story → saute TOUTE la navigation (caméra/galerie/menu
  // Create/avatar). On vérifie qu'on arrive bien sur le compositeur ; sinon on
  // bascule sur l'ancien flow (navigation manuelle).
  let xml = ''
  let onComposer = false
  log('🚀 Share-to-Story (image pré-chargée)…')
  {
    const idOut = await shellExec(bearer, phoneId,
      `content query --uri content://media/external/images/media --projection _id --where "_data='${imgPath}'" 2>/dev/null | tail -1`)
    const idm = /_id=(\d+)/.exec(idOut.output)
    if (idm) {
      const contentUri = `content://media/external/images/media/${idm[1]}`
      await shellExec(bearer, phoneId, 'am force-stop com.instagram.android')
      await sleep(1000)
      await shellExec(bearer, phoneId,
        `am start -a com.instagram.share.ADD_TO_STORY --grant-read-uri-permission ` +
        `-t image/jpeg --es source_application "com.instagram.android" ` +
        `--eu android.intent.extra.STREAM ${contentUri} com.instagram.android`)
      await sleep(8000)
      xml = await dumpXml(bearer, phoneId)
      onComposer = !!(
        findByResourceId(xml, 'sticker_button', 'sticker_tray_button', 'asset_button', 'sticker_picker_button') ??
        findByText(xml, 'Your story', 'Votre story', 'Add to story', 'Ajouter à la story', 'Close Friends', 'Amis proches') ??
        findByTextPartial(xml, 'sticker', 'autocollant', 'your story', 'votre story'))
      log(onComposer ? '   ✅ Story ouverte avec l\'image (Share-to-Story)' : '   ↩︎ Share-to-Story ignoré — flow classique')
    } else {
      log('   ↩︎ Content URI introuvable — flow classique')
    }
  }

  if (!onComposer) {
  // ── 2bis. Ouverture classique (flow de secours) ────────────────────────────
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
  xml = await dumpXml(bearer, phoneId)

  // Certaines versions d'IG ouvrent un menu « Create » (Reel / Post / Story /
  // Live…) au lieu d'aller direct à la caméra story. Dans ce cas, il faut taper
  // la ligne « Story » (sinon l'automation part dans Reels).
  const looksLikeCreateMenu = !!findByText(xml, 'Story', 'Histoire')
    && !!(findByText(xml, 'Reel', 'Reels') || findByText(xml, 'Post', 'Publication') || findByText(xml, 'Live', 'En direct'))
  if (looksLikeCreateMenu) {
    const storyRow = findByText(xml, 'Story', 'Histoire', 'Votre story') ?? findByTextPartial(xml, 'story', 'histoire')
    if (storyRow) {
      log('   📋 Menu « Create » détecté — tap sur « Story »…')
      await shellExec(bearer, phoneId, `input tap ${storyRow[0]} ${storyRow[1]}`)
      await sleep(5000)
      xml = await dumpXml(bearer, phoneId)
    }
  }

  // Sur l'écran caméra/story ? (on NE matche PAS « Reel/Live » pour ne pas
  // confondre avec le menu « Create »).
  const onCamera =
    findByResourceId(xml, 'gallery_button', 'camera_gallery', 'gallery_thumbnail', 'capture_button',
      'camera_shutter_button', 'camera_shutter', 'shutter_button', 'story_camera', 'camera_capture_button') ??
    findByText(xml, 'Gallery', 'Galerie', 'Add to story', 'Ajouter à la story', 'Recents', 'Récents', 'Boomerang', 'Layout') ??
    findByTextPartial(xml, 'add to story', 'votre story', 'recents', 'récents')
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
    // m[1] = attributs entre resource-id et bounds (contient content-desc) →
    // sert à EXCLURE la tuile appareil photo (1ʳᵉ case de « Recents »), sinon on
    // déclenche la caméra au lieu de sélectionner l'image.
    const re = /resource-id="[^"]*(?:gallery_grid_item|media_picker_grid_item)[^"]*"([^>]*?)bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g
    let best: [number, number] | null = null
    let bestScore = Infinity
    let cameraX2 = 0, cameraYc = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(xml)) !== null) {
      const attrs = m[1]
      const x1 = +m[2], y1 = +m[3], x2 = +m[4], y2 = +m[5]
      if (/camera|appareil|cam[ée]ra|capture|prendre une photo|take photo/i.test(attrs)) { cameraX2 = x2; cameraYc = Math.floor((y1 + y2) / 2); continue }
      const score = y1 * 10000 + x1 // top row first, then leftmost
      if (score < bestScore) { bestScore = score; best = [Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2)] }
    }
    if (best) return best
    // Repli : si on a repéré la caméra, l'image est la case juste à sa droite.
    if (cameraX2) return [Math.floor(cameraX2 + sw * 0.16), cameraYc || Math.floor(sh * 0.30)]
    return [Math.floor(sw * 0.42), Math.floor(sh * 0.30)]
  })()
  log(`   👆 Tap galerie: ${firstThumb[0]},${firstThumb[1]}`)
  await shellExec(bearer, phoneId, `input tap ${firstThumb[0]} ${firstThumb[1]}`)
  await sleep(3500)
  } // fin du flow classique (if !onComposer) — sinon l'image est déjà chargée

  // ── 4. Open the sticker tray and choose the Link sticker ───────────────────
  log('🔗 Ajout du sticker lien…')
  xml = await dumpXml(bearer, phoneId)
  logClickables(xml, log, 'Composer story (barre d\'outils)')
  const stickerBtn =
    findByResourceId(xml, 'sticker_button', 'sticker_tray_button', 'asset_button', 'sticker_picker_button', 'creation_sticker_button') ??
    findByText(xml, 'Sticker', 'Autocollant', 'Stickers', 'Autocollants', 'Add sticker', 'Add a sticker', 'Ajouter un autocollant') ??
    findByTextPartial(xml, 'sticker', 'autocollant')
  if (stickerBtn) {
    log(`   👆 Bouton sticker: ${stickerBtn[0]},${stickerBtn[1]}`)
    await shellExec(bearer, phoneId, `input tap ${stickerBtn[0]} ${stickerBtn[1]}`)
  } else {
    log(`   ⚠️ Bouton sticker non détecté → repli coord ${Math.floor(sw * 0.88)},${Math.floor(sh * 0.14)}`)
    // Repli : barre verticale haut-droite — le sticker (smiley) est le 2ᵉ icône,
    // sous « Aa ». ~88% en largeur, ~14% en hauteur.
    await shellExec(bearer, phoneId, `input tap ${Math.floor(sw * 0.88)} ${Math.floor(sh * 0.14)}`)
  }
  await sleep(3500) // extra time for tray to fully load

  xml = await dumpXml(bearer, phoneId)
  logClickables(xml, log, 'Tray des stickers')

  // Sélection du sticker « Lien ». Le tray des stickers a un libellé/ordre qui varie
  // selon la version d'Instagram et la langue → on privilégie la BARRE DE RECHERCHE
  // (présente sur toutes les versions récentes) plutôt qu'un tap direct fragile sur la
  // grille (qui a déjà cliqué « Mention » par erreur).  Repli : tap direct sur « LINK ».
  let linkTapped = false

  // 4a. Recherche via la barre de recherche du tray ─────────────────────────
  const searchPt =
    findByResourceId(xml, 'search_bar', 'sticker_search', 'search_box', 'search_input', 'search_edit_text') ??
    findByTextPartial(xml, 'search', 'recherch', 'cherch')
  if (searchPt) {
    log('   🔎 Recherche du sticker « Lien »…')
    await shellExec(bearer, phoneId, `input tap ${searchPt[0]} ${searchPt[1]}`)
    await sleep(1000)
    // « lien » d'abord (IG en français), puis « link » (IG en anglais)
    for (const term of ['lien', 'link']) {
      await shellExec(bearer, phoneId, 'input keyevent KEYCODE_MOVE_END')
      // Efface le terme précédent (jusqu'à 8 caractères) avant de retaper
      await shellExec(bearer, phoneId, 'input keyevent 67 67 67 67 67 67 67 67')
      await sleep(300)
      await shellExec(bearer, phoneId, `input text "${term}"`)
      await sleep(2200)
      const xml2 = await dumpXml(bearer, phoneId)
      const lk2 =
        findByText(xml2, 'Link', 'Lien', 'LINK', 'LIEN', 'Link sticker', 'Add a link', 'Ajouter un lien') ??
        findByResourceId(xml2, 'link_sticker', 'sticker_link')
      if (lk2) {
        await shellExec(bearer, phoneId, `input tap ${lk2[0]} ${lk2[1]}`)
        linkTapped = true
        break
      }
    }
  }

  // 4b. Repli : tap direct sur « LINK » dans la grille (barre de recherche absente
  //     ou recherche infructueuse).
  if (!linkTapped) {
    const linkSticker =
      findByText(xml, 'Link', 'Lien', 'LINK', 'LIEN', 'Link sticker', 'Sticker lien', 'Add a link', 'Ajouter un lien') ??
      findByResourceId(xml, 'link_sticker', 'sticker_link')
    if (linkSticker) {
      await shellExec(bearer, phoneId, `input tap ${linkSticker[0]} ${linkSticker[1]}`)
      linkTapped = true
    }
  }

  if (!linkTapped) {
    log('   ❌ Sticker lien introuvable')
    return { ok: false, error: 'Sticker lien introuvable — le sticker « Lien » est peut-être absent de ce compte Instagram' }
  }
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
  if (config.linkText?.trim()) {
    log('   ✏️  Texte du sticker…')
    await sleep(600)
    xml = await dumpXml(bearer, phoneId)
    const customPt =
      findByResourceId(xml, 'customize_sticker_text', 'link_sticker_text', 'sticker_text_edit', 'caption_text_view', 'sticker_text') ??
      findByText(xml, 'Customize sticker text', 'Personnaliser le texte du sticker', 'Personnaliser le texte', 'Sticker text', 'Texte du sticker') ??
      findByTextPartial(xml, 'customize sticker', 'personnalis', 'sticker text', 'texte du sticker')
    if (customPt) {
      log(`   ✓ Champ texte trouvé: ${customPt[0]},${customPt[1]}`)
      await shellExec(bearer, phoneId, `input tap ${customPt[0]} ${customPt[1]}`)
      await sleep(900)
    } else {
      log('   ↩︎ Champ « personnaliser le texte » non détecté — tap sous l\'URL')
      await shellExec(bearer, phoneId, `input tap ${urlField[0]} ${urlField[1] + Math.floor(sh * 0.07)}`)
      await sleep(900)
    }
    await shellExec(bearer, phoneId, 'input keyevent --longpress KEYCODE_DEL')
    await sleep(300)
    await shellExec(bearer, phoneId, `input text "${escapeForInputText(config.linkText.trim())}"`)
    await sleep(1000)
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
