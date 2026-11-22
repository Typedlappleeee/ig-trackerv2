// Bios Instagram automatiques PAR MARCHÉ (prompts de l'équipe, 22/11/2026) : France, USA, Allemagne.
// 3 lignes par bio ; l'IA renvoie N bios séparées par « --- ». Modifiables dans l'app (`sf-bio-prompt-<marché>`).
import { groqText } from './ai'
import type { Market } from './captionMarkets'

const FR = `Tu écris des bios courtes pour un profil Instagram d'une étudiante française de 18 ans. Les bios sont en français. Chaque bio fait 3 lignes, et les 3 lignes varient d'une bio à l'autre. Tout doit sonner comme une vraie fille qui écrit sa bio Insta : naturel, simple, jamais forcé.

CODES FRANÇAIS :
- bios courtes et un peu nonchalantes, pas trop d'emojis
- slang avec parcimonie, jamais plus d'un mot par bio : « en vrai », « la flemme », « tkt », « jsp », « grave »
- mots anglais courants acceptés : « chill », « good vibes », « girly »

LIGNE 1 : une étiquette très courte (1 à 4 mots), différente à chaque fois. Thèmes à mélanger :
- l'âge, toujours 18, écrit de façon variée : « 18 », « 18yo », « 18 ans », « 1️⃣8️⃣ », « ⓵⓼ »
- les études : « étudiante », « étudiante en psycho », « L1 droit », « en éco-gestion », « en partiels 😩 », « future infirmière »
- un goût ou une habitude simple : « accro au café », « team matcha », « fan de sushis », « pilates », « skincare addict »
Le drapeau 🇫🇷 apparaît dans environ 2 bios sur 3. Pas de régions, villes ou origines.

LIGNE 2 : courte (2 à 5 mots), en minuscules, douce, un peu taquine ou mignonne. Elle complète la ligne 1 sans la répéter.
Dans l'esprit de : « timide mais attachante », « je ne mords pas sauf si.. », « ta petite douceur », « célib mais difficile », « sage… en apparence », « douce mais têtue », « ton petit rayon de soleil »
- elle doit avoir un peu de caractère : jamais un seul mot neutre comme « célib » tout seul
- pas d'anecdotes ni de détails de vie quotidienne
- style SMS de temps en temps (« celibbb », « ptite », « :p »)
- pas de fautes involontaires
- environ 1 bio sur 10 sans ligne 2

LIGNE 3 : une petite phrase qui donne envie de regarder ma story, sans jamais donner d'ordre. Pas de « clique », « va voir », « regarde », « check ». Ton complice ou un peu mystérieux, suivi d'un seul emoji.
Exemples : « ma story t'attend », « tu as vu ma story ? », « petite surprise en story », « ça se passe en story », « j'ai posté un truc en story », « un secret en story », « j'en dis plus en story », « story rien que pour toi »
Le mot « story » doit toujours y être.
Emoji à varier : 💗 🥰 💕 🤭 🫶 💋 👀 ✨ 🌸 🎀 — jamais le même deux bios de suite.

CRÉDIBILITÉ : chaque ligne doit être quelque chose qu'une vraie fille de 18 ans écrirait vraiment dans sa bio. Pas de formules poétiques, pas de jargon Instagram (« golden hour », « photo dump », « main character »), pas de slang qui sonne forcé. Dans le doute, choisis la formulation la plus simple.

UNICITÉ :
- chaque bio de ce lot doit être différente de toutes les autres : aucune ligne 2 répétée, même reformulée
- évite les phrases les plus banales : cherche à chaque fois une formulation moins évidente
- alterne les thèmes de ligne 1, jamais deux fois de suite le même
- jamais deux fois de suite la même phrase de ligne 3
- si un âge est indiqué, c'est toujours 18, écrit tel quel

Donne-moi [NOMBRE] bios, séparées par « --- », sans numéros ni commentaires.`

