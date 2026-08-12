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
import { generateTOTP } from './totp'

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

// ── Warmup Instagram (regarde des Reels + like/follow aléatoires) ────────────
// Traduction « cœur » du template GeeLark « Instagram AI account warmup ».
// count = nb de reels regardés ; keywords (optionnel) = recherche par mot-clé
// (réparti sur les mots-clés), sinon fil Reels direct. Engagement humain aléa.
export async function warmupReels(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const count = Math.max(1, Number(params.count) || 10)
  const kwRaw = String(params.keywords ?? '').trim()
  const keywords = kwRaw ? kwRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : []

  await dismissPopups(id)
  if (find(await dumpUi(id), { desc: 'Log in' }) || find(await dumpUi(id), { text: 'Log in' })) throw new Error('compte non connecté')

  // Regarde 1 reel : pause « humaine », engagement aléatoire, puis reel suivant.
  const watchOne = async (i: number, total: number) => {
    await sleep(jitter(4000, 4500))
    const r = Math.random()
    if (r < 0.30) {                                   // ~30 % : like (double-tap centre)
      await cloudPhones.shell(id, 'input tap 540 950'); await sleep(140); await cloudPhones.shell(id, 'input tap 540 950'); log('  ❤️ like')
    } else if (r < 0.40) {                            // ~10 % : follow
      if (await tap(id, { text: 'Follow' }, { timeoutMs: 2000 })) log('  ➕ follow')
    }
    await cloudPhones.shell(id, 'input swipe 540 1500 540 500 300')  // reel suivant
    log(`  🎬 reel ${i + 1}/${total}`)
  }

  if (keywords.length) {
    const per = Math.max(1, Math.floor(count / keywords.length))
    let done = 0
    for (const kw of keywords) {
      if (done >= count) break
      log(`🔎 recherche « ${kw} »`)
      await dismissPopups(id)
      if (!(await tap(id, { id: 'search_tab' }, { timeoutMs: 4000 }) || await tap(id, { desc: 'Search and explore' }, { timeoutMs: 3000 }))) { log('  · onglet recherche introuvable'); continue }
      await sleep(1500)
      await tap(id, { id: 'action_bar_search_edit_text' }, { timeoutMs: 3000 })
      await sleep(600); await typeText(id, kw); await sleep(1000)
      await keys.enter(id); await sleep(2500); await dismissPopups(id)
      await tap(id, { text: 'Reels' }, { timeoutMs: 3000 }); await sleep(2000)
      if (!await tap(id, { id: 'layout_container' }, { timeoutMs: 3000 })) await cloudPhones.shell(id, 'input tap 260 800')
      await sleep(3000); await dismissPopups(id)
      const n = Math.min(per, count - done)
      for (let i = 0; i < n; i++) { await watchOne(done, count); done++ }
      await keys.back(id); await sleep(1000); await keys.back(id); await sleep(1500)
    }
    log(`✅ Warmup terminé (${done} reels)`)
  } else {
    const opened = await tap(id, { desc: 'Reels' }, { timeoutMs: 5000 }) || await tap(id, { id: 'clips_tab' }, { timeoutMs: 3000 })
    if (!opened) await cloudPhones.shell(id, `am start -a android.intent.action.VIEW -d 'instagram://reels_home'`)
    await sleep(3500); await dismissPopups(id)
    for (let i = 0; i < count; i++) await watchOne(i, count)
    log(`✅ Warmup terminé (${count} reels)`)
  }
}

