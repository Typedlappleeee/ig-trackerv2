/**
 * Auto-enregistrement du webhook GeeLark.
 * Au démarrage (dès que le token est connu), on vérifie l'URL de callback
 * configurée chez GeeLark et on la met à jour si besoin — sans aucune action
 * de l'utilisateur. Idempotent + throttlé (1 tentative/jour via localStorage).
 *
 * Web uniquement : sur Electron (origin file://) ou en localhost, GeeLark ne
 * pourrait pas joindre l'URL → on s'abstient.
 */
async function glProxy(url: string, body: unknown, bearer: string): Promise<Record<string, unknown>> {
  const res = await fetch('/api/geelark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'POST', url, headers: { Authorization: `Bearer ${bearer}` }, body }),
  })
  const j = await res.json()
  if (!j.ok) throw new Error(j.error ?? 'proxy error')
  return j.data as Record<string, unknown>
}

export async function ensureWebhookRegistered(bearer: string): Promise<void> {
  if (!bearer) return
  const origin = window.location.origin
  // Skippe Electron / localhost : l'URL ne serait pas joignable par GeeLark.
  if (!/^https:\/\//i.test(origin) || /localhost|127\.0\.0\.1/.test(origin)) return

  const STAMP = 'sf-webhook-set'
  const today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(STAMP) === today) return  // déjà tenté aujourd'hui

  const callbackUrl = `${origin}/api/geelark-callback`
  try {
    // 1. Lis l'URL déjà configurée
    const got = await glProxy('https://openapi.geelark.com/open/v1/callback/get', {}, bearer)
    const cur = (got['data'] as Record<string, unknown>)?.['url'] ?? got['url']
    if (cur === callbackUrl) { localStorage.setItem(STAMP, today); return }  // déjà bon

    // 2. Sinon, enregistre la nôtre
    const set = await glProxy('https://openapi.geelark.com/open/v1/callback/set', { url: callbackUrl }, bearer)
    const code = (set['code'] ?? (set['data'] as Record<string, unknown>)?.['code'])
    if (code === 0 || code === undefined) localStorage.setItem(STAMP, today)
  } catch { /* best-effort, on réessaiera demain */ }
}
