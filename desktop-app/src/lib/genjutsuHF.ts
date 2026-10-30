// Genjutsu (accès Blowsome) — moteur côté app. Pilote les comptes Higgsfield de l'équipe par le
// relais du générateur (/api/hf, servi à la même adresse que ScaleFlow ; son mot de passe est remis
// par la RPC sf_genjutsu_access aux seuls comptes Blowsome).
// Une génération = une vidéo source × une modèle (Element Higgsfield) :
//   lien → vidéo (ig_video) → import Higgsfield → generate_video (motion control) → suivi
//   → copie durable (video_garder) → dossier de la Banque de la modèle : X versions spoofées
//     (/api/v1/tools/spoof), ou la vidéo telle quelle si le spoof est coupé.
// La file est un singleton persisté (sf-gj-jobs) : quitter la page ne l'arrête pas, un rechargement
// reprend le suivi. Une génération déjà envoyée à Higgsfield n'est JAMAIS relancée automatiquement
// (coût double) : seulement par le bouton « Relancer ».
import { supabase } from './supabase'
import { IS_WEB } from './platform'
import { saveOutputToBank } from './studioTools'

export const GJ_ORIGIN = IS_WEB && typeof window !== 'undefined' && /^https?:/.test(window.location.origin) ? window.location.origin : 'https://scaleflow.company'
const RELAY = `${GJ_ORIGIN}/api/hf`
export const MAX_RUNNING = 8                    // Higgsfield : 8 Genjutsu à la fois par compte
export const TYPICAL_MS = 240_000               // durée habituelle d'une génération (barre d'avancement estimée)
const RUN_TIMEOUT_MS = 90 * 60_000
const JOBS_KEY = 'sf-gj-jobs', SRC_KEY = 'sf-gj-src', IMPORT_KEY = 'sf-gj-imports'

/* ── relais ── */
let password: string | null = null
export function setRelayPassword(p: string | null): void { password = p; if (p) pump() }
export const relayReady = () => !!password

class RelayError extends Error {
  status: number
  constructor(m: string, s: number) { super(m); this.status = s }
}
const errMsg = (e: unknown) => e instanceof Error ? e.message : String(e)
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

async function relay<T = Any>(body: Record<string, unknown>): Promise<T> {
  const long = /^(mcp|televerser|ig_video|video_garder)$/.test(String(body.a))
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), long ? 58_000 : 15_000)
  let r: Response
  try {
    r = await fetch(RELAY, {
      method: 'POST', signal: ctl.signal, body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...(password ? { 'x-mot-de-passe': password } : {}) },
    })
  } catch {
    throw new RelayError(ctl.signal.aborted ? 'le relais Genjutsu n’a pas répondu à temps' : 'relais Genjutsu injoignable', 0)
  } finally { clearTimeout(timer) }
  const txt = await r.text()
  let j: Any
  try { j = JSON.parse(txt) } catch { throw new RelayError(`réponse illisible du relais (HTTP ${r.status})`, r.status) }
  if (!r.ok) throw new RelayError(j?.error?.message || `HTTP ${r.status}`, r.status)
  return j as T
}

/* ── MCP Higgsfield (le jeton du compte reste sur le serveur du relais) ── */
const sessions = new Map<string, string>()
const opening = new Map<string, Promise<void>>()
let rpcId = 0