// ── Confidentialité du compte (public ↔ privé) ──────────────────────────────
// Traduction « cœur » du template GeeLark « Instagram account privacy settings ».
// public = true → compte public ; false → privé. Ne bascule que si nécessaire.
export async function setPrivacy(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const wantPublic = /^(1|true|oui|yes|public)$/i.test(String(params.public ?? ''))
  await dismissPopups(id)
  if (find(await dumpUi(id), { desc: 'Log in' }) || find(await dumpUi(id), { text: 'Log in' })) throw new Error('compte non connecté')
  if (!await tapFirst(id, [{ id: 'profile_tab' }, { desc: 'Profile' }, { desc: 'Profil' }], 'Onglet Profil', log)) throw new Error('onglet profil')
  await sleep(2500); await dismissPopups(id)
  if (!await tapFirst(id, [{ desc: 'Options' }, { desc: 'Menu' }, { desc: 'Settings and privacy' }, { desc: 'Paramètres' }], 'Menu Options', log)) throw new Error('menu options')
  await sleep(2000)
  // Descend jusqu'à « Account privacy » (max ~12 swipes).
  let row = null
  for (let i = 0; i < 12; i++) {
    row = find(await dumpUi(id), { contains: 'Account privacy' }) || find(await dumpUi(id), { contains: 'Confidentialité du compte' })
    if (row) break
    await cloudPhones.shell(id, 'input swipe 540 1400 540 700 300'); await sleep(900)
  }
  if (!row) { throw new Error('« Account privacy » introuvable') }
  // Déjà dans l'état voulu ? (le libellé montre l'état courant)
  const cur = `${row.desc} ${row.text}`.toLowerCase()
  if ((wantPublic && cur.includes('public')) || (!wantPublic && (cur.includes('private') || cur.includes('privé')))) {
    log(`  ✓ déjà ${wantPublic ? 'public' : 'privé'}`); return
  }
  await cloudPhones.shell(id, `input tap ${row.cx} ${row.cy}`)
  await sleep(3000); await dismissPopups(id)
  // Bascule l'interrupteur « Private account » (à droite de la ligne).
  const n2 = await dumpUi(id)
  const toggleRow = n2.find(n => /private account|compte privé/i.test(`${n.text} ${n.desc}`))
  const width = Math.max(...n2.map(n => n.x + n.w), 1080)
  if (!toggleRow) { throw new Error('interrupteur « Private account » introuvable') }
  await cloudPhones.shell(id, `input tap ${width - 80} ${toggleRow.cy}`)
  await sleep(2500); await dismissPopups(id)
  await tapFirst(id, [{ contains: 'Switch to' }, { contains: 'Passer en' }], 'Confirmer', log, false)
  await sleep(3000)
  log(`✅ Compte passé en ${wantPublic ? 'public' : 'privé'}`)
}

// ── Abonnement en masse (bulk follow) ───────────────────────────────────────
// Traduction « cœur » du template GeeLark « Instagram bulk follow ». Pour chaque
// pseudo : ouvre le profil, et clique « Follow » UNIQUEMENT s'il n'est pas déjà
// suivi (on ne clique jamais « Following » → pas de désabonnement accidentel).
export async function bulkFollow(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const raw = String(params.usernames ?? '').trim()
  const users = raw ? raw.split(/[\n,]+/).map(s => s.trim().replace(/^@/, '')).filter(Boolean) : []
  if (!users.length) { log('  · aucun compte fourni'); return }
  await dismissPopups(id)
  if (find(await dumpUi(id), { desc: 'Log in' }) || find(await dumpUi(id), { desc: 'Login' })) throw new Error('compte non connecté')

  let followed = 0
  for (const u of users) {
    await openProfile(id, u)
    await sleep(jitter(3000, 1500)); await dismissPopups(id)
    const nodes = await dumpUi(id)
    // Cible : un bouton cliquable dont le libellé est exactement « Follow »/« Suivre ».
    let target = nodes.find(n => n.clickable && /^(follow|suivre)$/i.test(n.text.trim())) || null
    if (!target) {
      const idBtn = nodes.find(n => n.id.endsWith('profile_header_follow_button'))
      if (idBtn) {
        const child = nodes.find(c => c !== idBtn && c.text.trim() && c.x >= idBtn.x && c.y >= idBtn.y && c.x + c.w <= idBtn.x + idBtn.w && c.y + c.h <= idBtn.y + idBtn.h)
        const label = (idBtn.text || child?.text || '').trim().toLowerCase()
        if (/^(follow|suivre)$/.test(label) || label === '') target = idBtn
        else { log(`  · ${u} : ${label || 'déjà suivi'}`); await sleep(jitter(2500, 1500)); continue }
      }
    }
    if (!target) { log(`  · ${u} : bouton « Follow » introuvable`); await sleep(jitter(2000, 1500)); continue }
    await cloudPhones.shell(id, `input tap ${target.cx} ${target.cy}`)
    followed++; log(`  ➕ ${u} suivi (${followed})`)
    await sleep(jitter(4000, 2500))  // rythme humain entre chaque follow
  }
  log(`✅ ${followed}/${users.length} compte(s) suivi(s)`)
}

