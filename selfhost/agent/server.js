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
//
// Démarrage : AGENT_TOKEN=... node server.js   (voir README.md)

const http = require('http')
const { execFile } = require('child_process')
const { promisify } = require('util')
const execFileAsync = promisify(execFile)

const PORT = Number(process.env.PORT || 8787)
const TOKEN = process.env.AGENT_TOKEN || ''
// Image Redroid ARM (Android natif ARM = bien plus proche d'un vrai téléphone).
const IMAGE = process.env.REDROID_IMAGE || 'redroid/redroid:13.0.0-arm64'
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
  const list = await listInstances()
  const used = new Set(list.map(i => i.adbPort).filter(Boolean))
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
  const image = androidVersion ? `redroid/redroid:${androidVersion}-arm64` : IMAGE
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
  return { id: name, adbPort: port, serial: `127.0.0.1:${port}`, fingerprint: m }
}

async function connectAdb(serial) {
  try { await adb(['connect', serial], 15000) } catch { /* déjà connecté */ }
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }

const server = http.createServer(async (req, res) => {
  // Auth : token partagé, obligatoire sur toutes les routes.
  const auth = req.headers['authorization'] || ''
  if (auth !== `Bearer ${TOKEN}`) return json(res, 401, { ok: false, error: 'non autorisé' })

  const url = new URL(req.url, 'http://x')
  const parts = url.pathname.split('/').filter(Boolean)
  let body = {}
  if (req.method === 'POST') {
    const raw = await new Promise(r => { let d = ''; req.on('data', c => { d += c }); req.on('end', () => r(d)) })
    try { body = raw ? JSON.parse(raw) : {} } catch { return json(res, 400, { ok: false, error: 'json invalide' }) }
  }

  try {
    if (parts[0] === 'health') return json(res, 200, { ok: true, image: IMAGE })

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
    }
    return json(res, 404, { ok: false, error: 'route inconnue' })
  } catch (e) {
    return json(res, 500, { ok: false, error: (e && e.message) ? String(e.message).slice(0, 500) : 'erreur' })
  }
})

server.listen(PORT, () => console.log(`[scaleflow-agent] écoute sur :${PORT}`))