async function rpc(account: string, method: string, params: unknown, withId = true): Promise<Any> {
  const msg: Record<string, unknown> = { jsonrpc: '2.0', method }
  if (params) msg.params = params
  if (withId) msg.id = ++rpcId
  const j = await relay<{ session?: string | null; rep?: Any }>({ a: 'mcp', compte: account, session: sessions.get(account) ?? null, rpc: msg })
  if (j.session) sessions.set(account, j.session)
  if (j.rep?.error) throw new Error(j.rep.error.message || JSON.stringify(j.rep.error))
  return j.rep?.result
}
function openSession(account: string): Promise<void> {
  if (sessions.has(account)) return Promise.resolve()
  let p = opening.get(account)
  if (!p) {
    p = (async () => {
      await rpc(account, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'scaleflow', version: '1' } })
      await rpc(account, 'notifications/initialized', null, false)
    })().finally(() => opening.delete(account))
    opening.set(account, p)
  }
  return p
}
async function tool<T = Any>(account: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
  await openSession(account)
  let r: Any
  try { r = (await rpc(account, 'tools/call', { name, arguments: args })) ?? {} } catch (e) {
    // session ou jeton refusé : on rouvre une session et on rejoue une fois — jamais une création
    // qui a pu partir (seul un 401 garantit qu'elle n'a pas été prise en compte).
    const m = errMsg(e), st = e instanceof RelayError ? e.status : 0
    const sessionIssue = st === 401 || st === 404 || /HTTP (401|404)|Unauthorized|session/i.test(m)
    const creates = /^generate_/.test(name) || args.action === 'create'
    if (!sessionIssue || (creates && st !== 401 && !/HTTP 401/.test(m))) throw e
    sessions.delete(account)
    await openSession(account)
    r = (await rpc(account, 'tools/call', { name, arguments: args })) ?? {}
  }
  if (r.structuredContent != null) return r.structuredContent as T
  const txt = ((r.content ?? []) as Any[]).filter(x => x.type === 'text').map(x => x.text).join('\n')
  if (r.isError) throw new Error(txt.slice(0, 400))
  try { return JSON.parse(txt) as T } catch { return txt as unknown as T }
}