// ── Connexion Instagram (identifiant + mot de passe, sans 2FA) ───────────────
// Traduction « cœur » du template GeeLark « Instagram auto login ».
export async function login(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const account = String(params.account ?? '').trim()
  const password = String(params.password ?? '')
  if (!account || !password) throw new Error('identifiant ou mot de passe manquant')

  await sleep(jitter(5000, 3000)); await dismissPopups(id)
  await tap(id, { text: 'I already have an account' }, { timeoutMs: 2000 })         // 1er lancement
  await tap(id, { text: 'Use another profile' }, { timeoutMs: 3000 })              // déjà des comptes
  await sleep(jitter(4000, 2000)); await dismissPopups(id)

  // Champ identifiant : par desc, sinon 1re zone de saisie.
  let nodes = await dumpUi(id)
  const userField = nodes.find(n => /EditText/.test(n.cls) && /username|email|mobile|identifiant/i.test(n.desc))
    || nodes.filter(n => /EditText/.test(n.cls)).sort((a, b) => a.y - b.y)[0]
  if (!userField) throw new Error('champ identifiant introuvable')
  await cloudPhones.shell(id, `input tap ${userField.cx} ${userField.cy}`); await sleep(500)
  await clearFocused(id); await typeText(id, account); await sleep(800)

  // Champ mot de passe : par desc, sinon 2e zone de saisie.
  nodes = await dumpUi(id)
  const passField = nodes.find(n => /EditText/.test(n.cls) && /password|mot de passe/i.test(n.desc))
    || nodes.filter(n => /EditText/.test(n.cls)).sort((a, b) => a.y - b.y)[1]
  if (!passField) throw new Error('champ mot de passe introuvable')
  await cloudPhones.shell(id, `input tap ${passField.cx} ${passField.cy}`); await sleep(500)
  await clearFocused(id); await typeText(id, password); await sleep(800)

  if (!await tapFirst(id, [{ text: 'Log in' }, { text: 'Se connecter' }, { desc: 'Log in' }], 'Connexion', log, false)) await keys.enter(id)
  await sleep(jitter(7000, 3000)); await dismissPopups(id)
  await tapFirst(id, [{ text: 'Not now' }, { text: 'Not Now' }, { text: 'Pas maintenant' }, { text: 'Save' }], 'Popup infos de connexion', log, false)
  log('✅ Connexion tentée — vérifie l’état du compte')
}

