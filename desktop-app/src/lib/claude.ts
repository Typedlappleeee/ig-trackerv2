// Claude (API Anthropic) pour les textes générés (descriptions, bios, CTA) — via le relais serveur /api/claude :
// la clé reste sur Vercel (ANTHROPIC_API_KEY), le navigateur n'envoie que la session ScaleFlow.
import { IS_WEB } from '@/lib/platform'
// même origine que l'API ScaleFlow (sans importer scaleflowLink, qui charge Supabase au démarrage)
const API_ORIGIN = IS_WEB && typeof window !== 'undefined' && /^https?:/.test(window.location.origin) ? window.location.origin : 'https://scaleflow.company'

let status: Promise<{ enabled: boolean; model: string | null }> | null = null
let statusAt = 0
/** Claude configuré sur le serveur ? (résultat gardé 10 min) */
export function claudeStatus(): Promise<{ enabled: boolean; model: string | null }> {
  if (typeof window === 'undefined') return Promise.resolve({ enabled: false, model: null })   // hors navigateur (tests)
  if (!status || Date.now() - statusAt > 600_000) {
    statusAt = Date.now()
    status = fetch(`${API_ORIGIN}/api/claude`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'status' }) })
      .then(r => r.json()).then((b: { enabled?: boolean; model?: string | null }) => ({ enabled: !!b?.enabled, model: b?.model ?? null }))
      .catch(() => ({ enabled: false, model: null }))
  }
  return status
}
export const claudeEnabled = async () => (await claudeStatus()).enabled

export class ClaudeError extends Error { constructor(msg: string, public status: number, public retryAfterMs: number | null) { super(msg) } }
/** Un message (prompt système + demande) → texte. Erreur ClaudeError (statut + délai conseillé) sinon. */
export async function claudeChat(system: string, user: string, maxTokens = 4000, image?: string): Promise<string> {
  const { supabase } = await import('@/lib/supabase')   // chargé à la demande (pas au démarrage des tests)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new ClaudeError('session expirée : reconnecte-toi', 401, null)
  let r: Response
  try {
    r = await fetch(`${API_ORIGIN}/api/claude`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ op: 'chat', system, user, max_tokens: maxTokens, ...(image ? { image } : {}) }),
    })
  } catch (e) { throw new ClaudeError(e instanceof Error ? e.message : String(e), 0, null) }
  const b = await r.json().catch(() => null) as { ok?: boolean; text?: string; error?: string; status?: number; retryAfter?: number | null } | null
  if (b?.ok) return b.text ?? ''
  throw new ClaudeError(b?.error ?? `HTTP ${r.status}`, b?.status ?? r.status, b?.retryAfter ? b.retryAfter * 1000 : null)
}
