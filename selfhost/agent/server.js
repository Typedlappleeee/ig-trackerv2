// Agent « cloud phones maison » — à faire tourner SUR TON SERVEUR.
// Pilote des instances Android (Redroid) et les expose à ScaleFlow via une petite
// API HTTP protégée par un token. ScaleFlow ne parle jamais à Docker/ADB
// directement : il passe par cet agent.
//
// Endpoints (tous protégés par l'en-tête `Authorization: Bearer <AGENT_TOKEN>`) :
//   GET    /health                     → état de l'agent
//   GET    /instances                  → liste des téléphones
//   POST   /instances    { name, proxy? , androidVersion? } → en crée un
//   DELETE /instances/:id              → le supprime
//   POST   /instances/:id/start|stop   → démarre / arrête
//   POST   /instances/:id/shell { cmd } → commande ADB (base de l'automatisation)
//   GET    /instances/:id/screenshot   → capture PNG (base64)
//   POST   /instances/:id/install { url } → télécharge un APK et l'installe (sideload)
//
// Chaque nouveau téléphone (Android 15, image officielle redroid) reçoit
// automatiquement Aurora Store dès que le boot est fini (voir
// provisionAuroraStore) — l'équivalent open-source du Play Store, sans compte
// Google ni image tierce à risque.
//
// Démarrage : AGENT_TOKEN=... node server.js   (voir README.md)

const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)

const PORT = Number(process.env.PORT || 8787)
const TOKEN = process.env.AGENT_TOKEN || ''
// Image officielle redroid (éditeur officiel, pas de GApps intégré). Android 15
// par défaut — Play Store remplacé par Aurora Store (open-source, catalogue Play
// complet, sans compte Google), auto-installé sur chaque nouveau téléphone
// juste après son 1er boot (voir provisionAuroraStore). Pas de dépendance à une
// image tierce inconnue tournant en --privileged.
const IMAGE_DEFAULT = 'redroid/redroid:15.0.0-latest'
// Variantes GApps (Play Store/Gmail réels) — build tiers (edwardzhouquan), pas
// l'éditeur officiel ; option explicite via androidVersion pour qui les préfère
// à Aurora Store. https://hub.docker.com/r/edwardzhouquan/redroid-mindthegapps-arm64
const GAPPS_IMAGES = {
  '13.0.0': 'edwardzhouquan/redroid-mindthegapps-arm64:13.0.0-arm64_only',
  '14.0.0': 'edwardzhouquan/redroid-mindthegapps-arm64:14.0.0-arm64_only',
}
const IMAGE = process.env.REDROID_IMAGE || IMAGE_DEFAULT
const DATA_ROOT = process.env.DATA_ROOT || '/var/lib/scaleflow-phones'
const PORT_BASE = Number(process.env.PORT_BASE || 5600)   // port ADB de la 1re instance

if (!TOKEN) { console.error('AGENT_TOKEN manquant — refus de démarrer (sécurité).'); process.exit(1) }

const sh = async (cmd, args, timeout = 60000) => {
  const { stdout } = await execFileAsync(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 })
  return stdout
}
const docker = (args, t) => sh('docker', args, t)
const adb = (args, t) => sh('adb', args, t)

const NAME_RE = /^[a-zA-Z0-9_-]{1,40}$/          // évite toute injection dans les args
const cname = (id) => `sfphone_${id}`

// Liste les instances (conteneurs Redroid gérés par nous).
async function listInstances() {
  const out = await docker(['ps', '-a', '--filter', 'name=sfphone_', '--format', '{{.Names}}|{{.State}}|{{.Ports}}'])
  return out.trim().split('\n').filter(Boolean).map(line => {
    const [name, state, ports] = line.split('|')
    const id = name.replace(/^sfphone_/, '')
    const m = /0\.0\.0\.0:(\d+)->5555/.exec(ports || '')
    return { id, name: id, state, adbPort: m ? Number(m[1]) : null, serial: m ? `127.0.0.1:${m[1]}` : null }
  })
}

