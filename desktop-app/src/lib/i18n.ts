// Langue de l'interface (FR / EN).
//
// L'app est écrite en français, texte en dur dans ~40 fichiers. Plutôt que de
// réécrire chaque chaîne, on traduit le TEXTE AFFICHÉ : un dictionnaire FR → EN
// (src/lib/i18n.en.ts, chargé seulement en anglais) appliqué au DOM par un
// MutationObserver — nœuds texte + attributs placeholder / title / aria-label / alt.
//   • correspondance exacte (espaces autour conservés), puis gabarits « {0} » ;
//   • jamais dans les champs de saisie, le code, ni sous [data-no-tr] (contenu
//     utilisateur : légendes, bios, logs bruts…) ;
//   • retour en français instantané : le texte d'origine est mémorisé par nœud.
// Nouvelle chaîne dans l'UI → l'ajouter à i18n.en.ts (le test i18n.test.ts le vérifie).
import { useSyncExternalStore } from 'react'

export type Lang = 'fr' | 'en'
const KEY = 'sf-lang'

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'fr' || v === 'en') return v
  } catch { /* stockage indisponible */ }
  const nav = typeof navigator !== 'undefined' ? (navigator.language || 'fr') : 'fr'
  return nav.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

let lang: Lang = initialLang()
const listeners = new Set<() => void>()

export function getLang(): Lang { return lang }
export function locale(): string { return lang === 'en' ? 'en-US' : 'fr-FR' }
export function useLang(): Lang {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => lang, () => lang)
}

/** Texte bilingue écrit directement dans le code (nouvelles fonctions). */
export function pick<T>(v: { fr: T; en: T }): T { return lang === 'en' ? v.en : v.fr }

// ── Dictionnaire ─────────────────────────────────────────────────────────────
export interface Dict { exact: Record<string, string>; templates: [string, string][] }
let exact = new Map<string, string>()
interface Tpl { re: RegExp; anchor: string; en: string }
let tpls: Tpl[] = []
const cache = new Map<string, string | null>()

const norm = (s: string) => s.replace(/\s+/g, ' ')
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function setDict(d: Dict): void {
  exact = new Map(Object.entries(d.exact).map(([k, v]) => [norm(k), v]))
  tpls = d.templates.map(([fr, en]) => {
    const parts = norm(fr).split(/\{\d+\}/)
    const order = [...norm(fr).matchAll(/\{(\d+)\}/g)].map(m => +m[1])
    const re = new RegExp('^' + parts.map(escRe).join('(.*?)') + '$', 's')   // une valeur peut être vide (« s » de pluriel)
    // Les groupes capturés suivent l'ordre d'apparition ; on mémorise quel {n} est lequel.
    const enMapped = en.replace(/\{(\d+)\}/g, (_, n) => `{#${order.indexOf(+n)}}`)
    const anchor = parts.reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), '')
    return { re, anchor, en: enMapped }
  }).sort((a, b) => b.anchor.length - a.anchor.length)
  cache.clear()
}

// Dates écrites en français par toLocaleString('fr-FR') : « 8 oct. », « 12 janvier 2026 ».
const MONTHS: [RegExp, string][] = [
  ['janv\\.?|janvier', 'Jan'], ['févr\\.?|février', 'Feb'], ['mars', 'Mar'], ['avr\\.?|avril', 'Apr'],
  ['mai', 'May'], ['juin', 'Jun'], ['juil\\.?|juillet', 'Jul'], ['août', 'Aug'], ['sept\\.?|septembre', 'Sep'],
  ['oct\\.?|octobre', 'Oct'], ['nov\\.?|novembre', 'Nov'], ['déc\\.?|décembre', 'Dec'],
].map(([fr, en]) => [new RegExp(`(\\d{1,2}) (?:${fr})(?=$|[\\s,·.])`, 'g'), en])
const DAYS: [RegExp, string][] = [
  ['lundi', 'Monday'], ['mardi', 'Tuesday'], ['mercredi', 'Wednesday'], ['jeudi', 'Thursday'],
  ['vendredi', 'Friday'], ['samedi', 'Saturday'], ['dimanche', 'Sunday'],
].map(([fr, en]) => [new RegExp(`(^|\\s)${fr}(?=\\s|,|$)`, 'gi'), en])
function frDates(s: string): string | null {
  if (!/\d/.test(s)) return null
  let out = s
  for (const [re, en] of MONTHS) out = out.replace(re, (_, d) => `${en} ${d}`)
  if (out !== s) for (const [re, en] of DAYS) out = out.replace(re, (_, sp) => `${sp}${en}`)
  return out === s ? null : out
}

