// Client HeroSMS — protocole COMPATIBLE SMS-Activate (auth ?api_key=, réponses texte).
// WEB → relais /api/herosms (token côté serveur). Electron → appel direct au handler.
import { IS_WEB } from './platform'

const CANDIDATE_BASES = [
  'https://hero-sms.com/stubs/handler_api.php',
  'https://hero-sms.com/api/v1',
  'https://hero-sms.com/handler_api.php',
]

interface Resp { ok: boolean; status?: number; text?: string; data?: any; base?: string; error?: string }

function actionFor(op: string, b: Record<string, unknown>): Record<string, string> | null {
  switch (op) {
    case 'ping':   return { action: 'getBalance' }
    case 'buy':    return { action: 'getNumberV2', service: String(b.service || 'ig'), country: String(b.country ?? ''), ...(b.maxPrice != null ? { maxPrice: String(b.maxPrice) } : {}), ...(b.operator ? { operator: String(b.operator) } : {}) }
    case 'status': return { action: 'getStatus', id: String(b.id ?? '') }
    case 'finish': return { action: 'setStatus', id: String(b.id ?? ''), status: '6' }
    case 'cancel': return { action: 'setStatus', id: String(b.id ?? ''), status: '8' }
    case 'prices': return { action: 'getPrices', service: String(b.service || 'ig'), country: String(b.country ?? '') }
    default: return null
  }
}

async function call(op: string, apiKey: string, extra: Record<string, unknown> = {}): Promise<Resp> {
  if (IS_WEB) {
    const res = await fetch('/api/herosms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, apiKey, ...extra }),
    })
    return res.json() as Promise<Resp>
  }
  // Electron : appel direct au handler SMS-Activate (essaie les URLs candidates).
  const params = actionFor(op, extra)
  if (!params) return { ok: false, error: `op inconnu: ${op}` }
  for (const base of CANDIDATE_BASES) {
    const qs = new URLSearchParams({ api_key: apiKey, ...params })
    let r: Response
    try { r = await fetch(`${base}?${qs.toString()}`) } catch { continue }
    const text = (await r.text()).trim()
    if (r.status === 404 || /<html|<!doctype|not found|no such|bad_action/i.test(text)) continue
    let data: unknown = null; try { data = JSON.parse(text) } catch { /* texte */ }
    const badKey = /BAD_KEY|WRONG_TOKEN|Unauthenticated/i.test(text)
    return { ok: r.status < 400 && !badKey, status: r.status, text, data, base }
  }
  return { ok: false, error: 'Aucun endpoint HeroSMS n’a répondu' }
}

// Test de clé : getBalance → « ACCESS_BALANCE:xx ».
export async function herosmsPing(apiKey: string): Promise<{ ok: boolean; auth?: string; error?: string }> {
  const r = await call('ping', apiKey)
  const t = r.text ?? ''
  if (r.ok && /ACCESS_BALANCE/i.test(t)) return { ok: true, auth: `solde ${t.split(':')[1] ?? '?'}$ · ${r.base?.replace('https://hero-sms.com', '') ?? ''}` }
  return { ok: false, error: t || r.error || 'refusée' }
}

// getNumberV2 → JSON { activationId, phoneNumber } ; repli texte « ACCESS_NUMBER:id:phone ».
export async function herosmsBuy(
  apiKey: string,
  opts: { country: number; service?: string; operator?: string; maxPrice?: number; priceMin?: number; priceMax?: number; onLog?: (m: string) => void },
): Promise<{ id: number; phone: string; price?: number }> {
  // Protocole compat : pas de sélection « plus cher dans la tranche » (getPrices ne donne
  // pas de paliers) → on borne au prix max de la tranche (best-effort).
  const maxPrice = opts.maxPrice ?? opts.priceMax
  if (opts.priceMax != null) opts.onLog?.(`   💲 achat borné à ≤ ${opts.priceMax}$`)
  const r = await call('buy', apiKey, { country: opts.country, service: opts.service ?? 'ig', operator: opts.operator, maxPrice })
  const d = r.data
  if (r.ok && d && (d.activationId || d.phoneNumber)) return { id: Number(d.activationId), phone: String(d.phoneNumber), price: d.activationCost != null ? Number(d.activationCost) : undefined }
  const m = (r.text ?? '').match(/ACCESS_NUMBER:(\d+):(\d+)/)
  if (m) return { id: Number(m[1]), phone: m[2] }
  throw new Error(`${r.text || r.error || 'achat HeroSMS échoué'}${r.base ? ` [${r.base.replace('https://hero-sms.com', '')}]` : ''}`)
}

// getStatus → « STATUS_OK:<code> » (code reçu) / « STATUS_WAIT_CODE » (attente).
export async function herosmsCheckCode(apiKey: string, id: number): Promise<string | null> {
  const r = await call('status', apiKey, { id })
  const t = r.text ?? ''
  const m = t.match(/STATUS_OK:(\d+)/)
  return m ? m[1] : null
}

export async function herosmsFinish(apiKey: string, id: number): Promise<void> { await call('finish', apiKey, { id }) }
export async function herosmsCancel(apiKey: string, id: number): Promise<void> { await call('cancel', apiKey, { id }) }

// Attend le code SMS (poll ~5 s jusqu'à maxMs). Détecte aussi l'annulation côté HeroSMS.
export async function herosmsWaitCode(
  apiKey: string, id: number,
  opts?: { maxMs?: number; onLog?: (m: string) => void; shouldStop?: () => boolean },
): Promise<string | null> {
  const deadline = Date.now() + (opts?.maxMs ?? 6 * 60_000)
  let n = 0
  while (Date.now() < deadline) {
    if (opts?.shouldStop?.()) return null
    await new Promise(r => setTimeout(r, 5000))
    n++
    try {
      const r = await call('status', apiKey, { id })
      const t = r.text ?? ''
      const m = t.match(/STATUS_OK:(\d+)/)
      if (m) { opts?.onLog?.(`   ✉️ code reçu : ${m[1]}`); return m[1] }
      if (/STATUS_CANCEL/i.test(t)) { opts?.onLog?.('   ⚠ activation annulée côté HeroSMS'); return null }
      if (n % 3 === 0) opts?.onLog?.(`   ⏳ attente du SMS… (${Math.round((deadline - Date.now()) / 1000)}s restantes)`)
    } catch (e) { opts?.onLog?.(`   ⚠ check: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return null
}
