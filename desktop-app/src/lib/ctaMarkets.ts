// Textes CTA de Story générés par IA, par MARCHÉ (prompts de l'équipe, 25/11/2026), modifiables (`sf-cta-prompt-<m>`).
// Un texte différent par compte ; même moteur que les descriptions de Reels (modèles Groq en direct, en parallèle,
// quota du jour contourné, réserve `sf-cta-cache-<m>`). Les prompts demandent UN CTA : on en demande N par lot, un par
// ligne, en passant les CTA déjà obtenus dans « CTA précédents » (comme prévu par le prompt), puis on vérifie les
// consignes (2 à 6 mots, emoji ❤️ 💕 💗 à la fin, pas de virgule, pas de « lien / bio / clique »).
import { generateMarketCaptions, type Market } from './captionMarkets'

export const DEFAULT_CTA_PROMPTS: Record<Market, string> = {
  fr: `Génère un seul CTA très court pour une story Instagram en français naturel.

Ambiance : une fille seule qui s’ennuie et aimerait que quelqu’un vienne lui parler. Le texte doit sembler spontané et personnel avec une touche de flirt.

Exemples de style :
seule ce soir ❤️
je m’ennuie.. 💕
j’attends ton msg 💗
viens me tenir compagnie ❤️
sois pas timide 💕
je t’attends ici ❤️

Consignes :
- 2 à 6 mots en minuscules.
- Termine par 1 ou 2 emojis parmi ❤️ 💕 💗.
- Aucune virgule.
- Pas de « clique » de « lien » de « bio » ni de formulation publicitaire.
- Pas de phrase poétique de déclaration intense ou de contenu sexuel explicite.
- Écris comme sur Instagram avec des mots simples et familiers.
- Varie entre solitude ennui attente d’un message et invitation à venir parler.
- Choisis une seule idée par CTA.
- Inspire-toi des exemples sans les recopier systématiquement.
- Si des CTA précédents sont fournis évite de les répéter.

Réponds uniquement avec un CTA sans guillemets ni explication.`,
  de: `Génère un seul CTA très court pour une story Instagram en allemand naturel d’Allemagne.

Ambiance : une fille seule qui s’ennuie et aimerait que quelqu’un vienne lui parler. Le texte doit ressembler à un petit message spontané avec une touche de flirt.

Exemples de style :
heute Abend allein ❤️
mir ist langweilig.. 💕
schreib mir 💗
ich warte auf dich ❤️
sei nicht schüchtern 💕
leistest du mir Gesellschaft? ❤️

Consignes :
- 2 à 6 mots.
- Style décontracté de message Instagram avec une grammaire allemande naturelle.
- Termine par 1 ou 2 emojis parmi ❤️ 💕 💗.
- Aucune virgule. Choisis des phrases qui n’en nécessitent pas.
- Pas de « klick » de « Link » de « Bio » ni de formulation publicitaire.
- Pas de traduction littérale du français ou de l’anglais.
- Pas de phrase poétique de déclaration intense ou de contenu sexuel explicite.
- Varie entre solitude ennui attente d’un message et invitation à venir parler.
- Choisis une seule idée par CTA.
- Inspire-toi des exemples sans les recopier systématiquement.
- Si des CTA précédents sont fournis évite de les répéter.

Réponds uniquement avec un CTA en allemand sans guillemets ni explication.`,
  us: `Génère un seul CTA très court pour une story Instagram en anglais américain naturel.

Ambiance : une fille seule qui s’ennuie et aimerait que quelqu’un vienne lui parler. Le texte doit ressembler à un petit message spontané avec une touche de flirt.

Exemples de style :
alone tonight ❤️
sooo bored.. 💕
text me 💗
keep me company? ❤️
don’t be shy 💕
waiting for your message ❤️

Consignes :
- 2 à 6 mots en minuscules.
- Termine par 1 ou 2 emojis parmi ❤️ 💕 💗.
- Aucune virgule.
- Pas de « click » de « link » de « bio » ni de formulation publicitaire.
- Utilise un anglais américain familier et simple sans argot forcé.
- Pas de phrase poétique de déclaration intense ou de contenu sexuel explicite.
- Varie entre solitude ennui attente d’un message et invitation à venir parler.
- Choisis une seule idée par CTA.
- Tu peux occasionnellement allonger un mot comme « sooo » sans en abuser.
- Inspire-toi des exemples sans les recopier systématiquement.
- Si des CTA précédents sont fournis évite de les répéter.

Réponds uniquement avec un CTA en anglais sans guillemets ni explication.`,
}

export function ctaPrompt(m: Market): string {
  try { const v = localStorage.getItem(`sf-cta-prompt-${m}`); if (v && v.trim()) return v } catch { /* noop */ }
  return DEFAULT_CTA_PROMPTS[m]
}
export function saveCtaPrompt(m: Market, text: string | null): void {
  try { if (text && text.trim() && text !== DEFAULT_CTA_PROMPTS[m]) localStorage.setItem(`sf-cta-prompt-${m}`, text); else localStorage.removeItem(`sf-cta-prompt-${m}`) } catch { /* noop */ }
}

/** Réponse de l'IA → CTA (un par ligne, sans numéro / puce / guillemets). Pure. */
export function splitCtas(raw: string): string[] {
  return raw.replace(/\r/g, '').split('\n')
    .map(l => l.trim().replace(/^(?:\d{1,2}[.)]|[-*•])\s*/, '').replace(/^["“«]\s*|\s*["”»]$/g, '').trim())
    .filter(l => l && !/^(voici|here are|hier sind|cta)\b/i.test(l))
}
/** Consignes vérifiées : 2 à 6 mots, finit par 1 ou 2 emojis ❤️ 💕 💗, pas de virgule, pas de lien / bio / clique. Pure. */
export function validCta(c: string): boolean {
  if (c.includes(',')) return false
  if (/\b(clique[rz]?|click|klick\w*|lien|link|bio)\b/i.test(c)) return false
  const m = /^(.*?)\s*((?:❤️|❤|💕|💗){1,2})$/u.exec(c.trim())
  if (!m) return false
  const words = m[1].split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w))
  return words.length >= 2 && words.length <= 6
}

/** N textes CTA différents pour le marché (prompt du marché). Mêmes garanties que les descriptions : tout ou erreur. */
export function generateMarketCtas(groqKey: string, m: Market, n: number, onLog?: (msg: string) => void, opts?: { useCache?: boolean }): Promise<string[]> {
  return generateMarketCaptions(groqKey, m, n, onLog, {
    useCache: opts?.useCache,
    batch: 25,
    gen: {
      ns: 'cta', system: ctaPrompt(m), split: splitCtas, valid: validCta, tokPer: 25,
      ask: (k, prev) => `CTA précédents : ${prev.length ? prev.join(' / ') : 'aucun'}\n\nGénère ${k} CTA différents, chacun respecte toutes les consignes, un par ligne, sans numéro ni guillemets.`,
    },
  })
}