// Trouve un port ADB libre pour une nouvelle instance.
async function nextPort() {
  // IMPORTANT : on lit le port configuré de CHAQUE container (même arrêté) via
  // `docker inspect`. `docker ps` n'affiche le mapping que pour les containers
  // EN MARCHE → un tel arrêté apparaîtrait « sans port » et on réattribuerait
  // le sien à un nouveau tel → deux tel sur le même port hôte = collision, ni
  // l'un ni l'autre ne démarre. inspect voit le port même à l'arrêt.
  const out = await docker(['ps', '-a', '--filter', 'name=sfphone_', '--format', '{{.Names}}'])
  const names = out.split('\n').map(s => s.trim()).filter(Boolean)
  const used = new Set()
  for (const n of names) {
    try {
      const insp = await docker(['inspect', '-f',
        '{{range $k,$v := .HostConfig.PortBindings}}{{range $v}}{{.HostPort}} {{end}}{{end}}', n])
      insp.split(/\s+/).filter(Boolean).forEach(hp => used.add(Number(hp)))
    } catch { /* container en cours de suppression : on ignore */ }
  }
  let p = PORT_BASE
  while (used.has(p)) p++
  return p
}

// Empreinte d'appareil aléatoire : chaque téléphone doit paraître unique.
const MODELS = [
  { brand: 'samsung', model: 'SM-S911B', device: 'dm1q', name: 'Galaxy S23' },
  { brand: 'samsung', model: 'SM-A546B', device: 'a54x',  name: 'Galaxy A54' },
  { brand: 'google',  model: 'Pixel 7',  device: 'panther', name: 'Pixel 7' },
  { brand: 'google',  model: 'Pixel 8',  device: 'shiba',   name: 'Pixel 8' },
  { brand: 'xiaomi',  model: '2211133C', device: 'fuxi',    name: 'Xiaomi 13' },
]
const rnd = (a) => a[Math.floor(Math.random() * a.length)]
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')

async function createInstance({ name, androidVersion }) {
  if (!NAME_RE.test(name || '')) throw new Error('nom invalide (a-z, 0-9, _ et - uniquement)')
  const port = await nextPort()
  const m = rnd(MODELS)
  // GApps dispo seulement pour certaines versions (build tiers) — sinon on
  // retombe sur l'image officielle redroid (sans Play Store).
  const image = androidVersion
    ? (GAPPS_IMAGES[androidVersion] || `redroid/redroid:${androidVersion}-latest`)
    : IMAGE
  // Chaque instance a ses propres props → empreinte distincte.
  const props = [
    `ro.product.brand=${m.brand}`, `ro.product.model=${m.model}`, `ro.product.device=${m.device}`,
    `ro.product.manufacturer=${m.brand}`, `ro.serialno=${hex(16)}`,
    'redroid.width=1080', 'redroid.height=1920', 'redroid.dpi=420',
    'redroid.gpu.mode=guest',            // rendu logiciel (pas de GPU requis)
  ]
  await docker(['run', '-d', '--privileged', '--restart', 'unless-stopped',
    '--name', cname(name),
    '-v', `${DATA_ROOT}/${name}:/data`,
    '-p', `${port}:5555`,
    image, ...props,
  ], 180000)
  const serial = `127.0.0.1:${port}`
  // Ne bloque pas la réponse HTTP : le boot Android + l'installation d'Aurora
  // Store prennent 1-2 min, en tâche de fond pendant que l'UI affiche déjà le
  // téléphone (en cours de connexion).
  provisionAuroraStore(serial).catch((e) => console.error(`[provision ${name}]`, e?.message || e))
  return { id: name, adbPort: port, serial, fingerprint: m }
}

async function connectAdb(serial) {
  try { await adb(['connect', serial], 15000) } catch { /* déjà connecté */ }
}

const MAX_APK_BYTES = 300 * 1024 * 1024   // 300 Mo

// Télécharge un APK (http/https uniquement) et l'installe en sideload.
// -g accorde direct toutes les permissions runtime demandées (pas de popup à
// valider manuellement — indispensable pour de l'automatisation).
async function installApk(serial, apkUrl) {
  if (!/^https?:\/\//i.test(apkUrl)) throw new Error('URL APK invalide (http/https uniquement)')
  const r = await fetch(apkUrl, { signal: AbortSignal.timeout(120000) })
  if (!r.ok) throw new Error(`téléchargement APK échoué (HTTP ${r.status})`)
  const len = Number(r.headers.get('content-length') || 0)
  if (len && len > MAX_APK_BYTES) throw new Error('APK trop volumineux (>300 Mo)')
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > MAX_APK_BYTES) throw new Error('APK trop volumineux (>300 Mo)')
  const tmpFile = path.join(os.tmpdir(), `sf-apk-${Date.now()}-${Math.random().toString(36).slice(2)}.apk`)
  fs.writeFileSync(tmpFile, buf)
  try {
    return await adb(['-s', serial, 'install', '-r', '-g', tmpFile], 180000)
  } finally {
    fs.unlink(tmpFile, () => {})
  }
}

const MAX_VIDEO_BYTES = 500 * 1024 * 1024   // 500 Mo

