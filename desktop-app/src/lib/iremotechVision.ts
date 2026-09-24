// Automatisation iRemoTech par VISION : on lit l'écran (OCR) pour trouver le bon
// container Crane dans le sélecteur « Select Container » et taper dessus, en scrollant
// tout seul si besoin. Bien plus fiable que des coordonnées devinées : on VÉRIFIE
// ce qu'on voit avant de taper, et ça s'adapte au scroll.
import { snapshot, sendAction } from './iremotech'
import { ocrWords } from './ocr'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function imgSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise(res => {
    const i = new Image()
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight })
    i.onerror = () => res({ w: 0, h: 0 })
    i.src = dataUrl
  })
}

export interface VisionHooks { log?: (m: string) => void; shouldStop?: () => boolean }

// Cherche le container `target` (ex. "12" ou "Default") dans le sélecteur affiché à
// l'écran et tape dessus. Scrolle haut/bas jusqu'à le trouver. true si tapé.
export async function findAndTapContainer(key: string, deviceId: string, target: string, hooks?: VisionHooks): Promise<boolean> {
  const wanted = target.trim()
  const wantedNum = /^\d+$/.test(wanted) ? parseInt(wanted) : null
  const isDefault = /^default$/i.test(wanted)
  const whitelist = '0123456789Defaultefaul'
  const maxSteps = 12
  let lastDir = 0
  let sawSheet = false
  for (let step = 0; step < maxSteps; step++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (!shot) { hooks?.log?.('⚠ snapshot indisponible'); await sleep(700); continue }
    const { w: W, h: H } = await imgSize(shot)
    if (!W || !H) { hooks?.log?.('⚠ image illisible'); await sleep(500); continue }
    const words = await ocrWords(shot, whitelist)
    // Libellés plausibles de container : chiffres purs ou "Default", dans la moitié basse.
    const rows = words.filter(o => o.text && (/^\d{1,3}$/.test(o.text) || /^default$/i.test(o.text)) && o.cy > H * 0.30)
    if (rows.length) sawSheet = true
    hooks?.log?.(`👁 lu : ${rows.map(r => r.text).join(', ') || '(rien)'}`)
    // Cible visible ?
    const hit = rows.find(o => isDefault ? /^default$/i.test(o.text) : o.text === wanted)
    if (hit) {
      hooks?.log?.(`🎯 « ${wanted} » trouvé → tap (${hit.cx}, ${hit.cy})`)
      await sendAction(key, deviceId, { type: 'tap', x: hit.cx, y: hit.cy })
      return true
    }
    // Sens de scroll à partir des numéros lus.
    const nums = rows.map(r => (/^\d+$/.test(r.text) ? parseInt(r.text) : NaN)).filter(n => !isNaN(n))
    let dir = 1 // 1 = révéler vers le bas (numéros plus grands) ; -1 = vers le haut
    if (isDefault) dir = -1
    else if (wantedNum != null && nums.length) {
      const minV = Math.min(...nums), maxV = Math.max(...nums)
      if (wantedNum < minV) dir = -1
      else if (wantedNum > maxV) dir = 1
      else dir = lastDir || 1 // dans la plage mais OCR raté → même sens
    }
    lastDir = dir
    const x = Math.round(W * 0.5)
    const y1 = dir > 0 ? Math.round(H * 0.72) : Math.round(H * 0.45)
    const y2 = dir > 0 ? Math.round(H * 0.45) : Math.round(H * 0.72)
    hooks?.log?.(`↕ scroll ${dir > 0 ? 'bas' : 'haut'}…`)
    await sendAction(key, deviceId, { type: 'swipe', x1: x, y1, x2: x, y2, duration_ms: 450 })
    await sleep(750)
  }
  hooks?.log?.(sawSheet ? `❌ « ${wanted} » introuvable après ${maxSteps} essais` : '❌ sélecteur « Select Container » non détecté à l’écran')
  return false
}

// Tape l'icône Instagram sur l'écran d'accueil (repérée par OCR). C'est CE geste qui
// déclenche le sélecteur Crane — l'ouverture par open_url ne le déclenche pas.
// Cherche sur jusqu'à 3 pages d'accueil (swipe). true si tapé.
async function tapInstagramIcon(key: string, deviceId: string, hooks?: VisionHooks): Promise<boolean> {
  for (let page = 0; page < 3; page++) {
    if (hooks?.shouldStop?.()) return false
    const shot = await snapshot(key, deviceId)
    if (!shot) { await sleep(700); continue }
    const { w: W, h: H } = await imgSize(shot)
    if (!W || !H) { await sleep(500); continue }
    const words = await ocrWords(shot) // texte complet (pas de whitelist)
    const ig = words.find(o => /instagram/i.test(o.text) || /^nstagram$/i.test(o.text))
    if (ig) {
      const ty = Math.max(0, ig.cy - Math.round(H * 0.035)) // viser l'icône, juste au-dessus du libellé
      hooks?.log?.(`📸 icône Instagram repérée → tap (${ig.cx}, ${ty})`)
      await sendAction(key, deviceId, { type: 'tap', x: ig.cx, y: ty })
      return true
    }
    hooks?.log?.('🔎 Instagram pas sur cette page → page suivante')
    await sendAction(key, deviceId, { type: 'swipe', x1: Math.round(W * 0.82), y1: Math.round(H * 0.6), x2: Math.round(W * 0.18), y2: Math.round(H * 0.6), duration_ms: 350 })
    await sleep(900)
  }
  return false
}

// Ouvre Instagram (via l'icône → déclenche le sélecteur Crane) puis sélectionne le container.
export async function selectContainerByVision(key: string, deviceId: string, target: string, hooks?: VisionHooks): Promise<boolean> {
  hooks?.log?.('🏠 Retour à l’écran d’accueil…')
  await sendAction(key, deviceId, { type: 'press', name: 'home' })
  await sleep(1200)
  hooks?.log?.('📲 Recherche de l’icône Instagram…')
  const opened = await tapInstagramIcon(key, deviceId, hooks)
  if (!opened) { hooks?.log?.('❌ Icône Instagram introuvable sur l’accueil (mets-la sur la 1re page).'); return false }
  await sleep(2800) // laisse le sélecteur Crane apparaître
  return findAndTapContainer(key, deviceId, target, hooks)
}
