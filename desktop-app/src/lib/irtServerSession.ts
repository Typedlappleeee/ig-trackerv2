// iRemoTech sur SERVEUR (PC éteint) — étape 1 : sessions Posting Reels.
// La page ScaleFlow prépare un « plan » (iPhones → posts : compte, vidéo, description, lieu) et l'enregistre dans
// irt_server_runs ; le programme serveur (public/irt-worker/worker.mjs) ouvre la page irt-worker.html dans un navigateur
// sans écran et appelle `runServerPhone` pour chaque iPhone. Même enchaînement que le Posting Reels de la page
// (BlowAutoPilot.tsx `run('reel')`) : compte → post → scroll → post… puis Instagram fermé + mode avion → compte suivant.
// Toute évolution du Posting Reels de la page doit être reportée ici (et inversement).
import { uploadMedia } from './iremotech'
import {
  recalibrateTouch, disableAutoCorrect, forceCloseForegroundApp, airplaneReset, warmupEditsByVision, openTargetByVision,
  warmupByVision, postReelByVision, type LocTarget,
} from './iremotechVision'

/** Lieu sérialisable (les RegExp ne passent pas en JSON) : sources des expressions, insensibles à la casse. */
export interface ServerLoc { q: string; label: string; city: string; region: string; first?: string }
export interface ServerVid { id: string; title: string; filename: string; storage_path: string | null; file_url: string | null }
export interface ServerJob { container: string; vids: ServerVid[]; caption: string; location?: ServerLoc | null }
export interface ServerPhone { dev: string; name: string; jobs: ServerJob[] }
export interface ServerOpts { airplaneOn: boolean; gapMin: number; gapScroll: boolean; parallel: boolean }
export interface ServerPlan { kind: 'reel'; phones: ServerPhone[]; opts: ServerOpts }

export const locToServer = (l: LocTarget | undefined | null): ServerLoc | null =>
  l ? { q: l.q, label: l.label, city: l.city.source, region: l.region.source, first: l.first?.source } : null
export const locFromServer = (l: ServerLoc | undefined | null): LocTarget | undefined =>
  l ? { q: l.q, label: l.label, city: new RegExp(l.city, 'i'), region: new RegExp(l.region, 'i'), first: l.first ? new RegExp(l.first, 'i') : undefined } : undefined

/** Nombre total de posts d'un plan. Pure. */
export const planTotal = (p: ServerPlan) => p.phones.reduce((n, ph) => n + ph.jobs.length, 0)

