// Actions d'engagement Instagram (like, follow, stories, scrape) — inspirées de
// GramAddict (open-source) : on réutilise ses resource-ids Instagram maintenus.
// Ces actions font des BOUCLES + de la lecture d'écran (donc du code, pas de
// simples étapes) ; elles sont exposées comme "actions" utilisables dans un flow
// via le type d'étape { do:'action', name, params }.
//
// ⚠️ Rythme humain volontaire (pauses aléatoires) pour limiter les « action
// blocked ». Les resource-ids IG peuvent bouger selon la version → fallbacks.
import { cloudPhones } from './cloudPhones'
import { dumpUi, tap, dismissPopups } from './phoneAutomation'

type Logger = (m: string) => void
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const jitter = (base: number, extra: number) => base + Math.floor(Math.random() * extra)   // rythme humain
const openProfile = (id: string, user: string) =>
  cloudPhones.shell(id, `am start -a android.intent.action.VIEW -d 'instagram://user?username=${user.replace(/^@/, '').replace(/'/g, '')}'`)

// ── Like du feed ────────────────────────────────────────────────────────────
export async function likeFeed(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const count = Number(params.count) || 5
  let liked = 0, tries = 0
  while (liked < count && tries < count * 5) {
    tries++
    await dismissPopups(id)
    const nodes = await dumpUi(id)
    // bouton like du feed, PAS déjà liké (content-desc « Like » et non « Unlike »)
    const btn = nodes.find(n => n.clickable && n.id.endsWith('row_feed_button_like') && /^(like|j.?aime)$/i.test(n.desc.trim()))
    if (btn) { await cloudPhones.shell(id, `input tap ${btn.cx} ${btn.cy}`); liked++; log(`  ❤️ ${liked}/${count}`); await sleep(jitter(1200, 1600)) }
    await cloudPhones.shell(id, 'input swipe 540 1500 540 500 400'); await sleep(jitter(1500, 1800))
  }
  log(`✓ ${liked} like(s)`)
}

// ── Regarder des stories ────────────────────────────────────────────────────
export async function watchStories(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const count = Number(params.count) || 5
  await dismissPopups(id)
  const ring = (await dumpUi(id)).find(n => n.clickable && n.id.endsWith('reel_ring'))
  if (!ring) { log('  ✗ aucune story dispo dans le feed'); return }
  await cloudPhones.shell(id, `input tap ${ring.cx} ${ring.cy}`); await sleep(3000)
  for (let i = 0; i < count; i++) {
    await sleep(jitter(2500, 2200))
    await cloudPhones.shell(id, 'input tap 1000 900')  // tape côté droit → story suivante
    log(`  👁️ story ${i + 1}/${count}`)
  }
  await cloudPhones.shell(id, 'input keyevent 4')  // ferme
  log(`✓ ${count} stories`)
}

// ── Suivre les abonnés d'un compte cible (lead gen / croissance) ────────────
export async function followFollowers(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const target = String(params.target || '').replace(/^@/, '')
  const count = Number(params.count) || 10
  if (!target) { log('  ✗ compte cible manquant'); return }
  await openProfile(id, target); await sleep(3500); await dismissPopups(id)
  const opened = await tap(id, { id: 'row_profile_header_followers_container' }, { timeoutMs: 6000, retries: 1 })
    || await tap(id, { contains: 'abonné' }, { timeoutMs: 4000 })
    || await tap(id, { contains: 'follower' }, { timeoutMs: 4000 })
  if (!opened) { log('  ✗ liste des abonnés introuvable'); return }
  await sleep(2500); await dismissPopups(id)
  let followed = 0, dry = 0
  while (followed < count && dry < 5) {
    const btn = (await dumpUi(id)).find(n => n.clickable && /^(follow|suivre)$/i.test(n.text.trim()))
    if (btn) { await cloudPhones.shell(id, `input tap ${btn.cx} ${btn.cy}`); followed++; dry = 0; log(`  ➕ ${followed}/${count}`); await sleep(jitter(1500, 2200)) }
    else dry++
    await cloudPhones.shell(id, 'input swipe 540 1500 540 700 400'); await sleep(jitter(1400, 1200))
  }
  log(`✓ ${followed} abonnement(s)`)
}

// ── Scraper les pseudos des abonnés d'un compte (UI scraping, sans cookie) ──
export async function scrapeFollowers(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const target = String(params.target || '').replace(/^@/, '')
  const max = Number(params.max) || 100
  if (!target) { log('  ✗ compte cible manquant'); return }
  await openProfile(id, target); await sleep(3500); await dismissPopups(id)
  const opened = await tap(id, { id: 'row_profile_header_followers_container' }, { timeoutMs: 6000, retries: 1 })
    || await tap(id, { contains: 'abonné' }, { timeoutMs: 4000 })
    || await tap(id, { contains: 'follower' }, { timeoutMs: 4000 })
  if (!opened) { log('  ✗ liste des abonnés introuvable'); return }
  await sleep(2500)
  const set = new Set<string>()
  let dry = 0
  while (set.size < max && dry < 6) {
    const before = set.size
    ;(await dumpUi(id)).filter(n => n.id.endsWith('follow_list_username') && n.text.trim()).forEach(n => set.add(n.text.trim()))
    dry = set.size === before ? dry + 1 : 0
    log(`  📋 ${set.size}/${max}`)
    await cloudPhones.shell(id, 'input swipe 540 1500 540 600 400'); await sleep(jitter(1400, 1200))
  }
  const list = [...set].slice(0, max)
  log(`✓ ${list.length} pseudos récupérés :`)
  log(list.join(', '))
}

// Registre des actions disponibles dans un flow (do:'action', name:'...').
export const ACTIONS: Record<string, (id: string, params: Record<string, unknown>, log: Logger) => Promise<void>> = {
  like_feed: likeFeed,
  watch_stories: watchStories,
  follow_followers: followFollowers,
  scrape_followers: scrapeFollowers,
}