// Premier lien https d'un résultat (hors adresses de dépôt).
function urlIn(o: Any, depth = 0): string | null {
  if (!o || typeof o !== 'object' || depth > 6) return null
  for (const k of ['rawUrl', 'raw_url', 'result_url', 'video_url', 'url'])
    if (typeof o[k] === 'string' && /^https:\/\//.test(o[k]) && !/upload\.higgsfield/.test(o[k])) return o[k]
  for (const v of Object.values(o)) { const u = urlIn(v, depth + 1); if (u) return u }
  return null
}
// Raison lisible d'un refus / échec, cherchée dans la réponse brute.
function reasonIn(o: Any): string {
  const seen = new Set<unknown>(), found: string[] = []
  const walk = (x: Any, depth: number) => {
    if (!x || typeof x !== 'object' || depth > 7 || seen.has(x)) return
    seen.add(x)
    for (const [k, v] of Object.entries(x)) {
      if (typeof v === 'string' && v.trim() && v.length < 600 && /error|reason|message|detail|fail|moderation|nsfw|cause|explanation/i.test(k)
        && !/^(completed|failed|nsfw|error|queued)$/i.test(v.trim())) found.push(v.trim())
      else if (v && typeof v === 'object') walk(v, depth + 1)
    }
  }
  walk(o, 0)
  return [...new Set(found)].join(' — ').slice(0, 300)
}
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/* ── comptes, modèles, prompts ── */
export interface HfAccount { name: string; credits: number | null; plan: string }
export async function listAccounts(): Promise<{ cloud: boolean; accounts: HfAccount[] }> {
  const j = await relay<{ nuage?: boolean; comptes?: { nom: string; credits: number | null; plan: string | null }[] }>({ a: 'comptes' })
  return { cloud: !!j.nuage, accounts: (j.comptes ?? []).map(c => ({ name: c.nom, credits: c.credits == null ? null : Number(c.credits), plan: c.plan || '' })) }
}
// Connexion d'un compte Higgsfield (OAuth PKCE) : Higgsfield n'accepte comme adresse de retour
// qu'une adresse locale → la page de retour « ne charge pas » et on colle son adresse dans l'app.
// Le jeton est rangé dans la base de l'équipe par le relais : il ne revient jamais au navigateur.
interface PendingLogin { verifier: string; state: string; clientId: string; redirect: string; name: string; at: number }
const LOGIN_KEY = 'sf-gj-login'
const LOOPBACKS = ['http://127.0.0.1:33418/callback', 'http://localhost:33418/callback', 'http://127.0.0.1/callback', 'http://localhost/callback']
const b64url = (buf: ArrayBuffer | Uint8Array) => {
  let s = ''
  for (const o of new Uint8Array(buf)) s += String.fromCharCode(o)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function startAccountLogin(name: string): Promise<{ url: string; redirect: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)))
  let d: { url?: string; client_id?: string } | null = null, redirect = ''
  for (const r of LOOPBACKS) {
    try { d = await relay({ a: 'depart', retour: r, state, challenge, client_id: null }); redirect = r; break } catch (e) {
      if (!/redirect/i.test(errMsg(e))) throw e
    }
  }
  if (!d?.url || !d.client_id) throw new Error('Higgsfield refuse la connexion d’une application extérieure pour le moment')
  const pending = readJson<PendingLogin[]>(LOGIN_KEY, []).filter(x => Date.now() - x.at < 20 * 60_000)
  pending.push({ verifier, state, clientId: d.client_id, redirect, name, at: Date.now() })
  writeJson(LOGIN_KEY, pending)
  return { url: d.url, redirect }
}
export async function finishAccountLogin(pasted: string): Promise<string> {
  let raw = String(pasted || '').trim().replace(/^[^hl1]*/i, '')
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`        // le navigateur copie parfois sans « http:// »
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('ce n’est pas l’adresse de la page de retour') }
  const err = u.searchParams.get('error')
  if (err) throw new Error(`Higgsfield a refusé : ${u.searchParams.get('error_description') || err}`)
  const code = u.searchParams.get('code'), state = u.searchParams.get('state')
  if (!code) throw new Error('l’adresse collée ne contient pas de code (il faut celle de la page qui ne charge pas)')
  const pending = readJson<PendingLogin[]>(LOGIN_KEY, [])
  const p = pending.find(x => x.state === state)
  if (!p) throw new Error('cette adresse vient d’une autre tentative : relance « Ouvrir Higgsfield » une seule fois, puis colle la nouvelle adresse')
  const t = await relay<{ access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }>({
    a: 'jeton', form: { grant_type: 'authorization_code', code, redirect_uri: p.redirect, client_id: p.clientId, code_verifier: p.verifier },
  })
  if (!t.access_token) throw new Error(t.error_description || t.error || 'jeton refusé')
  await relay({
    a: 'garder', nom: p.name, client_id: p.clientId, credits: null, plan: null,
    jeton: { access_token: t.access_token, refresh_token: t.refresh_token ?? null, expires_at: Math.floor(Date.now() / 1000) + (Number(t.expires_in) || 3600) },
  })
  writeJson(LOGIN_KEY, pending.filter(x => x.state !== state))
  sessions.delete(p.name)
  return p.name
}
export async function removeAccount(name: string): Promise<void> {
  await relay({ a: 'retirer', nom: name })
  sessions.delete(name)
}
// Le compte a perdu sa connexion (jeton révoqué) : il faut le reconnecter sous le même nom.
export const needsReconnect = (e: unknown) => /annulé la connexion|reconnecte|expirée|renouvellement refusé|compte non connecté|HTTP 401/i.test(errMsg(e))

export async function readCredits(account: string): Promise<number | null> {
  const b = await tool<Any>(account, 'balance', {})
  const n = b?.credits ?? b?.balance
  const credits = typeof n === 'number' ? n : null
  relay({ a: 'noter', nom: account, credits, plan: b?.subscription_plan_type || b?.plan || null }).catch(() => { /* simple mémo */ })
  return credits
}

export interface HfModel { id: string; name: string; photo: string | null; mediaId: string | null; ready: boolean }
export async function listModels(account: string): Promise<HfModel[]> {
  const all: Any[] = []
  let cursor: string | null = null
  for (let k = 0; k < 5; k++) {
    const r: Any = await tool<Any>(account, 'show_reference_elements', { action: 'list', size: 100, ...(cursor ? { cursor } : {}) })
    const items: Any[] = r?.items ?? []
    all.push(...items)
    cursor = r?.next_cursor ?? null
    if (!cursor || !items.length) break
  }
  return all.filter(e => e && e.id && e.status !== 'failed').map(e => {
    const m = (e.medias ?? [])[0]
    return { id: String(e.id), name: String(e.name ?? 'Modèle'), photo: m?.url ?? null, mediaId: m?.id ? String(m.id) : null, ready: e.status === 'completed' && !!m?.id }
  })
}

async function shrinkImage(b: Blob): Promise<Blob> {
  // le relais refuse plus de 4,5 Mo et l'image voyage en base64 (+33 %) → ≤ 2,5 Mo
  if (b.size <= 2.5e6) return b
  try {
    const bmp = await createImageBitmap(b)
    let max = 2048, q = 0.9, out: Blob | null = null
    do {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      out = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', q))
      max = Math.round(max * 0.8); q = Math.max(0.7, q - 0.05)
    } while (out && out.size > 2.5e6 && max > 700)
    return out ?? b
  } catch { return b }
}
const toBase64 = (b: Blob) => new Promise<string>((ok, ko) => {
  const f = new FileReader()
  f.onload = () => ok(String(f.result).split(',')[1] ?? '')
  f.onerror = () => ko(new Error('photo illisible'))
  f.readAsDataURL(b)
})
// Nouvelle modèle = un Element « character » Higgsfield (1 à 4 photos du visage).
export async function createModel(account: string, name: string, photos: Blob[]): Promise<void> {
  const medias: { id: string; url: string; type: string }[] = []
  for (const p of photos.slice(0, 4)) {
    const img = await shrinkImage(p)
    const r = await relay<{ media_id?: string; url?: string }>({
      a: 'televerser', compte: account, nom: 'element.jpg', type: img.type === 'image/png' ? 'image/png' : 'image/jpeg', donnees: await toBase64(img),
    })
    if (!r.media_id || !r.url) throw new Error('Higgsfield n’a pas pris la photo')
    medias.push({ id: r.media_id, url: r.url, type: 'media_input' })
  }
  await tool(account, 'show_reference_elements', { action: 'create', category: 'character', name, medias })
}

// Prompts enregistrés par l'équipe dans le générateur (mêmes presets partout).
export async function readPromptPresets(): Promise<Record<string, string>> {
  try {
    const j = await relay<{ valeur?: string | null }>({ a: 'reglage_lire', cle: 'genjutsu_prompts' })
    const o = j.valeur ? JSON.parse(j.valeur) as Record<string, unknown> : {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o)) if (!k.startsWith('__') && typeof v === 'string' && v.trim()) out[k] = v
    return out
  } catch { return {} }
}

export interface PromptOpts { several: boolean; who: string; keepText: boolean; outfit: string }
export function buildPrompt(o: PromptOpts): string {
  const who = o.several && o.who.trim() ? `the woman ${o.who.trim()}` : 'the woman'
  return [
    'Same video as @Video 1: keep the exact same motion, camera movement, framing and timing.',
    `Replace ${who} with @Image 1, preserving her face and her exact hairstyle from @Image 1, no tattoos on any part of her body.${o.several ? ' Keep every other person exactly as in @Video 1.' : ''}`,
    o.keepText ? 'Keep the on-screen texts of @Video 1 exactly as they are.' : 'Remove the caption texts moving on screen.',
    o.outfit.trim() ? `She wears ${o.outfit.trim()}.` : 'Keep the same outfit as @Video 1.',
  ].join('\n')
}

/* ── vidéos sources ── */
export interface SourceVideo { url: string; user: string | null }
const readJson = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* plein ou bloqué */ } }

// Liens collés (un par ligne, ou mélangés à du texte) → liens uniques, Instagram normalisés.
export function parseLinks(text: string): string[] {
  const out: string[] = []
  for (const raw of text.match(/https?:\/\/[^\s<>"')]+/gi) ?? []) {
    let u: URL
    try { u = new URL(raw) } catch { continue }
    let link = u.toString()
    if (/(^|\.)instagram\.com$/i.test(u.hostname)) {
      const code = u.pathname.match(/\/(?:reel|reels|p|tv)\/([\w-]+)/i)?.[1]
      if (!code) continue
      link = `https://www.instagram.com/reel/${code}/`
    }
    if (!out.includes(link)) out.push(link)
  }
  return out
}
export const isInstagram = (link: string) => /^https:\/\/www\.instagram\.com\//.test(link)
export const isDirectVideo = (link: string) => /^https:\/\/[^?#]+\.(mp4|mov|webm)(?:[?#]|$)/i.test(link)

const srcCache: Record<string, SourceVideo & { at: number }> = readJson(SRC_KEY, {})
const srcInflight = new Map<string, Promise<SourceVideo>>()
export function cachedSource(link: string): SourceVideo | null {
  const c = srcCache[link]
  return c && Date.now() - c.at < 7 * 86_400_000 ? c : null
}
export function resolveVideo(link: string): Promise<SourceVideo> {
  const hit = cachedSource(link)
  if (hit) return Promise.resolve(hit)
  let p = srcInflight.get(link)
  if (p) return p
  p = (async (): Promise<SourceVideo> => {
    let v: SourceVideo
    if (isInstagram(link)) {
      let last: unknown = null, got: { url?: string; pseudo?: string | null } | null = null
      for (let k = 0; k < 3 && !got; k++) {
        try { got = await relay<{ url?: string; pseudo?: string | null }>({ a: 'ig_video', url: link }) } catch (e) {
          last = e
          if (/pas de vidéo|pas un lien|lien invalide|clé HikerAPI/i.test(errMsg(e))) break
          await sleep(2000 * (k + 1))
        }
      }
      if (!got?.url) throw last instanceof Error ? last : new Error('vidéo introuvable')
      v = { url: got.url, user: got.pseudo ?? null }
    } else if (isDirectVideo(link)) v = { url: link, user: null }
    else throw new Error('lien non pris en charge (reel Instagram ou fichier .mp4)')
    srcCache[link] = { ...v, at: Date.now() }
    const keep = Object.entries(srcCache).sort((a, b) => b[1].at - a[1].at).slice(0, 300)
    writeJson(SRC_KEY, Object.fromEntries(keep))
    return v
  })().finally(() => srcInflight.delete(link))
  srcInflight.set(link, p)
  return p
}

// La même vidéo n'est importée qu'une fois par compte.
const imports: Record<string, string> = readJson(IMPORT_KEY, {})
const importing = new Map<string, Promise<string>>()     // même vidéo × plusieurs modèles : un seul import
function importVideo(account: string, url: string): Promise<string> {
  const key = `${account}|${url}`
  if (imports[key]) return Promise.resolve(imports[key])
  let p = importing.get(key)
  if (!p) {
    p = (async () => {
      const r = await tool<Any>(account, 'media_import_url', { url, type: 'video' })
      const id = r?.media_id || r?.id || r?.media?.id || JSON.stringify(r ?? '').match(UUID)?.[0]
      if (!id) throw new Error('Higgsfield n’a pas accepté la vidéo')
      imports[key] = String(id)
      writeJson(IMPORT_KEY, Object.fromEntries(Object.entries(imports).slice(-400)))
      return String(id)
    })().finally(() => importing.delete(key))
    importing.set(key, p)
  }
  return p
}

/* ── file des générations ── */
export type GjStatus = 'waiting' | 'preparing' | 'running' | 'saving' | 'spoofing' | 'done' | 'failed'
// count = 0 : pas de spoof, la vidéo est rangée telle quelle dans le dossier.
export interface SpoofPlan { count: number; device: string; gps: string; folder: string; orgId: string | null }
export interface GjModelRef { id: string; name: string; mediaId: string; photo: string | null }
export interface GjJob {
  id: string
  account: string
  model: GjModelRef
  source: string
  sourceUrl?: string | null
  sourceUser?: string | null
  prompt: string
  res: string
  status: GjStatus
  sent?: boolean                 // generate_video envoyé (même sans réponse) → jamais relancé tout seul
  hfJobId?: string | null
  error?: string | null
  filtered?: boolean
  resultUrl?: string | null
  spoof?: SpoofPlan | null
  spoofDone?: number
  spoofFailed?: number
  spoofError?: string | null
  createdAt: number
  startedAt?: number | null
  doneAt?: number | null
}
export const isActive = (s: GjStatus) => s === 'preparing' || s === 'running' || s === 'saving' || s === 'spoofing'

let jobs: GjJob[] = (() => {
  const l = readJson<GjJob[]>(JOBS_KEY, [])
  return Array.isArray(l) ? l.map(recoverAfterReload) : []
})()
// Après un rechargement : ce qui n'était pas encore parti repart, ce qui a peut-être été envoyé
// est signalé (à vérifier dans Higgsfield avant de relancer), le reste reprend son suivi.
function recoverAfterReload(j: GjJob): GjJob {
  if (j.status === 'preparing') return j.sent
    ? { ...j, status: 'failed', error: 'Lancement interrompu (page rechargée) : la vidéo est peut-être partie sur Higgsfield. Vérifie ton historique Higgsfield avant de relancer.' }
    : { ...j, status: 'waiting' }
  if (j.status === 'spoofing') return { ...j, status: 'done', spoofError: 'Spoof interrompu (page rechargée) : relance-le avec « Spoofer ».' }
  return j
}
const subs = new Set<() => void>()
function commit(next: GjJob[]): void {
  jobs = next
  writeJson(JOBS_KEY, jobs.slice(0, 300))
  subs.forEach(f => f())
}
const patch = (id: string, p: Partial<GjJob>) => commit(jobs.map(j => j.id === id ? { ...j, ...p } : j))
const byId = (id: string) => jobs.find(j => j.id === id)

export const getJobs = () => jobs
export function subscribeJobs(f: () => void): () => void { subs.add(f); return () => { subs.delete(f) } }

export interface NewJob { account: string; model: GjModelRef; source: string; prompt: string; res: string; spoof: SpoofPlan | null }
export function enqueue(items: NewJob[]): void {
  const now = Date.now()
  const fresh: GjJob[] = items.map((it, i) => {
    const src = cachedSource(it.source)
    return { ...it, id: crypto.randomUUID(), status: 'waiting', createdAt: now + i, sourceUrl: src?.url ?? null, sourceUser: src?.user ?? null }
  })
  commit([...fresh.reverse(), ...jobs])
  pump()
}
export function retryJob(id: string): void {
  const j = byId(id)
  if (!j) return
  enqueue([{ account: j.account, model: j.model, source: j.source, prompt: j.prompt, res: j.res, spoof: j.spoof ?? null }])
  commit(jobs.filter(x => x.id !== id))
}
export function removeJob(id: string): void {
  const j = byId(id)
  if (!j || isActive(j.status)) return
  commit(jobs.filter(x => x.id !== id))
}
export function clearFinished(): void { commit(jobs.filter(j => j.status !== 'done' && j.status !== 'failed')) }
export function respoof(id: string, plan: SpoofPlan): void {
  const j = byId(id)
  if (!j || !j.resultUrl || isActive(j.status)) return
  patch(id, { spoof: plan, spoofDone: 0, spoofFailed: 0, spoofError: null })
  void spoofJob(id)
}

// Lance ce qui attend (8 à la fois par compte) et reprend le suivi de ce qui tourne.
export function pump(): void {
  if (!password) return
  const active = new Map<string, number>()
  for (const j of jobs) if (j.status === 'preparing' || j.status === 'running') active.set(j.account, (active.get(j.account) ?? 0) + 1)
  const waiting = jobs.filter(j => j.status === 'waiting').sort((a, b) => a.createdAt - b.createdAt)
  for (const j of waiting) {
    const n = active.get(j.account) ?? 0
    if (n >= MAX_RUNNING) continue
    active.set(j.account, n + 1)
    void launch(j.id)
  }
  for (const acc of new Set(jobs.filter(j => j.status === 'running').map(j => j.account))) void pollAccount(acc)
  for (const j of jobs.filter(x => x.status === 'saving')) void collect(j.id)
}

let noRatio = false
async function generate(account: string, params: Record<string, unknown>): Promise<Any> {
  let last: unknown = null
  for (let k = 0; k < 3; k++) {
    try {
      const r = await tool<Any>(account, 'generate_video', { params, context: 'Transférer le mouvement d’une vidéo sur la personne de l’image de référence.' })
      const txt = JSON.stringify(r ?? {})
      // saturation passagère sans rien de créé → nouvel essai
      if (!UUID.test(txt) && /rate.?limit|too many|busy|overload|temporar|try again|unavailable|timeout/i.test(txt) && k < 2) { await sleep(2500 * (k + 1)); continue }
      return r
    } catch (e) {
      last = e
      if (k >= 2 || !/HTTP (429|5\d\d)|rate.?limit|too many|busy|overload|temporar|try again|unavailable/i.test(errMsg(e))) throw e
      await sleep(2500 * (k + 1))
    }
  }
  throw last
}

async function launch(id: string): Promise<void> {
  const j0 = byId(id)
  if (!j0 || j0.status !== 'waiting') return
  patch(id, { status: 'preparing', startedAt: Date.now(), error: null })
  try {
    const src = await resolveVideo(j0.source)
    patch(id, { sourceUrl: src.url, sourceUser: src.user })
    const vid = await importVideo(j0.account, src.url)
    const params: Record<string, unknown> = {
      model: 'hf_mult_motion_control', resolution: j0.res, use_unlim: false, ...(noRatio ? {} : { aspect_ratio: '9:16' }),
      medias: [{ value: vid, role: 'video_references' }, { value: j0.model.mediaId, role: 'image_references' }],
      ...(j0.prompt.trim() ? { prompt: j0.prompt.trim() } : {}),
    }
    patch(id, { sent: true })
    let r: Any
    try { r = await generate(j0.account, params) } catch (e) {
      if (noRatio || !/aspect|ratio/i.test(errMsg(e))) throw e
      noRatio = true; delete params.aspect_ratio            // ce modèle refuse le format : rendu au format de la vidéo
      r = await generate(j0.account, params)
    }
    const ids = [...new Set((JSON.stringify(r ?? {}).match(/"(?:job_id|id)":"([0-9a-f-]{36})"/gi) ?? []).map(x => x.match(UUID)![0]))]
    const hfJobId = r?.job_id || r?.jobs?.[0]?.job_id || ids.find(x => x !== vid && x !== j0.model.mediaId)
    if (!hfJobId) { patch(id, { status: 'failed', error: reasonIn(r) || 'Higgsfield n’a lancé aucune génération.' }); return }
    patch(id, { status: 'running', hfJobId: String(hfJobId) })
  } catch (e) {
    patch(id, { status: 'failed', error: errMsg(e) })
  } finally { pump() }
}

const FAIL = ['failed', 'nsfw', 'canceled', 'cancelled', 'error']
const polling = new Set<string>()
async function pollAccount(account: string): Promise<void> {
  if (polling.has(account)) return
  polling.add(account)
  let errors = 0
  try {
    for (;;) {
      if (!password) break
      const running = jobs.filter(j => j.account === account && j.status === 'running' && j.hfJobId)
      if (!running.length) break
      for (const j of running) if (Date.now() - (j.startedAt ?? j.createdAt) > RUN_TIMEOUT_MS)
        patch(j.id, { status: 'failed', error: 'Toujours en cours après 1 h 30 : regarde ton historique Higgsfield.' })
      const t0 = Date.now()
      let w: Any
      try {
        w = await tool<Any>(account, 'jobs_wait', { jobs: running.map((j, i) => ({ index: i, job_id: j.hfJobId })), timeout_seconds: 15 })
        errors = 0
      } catch {
        errors++
        await sleep(Math.min(15_000, 2000 * errors))
        continue
      }
      for (const st of (w?.jobs ?? []) as Any[]) {
        const j = running.find(x => x.hfJobId === st?.job_id)
        if (!j) continue
        const status = String(st.status ?? '')
        if (status === 'completed') { patch(j.id, { status: 'saving' }); void collect(j.id, st) }
        else if (FAIL.includes(status)) void fail(j.id, st, status)
      }
      // une réponse trop rapide ne doit pas tourner en boucle serrée
      if (Date.now() - t0 < 3000) await sleep(4000)
    }
  } finally { polling.delete(account) }
  pump()
}

async function fail(id: string, st: Any, status: string): Promise<void> {
  const j = byId(id)
  if (!j) return
  patch(id, { status: 'failed', filtered: status === 'nsfw' })
  let why = reasonIn(st)
  if (!why && j.hfJobId) { try { why = reasonIn(await tool(j.account, 'job_display', { id: j.hfJobId })) } catch { /* sans détail */ } }
  const head = status === 'nsfw' ? 'Refusée par le filtre de Higgsfield' : status.startsWith('cancel') ? 'Annulée chez Higgsfield' : 'Échec côté Higgsfield'
  patch(id, { error: why ? `${head} : ${why}` : `${head}.` })
}

const collecting = new Set<string>()
async function collect(id: string, st?: Any): Promise<void> {
  if (collecting.has(id)) return
  collecting.add(id)
  try {
    const j = byId(id)
    if (!j || !j.hfJobId) return
    let url = st ? urlIn(st) : null
    // l'adresse arrive parfois un peu après la fin
    for (let k = 0; !url && k < 4; k++) {
      if (k) await sleep(5000 * k)
      try { const r: Any = await tool<Any>(j.account, 'job_display', { id: j.hfJobId }); url = urlIn(r?.results ?? r) } catch { /* réessayé */ }
    }
    if (!url) {
      patch(id, { status: 'failed', error: 'Terminé, mais Higgsfield n’a pas rendu l’adresse de la vidéo : regarde ton historique Higgsfield.' })
      return
    }
    let durable = url
    try { durable = (await relay<{ url?: string }>({ a: 'video_garder', url })).url || url } catch { /* l'adresse Higgsfield reste valable un temps */ }
    patch(id, { resultUrl: durable, doneAt: Date.now() })
    if (j.spoof && j.spoof.count > 0) await spoofJob(id)
    else if (j.spoof) await saveOriginal(id)
    else patch(id, { status: 'done' })
  } finally { collecting.delete(id) }
}

// Spoof coupé : la vidéo telle quelle, dans le dossier de la modèle.
async function saveOriginal(id: string): Promise<void> {
  const j = byId(id)
  if (!j?.resultUrl || !j.spoof) return
  patch(id, { status: 'spoofing', spoofDone: 0, spoofFailed: 0, spoofError: null })
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Session expirée : reconnecte-toi.')
    const r = await fetch(j.resultUrl)
    if (!r.ok) throw new Error(`vidéo indisponible (HTTP ${r.status})`)
    const bankId = await saveOutputToBank(session.user.id, j.spoof.orgId, new Uint8Array(await r.arrayBuffer()), `Genjutsu ${j.model.name} ${String(j.hfJobId ?? j.id).slice(0, 6)}`, 'mp4', j.spoof.folder)
    if (!bankId) throw new Error('enregistrement dans la Banque refusé')
    patch(id, { status: 'done', spoofDone: 1 })
  } catch (e) { patch(id, { status: 'done', spoofFailed: 1, spoofError: errMsg(e) }) }
}

