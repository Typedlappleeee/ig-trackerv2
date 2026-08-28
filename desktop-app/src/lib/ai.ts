// Génération de légende via Groq (OpenAI-compatible). En desktop (webSecurity
// off) l'appel direct passe sans CORS. Renvoie null si pas de clé ou en cas d'échec.
export async function generateCaption(groqKey: string, topic?: string): Promise<string | null> {
  if (!groqKey) return null
  const prompt = topic?.trim()
    ? `Écris une légende Instagram courte et accrocheuse (français) pour un Reel sur : ${topic.trim()}. Ajoute 3 à 5 hashtags pertinents. Pas de guillemets.`
    : `Écris une légende Instagram courte et accrocheuse (français) pour un Reel qui donne envie de regarder jusqu'au bout. Ajoute 3 à 5 hashtags pertinents. Pas de guillemets.`
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9, max_tokens: 220,
      }),
    })
    if (!res.ok) return null
    const j = await res.json()
    const txt = j?.choices?.[0]?.message?.content
    return typeof txt === 'string' ? txt.trim().replace(/^["']|["']$/g, '') : null
  } catch { return null }
}