const US = `You write short Instagram bios for an 18-year-old American college freshman. Bios are in American English. Each bio is 3 lines, and all 3 lines change from one bio to the next. Everything must sound like a real American girl writing her own bio: natural, simple, never forced.

US CODES:
- mostly all lowercase, a bit more emojis than in Europe, confident tone
- slang used sparingly, never more than one word per bio: "lowkey", "tbh", "ngl", "obsessed", "vibes"
- simple US references are fine: college, campus, iced coffee, finals

LINE 1: a very short tag (1 to 4 words), different every time. Mix these themes:
- age, always 18, written in different ways: "18", "18yo", "18y", "1️⃣8️⃣", "⓵⓼"
- school: "college student", "freshman", "psych major", "nursing student", "pre-law", "finals week 😩"
- a simple taste or habit: "iced coffee addict", "matcha girl", "sushi lover", "pilates", "skincare"
The 🇺🇸 flag appears in about 1 out of 2 bios. No cities or states.

LINE 2: short (2 to 5 words), lowercase, sweet, a little teasing or cute. It complements line 1 without repeating it.
In the spirit of: "shy but sweet", "i don't bite… unless", "ur little sunshine", "single but picky", "innocent… or not", "soft but stubborn", "sweet with a little sass"
- it needs a bit of character: never one neutral word like "single" on its own
- no anecdotes or daily-life details
- texting abbreviations now and then ("ur", "u", "tbh")
- about 1 in 10 bios has no line 2

LINE 3: a short line that makes people want to see my story, never giving an order. No "click", "check", "go see", "tap". Playful or a bit mysterious, followed by one single emoji.
Examples: "something on my story", "u saw my story?", "little surprise on my story", "story's for u", "more on my story", "new story", "story time", "posted something just for u"
The word "story" must always be there.
Rotate emojis: 💗 🥰 💕 🤭 🫶 💋 👀 ✨ 🌸 🎀 🦋 — never the same one two bios in a row.

CREDIBILITY: every line must be something a real 18-year-old girl would actually write in her bio. No poetic phrases, no Instagram jargon ("golden hour", "photo dump", "main character"), no slang that sounds forced (no "delulu", "it's giving", "ate"). When in doubt, pick the simplest wording.

UNIQUENESS:
- every bio in this batch must be different from all the others: no line 2 repeated, even reworded
- avoid the most generic phrases: always look for a less obvious wording
- alternate line 1 themes, never the same theme twice in a row
- never the same line 3 twice in a row
- if an age is shown, it is always 18, written as is

Give me [NUMBER] bios, separated by "---", no numbers, no comments.`

const DE = `Du schreibst kurze Instagram-Bios für eine 18-jährige deutsche Studentin. Die Bios sind auf Deutsch. Jede Bio hat 3 Zeilen, und alle 3 Zeilen ändern sich von Bio zu Bio. Alles muss klingen wie ein echtes deutsches Mädchen, das seine eigene Bio schreibt: natürlich, einfach, nie gezwungen.

DEUTSCHE CODES:
- schlichter als in den USA, wenige Emojis, oft kleingeschrieben
- etwas Englisch gemischt mit Deutsch ist normal: "single", "good vibes", "no stress"
- Slang sparsam, nie mehr als ein Wort pro Bio: "lowkey", "same", "läuft", "safe"
- einfache kulturelle Bezüge sind okay: Uni, Semester, Klausuren, Kaffee

ZEILE 1: ein sehr kurzes Label (1 bis 4 Wörter), jedes Mal anders. Mische diese Themen:
- das Alter, immer 18, unterschiedlich geschrieben: "18", "18yo", "18 Jahre", "1️⃣8️⃣", "⓵⓼"
- Studium: "Studentin", "Psychologie-Studentin", "1. Semester", "BWL", "Klausurenphase 😩", "angehende Lehrerin"
- eine einfache Vorliebe oder Gewohnheit: "Kaffee-Junkie", "Team Matcha", "Sushi-Liebe", "Pilates", "Skincare"
Die Flagge 🇩🇪 erscheint in etwa 2 von 3 Bios. Keine Städte oder Regionen.

ZEILE 2: kurz (2 bis 5 Wörter), kleingeschrieben, süß, ein bisschen frech oder niedlich. Sie ergänzt Zeile 1, ohne sie zu wiederholen.
Im Stil von: "schüchtern aber lieb", "ich beiße nicht… außer", "dein kleiner sonnenschein", "single aber wählerisch", "brav… auf den ersten blick", "süß aber stur", "süß mit etwas frechheit"
- sie braucht ein bisschen Charakter: nie nur ein neutrales Wort wie "single"
- keine Anekdoten oder Alltagsdetails
- Abkürzungen ab und zu ("hdl", "vllt", "lol")
- korrekte Rechtschreibung, keine ungewollten Fehler
- etwa jede 10. Bio ohne Zeile 2

ZEILE 3: ein kurzer Satz, der Lust macht, meine Story anzuschauen, ohne jemals einen Befehl zu geben. Kein "klick", "schau", "guck". Verspielt oder ein bisschen geheimnisvoll, gefolgt von genau einem Emoji.
Beispiele: "was neues in meiner story", "hast du meine story gesehen?", "kleine überraschung in der story", "story ist für dich", "mehr in meiner story", "neue story", "psst… story"
Das Wort "story" muss immer vorkommen.
Emojis abwechseln: 💗 🥰 💕 🤭 🫶 💋 👀 ✨ 🌸 🎀 — nie zweimal hintereinander dasselbe.

GLAUBWÜRDIGKEIT: jede Zeile muss etwas sein, das ein echtes 18-jähriges Mädchen wirklich in seine Bio schreiben würde. Keine poetischen Sätze, kein Instagram-Jargon ("golden hour", "photo dump", "main character"), kein Slang, der gezwungen klingt (kein "ehrenfrau", "sheesh", "gönn dir"). Im Zweifel die einfachste Formulierung wählen.

EINZIGARTIGKEIT:
- jede Bio in dieser Runde muss sich von allen anderen unterscheiden: keine Zeile 2 doppelt, auch nicht umformuliert
- vermeide die banalsten Sätze: suche immer eine weniger offensichtliche Formulierung
- wechsle die Themen von Zeile 1 ab, nie zweimal hintereinander dasselbe Thema
- nie zweimal hintereinander dieselbe Zeile 3
- wenn ein Alter angegeben ist, ist es immer 18, genau so geschrieben

Gib mir [ANZAHL] Bios, getrennt durch "---", ohne Nummern, ohne Kommentare.`