// ── Publier un carrousel photo (feed) ───────────────────────────────────────
// Traduction « cœur » du template GeeLark « Post Carousel photo ». Les images
// sont déjà poussées sur le tel (les N plus récentes de la galerie). count = nb
// d'images à sélectionner. Version épurée (sans tags IA / audio / lien).
export async function postCarousel(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const caption = String(params.caption ?? '')
  const count = Math.max(1, Number(params.count) || 1)
  const musicId = String(params.musicId ?? '').trim()
  await dismissPopups(id)

  // Son tendance optionnel : on l'enregistre d'abord (Saved audio) via le deep
  // link, pour pouvoir l'attacher pendant l'édition du post.
  if (musicId) {
    await cloudPhones.shell(id, `am start -a android.intent.action.VIEW -d 'https://www.instagram.com/reels/audio/${musicId}/'`).catch(() => {})
    await sleep(jitter(5000, 2000)); await dismissPopups(id)
    await tapFirst(id, [{ desc: 'Save audio' }, { text: 'Save audio' }], 'Enregistrer le son', log, false)
    await sleep(1500)
    await cloudPhones.shell(id, `am start -a android.intent.action.VIEW -d 'instagram://share'`).catch(() => {})
    await sleep(jitter(4000, 2000)); await dismissPopups(id)
  }

  if (!await tapFirst(id, [{ id: 'creation_tab' }, { desc: 'Create' }, { desc: 'Créer' }, { desc: 'New post' }], 'Créer', log)) throw new Error('bouton Créer introuvable')
  await sleep(2500); await dismissPopups(id)
  // Onglet POST (fil), pas Reel.
  await tapFirst(id, [{ id: 'cam_dest_feed' }, { desc: 'POST' }, { text: 'POST' }], 'Onglet POST', log, false)
  await sleep(1500); await dismissPopups(id)
  // Active la sélection multiple si dispo.
  await tapFirst(id, [{ desc: 'Select multiple button' }, { contains: 'Select multiple' }], 'Sélection multiple', log, false)
  await sleep(1200)
  // Sélectionne les N vignettes les plus récentes.
  let picked = 0
  for (let i = 0; i < count; i++) {
    const thumbs = (await dumpUi(id)).filter(n => n.clickable && /gallery_grid_item_thumbnail|gallery_grid_item/.test(n.id))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    const t = thumbs[i]
    if (t) { await cloudPhones.shell(id, `input tap ${t.cx} ${t.cy}`); picked++; await sleep(700) }
  }
  log(`  🖼️ ${picked} image(s) sélectionnée(s)`)
  await sleep(1000)
  if (!await tapFirst(id, [{ desc: 'Next' }, { text: 'Next' }, { text: 'Suivant' }], 'Suivant', log)) throw new Error('bouton Suivant introuvable')
  await sleep(2500); await dismissPopups(id)
  // Attacher le son enregistré (best-effort) : Audio → Saved → 1er son.
  if (musicId) {
    if (await tapFirst(id, [{ desc: 'Audio' }, { text: 'Audio' }, { contains: 'Add audio' }], 'Ouvrir Audio', log, false)) {
      await sleep(2500); await dismissPopups(id)
      await tapFirst(id, [{ text: 'Saved' }, { desc: 'Saved' }], 'Onglet Saved', log, false); await sleep(1500)
      const track = (await dumpUi(id)).find(n => n.clickable && n.id.endsWith('album_art'))
      if (track) { await cloudPhones.shell(id, `input tap ${track.cx} ${track.cy}`); await sleep(2500) }
      await tapFirst(id, [{ text: 'Done' }, { desc: 'Done' }, { text: 'OK' }], 'Valider le son', log, false); await sleep(1500)
      await dismissPopups(id)
    } else { log('  · écran Audio non trouvé (son ignoré)') }
  }
  await tapFirst(id, [{ desc: 'Next' }, { text: 'Next' }, { text: 'Suivant' }], 'Suivant (filtres)', log, false)
  await sleep(2500); await dismissPopups(id)
  // Légende.
  if (caption.trim()) {
    const nodes = await dumpUi(id)
    const cap = nodes.find(n => n.id.endsWith('caption_input_text_view')) || nodes.find(n => /EditText/.test(n.cls))
    if (cap) { await cloudPhones.shell(id, `input tap ${cap.cx} ${cap.cy}`); await sleep(500); await typeText(id, caption.trim()); await sleep(600); await keys.back(id); await sleep(600) }
  }
  await tapFirst(id, [{ desc: 'Share' }, { text: 'Share' }, { text: 'Partager' }, { desc: 'OK' }, { text: 'OK' }], 'Partager', log, false)
  await sleep(4000)
  log('✅ Carrousel publié — vérifie le profil')
}

// ── Envoyer un message privé (DM) à une liste de comptes ────────────────────
// Traduction « cœur » du template GeeLark « Send private message ». Pour chaque
// compte : ouvre le profil (deep link, plus robuste que la recherche), tape
// « Message », saisit le texte dans le composer, envoie. Ignore proprement les
// profils sans bouton « Message » (privés/bloqués).
export async function sendDm(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const raw = String(params.usernames ?? '').trim()
  const users = raw ? raw.split(/[\n,]+/).map(s => s.trim().replace(/^@/, '')).filter(Boolean) : []
  const content = String(params.content ?? '').trim()
  if (!users.length) { log('  · aucun compte fourni'); return }
  if (!content) { log('  · aucun message fourni'); return }
  await dismissPopups(id)
  if (find(await dumpUi(id), { desc: 'Log in' }) || find(await dumpUi(id), { desc: 'Login' })) throw new Error('compte non connecté')

  let sent = 0
  for (const u of users) {
    await openProfile(id, u)
    await sleep(jitter(3500, 1500)); await dismissPopups(id)
    // Bouton « Message » du profil.
    if (!await tapFirst(id, [{ desc: 'Message' }, { text: 'Message' }, { text: 'Envoyer un message' }], `Message → ${u}`, log, false)) {
      log(`  · ${u} : bouton « Message » introuvable (profil privé/bloqué ?)`); await sleep(jitter(2500, 1500)); continue
    }
    await sleep(jitter(3000, 1500)); await dismissPopups(id)
    // Champ de saisie du fil de discussion.
    const nodes = await dumpUi(id)
    const box = nodes.find(n => n.id.endsWith('row_thread_composer_edittext')) || nodes.find(n => /EditText/.test(n.cls))
    if (!box) { log(`  · ${u} : champ message introuvable`); await sleep(jitter(2000, 1500)); continue }
    await cloudPhones.shell(id, `input tap ${box.cx} ${box.cy}`); await sleep(600)
    await typeText(id, content); await sleep(700)
    // Envoyer (bouton dédié par id, sinon libellé Send/Envoyer).
    const sendNode = (await dumpUi(id)).find(n => n.id.endsWith('row_thread_composer_send_button_container') && n.clickable)
    if (sendNode) await cloudPhones.shell(id, `input tap ${sendNode.cx} ${sendNode.cy}`)
    else await tapFirst(id, [{ desc: 'Send' }, { text: 'Send' }, { text: 'Envoyer' }], 'Envoyer', log, false)
    sent++; log(`  ✉️ ${u} : message envoyé (${sent})`)
    await sleep(jitter(4500, 3000))  // rythme humain entre chaque DM
  }
  log(`✅ ${sent}/${users.length} message(s) envoyé(s)`)
}

