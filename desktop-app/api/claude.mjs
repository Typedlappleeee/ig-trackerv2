// Relais Claude (API Anthropic) pour les textes générés par ScaleFlow : descriptions de Reels, bios, textes CTA.
// La clé reste sur le serveur (variable Vercel ANTHROPIC_API_KEY), jamais envoyée au navigateur. Réservé aux
// utilisateurs connectés (session Supabase). Modèle : variable CLAUDE_MODEL, sinon claude-haiku-5-5 (choix du propriétaire : rapide, peu cher).
//   POST { op: 'status' }                           → { ok, enabled, model }
//   POST { op: 'chat', system, user, max_tokens }   → { ok, text } | { ok: false, status, error, retryAfter }
import Anthropic from '@anthropic-ai/sdk'
import { db, bodyOf } from './_bank.js'

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5'
const send = (res, body) => res.status(200).json(body)

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, { ok: false, error: 'POST attendu' })
    const b = bodyOf(req)
    const key = process.env.ANTHROPIC_API_KEY
    if (b.op === 'status') return send(res, { ok: true, enabled: !!key, model: key ? MODEL : null })
    if (!key) return send(res, { ok: false, status: 503, error: 'Claude non configuré (variable ANTHROPIC_API_KEY absente sur Vercel)' })
    // session ScaleFlow obligatoire (sinon n'importe qui consommerait la clé)
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const { data: auth } = jwt ? await db().auth.getUser(jwt) : { data: null }
    if (!auth?.user) return send(res, { ok: false, status: 401, error: 'session expirée : reconnecte-toi' })
    if (b.op !== 'chat') return send(res, { ok: false, error: 'op inconnue' })
    const system = String(b.system ?? '').slice(0, 60_000)
    const user = String(b.user ?? '').slice(0, 60_000)
    if (!user.trim()) return send(res, { ok: false, error: 'message vide' })
    const max = Math.max(256, Math.min(16_000, Number(b.max_tokens) || 4000))
    const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 50_000 })
    try {
      // textes courts et nombreux : effort « low » (réflexion brève, réponse rapide et moins chère) ; marge de tokens
      // pour la réflexion en plus du texte demandé
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: Math.min(32_000, max + 4000),
        output_config: { effort: process.env.CLAUDE_EFFORT || 'low' },
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: user }],
      })
      const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('')
      return send(res, { ok: true, text, model: MODEL, stop: msg.stop_reason })
    } catch (e) {
      // 429 (débit) / 529 (surcharge) / 5xx : l'appli réessaie après le délai donné
      const status = Number(e?.status) || 500
      const retryAfter = Number(e?.headers?.get?.('retry-after') ?? e?.headers?.['retry-after']) || null
      return send(res, { ok: false, status, retryAfter, error: String(e?.error?.error?.message ?? e?.message ?? e).slice(0, 300) })
    }
  } catch (e) {
    return send(res, { ok: false, status: 500, error: e instanceof Error ? e.message : String(e) })
  }
}
