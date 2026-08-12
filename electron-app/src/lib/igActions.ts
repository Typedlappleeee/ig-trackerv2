// Actions d'engagement Instagram (like, follow, stories, scrape) — inspirées de
// GramAddict (open-source) : on réutilise ses resource-ids Instagram maintenus.
// Ces actions font des BOUCLES + de la lecture d'écran (donc du code, pas de
// simples étapes) ; elles sont exposées comme "actions" utilisables dans un flow
// via le type d'étape { do:'action', name, params }.
//
// ⚠️ Rythme humain volontaire (pauses aléatoires) pour limiter les « action
// blocked ». Les resource-ids IG peuvent bouger selon la version → fallbacks.
import { cloudPhones } from './cloudPhones'
import { dumpUi, tap, dismissPopups, find, typeText, keys, type Matcher } from './phoneAutomation'

type Logger = (m: string) => void
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const jitter = (base: number, extra: number) => base + Math.floor(Math.random() * extra)   // rythme humain
const openProfile = (id: string, user: string) =>
  cloudPhones.shell(id, `am start -a android.intent.action.VIEW -d 'instagram://user?username=${user.replace(/^@/, '').replace(/'/g, '')}'`)

// ── Préparer le tel : navigation 3 boutons (évite le "home" au swipe du bas)
// + animations réduites (automatisation plus rapide/stable). Idempotent.
export async function prepDevice(id: string, _params: Record<string, unknown>, log: Logger): Promise<void> {
  await cloudPhones.shell(id, 'settings put secure navigation_mode 0').catch(() => {})           // 3 boutons
  await cloudPhones.shell(id, 'cmd overlay enable com.android.internal.systemui.navbar.threebutton').catch(() => {})
  await cloudPhones.shell(id, 'settings put global window_animation_scale 0.5').catch(() => {})
  await cloudPhones.shell(id, 'settings put global transition_animation_scale 0.5').catch(() => {})
  log('  ⚙️ tel préparé (nav 3 boutons)')
}

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

