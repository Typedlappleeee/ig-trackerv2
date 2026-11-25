// Page irt-worker.html : ouverte par le programme serveur (public/irt-worker/worker.mjs) dans un navigateur sans écran.
// Elle n'affiche rien : elle expose `window.irtRunPhone` qui fait tourner la session d'un iPhone avec le moteur iRemoTech
// de ScaleFlow (toujours la version publiée du site : le serveur se met à jour tout seul). Le journal, l'arrêt, les liens
// des vidéos et le compteur d'utilisation passent par des fonctions fournies par le programme serveur (window.w*).
import { runServerPhone, type ServerPhone, type ServerOpts, type ServerVid } from './lib/irtServerSession'

type Bridge = {
  wlog: (runId: string, line: string) => Promise<void>
  wstop: (runId: string) => Promise<boolean>
  wmedia: (runId: string, v: ServerVid) => Promise<string | null>
  wbump: (runId: string, id: string) => Promise<void>
  wtick: (runId: string, ok: boolean) => Promise<void>
}
const w = window as unknown as Bridge & { irtRunPhone: unknown; irtReady: boolean; irtVersion: string }

const stopFlags = new Map<string, boolean>()
w.irtRunPhone = async (runId: string, key: string, phone: ServerPhone, opts: ServerOpts) => {
  // l'arrêt est relu toutes les 5 s (shouldStop doit rester synchrone pour le moteur)
  const timer = setInterval(() => { void w.wstop(runId).then(v => { if (v) stopFlags.set(runId, true) }, () => undefined) }, 5000)
  try {
    await runServerPhone(key, phone, opts, {
      log: m => { void w.wlog(runId, m) },
      shouldStop: () => stopFlags.get(runId) === true,
      mediaUrl: v => w.wmedia(runId, v),
      bumpUsed: id => { void w.wbump(runId, id) },
      tick: ok => { void w.wtick(runId, ok) },
    })
  } finally { clearInterval(timer) }
}
w.irtVersion = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'
w.irtReady = true