export const DEFAULT_BIO_PROMPTS: Record<Market, string> = { fr: FR, us: US, de: DE }
export function bioPrompt(m: Market): string {
  try { const v = localStorage.getItem(`sf-bio-prompt-${m}`); if (v && v.trim()) return v } catch { /* noop */ }
  return DEFAULT_BIO_PROMPTS[m]
}
export function saveBioPrompt(m: Market, text: string | null): void {
  try { if (text && text.trim() && text !== DEFAULT_BIO_PROMPTS[m]) localStorage.setItem(`sf-bio-prompt-${m}`, text); else localStorage.removeItem(`sf-bio-prompt-${m}`) } catch { /* noop */ }
}

/** Réponse de l'IA → bios (séparées par « --- », 150 caractères max chez Instagram). Pure. */
export function splitBios(raw: string): string[] {
  return raw.replace(/\r/g, '').split(/^\s*[-—–]{3,}\s*$/m)
    .map(b => b.split('\n').map(l => l.trim()).filter(Boolean).join('\n').replace(/^\s*(?:\d{1,2}[.)])\s+/, ''))
    .filter(b => b.length > 0 && b.length <= 150 && !/^(voici|here are|hier sind)\b/i.test(b))
}

/** N bios pour le marché (le nombre remplace [NOMBRE] / [NUMBER] / [ANZAHL] du prompt). */
export async function generateBios(groqKey: string, m: Market, n: number): Promise<string[]> {
  if (!groqKey) throw new Error('clé Groq manquante (Réglages › Intégrations)')
  const out: string[] = []
  for (let guard = 0; out.length < n && guard < 4; guard++) {
    const ask = Math.min(20, n - out.length)
    const prompt = bioPrompt(m).replace(/\[(NOMBRE|NUMBER|ANZAHL)\]/g, String(ask))
    const raw = await groqText(groqKey, [{ role: 'user', content: prompt + (out.length ? `\n\n(Déjà écrites, à ne pas répéter :\n${out.join('\n---\n')})` : '') }], Math.min(6000, 120 * ask + 800), 1)
    if (!raw) break
    out.push(...splitBios(raw).filter(b => !out.includes(b)))
  }
  if (!out.length) throw new Error('aucune bio reçue de l’IA')
  return out.slice(0, n)
}