// ── Regarder des reels (warmup) ─────────────────────────────────────────────
export async function watchReels(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const count = Number(params.count) || 5
  const doLike = /^(1|true|oui|yes)$/i.test(String(params.like ?? ''))
  await dismissPopups(id)
  // ouvre l'onglet Reels (nav) ; repli sur deep link
  const opened = await tap(id, { desc: 'Reels' }, { timeoutMs: 5000, retries: 1 }) || await tap(id, { contains: 'Reels' }, { timeoutMs: 3000 })
  if (!opened) await cloudPhones.shell(id, `am start -a android.intent.action.VIEW -d 'instagram://reels_home'`)
  await sleep(3500); await dismissPopups(id)
  let liked = 0
  for (let i = 0; i < count; i++) {
    await sleep(jitter(3500, 4000))  // on regarde le reel
    if (doLike && Math.random() < 0.4) {  // like ~40 % des reels (double-tap)
      await cloudPhones.shell(id, 'input tap 540 950'); await sleep(120); await cloudPhones.shell(id, 'input tap 540 950')
      liked++; log(`  ❤️ like`)
    }
    await cloudPhones.shell(id, 'input swipe 540 1500 540 500 300')  // reel suivant (swipe up)
    log(`  🎬 reel ${i + 1}/${count}`)
  }
  log(`✓ ${count} reels regardés${doLike ? ` · ${liked} like(s)` : ''}`)
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

// ── Édition du profil Instagram (nom, pseudo, bio, lien) ─────────────────────
// Traduction « cœur » du template GeeLark « Edit Instagram profile » pour les
// cloud phones. Chaque champ est optionnel : on ne touche qu'à ceux fournis.
// (Photo de profil = étape +1, nécessite de pousser l'image sur le tel.)
async function tapFirst(id: string, matchers: Matcher[], label: string, log: Logger, required = true): Promise<boolean> {
  for (const m of matchers) if (await tap(id, m, { timeoutMs: 5000, retries: 1 })) { log(`  ✓ ${label}`); return true }
  log(`  ${required ? '✗' : '·'} ${label}${required ? ' introuvable' : ' (sauté)'}`)
  return false
}
// Vide le champ actuellement focalisé (fin de ligne + rafale de suppressions).
async function clearFocused(id: string): Promise<void> {
  await cloudPhones.shell(id, 'input keyevent 123')                                  // MOVE_END
  await cloudPhones.shell(id, 'input keyevent ' + Array(160).fill('67').join(' '))   // 160× DEL
  await sleep(300)
}
// Ouvre un champ (par libellé), le vide, saisit la valeur, enregistre (Done).
async function editField(id: string, labels: Matcher[], value: string, label: string, log: Logger, confirmChange = false): Promise<void> {
  await dismissPopups(id)
  const nodes = await dumpUi(id)
  const row = labels.map(m => find(nodes, m)).find(Boolean)
  if (!row) { log(`  · ${label} : champ introuvable`); return }
  await cloudPhones.shell(id, `input tap ${row.cx} ${row.cy}`)
  await sleep(1300)
  const et = (await dumpUi(id)).find(n => /EditText/.test(n.cls))
  if (!et) { log(`  · ${label} : éditeur introuvable`); return }
  await cloudPhones.shell(id, `input tap ${et.cx} ${et.cy}`); await sleep(400)
  await clearFocused(id)
  await typeText(id, value); await sleep(600)
  await tapFirst(id, [{ desc: 'Done' }, { text: 'Done' }, { desc: 'Terminé' }, { text: 'OK' }], `${label} enregistré`, log, false)
  await sleep(1000)
  if (confirmChange) { await tapFirst(id, [{ text: 'Change name' }, { text: 'Changer le nom' }], 'Confirmation', log, false); await sleep(800) }
}

export async function editProfile(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const nickname  = String(params.nickname ?? '').trim()
  const username  = String(params.username ?? '').trim()
  const biography = String(params.biography ?? '').trim()
  const linkUrl   = String(params.linkUrl ?? '').trim()
  const linkTitle = String(params.linkTitle ?? '').trim()

  await dismissPopups(id)
  // Connecté ? (le template s'arrête si « Log in » est visible)
  if (find(await dumpUi(id), { desc: 'Log in' }) || find(await dumpUi(id), { text: 'Log in' })) {
    throw new Error('compte non connecté')
  }
  if (!await tapFirst(id, [{ id: 'profile_tab' }, { desc: 'Profile' }, { desc: 'Profil' }], 'Onglet Profil', log)) throw new Error('onglet profil')
  await sleep(1500); await dismissPopups(id)
  if (!await tapFirst(id, [{ desc: 'Edit profile' }, { text: 'Edit profile' }, { text: 'Modifier le profil' }, { desc: 'Modifier le profil' }], 'Modifier le profil', log)) throw new Error('bouton « Modifier le profil »')
  await sleep(1500)

  if (nickname)  await editField(id, [{ text: 'Name' }, { text: 'Nom' }], nickname, 'Nom', log, true)
  if (username)  await editField(id, [{ text: 'Username' }, { text: "Nom d'utilisateur" }], username, 'Pseudo', log)
  if (biography) await editField(id, [{ text: 'Bio' }], biography, 'Bio', log)
  if (linkUrl) {
    await dismissPopups(id)
    if (await tapFirst(id, [{ text: 'Add link' }, { text: 'Links' }, { text: 'Liens' }, { text: 'Ajouter un lien' }], 'Section liens', log, false)) {
      await sleep(1200)
      await tapFirst(id, [{ text: 'Add link' }, { text: 'Add external link' }, { text: 'Ajouter un lien' }], 'Ajouter un lien', log, false)
      await sleep(1200)
      const ets = (await dumpUi(id)).filter(n => /EditText/.test(n.cls))
      if (ets[0]) { await cloudPhones.shell(id, `input tap ${ets[0].cx} ${ets[0].cy}`); await sleep(300); await clearFocused(id); await typeText(id, linkUrl) }
      if (linkTitle && ets[1]) { await cloudPhones.shell(id, `input tap ${ets[1].cx} ${ets[1].cy}`); await sleep(300); await clearFocused(id); await typeText(id, linkTitle) }
      await sleep(500)
      await tapFirst(id, [{ desc: 'Done' }, { text: 'Done' }, { text: 'OK' }], 'Lien enregistré', log, false)
      await sleep(1000); await keys.back(id)
    }
  }
  log('✅ Profil mis à jour')
}

// Registre des actions disponibles dans un flow (do:'action', name:'...').
export const ACTIONS: Record<string, (id: string, params: Record<string, unknown>, log: Logger) => Promise<void>> = {
  prep_device: prepDevice,
  like_feed: likeFeed,
  watch_stories: watchStories,
  watch_reels: watchReels,
  follow_followers: followFollowers,
  scrape_followers: scrapeFollowers,
  edit_profile: editProfile,
}
