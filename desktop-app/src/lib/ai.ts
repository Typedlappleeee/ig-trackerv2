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
    const j = await res.json() as { ok: boolean; error?: string; data?: any }   // eslint-disable-line @typescript-eslint/no-explicit-any
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


// ── Texte (descriptions, légendes) : modèles de secours ─────────────────────────────────────────────────
// Groq retire régulièrement des modèles (vu le 22/11/2026 : « llama-3.3-70b-versatile does not exist or you do not
// have access to it »). On essaie la liste dans l'ordre, on passe au suivant si le modèle est refusé, et on retient
// celui qui marche (`sf-groq-text-model`) pour commencer par lui la fois suivante.
export const TEXT_MODELS = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'moonshotai/kimi-k2-instruct',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
]
/** Erreur « ce modèle n'existe pas / n'est pas accessible / est retiré » (on essaie alors le suivant). Pure. */
export function isModelUnavailable(msg: string): boolean {
  return /model_not_found|does not exist|do not have access|decommission|no longer supported|not supported|404|model.*(invalid|unknown)/i.test(msg)
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
      const t = await groqChat(groqKey, model, messages, maxTokens, temperature)
      if (t == null) continue
      try { localStorage.setItem('sf-groq-text-model', model) } catch { /* noop */ }
      return stripThinking(t)
    } catch (e) {
      lastErr = e
      if (!isModelUnavailable(e instanceof Error ? e.message : String(e))) throw e // autre erreur (clé, quota…) : on la remonte
    }
  }
  if (lastErr) throw new Error('aucun modèle Groq disponible pour cette clé')
  return null
}