// X versions uniques (appareil + GPS + empreinte) rangées dans la Banque.
async function spoofJob(id: string): Promise<void> {
  const j = byId(id)
  if (!j?.resultUrl || !j.spoof) return
  const plan = j.spoof, n = Math.max(1, Math.min(10, plan.count))
  patch(id, { status: 'spoofing', spoofDone: 0, spoofFailed: 0, spoofError: null })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { patch(id, { status: 'done', spoofError: 'Session expirée : reconnecte-toi puis « Spoofer ».' }); return }
  const base = `Genjutsu ${j.model.name} ${String(j.hfJobId ?? j.id).slice(0, 6)}`
  let done = 0, failed = 0, lastErr: string | null = null
  await Promise.all(Array.from({ length: n }, async (_, i) => {
    try {
      const r = await fetch(`${GJ_ORIGIN}/api/v1/tools/spoof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ url: j.resultUrl, org_id: plan.orgId, device: plan.device, gps: plan.gps, intensity: 'normal', folder: plan.folder, title: `${base} v${i + 1}` }),
      })
      const b = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null
      if (b?.ok) done++
      else { failed++; lastErr = b?.error ?? `HTTP ${r.status}` }
    } catch (e) { failed++; lastErr = errMsg(e) }
    patch(id, { spoofDone: done, spoofFailed: failed })
  }))
  patch(id, { status: 'done', spoofDone: done, spoofFailed: failed, spoofError: failed ? lastErr : null })
}
