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
    if (IS_WEB) {
      const res = await fetch('/api/groq', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: groqKey, model: 'llama-3.3-70b-versatile', messages, temperature: 0.9, maxTokens: 220 }),
      })
      const j = await res.json() as { ok: boolean; data?: any }
      const txt = j.ok ? j.data?.choices?.[0]?.message?.content : null
      return typeof txt === 'string' ? txt.trim().replace(/^["']|["']$/g, '') : null
    }
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.9, max_tokens: 220 }),
    })
    if (!res.ok) return null
    const j = await res.json()
    const txt = j?.choices?.[0]?.message?.content
    return typeof txt === 'string' ? txt.trim().replace(/^["']|["']$/g, '') : null
  } catch { return null }
}
