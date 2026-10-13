import { IS_WEB } from './platform'
import { usernameIssue } from './igRules'

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

// ── Génération par lots (Outils IA : légendes, bios) ──────────────────────────
async function groqChat(groqKey: string, messages: { role: string; content: string }[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<string | null> {
  const temperature = opts.temperature ?? 0.95, maxTokens = opts.maxTokens ?? 1800
  try {
    if (IS_WEB) {
      const res = await fetch('/api/groq', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: groqKey, model: 'llama-3.3-70b-versatile', messages, temperature, maxTokens }),
      })
      const j = await res.json() as { ok: boolean; data?: any }
      const txt = j.ok ? j.data?.choices?.[0]?.message?.content : null
      return typeof txt === 'string' ? txt : null
    }
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature, max_tokens: maxTokens }),
    })
    if (!res.ok) return null
    const j = await res.json()
    const txt = j?.choices?.[0]?.message?.content
    return typeof txt === 'string' ? txt : null
  } catch { return null }
}

/** Pur : découpe une réponse « 1. … / - … / • … » en éléments propres, sans doublons. */
export function parseList(text: string, max = 100): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^(\d{1,3}[.)\]:-]|[-*•–])\s*/, '').replace(/^["“«]\s*|\s*["”»]$/g, '').trim()
    if (line.length < 2 || /^(voici|here are|bien sûr|sure)\b/i.test(line)) continue
    const k = line.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); out.push(line)
    if (out.length >= max) break
  }
  return out
}

export type BatchKind = 'captions' | 'bios'
export interface BatchOpts { niche: string; tone: string; lang: 'fr' | 'en'; n: number; hashtags?: boolean; name?: string }

/** Pur : messages envoyés au modèle pour un lot. */
export function batchPrompt(kind: BatchKind, o: BatchOpts): { role: string; content: string }[] {
  const L = o.lang === 'en' ? 'ANGLAIS' : 'FRANÇAIS'
  const sys = `Tu es un expert des réseaux sociaux pour créatrices de contenu. Tu écris exclusivement en ${L}. Réponds UNIQUEMENT par une liste numérotée, un élément par ligne, sans titre ni commentaire.`
  const niche = o.niche.trim() || 'créatrice de contenu lifestyle'
  const user = kind === 'captions'
    ? `Écris ${o.n} légendes Instagram différentes pour des Reels. Niche : ${niche}. Ton : ${o.tone}. Courtes (1 à 2 phrases), accrocheuses, avec 1 à 2 emojis${o.hashtags ? ' et 3 à 5 hashtags à la fin' : ', sans hashtags'}. Varie les accroches (question, POV, défi, confidence).`
    : `Écris ${o.n} bios Instagram différentes${o.name?.trim() ? ` pour « ${o.name.trim()} »` : ''}. Niche : ${niche}. Ton : ${o.tone}. 150 caractères maximum chacune, 1 à 3 emojis, une invitation à cliquer sur le lien en fin de bio. Sur UNE seule ligne chacune.`
  return [{ role: 'system', content: sys }, { role: 'user', content: user }]
}

/** Génère un lot de légendes ou de bios (null si clé absente / échec). */
export async function generateBatch(groqKey: string, kind: BatchKind, o: BatchOpts): Promise<string[] | null> {
  if (!groqKey) return null
  const txt = await groqChat(groqKey, batchPrompt(kind, o), { maxTokens: Math.min(4000, 120 + o.n * (kind === 'captions' ? 80 : 60)) })
  if (!txt) return null
  const list = parseList(txt, o.n)
  return kind === 'bios' ? list.map(b => b.slice(0, 150)) : list
}

// ── Pseudos (local, sans IA) ─────────────────────────────────────────────────

/** Pur : `n` pseudos Instagram valides et uniques dérivés d'un prénom / d'une base. */
export function genUsernames(base: string, n = 30, rnd: () => number = Math.random): string[] {
  const clean = base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9._]/g, '').replace(/^\.+|\.+$/g, '').replace(/\.{2,}/g, '.')
  if (!clean) return []
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const vowelStretch = (s: string) => s.replace(/[aeiouy](?!.*[aeiouy])/, m => m.repeat(2 + Math.floor(rnd() * 2)))
  const doubleLast = (s: string) => s + s.slice(-1)
  const forms = [clean, vowelStretch(clean), doubleLast(clean), clean.replace(/[aeiouy]/, m => m + m)]
  const pre = ['', '', 'its', 'the', 'real', 'hey', 'xo', 'iam', 'miss', 'little']
  const suf = ['', 'officiel', 'off', 'fr', 'xo', 'x', 'vip', 'priv', 'paris', 'bby', 'love', 'daily', 'world']
  const seps = ['', '', '.', '_']
  const out = new Set<string>()
  for (let tries = 0; out.size < n && tries < n * 40; tries++) {
    const f = pick(forms), p = pick(pre), s = pick(suf)
    let h = p ? `${p}${pick(seps)}${f}` : f
    if (s) h = `${h}${pick(seps)}${s}`
    if (rnd() < 0.3) h += String(Math.floor(rnd() * 100))
    if (h === clean && out.size > 0) continue
    h = h.replace(/\.{2,}/g, '.').replace(/^[._]+|\.$/g, '').slice(0, 30).replace(/\.$/, '')
    if (!usernameIssue(h)) out.add(h)
  }
  return [...out]
}