// ── Connexion Instagram AVEC 2FA (app d'authentification) ───────────────────
// Port « cœur » du template GeeLark « auto login 2FA ». Comme `login`, mais gère
// l'étape « Go to your authentication app » : le code TOTP est calculé EN LOCAL
// depuis le secret 2FA (base32) — pas de dépendance à un service tiers. Les
// challenges e-mail / captcha / appel ne sont pas franchissables → échec clair.
export async function login2fa(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const account = String(params.account ?? '').trim()
  const password = String(params.password ?? '')
  const totpKey = String(params.totpKey ?? params.key ?? '').replace(/\s/g, '').trim()
  if (!account || !password) throw new Error('identifiant ou mot de passe manquant')

  // Écran d'accueil (1er lancement / plusieurs comptes).
  await sleep(jitter(5000, 3000)); await dismissPopups(id)
  await tapFirst(id, [{ text: 'I already have an account' }, { text: 'Use another profile' }], 'Écran d’accueil', log, false)
  await sleep(jitter(4000, 2000)); await dismissPopups(id)

  // Identifiant (par desc, sinon 1re zone de saisie).
  let nodes = await dumpUi(id)
  const userField = nodes.find(n => /EditText/.test(n.cls) && /username|email|mobile|identifiant/i.test(`${n.desc} ${n.text}`))
    || nodes.filter(n => /EditText/.test(n.cls)).sort((a, b) => a.y - b.y)[0]
  if (!userField) throw new Error('champ identifiant introuvable')
  await cloudPhones.shell(id, `input tap ${userField.cx} ${userField.cy}`); await sleep(500)
  await clearFocused(id); await typeText(id, account); await sleep(800)

  // Mot de passe (par desc, sinon 2e zone de saisie).
  nodes = await dumpUi(id)
  const passField = nodes.find(n => /EditText/.test(n.cls) && /password|mot de passe/i.test(`${n.desc} ${n.text}`))
    || nodes.filter(n => /EditText/.test(n.cls)).sort((a, b) => a.y - b.y)[1]
  if (!passField) throw new Error('champ mot de passe introuvable')
  await cloudPhones.shell(id, `input tap ${passField.cx} ${passField.cy}`); await sleep(500)
  await clearFocused(id); await typeText(id, password); await sleep(800)

  if (!await tapFirst(id, [{ text: 'Log in' }, { text: 'Se connecter' }, { desc: 'Log in' }], 'Connexion', log, false)) await keys.enter(id)
  await sleep(jitter(9000, 3000)); await dismissPopups(id)

  // Challenge e-mail : non géré (pas d'accès à la boîte mail).
  if (find(await dumpUi(id), { contains: 'Request new code' }) || find(await dumpUi(id), { contains: 'We sent a code' }))
    throw new Error('vérification par e-mail requise (non gérée)')

  // 2FA : si l'écran d'authentification apparaît, saisir le code TOTP.
  const on2fa = () => find(nodes, { contains: 'authentication app' }) || find(nodes, { contains: 'security code' })
    || find(nodes, { contains: 'Check your notifications' }) || find(nodes, { contains: 'Try another way' })
  nodes = await dumpUi(id)
  if (totpKey && (on2fa() || find(nodes, { contains: 'Code' }))) {
    // Basculer vers « Authentication app » si Instagram propose une autre méthode.
    if (find(nodes, { contains: 'Check your notifications' }) || find(nodes, { contains: 'Try another way' })) {
      await tapFirst(id, [{ text: 'Try another way' }], 'Autre méthode', log, false); await sleep(2000)
      await tapFirst(id, [{ text: 'Authentication app' }, { contains: 'authentication app' }], 'App d’authentification', log, false); await sleep(1500)
      await tapFirst(id, [{ text: 'Continue' }], 'Continuer', log, false); await sleep(2500)
    }
    // Saisir le code (2 tentatives : un nouveau code toutes les 30 s).
    let done = false
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      const cur = await dumpUi(id)
      const codeField = cur.find(n => /EditText/.test(n.cls))
      if (codeField) {
        const code = await generateTOTP(totpKey)
        await cloudPhones.shell(id, `input tap ${codeField.cx} ${codeField.cy}`); await sleep(400)
        await clearFocused(id); await typeText(id, code); await sleep(600)
        log(`  🔐 code 2FA saisi`)
        await tapFirst(id, [{ text: 'Continue' }, { text: 'Confirm' }, { desc: 'Continue' }, { text: 'Log in' }], 'Valider 2FA', log, false)
        await sleep(jitter(7000, 3000)); await dismissPopups(id)
        // Si le champ code a disparu → réussi.
        done = !(await dumpUi(id)).some(n => /EditText/.test(n.cls))
      } else { await sleep(2500) }
    }
  }

  // Enregistrer les infos de connexion (ou passer).
  await tapFirst(id, [{ text: 'Save' }, { text: 'Save info' }, { text: 'Not now' }, { text: 'Not Now' }, { text: 'Pas maintenant' }], 'Popup enregistrer', log, false)
  log('✅ Connexion 2FA tentée — vérifie l’état du compte')
}