export interface ServerHooks {
  log: (m: string) => void
  shouldStop: () => boolean
  /** lien de téléchargement de la vidéo (lien signé de la Banque, fourni par le serveur) */
  mediaUrl: (v: ServerVid) => Promise<string | null>
  /** +1 au compteur d'utilisation du média */
  bumpUsed: (id: string) => void
  /** un post terminé (réussi ou non) */
  tick: (ok: boolean) => void
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Session complète d'UN iPhone (tous ses posts). Ne lève pas d'erreur : chaque problème est écrit au journal. */
export async function runServerPhone(key: string, p: ServerPhone, opts: ServerOpts, h: ServerHooks): Promise<void> {
  const tag = `[${p.name}]`
  const log = (m: string) => h.log(`${tag} ${m}`)
  const vh = { log, shouldStop: h.shouldStop }
  try {
    await recalibrateTouch(key, p.dev, vh)
    // correction automatique du clavier iOS coupée une fois par iPhone (mémo dans le profil du navigateur du serveur)
    const acKey = `sf-irt-kbclean2-${p.dev}`
    let acDone = false
    try { acDone = localStorage.getItem(acKey) === '1' } catch { /* noop */ }
    if (!acDone && await disableAutoCorrect(key, p.dev, vh)) { try { localStorage.setItem(acKey, '1') } catch { /* noop */ } }
  } catch (e) { log(`⚠ préparation de l’iPhone : ${e instanceof Error ? e.message : String(e)}`) }

  let stayedIn: string | null = null
  let cleaned = false
  const unreachable = new Set<string>()
  for (const [ji, job] of p.jobs.entries()) {
    if (h.shouldStop()) { log('⏹ arrêt demandé'); break }
    if (unreachable.has(job.container)) { log(`⏭ « ${job.container} » sauté (compte non atteint plus tôt dans la session)`); h.tick(false); continue }
    try {
      log(`\n📦 ${job.container.startsWith('@') ? 'compte' : 'container'} « ${job.container} » · ${job.vids.map(v => v.title).join(' + ')}`)
      const sameAcct = stayedIn === job.container
      if (!sameAcct) {
        if (ji > 0 && job.container.startsWith('@') && !cleaned) {
          log('🚪 fin du compte précédent → Instagram fermé')
          await forceCloseForegroundApp(key, p.dev, vh)
        }
        cleaned = false
        if (opts.airplaneOn) await airplaneReset(key, p.dev, vh)
        if (!job.container.startsWith('@')) await warmupEditsByVision(key, p.dev, job.container, vh)
        const ok = await openTargetByVision(key, p.dev, job.container, vh)
        if (!ok) { log(`⏭ ${job.container.startsWith('@') ? 'compte' : 'container'} « ${job.container} » non atteint → suivant`); log('🧹 post raté → posting annulé, Instagram fermé (reprise propre)'); await forceCloseForegroundApp(key, p.dev, vh); cleaned = true; unreachable.add(job.container); h.tick(false); stayedIn = null; continue }
        await sleep(1200)
      }
      stayedIn = null
      const nextSame = p.jobs[ji + 1]?.container === job.container
      // entre deux posts DU MÊME COMPTE : scroll de durée aléatoire (80 à 180 % du réglage, 1 min minimum)
      if (sameAcct) {
        const ms = Math.max(60_000, opts.gapMin * 60_000 * (0.8 + Math.random()))
        if (opts.gapScroll) {
          log(`📱 ${Math.round(ms / 6000) / 10} min de scroll avant le post…`)
          try { const w = await warmupByVision(key, p.dev, { minMs: ms, maxMs: ms, likeRate: 0.03, commentRate: 0, keepApp: true }, { log: () => { /* silencieux */ }, shouldStop: h.shouldStop }); if (w) log(`   ✓ scroll fini (Instagram resté ouvert) : ${w.reels ?? 0} reel(s) vu(s), ${w.likes ?? 0} like(s)`) } catch { /* noop */ }
        } else { log(`⏳ pause ${Math.round(ms / 6000) / 10} min avant le post…`); const end = Date.now() + ms; while (Date.now() < end && !h.shouldStop()) await sleep(1000) }
        if (h.shouldStop()) { log('⏹ arrêt demandé'); break }
      }
      // vidéo → iPhone
      let injected = true
      for (const v of [...job.vids].reverse()) {
        const url = await h.mediaUrl(v)
        if (!url) { injected = false; break }
        log('⬆ injection du média…')
        if (!await uploadMedia(key, p.dev, url, v.filename)) { injected = false; break }
      }
      if (!injected) { log('❌ média introuvable ou injection refusée → suivant'); log('🧹 post raté → posting annulé, Instagram fermé (reprise propre)'); await forceCloseForegroundApp(key, p.dev, vh); cleaned = true; h.tick(false); continue }
      log('⏳ 10 s (indexation)…')
      await sleep(10000)
      const posted = await postReelByVision(key, p.dev, { caption: job.caption, location: locFromServer(job.location), stay: nextSame }, vh)
      if (posted && nextSame) stayedIn = job.container
      log(posted ? `✅ « ${job.container} » publié` : `⚠ « ${job.container} » interrompu`)
      if (!posted && !h.shouldStop()) { log('🧹 post raté → posting annulé, Instagram fermé (reprise propre)'); await forceCloseForegroundApp(key, p.dev, vh); stayedIn = null; cleaned = true }
      if (posted) for (const v of job.vids) h.bumpUsed(v.id)
      h.tick(posted)
    } catch (e) {
      log(`❌ erreur inattendue : ${e instanceof Error ? e.message : String(e)} → post suivant`)
      try { await forceCloseForegroundApp(key, p.dev, vh); cleaned = true } catch { /* noop */ }
      stayedIn = null
      h.tick(false)
    }
  }
  log('🏁 iPhone terminé')
}
