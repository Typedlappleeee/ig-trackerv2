import { IS_WEB } from './platform'

// Génération de légende via Groq. Electron → appel direct ; WEB → relais /api/groq
// (CORS). Renvoie null si pas de clé ou en cas d'échec.
export async function generateCaption(groqKey: string, topic?: string): Promise<string | null> {
  if (!groqKey) return null
  const sujet = topic?.trim() ? ` sur : ${topic.trim()}` : ' qui donne envie de regarder jusqu\'au bout'
  const prompt = `Écris UNE légende Instagram courte et accrocheuse pour un Reel${sujet}. Ajoute 3 à 5 hashtags pertinents. Pas de guillemets.`
  // Message système ferme : la légende DOIT être en français (le modèle partait
  // parfois en anglais quand le titre de la vidéo était en anglais).
  const messages = [
    { role: 'system', content: 'Tu écris exclusivement EN FRANÇAIS. Ne réponds JAMAIS en anglais, même si le sujet ou le titre est en anglais. Réponds uniquement la légende, rien d\'autre.' },
    { role: 'user', content: prompt },
  ]
  try {
    const txt = await groqText(groqKey, messages, 220, 0.9)
    return typeof txt === 'string' ? txt.trim().replace(/^["']|["']$/g, '') : null
  } catch { return null }
}


// Appel chat Groq brut (texte de la réponse, ou null). Electron → direct ; WEB → relais /api/groq.
// `messages` peut contenir des images (content: [{type:'text'},{type:'image_url'}]) pour les modèles vision.
export async function groqChat(groqKey: string, model: string, messages: unknown[], maxTokens = 200, temperature = 0): Promise<string | null> {
  if (!groqKey) return null
  if (IS_WEB) {
    const res = await fetch('/api/groq', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: groqKey, model, messages, temperature, maxTokens }),
    })
    // Le relais peut répondre une page d'erreur Vercel (« An error occurred… », délai dépassé) au lieu de JSON
    const txt = await res.text()
    let j: { ok: boolean; error?: string; data?: any }   // eslint-disable-line @typescript-eslint/no-explicit-any
    try { j = JSON.parse(txt) } catch { throw new Error(`relais Groq indisponible (HTTP ${res.status}) — try again in a moment`) }
    if (!j.ok) throw new Error(j.error || 'Groq indisponible')
    const t = j.data?.choices?.[0]?.message?.content
    return typeof t === 'string' ? t : null
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  })
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`)
  const j = await res.json()
  const t = j?.choices?.[0]?.message?.content
  return typeof t === 'string' ? t : null
}


/** Modèles disponibles pour cette clé Groq (liste en direct, mémorisée 1 h). null = liste illisible. */
let modelsCache: { key: string; at: number; ids: string[] } | null = null
export async function groqModels(groqKey: string): Promise<string[] | null> {
  if (!groqKey) return null
  if (modelsCache && modelsCache.key === groqKey && Date.now() - modelsCache.at < 3600_000) return modelsCache.ids
  try {
    let ids: string[] | null = null
    if (IS_WEB) {
      const r = await fetch('/api/groq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: groqKey, list: true }) })
      const j = JSON.parse(await r.text()) as { ok: boolean; data?: string[] }
      ids = j.ok && Array.isArray(j.data) ? j.data : null
    } else {
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${groqKey}` } })
      if (r.ok) { const j = await r.json(); ids = (j?.data ?? []).filter((m: { active?: boolean }) => m.active !== false).map((m: { id: string }) => String(m.id)) }
    }
    if (ids && ids.length) modelsCache = { key: groqKey, at: Date.now(), ids }
    return ids && ids.length ? ids : null
  } catch { return null }
}
/** Modèles de chat utilisables pour écrire : d'abord `preferred` encore proposés par Groq, puis les autres modèles de
 *  chat de la liste (jamais audio / modération / TTS). Sans liste : `preferred` tel quel. Pure. */
export function pickChatModels(preferred: string[], live: string[] | null): string[] {
  if (!live) return preferred
  const chat = live.filter(id => !/whisper|guard|tts|playai|orpheus|distil|safeguard|compound|allam|prompt-guard/i.test(id))
  const kept = preferred.filter(m => chat.includes(m))
  return [...kept, ...chat.filter(m => !kept.includes(m)).sort()]
}

// ── Texte (descriptions, légendes) : modèles de secours ─────────────────────────────────────────────────
// Groq retire régulièrement des modèles (vu le 22/11/2026 : « llama-3.3-70b-versatile does not exist or you do not
// have access to it »). On essaie la liste dans l'ordre, on passe au suivant si le modèle est refusé, et on retient
// celui qui marche (`sf-groq-text-model`) pour commencer par lui la fois suivante.
// Modèles qui écrivent directement d'abord ; ceux qui « raisonnent » (gpt-oss, qwen3) en dernier : avec une limite
// de longueur serrée, leur raisonnement mangeait tout et la réponse arrivait VIDE (vu le 22/11/2026).
export const TEXT_MODELS = [
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'moonshotai/kimi-k2-instruct',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'qwen/qwen3-32b',
  'openai/gpt-oss-20b',
]
/** Erreur « ce modèle n'existe pas / n'est pas accessible / est retiré » (on essaie alors le suivant). Pure. */
export function isModelUnavailable(msg: string): boolean {
  return /model_not_found|does not exist|do not have access|decommission|no longer supported|not supported|404|model.*(invalid|unknown)/i.test(msg)
}
/** Limite de débit / demande trop grosse pour CE modèle (quotas par modèle chez Groq) : on essaie le suivant. Pure. */
export function isModelBusy(msg: string): boolean {
  return /rate.?limit|tokens per minute|requests per minute|\bTPM\b|\bRPM\b|too large|429|413|over capacity|overloaded|503|try again in/i.test(msg)
}
/** Raison lisible d'une erreur Groq (message de l'API si présent). Pure. */
export function groqReason(msg: string): string {
  const m = /"message"\s*:\s*"([^"]+)"/.exec(msg)
  return (m ? m[1] : msg).replace(/ in organization `[^`]+`/, '').slice(0, 220)
}
/** Retire un éventuel raisonnement affiché (« <think>…</think> » de certains modèles). Pure. */
export function stripThinking(t: string): string {
  return t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}
export async function groqText(groqKey: string, messages: unknown[], maxTokens = 400, temperature = 0.9): Promise<string | null> {
  let saved: string | null = null
  try { saved = localStorage.getItem('sf-groq-text-model') } catch { /* noop */ }
  const order = saved && TEXT_MODELS.includes(saved) ? [saved, ...TEXT_MODELS.filter(m => m !== saved)] : TEXT_MODELS
  let lastErr: unknown = null
  for (const model of order) {
    try {
      const t = await groqChat(groqKey, model, messages, Math.max(maxTokens, /gpt-oss|qwen3/.test(model) ? 4000 : 0), temperature)
      const clean = t == null ? '' : stripThinking(t)
      if (!clean) { lastErr = new Error(`réponse vide (${model})`); continue } // réponse vide → modèle suivant
      try { localStorage.setItem('sf-groq-text-model', model) } catch { /* noop */ }
      return clean
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      // modèle retiré OU limite de débit propre à ce modèle → modèle suivant ; autre erreur (clé invalide…) → remontée
      if (!isModelUnavailable(msg) && !isModelBusy(msg)) throw new Error(groqReason(msg))
    }
  }
  if (lastErr) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
    throw new Error(`aucun modèle Groq n’a répondu (dernière erreur : ${groqReason(msg)})`)
  }
  return null
}