function lookup(core: string): string | null {
  const hit = cache.get(core)
  if (hit !== undefined) return hit
  let res: string | null = exact.get(core) ?? null
  if (res == null) {
    for (const t of tpls) {
      if (t.anchor && !core.includes(t.anchor)) continue
      const m = core.match(t.re)
      if (!m) continue
      res = t.en.replace(/\{#(\d+)\}/g, (_, i) => {
        const v = m[+i + 1] ?? ''
        return lookup(v.trim()) ?? v
      })
      break
    }
  }
  if (res == null) res = frDates(core)
  if (cache.size > 20000) cache.clear()
  cache.set(core, res)
  return res
}

/** Traduit une chaîne FR (espaces de bord conservés). Inchangée si inconnue ou en mode FR. */
export function tr(raw: string): string {
  if (lang !== 'en' || !raw) return raw
  const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!m || !m[2]) return raw
  const t = lookup(norm(m[2]))
  return t == null ? raw : m[1] + t + m[3]
}

// ── Application au DOM ───────────────────────────────────────────────────────
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const
const SKIP = 'textarea,[contenteditable],code,pre,script,style,noscript,[data-no-tr]'
const ORIG = new WeakMap<Node, string>()      // texte source (français)
const SET = new WeakMap<Node, string>()       // ce que NOUS avons écrit
const AORIG = new WeakMap<Element, Record<string, { orig: string; set: string | null }>>()
let applying = false

function skipped(el: Element | null): boolean {
  return !el || !!el.closest(SKIP)
}

function doText(n: Text): void {
  const cur = n.nodeValue ?? ''
  if (SET.has(n) && SET.get(n) === cur) {
    if (lang === 'fr') { const o = ORIG.get(n); if (o != null) { n.nodeValue = o; SET.delete(n) } }
    return
  }
  ORIG.set(n, cur); SET.delete(n)
  if (lang !== 'en' || skipped(n.parentElement)) return
  const t = tr(cur)
  if (t !== cur) { SET.set(n, t); n.nodeValue = t }
}

function doAttrs(el: Element): void {
  // Les placeholders des champs sont de l'interface (traduits) ; seul [data-no-tr] les exclut.
  if (el.closest('[data-no-tr],code,pre')) return
  let rec = AORIG.get(el)
  for (const a of ATTRS) {
    const cur = el.getAttribute(a)
    if (cur == null) continue
    rec ??= {}
    const r = rec[a]
    if (r && r.set === cur) {
      if (lang === 'fr') { el.setAttribute(a, r.orig); r.set = null }
      continue
    }
    const entry = { orig: cur, set: null as string | null }
    rec[a] = entry
    if (lang === 'en') { const t = tr(cur); if (t !== cur) { entry.set = t; el.setAttribute(a, t) } }
  }
  if (rec) AORIG.set(el, rec)
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return
  if (root.nodeType === Node.ELEMENT_NODE) doAttrs(root as Element)
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text)
    else doAttrs(n as Element)
  }
}

let observer: MutationObserver | null = null
function startObserver(): void {
  if (observer || typeof MutationObserver === 'undefined') return
  observer = new MutationObserver(recs => {
    if (applying) return
    applying = true
    try {
      for (const r of recs) {
        if (r.type === 'characterData') doText(r.target as Text)
        else if (r.type === 'attributes') doAttrs(r.target as Element)
        else r.addedNodes.forEach(walk)
      }
    } finally { applying = false }
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] })
}

let dictLoaded = false
async function ensureDict(): Promise<void> {
  if (dictLoaded) return
  const m = await import('./i18n.en')
  setDict(m.EN)
  dictLoaded = true
}

function patchDialogs(): void {
  const w = window as unknown as { __sfDlg?: boolean }
  if (w.__sfDlg) return
  w.__sfDlg = true
  const a = window.alert.bind(window), c = window.confirm.bind(window)
  window.alert = (msg?: unknown) => a(tr(String(msg ?? '')))
  window.confirm = (msg?: string) => c(tr(String(msg ?? '')))
}

/** À appeler avant le premier rendu (main.tsx) : charge le dictionnaire si besoin et observe le DOM. */
export async function initI18n(): Promise<void> {
  document.documentElement.lang = lang
  if (lang === 'en') { try { await ensureDict() } catch { /* dictionnaire indisponible → reste en FR */ } }
  patchDialogs()
  startObserver()
}

export async function setLang(l: Lang): Promise<void> {
  if (l === lang) return
  if (l === 'en') { try { await ensureDict() } catch { return } }
  lang = l
  try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
  cache.clear()
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l
    applying = true
    try { walk(document.body) } finally { applying = false }
  }
  listeners.forEach(f => f())
}
