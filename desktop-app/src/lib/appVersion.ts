// Version de l'app : date du dernier déploiement + détection d'une version plus récente.
// Sur le web, un onglet resté ouvert garde l'ancien code : on relit /version.json
// (publié à chaque build) et on propose de rafraîchir quand l'identifiant a changé.
import { useEffect, useState } from 'react'
import { IS_WEB } from './platform'
import type { ChangelogEntry } from './changelog'

export const APP_BUILD = {
  id: typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev',
  builtAt: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString(),
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « 5 oct. · 14:32 » (heure locale). */
export function fmtBuild(iso: string = APP_BUILD.builtAt): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${hm}`
}

export interface RemoteBuild { id: string; builtAt: string; changes?: ChangelogEntry[] }

/** Lit la version publiée. null si indisponible (réseau, dev, fichier absent). */
export async function fetchRemoteBuild(): Promise<RemoteBuild | null> {
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json()
    if (!j || typeof j.id !== 'string' || !j.id) return null
    return { id: j.id, builtAt: typeof j.builtAt === 'string' ? j.builtAt : '', changes: Array.isArray(j.changes) ? j.changes : undefined }
  } catch { return null }
}

// ── Store partagé (un seul polling pour toute l'app) ─────────────────────────
let remote: RemoteBuild | null = null
const listeners = new Set<() => void>()
const setRemote = (r: RemoteBuild) => { remote = r; listeners.forEach(l => l()) }

export async function checkForUpdate(): Promise<RemoteBuild | null> {
  const r = await fetchRemoteBuild()
  if (r && r.id !== APP_BUILD.id && r.id !== remote?.id) setRemote(r)
  return remote
}

const RELOAD_KEY = 'sf-reload-after-deploy'
let started = false
function start() {
  if (started || !IS_WEB || APP_BUILD.id === 'dev') return
  started = true
  void checkForUpdate()
  setInterval(() => { if (document.visibilityState === 'visible') void checkForUpdate() }, 2 * 60_000)
  const onBack = () => { if (document.visibilityState === 'visible') void checkForUpdate() }
  document.addEventListener('visibilitychange', onBack)
  window.addEventListener('focus', onBack)
  // Une page (chargée à la demande) introuvable = l'app a été redéployée depuis
  // l'ouverture de l'onglet. On recharge une fois (garde anti-boucle), sinon on
  // affiche le bandeau.
  window.addEventListener('vite:preloadError', (e) => {
    let already = false
    try { already = sessionStorage.getItem(RELOAD_KEY) === APP_BUILD.id } catch { /* */ }
    if (!already) {
      e.preventDefault()
      try { sessionStorage.setItem(RELOAD_KEY, APP_BUILD.id) } catch { /* */ }
      window.location.reload()
      return
    }
    setRemote({ id: remote?.id ?? 'new', builtAt: remote?.builtAt ?? '' })
  })
}

/** Version plus récente disponible (web uniquement), sinon null. */
export function useAppUpdate(): RemoteBuild | null {
  const [r, setR] = useState(remote)
  useEffect(() => {
    start()
    const l = () => setR(remote)
    listeners.add(l)
    l()
    return () => { listeners.delete(l) }
  }, [])
  return r
}

/** Test uniquement. */
export function __resetAppVersion() { remote = null; listeners.clear() }