// ── Publier une vidéo en YouTube Short ──────────────────────────────────────
// Port « cœur » du template GeeLark « Post video (YouTube Short) ». La vidéo est
// déjà dans la galerie du tel (poussée avant le flow). Version épurée : pas de
// son-template, réglage de volume ni OCR (spécifiques GeeLark, fragiles).
export async function youtubeShort(id: string, params: Record<string, unknown>, log: Logger): Promise<void> {
  const YT = 'com.google.android.youtube'
  const title = String(params.title ?? '').trim()

  // Permissions média (évite les popups d'accès galerie).
  await cloudPhones.shell(id, `pm grant ${YT} android.permission.READ_MEDIA_VIDEO`).catch(() => {})
  await cloudPhones.shell(id, `pm grant ${YT} android.permission.READ_EXTERNAL_STORAGE`).catch(() => {})
  await dismissPopups(id)

  // Ouvrir « Créer » puis « Short ».
  await tapFirst(id, [{ desc: 'Create' }, { desc: 'Créer' }, { text: 'Create' }], 'Créer', log, false)
  await sleep(1500)
  if (!await tapFirst(id, [{ text: 'Short' }, { desc: 'Short' }, { contains: 'Short' }], 'Short', log)) throw new Error('bouton « Short » introuvable')
  await sleep(2500); await dismissPopups(id)

  // Popups permissions caméra/micro (best-effort, ordre variable).
  for (const lbl of ['Allow access', 'ALLOW', 'While using the app', 'WHILE USING THE APP', 'OK', 'Start over', 'Start again']) {
    await tapFirst(id, [{ text: lbl }], `popup ${lbl}`, log, false)
  }

  // Ajouter depuis la galerie.
  await tapFirst(id, [{ text: 'Add from Gallery' }, { id: 'reel_camera_gallery_button' }], 'Galerie', log, false)
  await sleep(1500); await dismissPopups(id)
  await tapFirst(id, [{ id: 'allow_access_button' }, { text: 'ALLOW' }, { text: 'OK' }], 'Autoriser galerie', log, false)
  await sleep(1200)

  // 1re vidéo de la galerie.
  const thumbs = (await dumpUi(id)).filter(n => n.clickable && /thumb_image_view|gallery/i.test(n.id)).sort((a, b) => (a.y - b.y) || (a.x - b.x))
  if (thumbs[0]) { await cloudPhones.shell(id, `input tap ${thumbs[0].cx} ${thumbs[0].cy}`); await sleep(1500) }
  else log('  · aucune vidéo trouvée dans la galerie')
  await tapFirst(id, [{ text: 'OK' }, { id: 'multi_select_next_button' }], 'Confirmer sélection', log, false)
  await sleep(1500)
  await tapFirst(id, [{ id: 'shorts_trim_finish_trim_button' }, { text: 'Done' }, { text: 'Terminé' }], 'Trim terminé', log, false)
  await sleep(1500)

  // Avancer jusqu'à l'écran d'upload (bouton Next de la caméra Shorts).
  for (let i = 0; i < 5; i++) {
    if (find(await dumpUi(id), { text: 'Upload Short' }) || find(await dumpUi(id), { contains: 'Caption your Short' })) break
    await tapFirst(id, [{ id: 'shorts_camera_next_button' }, { desc: 'Next' }, { text: 'Next' }, { text: 'Suivant' }], `Suivant (${i + 1})`, log, false)
    await sleep(2500); await dismissPopups(id)
  }

  // Légende.
  if (title) {
    const nodes = await dumpUi(id)
    const cap = nodes.find(n => /EditText/.test(n.cls) && /caption/i.test(`${n.text} ${n.desc}`)) || nodes.find(n => /EditText/.test(n.cls))
    if (cap) { await cloudPhones.shell(id, `input tap ${cap.cx} ${cap.cy}`); await sleep(600); await typeText(id, title); await sleep(700); await keys.back(id); await sleep(600) }
  }

  // Publier.
  if (!await tapFirst(id, [{ text: 'Upload Short' }, { id: 'shorts_post_bottom_button' }], 'Upload Short', log)) throw new Error('bouton « Upload Short » introuvable')
  await sleep(4000)
  log('✅ Short envoyé — la mise en ligne peut prendre 1-2 min')
}

