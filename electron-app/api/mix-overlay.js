// Server-side video + caption overlay.
// Primary: render caption PNG via sharp's Pango text mode, composite with ffmpeg overlay.
// Fallback: if sharp/Pango fails, burn text via ffmpeg's subtitles (ASS) filter.
// Accepts: POST { videoUrl|storagePath, caption, userId, bucket?, position?, fontSize?, fontColor? }
// Returns: { ok, url, storagePath }

const ffmpegPath = require('ffmpeg-static')
const sharp      = require('sharp')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { createClient } = require('@supabase/supabase-js')
const { assertAllowedMediaUrl, fetchMediaFollow, isOwnStoragePath } = require('./_ssrf')
const { resolveCityKey, buildGpsMetadataArgs } = require('./_gps')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const execFileAsync = promisify(execFile)

const VW = 1080, VH = 1920
const TEXT_MAX_W = 960

function getSupabaseAdmin({ supabaseToken, supabaseAnonKey } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) {
    return createClient(url, serviceKey, { auth: { persistSession: false } })
  }
  if (supabaseToken && supabaseAnonKey) {
    return createClient(url, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${supabaseToken}` } },
      auth: { persistSession: false },
    })
  }
  throw new Error('Supabase non authentifié — définir SUPABASE_SERVICE_ROLE_KEY dans Vercel')
}

function escapePango(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fontFamilyName(buf) {
  try {
    const numTables = buf.readUInt16BE(4)
    let nameOff = 0
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16
      if (buf.toString('ascii', o, o + 4) === 'name') { nameOff = buf.readUInt32BE(o + 8); break }
    }
    if (!nameOff) return null
    const count = buf.readUInt16BE(nameOff + 2)
    const strOff = nameOff + buf.readUInt16BE(nameOff + 4)
    for (let i = 0; i < count; i++) {
      const r = nameOff + 6 + i * 12
      const platformID = buf.readUInt16BE(r)
      const nameID = buf.readUInt16BE(r + 6)
      const len = buf.readUInt16BE(r + 8)
      const off = buf.readUInt16BE(r + 10)
      if (nameID === 1) {
        const slice = buf.slice(strOff + off, strOff + off + len)
        if (platformID === 1) return slice.toString('latin1')
        const swapped = Buffer.from(slice)
        for (let j = 0; j + 1 < swapped.length; j += 2) { const t = swapped[j]; swapped[j] = swapped[j + 1]; swapped[j + 1] = t }
        return swapped.toString('utf16le')
      }
    }
  } catch { /* ignore */ }
  return null
}

function luminance(hex) {
  let h = String(hex).replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return (0.2126 * r + 0.7152 * g + 0.4152 * b)
}

async function renderTextLayer(caption, family, fontPath, fontSize, color) {
  const fontDesc = family ? `${family} ${fontSize}` : `Sans Bold ${fontSize}`
  return sharp({
    text: {
      text: `<span weight="bold" foreground="${color}">${escapePango(caption)}</span>`,
      font: fontDesc,
      ...(fontPath ? { fontfile: fontPath } : {}),
      rgba: true,
      align: 'centre',
      width: TEXT_MAX_W,
      spacing: Math.round(fontSize * 0.22),
    },
  }).png().toBuffer({ resolveWithObject: true })
}

async function buildCaptionOverlay(caption, fontSize, fontColor, fontPath, family) {
  const outlineColor = luminance(fontColor) > 0.55 ? '#000000' : '#ffffff'
  const fill    = await renderTextLayer(caption, family, fontPath, fontSize, fontColor)
  const outline = await renderTextLayer(caption, family, fontPath, fontSize, outlineColor)

  const W = fill.info.width, H = fill.info.height
  const OFF = Math.max(2, Math.round(fontSize * 0.07))
  const canvasW = W + OFF * 2, canvasH = H + OFF * 2

  const offsets = [
    [0, 0], [OFF, 0], [2 * OFF, 0],
    [0, OFF],          [2 * OFF, OFF],
    [0, 2 * OFF], [OFF, 2 * OFF], [2 * OFF, 2 * OFF],
  ]
  const composites = offsets.map(([x, y]) => ({ input: outline.data, left: x, top: y }))
  composites.push({ input: fill.data, left: OFF, top: OFF })

  const buf = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composites).png().toBuffer()

  return { buf, w: canvasW, h: canvasH }
}

function buildAssFile(caption, fontSize, fontColor, position, custom) {
  const h = String(fontColor).replace('#', '').padEnd(6, '0')
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6)
  const assColor    = `&H00${b}${g}${r}`.toUpperCase()
  const outColor    = luminance(fontColor) > 0.55 ? '&H00000000' : '&H00FFFFFF'
  const alignMap    = { top: 8, center: 5, middle: 5, bottom: 2 }
  // Placement libre : alignement centré + override \pos(x,y) en pixels (PlayRes 1080×1920).
  const alignment   = custom ? 5 : (alignMap[position] ?? 2)
  const marginV     = position === 'top' ? 120 : position === 'center' || position === 'middle' ? 0 : 220
  const posTag      = custom ? `{\\pos(${Math.round(custom.x * 1080)},${Math.round(custom.y * 1920)})}` : ''
  const safeCaption = posTag + String(caption).replace(/[\r\n]+/g, '\\N')

  return (
    '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n' +
    '[V4+ Styles]\n' +
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ' +
    'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
    'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
    `Style: Default,Arial,${fontSize},${assColor},&H000000FF,${outColor},&H80000000,` +
    `-1,0,0,0,100,100,0,0,1,3,1,${alignment},60,60,${marginV},1\n\n` +
    '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
    `Dialogue: 0,0:00:00.00,9:59:59.00,Default,,0,0,0,,${safeCaption}\n`
  )
}

// ── Incrustation d'un MÉDIA (image/vidéo) positionné + timé ──────────────────
// Position (x,y) et largeur (w) en FRACTIONS de la vidéo de sortie (0..1) → placement
// précis indépendant de la résolution. Timing : apparaît entre `start` et start+duration.
async function handleMediaOverlay(req, res) {
  const {
    videoUrl, overlayUrl, overlayType = 'image', userId, bucket = 'content',
    x = 0.1, y = 0.1, w = 0.3, h, start = 0, duration = 5,
    supabaseToken, supabaseAnonKey,
  } = req.body ?? {}
  if (!videoUrl || !overlayUrl) return res.status(400).json({ ok: false, error: 'Missing videoUrl or overlayUrl' })

  const supabase = getSupabaseAdmin({ supabaseToken, supabaseAnonKey })
  const ts = Date.now(); const tmpDir = os.tmpdir()
  const inPath  = path.join(tmpDir, `movl_in_${ts}.mp4`)
  const ovPath  = path.join(tmpDir, `movl_ov_${ts}`)
  const outPath = path.join(tmpDir, `movl_out_${ts}.mov`)
  const thumbPath = path.join(tmpDir, `movl_th_${ts}.jpg`)
  try {
    const r1 = await fetchMediaFollow(videoUrl, { timeoutMs: 120000 })  // gros fichiers (banque 100 Mo)
    if (!r1.ok) return res.status(400).json({ ok: false, error: `base ${r1.status}` })
    fs.writeFileSync(inPath, Buffer.from(await r1.arrayBuffer()))
    const r2 = await fetchMediaFollow(overlayUrl, { timeoutMs: 60000 })
    if (!r2.ok) return res.status(400).json({ ok: false, error: `overlay ${r2.status}` })
    fs.writeFileSync(ovPath, Buffer.from(await r2.arrayBuffer()))

    const clamp = (v, lo, hi) => Math.min(Math.max(Number(v), lo), hi)
    const fx = clamp(x || 0, 0, 1), fy = clamp(y || 0, 0, 1), fw = clamp(w || 0.3, 0.02, 1)
    const st = Math.max(Number(start) || 0, 0)
    const dur = Math.max(Number(duration) || 3, 0.03)  // autorise des flashs très courts (0.1s et moins)
    const end = (st + dur).toFixed(3)
    const ox = Math.round(fx * VW), oy = Math.round(fy * VH), ow = Math.round(fw * VW)
    const isVideo = overlayType === 'video'

    // Hauteur : si le client l'envoie (nouveau composer), on redimensionne l'image
    // pour REMPLIR exactement la zone dessinée (cover + crop, comme l'aperçu) → le
    // plein écran fonctionne. Sinon (anciens appels), largeur seule, ratio conservé.
    const hasH = h !== undefined && h !== null && Number(h) > 0
    const oh = hasH ? Math.round(clamp(h, 0.02, 1) * VH) : 0
    // `cover` : on agrandit à la plus grande dimension puis on recadre à ow×oh (pas de déformation).
    const sizeChain = hasH
      ? `scale=${ow}:${oh}:force_original_aspect_ratio=increase,crop=${ow}:${oh}`
      : `scale=${ow}:-1`

    const bg = `[0:v]scale=${VW}:${VH}:force_original_aspect_ratio=decrease,pad=${VW}:${VH}:-1:-1:color=black,setsar=1[bg]`
    const ovChain = isVideo
      ? `[1:v]${sizeChain},setpts=PTS-STARTPTS+${st}/TB[ov]`  // vidéo overlay démarre à `start`
      : `[1:v]${sizeChain}[ov]`
    // Flash noir optionnel : un cache noir apparaît JUSTE AVANT et JUSTE APRÈS
    // l'incrustation (durée très courte, ex. 0.1-0.2 s), à la même position/taille.
    const bDur = clamp(req.body?.blackDur ?? 0.15, 0.02, 1)
    const bx = hasH ? ox : 0, by = hasH ? oy : 0
    const bw = hasH ? ow : VW, bh = hasH ? oh : VH
    // Un drawbox SÉPARÉ par fenêtre (plus sûr qu'une expression combinée), et on
    // n'ajoute une fenêtre que si elle a une durée réelle (st=0 → pas de "avant").
    // Quotes simples uniquement (même écriture que l'`enable` de l'overlay qui marche).
    const boxAt = (s, e) => `,drawbox=x=${bx}:y=${by}:w=${bw}:h=${bh}:color=black:t=fill:enable='between(t,${s.toFixed(3)},${e.toFixed(3)})'`
    let blackChain = ''
    if (req.body?.blackFlash) {
      const preS = Math.max(st - bDur, 0)
      if (st - preS > 0.01) blackChain += boxAt(preS, st)          // cache AVANT
      blackChain += boxAt(st + dur, st + dur + bDur)               // cache APRÈS
    }
    // IMAGE : une seule frame, répétée par l'overlay (`repeat`) → elle reste
    //   affichable pendant toute la fenêtre `enable`. Surtout PAS de `-loop 1`
    //   (le fichier n'a pas d'extension → démuxeur png_pipe, `-loop` ignoré → 1
    //   seule frame) ni de `-shortest` (qui couperait la sortie à cette frame).
    // VIDÉO : `pass` → une fois l'overlay terminé, la vidéo de base continue.
    // Dans les deux cas la sortie s'arrête avec la vidéo de BASE.
    const eof = isVideo ? 'pass' : 'repeat'
    const vFilter = `${bg};${ovChain};[bg][ov]overlay=${ox}:${oy}:enable='between(t,${st},${end})':eof_action=${eof}${blackChain}[out]`
    const inputs = ['-i', inPath, '-i', ovPath]

    // ── Son « cling » joué AU MOMENT où l'image apparaît (optionnel) ──────────
    // On décale le son à `start` (adelay) puis on le mixe à la piste d'origine.
    // Si la vidéo de base n'a PAS d'audio, on ne mixe pas : le son devient la
    // piste (sinon amix échoue sur une entrée inexistante).
    const clingPath = path.join(__dirname, 'assets', 'cling.mp3')
    const wantSound = !!req.body?.overlaySound && fs.existsSync(clingPath)
    let srcHasAudio = false
    if (wantSound) {
      try { await execFileAsync(ffmpegPath, ['-nostdin', '-i', inPath], { maxBuffer: 8 * 1024 * 1024, timeout: 15000 }) }
      // `ffmpeg -i` sans sortie termine toujours en erreur : les infos sont sur stderr.
      // Test volontairement large : si on rate la détection, on garderait le son
      // « cling » SEUL et on perdrait la bande-son d'origine.
      catch (p) { srcHasAudio = /Audio:/.test(p.stderr ?? '') }
    }
    let aFilter = '', audioMaps = ['-map', '0:a?']
    if (wantSound) {
      inputs.push('-i', clingPath)
      const delayMs = Math.round(st * 1000)
      const vol = clamp(req.body?.soundVolume ?? 1, 0.05, 3)
      const snd = `[2:a]adelay=${delayMs}|${delayMs},volume=${vol.toFixed(2)}[snd]`
      aFilter = srcHasAudio
        ? `;${snd};[0:a][snd]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`
        : `;${snd}`
      audioMaps = ['-map', srcHasAudio ? '[aout]' : '[snd]']
    }
    const filter = `${vFilter}${aFilter}`

    const ffArgs = [
      '-nostdin', '-threads', '0', ...inputs,
      '-filter_complex', filter,
      '-map', '[out]', ...audioMaps,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      // PAS de -level codé en dur : un level fixe (4.0) est violé par une source
      // 1080p60/4K → fichier non conforme, lu comme "0 seconde / noir".
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-max_muxing_queue_size', '9999',
      '-c:a', 'aac', '-b:a', '128k',
      // PAS de -shortest : la longueur suit la vidéo de BASE (sinon un overlay
      // court — ou une image d'une frame — tronquait toute la sortie).
      '-movflags', '+faststart', '-y', outPath,
    ]
    try {
      await execFileAsync(ffmpegPath, ffArgs, { maxBuffer: 200 * 1024 * 1024, timeout: 290000, killSignal: 'SIGKILL' })
    } catch (ffErr) {
      const stderr = (ffErr.stderr ?? '').slice(-800)
      throw new Error(`FFmpeg: ${stderr || ffErr.message}`)
    }

    // Garde-fou : on vérifie que la sortie est une VRAIE vidéo (durée > 0) avant
    // de l'envoyer dans la banque — sinon on remonte l'erreur au lieu d'y stocker
    // un fichier vide/noir.
    const outStat = fs.existsSync(outPath) ? fs.statSync(outPath) : { size: 0 }
    let outDur = 0
    try {
      // `ffmpeg -i <file>` sort en code 1 mais écrit les infos sur stderr.
      await execFileAsync(ffmpegPath, ['-nostdin', '-i', outPath], { maxBuffer: 8 * 1024 * 1024, timeout: 15000 })
    } catch (probeErr) {
      const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(probeErr.stderr ?? '')
      if (m) outDur = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])
    }
    if (outStat.size < 8000 || (outDur > 0 && outDur < 0.2)) {
      throw new Error(`sortie invalide (${Math.round(outStat.size / 1024)} Ko, ${outDur.toFixed(2)}s) — vérifie que le média de base est bien une vidéo`)
    }

    const rand = Math.random().toString(36).slice(2)
    const resultPath = userId ? `videos/users/${userId}/overlay-${ts}_${rand}.mov` : `mix-results/${ts}_${rand}.mov`
    const outBuf = fs.readFileSync(outPath)
    const { error: upErr } = await supabase.storage.from(bucket).upload(resultPath, outBuf, { contentType: 'video/quicktime', upsert: true })
    if (upErr) throw new Error(upErr.message)
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(resultPath)

    // Miniature prise PENDANT la fenêtre d'incrustation → la banque montre bien la
    // vidéo AVEC l'image dessus (et pas la 1re frame sans overlay). Best-effort.
    let thumbnailPath = null
    try {
      const at = Math.min(st + dur / 2, Math.max(st + 0.03, 0.1))
      await execFileAsync(ffmpegPath, ['-nostdin', '-ss', String(at), '-i', outPath, '-vframes', '1', '-q:v', '3', '-y', thumbPath], { maxBuffer: 20 * 1024 * 1024, timeout: 15000 })
      const thBuf = fs.readFileSync(thumbPath)
      const thPath = resultPath.replace(/\.mp4$/, '_thumb.jpg')
      const { error: thErr } = await supabase.storage.from(bucket).upload(thPath, thBuf, { contentType: 'image/jpeg', upsert: true })
      if (!thErr) thumbnailPath = thPath
    } catch { /* miniature best-effort */ }

    res.json({ ok: true, url: publicUrl, storagePath: resultPath, thumbnailPath })
  } catch (err) {
    res.status(500).json({ ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 1000) })
  } finally {
    fs.rmSync(inPath, { force: true }); fs.rmSync(ovPath, { force: true }); fs.rmSync(outPath, { force: true }); fs.rmSync(thumbPath, { force: true })
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  // Nouveau mode : incrustation d'une image/vidéo positionnée + timée.
  if (req.body && req.body.mode === 'media') return handleMediaOverlay(req, res)

  const {
    videoUrl, storagePath, caption, userId,
    bucket    = 'content',
    position  = 'bottom',
    fontSize  = 52,
    fontColor = '#ffffff',
    // Placement libre (fractions 0..1 du CENTRE du texte) quand position==='custom'.
    posX, posY,
    // Spoof intégré : nettoie toujours les métadonnées ; injecte un GPS si gpsSpoof.
    gpsSpoof = false, gpsCity = 'random',
    // Piste audio MP3 optionnelle (remplace le son d'origine), depuis la banque.
    audioStoragePath,
    supabaseToken, supabaseAnonKey,
  } = req.body ?? {}

  if ((!videoUrl && !storagePath) || !caption)
    return res.status(400).json({ ok: false, error: 'Missing videoUrl/storagePath or caption' })

  const supabase = getSupabaseAdmin({ supabaseToken, supabaseAnonKey })
  const ts       = Date.now()
  const tmpDir   = os.tmpdir()
  const inputPath   = path.join(tmpDir, `mix_in_${ts}.mp4`)
  const overlayPath = path.join(tmpDir, `mix_ov_${ts}.png`)
  const assPath     = path.join(tmpDir, `mix_as_${ts}.ass`)
  const audioPath   = path.join(tmpDir, `mix_au_${ts}.mp3`)
  const outPath     = path.join(tmpDir, `mix_out_${ts}.mov`)

  const isCustom = position === 'custom' && Number.isFinite(Number(posX)) && Number.isFinite(Number(posY))

  try {
    // ── Download source video ────────────────────────────────────────────────
    if (videoUrl) {
      // anti-SSRF : uniquement une URL de la banque Supabase ; suit les
      // redirections (Supabase → CDN) en re-validant chaque saut.
      const resp = await fetchMediaFollow(videoUrl, { timeoutMs: 120000 })
      if (!resp.ok) return res.status(400).json({ ok: false, error: `Failed to fetch video: ${resp.status}` })
      fs.writeFileSync(inputPath, Buffer.from(await resp.arrayBuffer()))
    } else {
      if (!isOwnStoragePath(storagePath)) return res.status(400).json({ ok: false, error: 'chemin storage non autorisé' })
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath)
      if (dlErr) return res.status(400).json({ ok: false, error: dlErr.message })
      fs.writeFileSync(inputPath, Buffer.from(await blob.arrayBuffer()))
    }

    // ── Optional MP3 audio track (from the bank) ─────────────────────────────
    let hasAudio = false
    if (audioStoragePath && isOwnStoragePath(audioStoragePath)) {
      const { data: aBlob, error: aErr } = await supabase.storage.from(bucket).download(audioStoragePath)
      if (aErr) throw new Error(`audio: ${aErr.message}`)
      fs.writeFileSync(audioPath, Buffer.from(await aBlob.arrayBuffer()))
      hasAudio = true
    }

    // ── GPS metadata (ISO 6709) + city label, resolved server-side ───────────
    let gpsMeta = null
    if (gpsSpoof) {
      const key = resolveCityKey(gpsCity)
      gpsMeta = buildGpsMetadataArgs(key, { wide: gpsCity === 'random_usa' })
    }

    // ── Common tail : strip source metadata, (opt.) inject GPS, .mov muxer ────
    // On nettoie TOUJOURS les métadonnées d'origine (`-map_metadata -1`) : une
    // vidéo re-postée ne doit pas trimballer les tags du fichier source.
    const buildTail = () => {
      const tail = [
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-max_muxing_queue_size', '9999',
        '-c:a', 'aac', '-b:a', '128k',
        '-map_metadata', '-1', '-map_chapters', '-1',
      ]
      if (gpsMeta) tail.push(...gpsMeta.args, '-movflags', 'use_metadata_tags+faststart')
      else tail.push('-movflags', '+faststart')
      tail.push('-y', outPath)
      return tail
    }

    // ── Build caption overlay ─────────────────────────────────────────────────
    // Primary: sharp Pango text → PNG overlay composited via ffmpeg overlay filter.
    // Fallback: if Pango/sharp fails → ASS subtitle file → ffmpeg subtitles filter.
    let ffArgs
    try {
      const fontPath = (() => {
        const p = path.join(__dirname, 'fonts', 'font-bold.ttf')
        return fs.existsSync(p) ? p : null
      })()
      const family = fontPath ? fontFamilyName(fs.readFileSync(fontPath)) : null
      const { buf: overlayBuf, w: ovW, h: ovH } =
        await buildCaptionOverlay(String(caption), Number(fontSize), String(fontColor), fontPath, family)

      if (!overlayBuf || !overlayBuf.length) throw new Error('sharp returned empty buffer')
      fs.writeFileSync(overlayPath, overlayBuf)

      const clampI = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
      const ox = isCustom
        ? clampI(Math.round(Number(posX) * VW - ovW / 2), 0, VW - ovW)
        : Math.round((VW - ovW) / 2)
      const oy = isCustom
        ? clampI(Math.round(Number(posY) * VH - ovH / 2), 0, VH - ovH)
        : position === 'top' ? 120
        : (position === 'center' || position === 'middle') ? Math.round((VH - ovH) / 2)
        : VH - ovH - 130

      // 0 = vidéo, 1 = overlay png, (2 = audio mp3 si présent)
      const inputs = ['-i', inputPath, '-i', overlayPath]
      if (hasAudio) inputs.push('-stream_loop', '-1', '-i', audioPath)
      const audioMap = hasAudio ? ['-map', '2:a:0', '-shortest'] : ['-map', '0:a?']

      const filterComplex =
        `[0:v]scale=${VW}:${VH}:force_original_aspect_ratio=decrease,` +
        `pad=${VW}:${VH}:-1:-1:color=black,setsar=1[bg];` +
        `[bg][1:v]overlay=${ox}:${oy}[vout]`

      ffArgs = [
        '-nostdin', '-threads', '0',
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[vout]', ...audioMap,
        ...buildTail(),
      ]
    } catch (_sharpErr) {
      // Fallback: burn caption via ASS subtitle — works without Pango system libs
      fs.writeFileSync(assPath, buildAssFile(String(caption), Number(fontSize), String(fontColor), position, isCustom ? { x: Number(posX), y: Number(posY) } : null))

      // ffmpeg subtitles filter path: escape colons/backslashes for the filter option
      const safeAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
      const filterComplex =
        `[0:v]scale=${VW}:${VH}:force_original_aspect_ratio=decrease,` +
        `pad=${VW}:${VH}:-1:-1:color=black,setsar=1,` +
        `subtitles=${safeAssPath}[vout]`

      const inputs = ['-i', inputPath]
      if (hasAudio) inputs.push('-stream_loop', '-1', '-i', audioPath)
      const audioMap = hasAudio ? ['-map', '1:a:0', '-shortest'] : ['-map', '0:a?']

      ffArgs = [
        '-nostdin', '-threads', '0',
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[vout]', ...audioMap,
        ...buildTail(),
      ]
    }

    try {
      await execFileAsync(ffmpegPath, ffArgs, { maxBuffer: 100 * 1024 * 1024 })
    } catch (ffErr) {
      const stderr = (ffErr.stderr ?? '').slice(-800)
      throw new Error(`FFmpeg: ${stderr || ffErr.message}`)
    }

    // ── Upload result ────────────────────────────────────────────────────────
    const resultPath = userId
      ? `videos/users/${userId}/mix-out-${ts}_${Math.random().toString(36).slice(2)}.mov`
      : `mix-results/${ts}_${Math.random().toString(36).slice(2)}.mov`

    const outBuf = fs.readFileSync(outPath)
    const { error: upErr } = await supabase.storage.from(bucket).upload(resultPath, outBuf, {
      contentType: 'video/quicktime', upsert: true,
    })
    if (upErr) throw new Error(upErr.message)

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(resultPath)
    res.json({ ok: true, url: publicUrl, storagePath: resultPath, gps: gpsMeta ? gpsMeta.city : null })
  } catch (err) {
    res.status(500).json({ ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 1000) })
  } finally {
    fs.rmSync(inputPath,   { force: true })
    fs.rmSync(overlayPath, { force: true })
    fs.rmSync(assPath,     { force: true })
    fs.rmSync(audioPath,   { force: true })
    fs.rmSync(outPath,     { force: true })
  }
}

module.exports.config = { maxDuration: 300, memory: 3008 }