// Pousse un buffer vidéo dans /sdcard/Movies du tel + indexation MediaStore
// (visible immédiatement dans la galerie). Base commune upload URL / fichier.
async function pushBuffer(serial, buf) {
  if (!buf || !buf.length) throw new Error('vidéo vide')
  if (buf.length > MAX_VIDEO_BYTES) throw new Error('vidéo trop volumineuse (>500 Mo)')
  const base = `sf-${Date.now()}.mp4`
  const tmpFile = path.join(os.tmpdir(), base)
  fs.writeFileSync(tmpFile, buf)
  const dest = `/sdcard/Movies/${base}`
  try {
    await adb(['-s', serial, 'push', tmpFile, dest], 300000)
    await adb(['-s', serial, 'shell', 'am', 'broadcast', '-a',
      'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file://${dest}`], 20000).catch(() => {})
    return dest
  } finally {
    fs.unlink(tmpFile, () => {})
  }
}

// Télécharge une vidéo (http/https) côté serveur puis la pousse sur le tel.
async function pushVideo(serial, videoUrl) {
  if (!/^https?:\/\//i.test(videoUrl)) throw new Error('URL vidéo invalide (http/https uniquement)')
  const r = await fetch(videoUrl, { signal: AbortSignal.timeout(180000) })
  if (!r.ok) throw new Error(`téléchargement vidéo échoué (HTTP ${r.status})`)
  return pushBuffer(serial, Buffer.from(await r.arrayBuffer()))
}

// Résout toujours la dernière version d'Aurora Store via l'API F-Droid (évite
// de coder en dur un numéro de version qui périmerait). Aurora Store = client
// Play Store open-source/anonyme (catalogue Google Play complet, sans compte
// Google) — notre "app store par défaut" à la place de GApps/Play Store réel.
async function latestAuroraStoreUrl() {
  return fdroidApkUrl('com.aurora.store')
}

// Résout la dernière version d'un paquet F-Droid (par son nom de paquet) → URL
// d'APK directe. Générique : sert pour Aurora et pour les installs 1-clic
// d'outils (Material Files…). Toujours la dernière version, pas d'URL périmée.
async function fdroidApkUrl(pkg) {
  const r = await fetch(`https://f-droid.org/api/v1/packages/${pkg}`, { signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`F-Droid : paquet introuvable (HTTP ${r.status})`)
  const { suggestedVersionCode } = await r.json()
  if (!suggestedVersionCode) throw new Error('F-Droid : version introuvable')
  return `https://f-droid.org/repo/${pkg}_${suggestedVersionCode}.apk`
}
async function installFdroid(serial, pkg) {
  return installApk(serial, await fdroidApkUrl(pkg))
}

// Attend que le téléphone ait fini de booter (jusqu'à ~2 min) puis installe
// Aurora Store — tourne en tâche de fond, jamais devant l'appel HTTP de create.
async function provisionAuroraStore(serial) {
  for (let i = 0; i < 60; i++) {
    await connectAdb(serial)
    try {
      const out = await adb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], 10000)
      if (out.trim() === '1') break
    } catch { /* ADB pas encore prêt */ }
    await new Promise((res) => setTimeout(res, 2000))
  }
  const url = await latestAuroraStoreUrl()
  await installApk(serial, url)
}

// Teste un proxy : se connecte AU TRAVERS et récupère l'IP sortante + l'ISP
// (via ip-api.com). curl gère socks5h (résolution DNS côté proxy) et http.
async function checkProxy(p) {
  if (!p || !p.host || !p.port) return { ok: true, reachable: false, error: 'proxy incomplet' }
  const scheme = (p.type === 'http') ? 'http' : 'socks5h'
  // Auth via -U (pas dans l'URL) → robuste aux caractères spéciaux du mot de passe.
  const args = ['-s', '--max-time', '20', '-x', `${scheme}://${p.host}:${p.port}`]
  if (p.username) args.push('-U', `${p.username}:${p.password || ''}`)
  args.push('http://ip-api.com/json')
  try {
    const out = await sh('curl', args, 25000)
    let j = null; try { j = JSON.parse(out) } catch { return { ok: true, reachable: false, error: 'réponse invalide : ' + String(out).slice(0, 80) } }
    if (j && j.status === 'success') return { ok: true, reachable: true, ip: j.query, isp: j.isp, country: j.country, countryCode: j.countryCode, city: j.city }
    return { ok: true, reachable: false, error: (j && j.message) || 'échec' }
  } catch (e) {
    return { ok: true, reachable: false, error: (e && e.message ? String(e.message) : 'échec').slice(0, 150) }
  }
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }

const server = http.createServer(async (req, res) => {
  // CORS : l'upload de fichier se fait EN DIRECT navigateur → agent (un gros
  // fichier ne peut pas transiter par le proxy serverless). On autorise donc
  // l'origine à appeler l'agent ; le token Bearer reste le vrai garde-fou.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Auth : token partagé, obligatoire sur toutes les routes.
  const auth = req.headers['authorization'] || ''
  if (auth !== `Bearer ${TOKEN}`) return json(res, 401, { ok: false, error: 'non autorisé' })

  const url = new URL(req.url, 'http://x')
  const parts = url.pathname.split('/').filter(Boolean)
  // Lecture du corps : binaire brut pour /pushfile (upload vidéo), JSON sinon.
  const isFileUpload = parts[2] === 'pushfile'
  let body = {}
  let fileBuf = null
  if (req.method === 'POST') {
    const raw = await new Promise(r => { const a = []; req.on('data', c => a.push(c)); req.on('end', () => r(Buffer.concat(a))) })
    if (isFileUpload) fileBuf = raw
    else { try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {} } catch { return json(res, 400, { ok: false, error: 'json invalide' }) } }
  }

  try {
    if (parts[0] === 'health') return json(res, 200, { ok: true, image: IMAGE })
    if (parts[0] === 'proxy' && parts[1] === 'check' && req.method === 'POST') return json(res, 200, await checkProxy(body))

    if (parts[0] === 'instances' && parts.length === 1) {
      if (req.method === 'GET')  return json(res, 200, { ok: true, instances: await listInstances() })
      if (req.method === 'POST') return json(res, 200, { ok: true, instance: await createInstance(body) })
    }

    if (parts[0] === 'instances' && parts[1]) {
      const id = parts[1]
      if (!NAME_RE.test(id)) return json(res, 400, { ok: false, error: 'id invalide' })
      const inst = (await listInstances()).find(i => i.id === id)

      if (req.method === 'DELETE') {
        await docker(['rm', '-f', cname(id)], 60000).catch(() => {})
        // Le container part, mais son /data monté (${DATA_ROOT}/${id}) reste sur
        // le disque et pèse plusieurs Go. On le supprime aussi, sinon l'espace
        // n'est jamais libéré. (id est déjà validé par NAME_RE → pas d'injection.)
        await sh('rm', ['-rf', `${DATA_ROOT}/${id}`], 60000).catch(() => {})
        return json(res, 200, { ok: true })
      }
      if (parts[2] === 'start') { await docker(['start', cname(id)], 60000); return json(res, 200, { ok: true }) }
      if (parts[2] === 'stop')  { await docker(['stop',  cname(id)], 60000); return json(res, 200, { ok: true }) }

      if (!inst?.serial) return json(res, 409, { ok: false, error: 'instance non démarrée' })
      await connectAdb(inst.serial)

      if (parts[2] === 'shell' && req.method === 'POST') {
        const out = await adb(['-s', inst.serial, 'shell', String(body.cmd ?? '')], Number(body.timeout) || 60000)
        return json(res, 200, { ok: true, output: out })
      }
      if (parts[2] === 'screenshot') {
        const png = await execFileAsync('adb', ['-s', inst.serial, 'exec-out', 'screencap', '-p'],
          { timeout: 30000, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' })
        return json(res, 200, { ok: true, dataUrl: `data:image/png;base64,${png.stdout.toString('base64')}` })
      }
      if (parts[2] === 'install' && req.method === 'POST') {
        const out = await installApk(inst.serial, String(body.url || ''))
        return json(res, 200, { ok: true, output: out })
      }
      if (parts[2] === 'push' && req.method === 'POST') {
        const out = await pushVideo(inst.serial, String(body.url || ''))
        return json(res, 200, { ok: true, output: out })
      }
      if (parts[2] === 'pushfile' && req.method === 'POST') {
        const out = await pushBuffer(inst.serial, fileBuf)
        return json(res, 200, { ok: true, output: out })
      }
      if (parts[2] === 'installfdroid' && req.method === 'POST') {
        const out = await installFdroid(inst.serial, String(body.pkg || ''))
        return json(res, 200, { ok: true, output: out })
      }
    }
    return json(res, 404, { ok: false, error: 'route inconnue' })
  } catch (e) {
    return json(res, 500, { ok: false, error: (e && e.message) ? String(e.message).slice(0, 500) : 'erreur' })
  }
})

server.listen(PORT, () => console.log(`[scaleflow-agent] écoute sur :${PORT}`))