// ── Lire les statistiques (Insights) d'un compte Instagram ──────────────────
// Port « cœur » du template GeeLark « Instagram insights ». Ouvre le tableau de
// bord Insights, ferme les popups, puis lit et journalise les chiffres clés
// (vues, interactions, nouveaux abonnés). Lecture seule — aucune action risquée.
// La mise en page Insights bouge selon la version → lecture par libellé + récap
// brut de secours. Nécessite un compte pro/créateur.
export async function readInsights(id: string, _params: Record<string, unknown>, log: Logger): Promise<void> {
  await cloudPhones.shell(id, `am start -a android.intent.action.VIEW -d 'instagram://insights'`).catch(() => {})
  await sleep(jitter(9000, 3000)); await dismissPopups(id)

  // Popups fréquents du dashboard.
  for (const lbl of ['View insights', 'Close', 'Not now', 'OK']) {
    await tapFirst(id, [{ text: lbl }], `popup ${lbl}`, log, false)
  }
  await sleep(2000)

  const nodes = await dumpUi(id)
  const numeric = (t: string) => /^[\d.,]+[KMB]?$/.test(t.trim())
  // Lit le nombre le plus proche (même colonne) d'un libellé connu.
  const readMetric = (labels: RegExp): string | null => {
    const label = nodes.find(n => labels.test(n.text.trim()))
    if (!label) return null
    const near = nodes
      .filter(n => n !== label && numeric(n.text) && Math.abs(n.cx - label.cx) < 220)
      .sort((a, b) => Math.abs(a.cy - label.cy) - Math.abs(b.cy - label.cy))[0]
    return near?.text.trim() ?? null
  }

  const views = readMetric(/^Views$/i)
  const interactions = readMetric(/^Interactions$/i)
  const followers = readMetric(/followers?/i)
  log(`📊 Insights — Vues : ${views ?? '?'} · Interactions : ${interactions ?? '?'} · Nouveaux abonnés : ${followers ?? '?'}`)

  // Récap brut de secours si la mise en page a changé.
  const allNums = nodes.filter(n => numeric(n.text)).map(n => n.text.trim())
  if (allNums.length) log(`  (valeurs détectées : ${allNums.slice(0, 12).join(', ')})`)
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
  warmup_reels: warmupReels,
  set_privacy: setPrivacy,
  bulk_follow: bulkFollow,
  send_dm: sendDm,
  youtube_short: youtubeShort,
  read_insights: readInsights,
  login: login,
  login_2fa: login2fa,
  post_carousel: postCarousel,
}
