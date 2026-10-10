// Moteur du Flow Builder (GeeLark · Instagram).
//
// Un flow = une chaîne de blocs (connexion, pseudo, photo, bio, chauffe, post,
// story, pause) exécutée dans l'ordre sur chaque compte choisi, depuis le
// navigateur. Chaque téléphone ne démarre qu'UNE fois pour tout le flow : le moteur
// le marque « géré » (setPhoneManaged) pour que les primitives ne le redémarrent ni
// ne l'éteignent entre deux blocs, puis l'éteint à la fin — succès, échec ou
// annulation.
//
// Tout est personnalisable par bloc : nom, activé/désactivé, délai aléatoire avant,
// réessais, comportement en cas d'échec, et pour les médias la source (choix
// manuel, dossier de la banque ou toute la banque).
//
// L'état des runs vit hors React (singleton) → la progression survit à la
// navigation, et le run apparaît dans la pastille globale (runStore).
import { startRunHistory, type RunHistory } from './runHistory'
import { expandUsername, usernameListIssues } from './igRules'
import { useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ensurePhoneRunning, setPhoneManaged, stopPhoneSurely, sleep,
  abortPhone, clearPhoneAbort, cancelPhoneTask,
  loginInstagramOnPhone, editProfileOnPhone, warmupAccountNative, postReelToPhone, postStoryToPhone,
  geelarkUploadVideo, geelarkUploadImage,
} from '@/lib/geelark'
import { changeUsernameOnPhone, changeProfilePicOnPhone, resetInstagram } from '@/lib/geelarkAdb'
import { startCreditRun, isCreditError, CREDIT_COSTS, type CreditRun } from '@/lib/credits'
import { startRun, type RunHandle } from '@/lib/runStore'
import { heartbeatPhone } from '@/lib/phoneWatch'

// ── Modèle ───────────────────────────────────────────────────────────────────
export type BlockType = 'login' | 'username' | 'avatar' | 'bio' | 'warmup' | 'post' | 'story' | 'pause'
export type PoolMode = 'seq' | 'random'
export type MediaSource = 'pick' | 'folder' | 'all'
export type BlockOnError = 'inherit' | 'stop' | 'continue'

export interface BlockParams {
  // ── Communs à tous les blocs ──
  label?: string            // nom personnalisé du bloc
  disabled?: boolean        // bloc conservé mais sauté à l'exécution
  delayMin?: number         // attente aléatoire avant le bloc (min)
  delayMax?: number
  retries?: number          // nouvelles tentatives en cas d'échec (0–3)
  onError?: BlockOnError    // sinon : comportement du flow
  // ── Médias (post / photo de profil / story) ──
  source?: MediaSource      // défaut 'pick'
  folder?: string           // si source = 'folder'
  imageIds?: string[]       // avatar / story (source 'pick')
  videoIds?: string[]       // post (source 'pick')
  mode?: PoolMode           // répartition des médias entre comptes
  // ── Textes ──
  usernames?: string        // pseudo : un par ligne, {4} = 4 chiffres aléatoires
  bios?: string             // bio : une par ligne
  names?: string            // bio : nom affiché, un par ligne (optionnel)
  link?: string             // bio : lien du profil / story : lien du sticker (même pour tous)
  linkTitle?: string        // bio : titre du lien
  bioSingle?: boolean       // bio : une seule bio (multi-lignes) pour tous les comptes (édition en masse)
  linkMode?: 'same' | 'perAccount'   // story
  links?: string            // story : un lien par compte (une ligne par compte, dans l'ordre)
  linkText?: string         // story : texte du sticker
  captions?: string         // post : une légende par ligne
  captionMode?: PoolMode    // post : répartition des légendes (défaut = mode)
  trial?: boolean           // post : Reel d'essai (non-abonnés)
  removeAfter?: boolean     // post : usage unique → vidéo mise à la corbeille après publication
  minMin?: number           // chauffe / pause : durée mini (min)
  maxMin?: number           // chauffe / pause : durée maxi (min)
  keyword?: string          // chauffe : mots-clés, un par ligne (tiré au hasard par compte)
}

export interface FlowBlock { id: string; type: BlockType; params: BlockParams }
export type OnError = 'stop' | 'continue'
export interface FlowDefaults { concurrency?: number; rotation?: boolean; groups?: string[] }
export interface Flow {
  id: string; name: string; blocks: FlowBlock[]; onError: OnError
  description?: string; defaults?: FlowDefaults; updatedAt?: string
}

export interface BlockDef {
  type: BlockType
  label: string
  group: 'Compte' | 'Activité' | 'Contenu'
  icon: string          // chemin(s) SVG séparés par |
  color: string         // rgb « r,g,b »
  hint: string
  credits: number       // crédits par compte
  media?: 'video' | 'image'
  defaults: () => BlockParams
  estimate: (p: BlockParams) => [number, number]   // minutes [min, max] hors délai/réessais
}

export const BLOCKS: BlockDef[] = [
  { type: 'login', label: 'Connexion', group: 'Compte', color: '56,189,248', credits: 0,
    icon: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4|M10 17l5-5-5-5|M15 12H3',
    hint: 'Connecte le compte Instagram (2FA supportée). Identifiants demandés au lancement, jamais enregistrés.',
    defaults: () => ({}), estimate: () => [3, 6] },
  { type: 'username', label: 'Nom d\'utilisateur (@)', group: 'Compte', color: '167,139,250', credits: 0,
    icon: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8|M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    hint: 'Change le @username (pas le nom affiché) via le Centre de comptes. Un par compte.',
    defaults: () => ({ usernames: '' }), estimate: () => [2, 4] },
  { type: 'avatar', label: 'Photo de profil', group: 'Compte', color: '244,114,182', credits: 0, media: 'image',
    icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    hint: 'Met une photo de ta banque en photo de profil.',
    defaults: () => ({ source: 'pick', imageIds: [], mode: 'seq' }), estimate: () => [3, 5] },
  { type: 'bio', label: 'Nom, bio & lien', group: 'Compte', color: '45,212,191', credits: 0,
    icon: 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z',
    hint: 'Nom affiché (name), bio et lien du profil (RPA natif GeeLark). Ne change pas le @.',
    defaults: () => ({ bios: '', names: '', link: '', mode: 'random' }), estimate: () => [2, 4] },
  { type: 'warmup', label: 'Chauffe', group: 'Activité', color: '251,191,36', credits: 0,
    icon: 'M12 2c0 6-5 8-5 13a5 5 0 0 0 10 0c0-5-5-7-5-13z',
    hint: 'Parcourt les Reels avec likes/follows aléatoires. Durée tirée au hasard dans la plage.',
    defaults: () => ({ minMin: 8, maxMin: 15, keyword: '' }),
    estimate: p => [Math.max(1, p.minMin ?? 8) + 1, Math.max(p.minMin ?? 8, p.maxMin ?? 15) + 2] },
  { type: 'pause', label: 'Pause', group: 'Activité', color: '161,161,170', credits: 0,
    icon: 'M10 4H6v16h4z|M18 4h-4v16h4z',
    hint: 'Attend une durée aléatoire. Le téléphone est éteint pendant les pauses ≥ 3 min (économie GeeLark).',
    defaults: () => ({ minMin: 10, maxMin: 30 }),
    estimate: p => [Math.max(0, p.minMin ?? 10), Math.max(p.minMin ?? 10, p.maxMin ?? 30)] },
  { type: 'post', label: 'Publier une vidéo', group: 'Contenu', color: '139,92,246', credits: CREDIT_COSTS.posting, media: 'video',
    icon: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z',
    hint: 'Publie un Reel (vidéo de la banque + légende).',
    defaults: () => ({ source: 'pick', videoIds: [], captions: '', mode: 'seq', trial: false }), estimate: () => [4, 8] },
  { type: 'story', label: 'Story', group: 'Contenu', color: '249,115,22', credits: CREDIT_COSTS.story, media: 'image',
    icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 8v4l3 2',
    hint: 'Publie une story (image de la banque) avec sticker lien.',
    defaults: () => ({ source: 'pick', imageIds: [], link: '', linkText: '', linkMode: 'same', mode: 'seq' }), estimate: () => [4, 8] },
]
export const BLOCK: Record<BlockType, BlockDef> = Object.fromEntries(BLOCKS.map(b => [b.type, b])) as Record<BlockType, BlockDef>

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
export function newBlock(type: BlockType): FlowBlock { return { id: uid('blk'), type, params: BLOCK[type].defaults() } }
export function newFlow(name = 'Nouveau flow', types: BlockType[] = []): Flow {
  return { id: uid('flw'), name, blocks: types.map(newBlock), onError: 'stop' }
}

export const blockName = (b: FlowBlock) => b.params.label?.trim() || BLOCK[b.type].label
export const isActive = (b: FlowBlock) => !b.params.disabled
export const retriesOf = (p: BlockParams) => Math.max(0, Math.min(3, Math.round(p.retries ?? 0)))
const mediaIdsOf = (b: FlowBlock) => (BLOCK[b.type].media === 'video' ? b.params.videoIds : b.params.imageIds) ?? []

export const BOOT_ESTIMATE: [number, number] = [1, 2]
export function blockEstimate(b: FlowBlock): [number, number] {
  const [lo, hi] = BLOCK[b.type].estimate(b.params)
  const dLo = Math.max(0, b.params.delayMin ?? 0), dHi = Math.max(dLo, b.params.delayMax ?? 0)
  return [lo + dLo, hi * (1 + retriesOf(b.params)) + dHi]
}
export function estimateFlow(f: Flow): [number, number] {
  return f.blocks.filter(isActive).reduce<[number, number]>((acc, b) => {
    const [lo, hi] = blockEstimate(b)
    return [acc[0] + lo, acc[1] + hi]
  }, [...BOOT_ESTIMATE])
}
export function flowCredits(f: Flow): number { return f.blocks.filter(isActive).reduce((s, b) => s + BLOCK[b.type].credits, 0) }
export function fmtMinutes([lo, hi]: [number, number]): string {
  const r = (m: number) => Math.round(m)
  const f = (m: number) => r(m) >= 60 ? `${Math.floor(r(m) / 60)} h${r(m) % 60 ? String(r(m) % 60).padStart(2, '0') : ''}` : `${r(m)} min`
  return r(lo) === r(hi) ? f(lo) : `${f(lo)} – ${f(hi)}`
}

export const TEMPLATES: { name: string; desc: string; types: BlockType[] }[] = [
  { name: 'Nouveau compte', desc: 'Connexion → Chauffe → Publier', types: ['login', 'warmup', 'post'] },
  { name: 'Rebrand', desc: 'Pseudo → Photo → Bio', types: ['username', 'avatar', 'bio'] },
  { name: 'Routine quotidienne', desc: 'Chauffe → Publier → Pause → Story', types: ['warmup', 'post', 'pause', 'story'] },
]

// ── Textes multi-lignes & pseudos ────────────────────────────────────────────
export const lines = (s?: string) => (s ?? '').split('\n').map(l => l.trim()).filter(Boolean)
export { expandUsername }
function pick<T>(arr: T[], i: number, mode: PoolMode | undefined): T | undefined {
  if (arr.length === 0) return undefined
  return mode === 'random' ? arr[Math.floor(Math.random() * arr.length)] : arr[i % arr.length]
}

// ── Banque de contenus ───────────────────────────────────────────────────────
// Dossiers = colonne content_bank.folder ; les lignes « sentinelles » marquent les
// dossiers vides et ne sont pas des médias.
export interface Scope { orgId: string | null; userId: string }
const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
interface BankRow { id: string; folder: string | null; title: string | null; storage_path: string | null; file_url: string | null; notes: string | null; deleted_at?: string | null }
const kindOf = (r: BankRow): 'image' | 'video' => {
  const ext = (r.storage_path ?? r.file_url ?? r.title ?? '').toLowerCase().split('?')[0].split('.').pop() ?? ''
  return IMG_EXT.includes(ext) ? 'image' : 'video'
}
const isMedia = (r: BankRow) => !SENTINELS.includes(r.notes ?? '') && !r.deleted_at && !!(r.storage_path || r.file_url)

async function bankRows(scope: Scope): Promise<BankRow[]> {
  let q = supabase.from('content_bank').select('id,folder,title,storage_path,file_url,notes,deleted_at')
  q = scope.orgId ? q.eq('org_id', scope.orgId) : q.eq('user_id', scope.userId).is('org_id', null)
  const { data, error } = await q
  if (error) throw new Error(`Banque : ${error.message}`)
  return (data ?? []) as BankRow[]
}

export interface BankSummary { folders: { name: string; video: number; image: number }[]; video: number; image: number }
export async function loadBankSummary(scope: Scope): Promise<BankSummary> {
  const rows = await bankRows(scope)
  const map = new Map<string, { name: string; video: number; image: number }>()
  const out: BankSummary = { folders: [], video: 0, image: 0 }
  for (const r of rows) {
    if (r.folder && !map.has(r.folder)) map.set(r.folder, { name: r.folder, video: 0, image: 0 })
    if (!isMedia(r)) continue
    const k = kindOf(r)
    out[k]++
    if (r.folder) map.get(r.folder)![k]++
  }
  out.folders = [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  return out
}

// Médias (ids) d'un bloc selon sa source, résolus au lancement.
async function resolvePool(b: FlowBlock, scope: Scope, cache: { rows?: BankRow[] }): Promise<string[]> {
  const src = b.params.source ?? 'pick'
  if (src === 'pick') return [...mediaIdsOf(b)]
  if (!cache.rows) cache.rows = await bankRows(scope)
  const kind = BLOCK[b.type].media
  return cache.rows
    .filter(r => isMedia(r) && kindOf(r) === kind && (src === 'all' || r.folder === b.params.folder))
    .map(r => r.id)
}

// ── Validation avant lancement ───────────────────────────────────────────────
export interface Creds { email: string; password: string; totp: string }
export function validateFlow(f: Flow, nPhones: number, creds?: Record<string, Creds>, phoneIds?: string[], bank?: BankSummary): string[] {
  const issues: string[] = []
  if (f.blocks.length === 0) issues.push('Le flow est vide — ajoute au moins un bloc.')
  else if (!f.blocks.some(isActive)) issues.push('Tous les blocs sont désactivés.')
  f.blocks.forEach((b, i) => {
    if (!isActive(b)) return
    const n = `Bloc ${i + 1} (${blockName(b)})`
    const p = b.params
    const media = BLOCK[b.type].media
    if (media) {
      const src = p.source ?? 'pick'
      const w = media === 'video' ? 'vidéo' : 'image'
      if (src === 'pick' && mediaIdsOf(b).length === 0) issues.push(`${n} : choisis au moins une ${w}.`)
      if (src === 'folder' && !p.folder) issues.push(`${n} : choisis un dossier de la banque.`)
      if (src === 'folder' && p.folder && bank) {
        const fo = bank.folders.find(x => x.name === p.folder)
        if (!fo) issues.push(`${n} : le dossier « ${p.folder} » n'existe plus.`)
        else if (fo[media] === 0) issues.push(`${n} : le dossier « ${p.folder} » ne contient aucune ${w}.`)
      }
      if (src === 'all' && bank && bank[media] === 0) issues.push(`${n} : ta banque ne contient aucune ${w}.`)
    }
    if (b.type === 'username') {
      const ls = lines(p.usernames)
      if (ls.length === 0) issues.push(`${n} : ajoute au moins un pseudo.`)
      else usernameListIssues(ls, nPhones).forEach(e => issues.push(`${n} : ${e}`))
    }
    if (b.type === 'story') {
      if ((p.linkMode ?? 'same') === 'same' && !p.link?.trim()) issues.push(`${n} : renseigne le lien du sticker.`)
      if (p.linkMode === 'perAccount') {
        const ls = lines(p.links)
        if (ls.length === 0) issues.push(`${n} : ajoute un lien par compte.`)
        else if (nPhones > 0 && ls.length < nPhones) issues.push(`${n} : ${ls.length} lien(s) pour ${nPhones} compte(s) — un lien par compte.`)
      }
    }
    if (b.type === 'bio' && lines(p.bios).length === 0 && lines(p.names).length === 0 && !p.link?.trim()) issues.push(`${n} : renseigne un nom affiché, une bio ou un lien.`)
    if ((b.type === 'warmup' || b.type === 'pause') && (p.maxMin ?? 0) < (p.minMin ?? 0)) issues.push(`${n} : la durée maxi doit être ≥ la durée mini.`)
    if ((p.delayMax ?? 0) < (p.delayMin ?? 0)) issues.push(`${n} : le délai maxi doit être ≥ le délai mini.`)
  })
  if (creds && phoneIds && f.blocks.some(b => isActive(b) && b.type === 'login')) {
    const missing = phoneIds.filter(id => !(creds[id]?.email?.trim() && creds[id]?.password?.trim())).length
    if (missing > 0) issues.push(`Connexion : identifiants manquants pour ${missing} compte(s).`)
  }
  return issues
}

// ── Sauvegarde (table automation_flows, repli localStorage) ──────────────────
// Les identifiants de connexion ne sont JAMAIS enregistrés : seuls les blocs et
// leurs réglages le sont.
const APP_TAG = 'builder:instagram'
const lsKey = (userId: string) => `sf-flows:${userId}`
let remoteOk = true

interface StoredSteps { blocks?: FlowBlock[]; onError?: OnError; description?: string; defaults?: FlowDefaults }
function fromRow(r: Record<string, unknown>): Flow {
  const steps = r['steps']
  const meta = (Array.isArray(steps) ? { blocks: steps } : (steps ?? {})) as StoredSteps
  return {
    id: String(r['id']), name: String(r['name'] ?? 'Flow'), blocks: meta.blocks ?? [], onError: meta.onError ?? 'stop',
    description: meta.description, defaults: meta.defaults, updatedAt: r['updated_at'] as string | undefined,
  }
}
function readLocal(userId: string): Flow[] {
  try { return JSON.parse(localStorage.getItem(lsKey(userId)) ?? '[]') as Flow[] } catch { return [] }
}
function writeLocal(userId: string, flows: Flow[]) {
  try { localStorage.setItem(lsKey(userId), JSON.stringify(flows)) } catch { /* quota */ }
}

export async function loadFlows(userId: string): Promise<Flow[]> {
  if (remoteOk) {
    const { data, error } = await supabase.from('automation_flows').select('id,name,steps,updated_at').eq('app', APP_TAG).order('updated_at', { ascending: false })
    if (!error) return (data ?? []).map(r => fromRow(r as Record<string, unknown>))
    remoteOk = false   // table absente / non migrée → stockage local
  }
  return readLocal(userId).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

export async function saveFlow(f: Flow, userId: string, orgId: string | null): Promise<{ ok: boolean; error?: string }> {
  const updatedAt = new Date().toISOString()
  if (remoteOk) {
    const steps: StoredSteps = { blocks: f.blocks, onError: f.onError, description: f.description, defaults: f.defaults }
    const { error } = await supabase.from('automation_flows').upsert({
      id: f.id, name: f.name.trim() || 'Flow', app: APP_TAG, org_id: orgId,
      visibility: orgId ? 'org' : 'private', steps, updated_at: updatedAt,
    })
    if (!error) return { ok: true }
    if (!/relation|does not exist|schema cache|not find/i.test(error.message)) return { ok: false, error: error.message }
    remoteOk = false
  }
  const all = readLocal(userId).filter(x => x.id !== f.id)
  writeLocal(userId, [{ ...f, updatedAt }, ...all])
  return { ok: true }
}

export async function deleteFlow(id: string, userId: string): Promise<void> {
  if (remoteOk) { await supabase.from('automation_flows').delete().eq('id', id); return }
  writeLocal(userId, readLocal(userId).filter(x => x.id !== id))
}

// URL signées longues : un post peut partir des heures après le lancement
// (chauffe + pauses avant), l'URL doit rester valide jusque-là.
export async function bankUrls(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const { data } = await supabase.from('content_bank').select('id,storage_path,file_url').in('id', ids)
  await Promise.all((data ?? []).map(async (r: { id: string; storage_path: string | null; file_url: string | null }) => {
    if (r.storage_path) {
      const { data: s } = await supabase.storage.from('content').createSignedUrl(r.storage_path, 24 * 3600)
      if (s?.signedUrl) { out.set(r.id, s.signedUrl); return }
    }
    if (r.file_url) out.set(r.id, r.file_url)
  }))
  return out
}

// ── État des runs (singleton hors React) ─────────────────────────────────────
export type StepStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped'
export interface PhoneRun {
  key: string; name: string
  status: 'pending' | 'booting' | 'running' | 'done' | 'failed' | 'cancelled'
  current: number          // index du bloc en cours (-1 = démarrage)
  steps: StepStatus[]
  errors: (string | undefined)[]
  attempts: number[]       // tentatives par bloc
  logs: string[]
}
export interface FlowRun {
  id: string; flowName: string; blocks: FlowBlock[]
  status: 'preparing' | 'running' | 'done' | 'cancelled' | 'error'
  phones: PhoneRun[]; log: string[]; startedAt: number; endedAt?: number
  handleId: string
}

const runs = new Map<string, FlowRun>()
const finished = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()
let snapshot: FlowRun[] = []
let emitQueued = false
const nextFrame = (cb: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => cb()) : setTimeout(cb, 16))
// Les logs arrivent par rafales (dizaines de téléphones) → on regroupe les
// notifications React sur une frame.
function emit() {
  if (emitQueued) return
  emitQueued = true
  nextFrame(() => {
    emitQueued = false
    snapshot = [...runs.values()].map(r => ({ ...r, phones: r.phones.map(p => ({ ...p })) })).sort((a, b) => b.startedAt - a.startedAt)
    listeners.forEach(l => l())
  })
}
export function useFlowRuns(): FlowRun[] {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => snapshot, () => snapshot)
}
export function dismissFlowRun(id: string) { runs.delete(id); finished.delete(id); emit() }
export function getFlowRun(id: string): FlowRun | undefined { return runs.get(id) }
// Résout quand le run est entièrement terminé (téléphones éteints, crédits réglés).
export function waitFlowRun(id: string): Promise<void> { return finished.get(id) ?? Promise.resolve() }

// ── Exécution ────────────────────────────────────────────────────────────────
export interface RunTarget { key: string; geelarkId: string; name: string; username?: string }
export interface RunOptions {
  bearer: string
  flow: Flow
  targets: RunTarget[]
  creds: Record<string, Creds>       // par target.key (si bloc Connexion)
  concurrency: number                 // téléphones simultanés
  rotationUrls?: string[]             // rotation d'IP avant chaque boot (force le série)
  creditOwnerId: string
  scope: Scope                        // banque (dossiers) + usage unique
}

export async function runFlow(o: RunOptions): Promise<string> {
  const flow: Flow = JSON.parse(JSON.stringify(o.flow))
  const handle: RunHandle = startRun('flow', flow.name, o.targets.length)
  const run: FlowRun = {
    id: uid('run'), flowName: flow.name, blocks: flow.blocks, status: 'preparing',
    phones: o.targets.map(t => ({
      key: t.key, name: t.name, status: 'pending', current: -1,
      steps: flow.blocks.map(b => isActive(b) ? 'pending' as StepStatus : 'skipped' as StepStatus),
      errors: flow.blocks.map(() => undefined), attempts: flow.blocks.map(() => 0), logs: [],
    })),
    log: [], startedAt: Date.now(), handleId: handle.id,
  }
  runs.set(run.id, run); emit()
  finished.set(run.id, execute(run, handle, flow, o))
  return run.id
}

interface Ctx {
  run: FlowRun; flow: Flow; o: RunOptions; handle: RunHandle
  assign: Map<string, Record<string, string>>[]   // [compte] → blockId → valeurs
  urls: Map<string, string>; hosted: Map<string, string>
  credit: Map<string, CreditRun>                  // blockId → crédits
  posted: Map<string, Set<string>>                // blockId → vidéos publiées (usage unique)
}

async function execute(run: FlowRun, handle: RunHandle, flow: Flow, o: RunOptions): Promise<void> {
  const glog = (m: string) => { run.log.push(m); if (run.log.length > 300) run.log.shift(); emit() }
  const credit = new Map<string, CreditRun>()
  const active = flow.blocks.filter(isActive)
  let hist: RunHistory | null = null
  try {
    // 1. Crédits : un débit par bloc payant ACTIF (2/compte pour un post, 1 pour une
    //    story), remboursé compte par compte si le bloc ne réussit pas.
    for (const b of active) {
      const cost = BLOCK[b.type].credits
      if (cost <= 0) continue
      const cr = await startCreditRun(o.creditOwnerId, cost, o.targets.length)
      if (isCreditError(cr)) {
        for (const c of credit.values()) { c.abort(); await c.settle() }
        glog(`❌ Crédits insuffisants : ${cr.error}`)
        run.phones.forEach(p => { p.status = 'cancelled'; p.steps = p.steps.map(() => 'skipped') })
        run.status = 'error'; run.endedAt = Date.now(); emit(); handle.finish('error'); return
      }
      credit.set(b.id, cr)
    }

    // 2. Médias de chaque bloc (choix manuel, dossier ou toute la banque).
    const n = o.targets.length
    const pools = new Map<string, string[]>()
    const cache: { rows?: BankRow[] } = {}
    for (const b of active) {
      if (!BLOCK[b.type].media) continue
      const pool = await resolvePool(b, o.scope, cache)
      pools.set(b.id, pool)
      if ((b.params.source ?? 'pick') !== 'pick') glog(`📁 ${blockName(b)} : ${pool.length} média(s) ${b.params.source === 'folder' ? `dans « ${b.params.folder} »` : 'dans la banque'}`)
    }

    // 3. Attribution des contenus par compte (pseudos, médias, textes, liens).
    const assign = o.targets.map(() => new Map<string, Record<string, string>>())
    for (const b of active) {
      const p = b.params
      const users = lines(p.usernames), bios = lines(p.bios), names = lines(p.names), caps = lines(p.captions)
      const links = lines(p.links), kws = lines(p.keyword)
      const pool = pools.get(b.id) ?? []
      for (let i = 0; i < n; i++) {
        const a: Record<string, string> = {}
        if (b.type === 'username') { const t = users[i % Math.max(1, users.length)]; if (t) a.username = expandUsername(t) }
        if (BLOCK[b.type].media) { const id = pick(pool, i, p.mode); if (id) a.media = id }
        if (b.type === 'post') a.caption = pick(caps, i, p.captionMode ?? p.mode) ?? ''
        if (b.type === 'bio') { a.bio = p.bioSingle ? (p.bios ?? '').trim() : pick(bios, i, p.mode) ?? ''; a.name = pick(names, i, p.mode) ?? '' }
        if (b.type === 'story') a.link = p.linkMode === 'perAccount' ? (links[i] ?? links[i % Math.max(1, links.length)] ?? '') : (p.link?.trim() ?? '')
        if (b.type === 'warmup' && kws.length) a.keyword = kws[Math.floor(Math.random() * kws.length)]
        assign[i].set(b.id, a)
      }
    }
    const urls = await bankUrls([...new Set(assign.flatMap(m => [...m.values()].map(a => a.media).filter((x): x is string => !!x)))])

    // 4. Hébergement GeeLark UNE fois par média (vidéos des posts, images des stories).
    const hosted = new Map<string, string>()
    const needVid = new Set<string>(), needImg = new Set<string>()
    for (const b of active) for (let i = 0; i < n; i++) {
      const m = assign[i].get(b.id)?.media
      if (!m) continue
      if (b.type === 'post') needVid.add(m)
      if (b.type === 'story') needImg.add(m)
    }
    if (needVid.size + needImg.size > 0) glog(`⬆️ Hébergement de ${needVid.size + needImg.size} média(s) chez GeeLark…`)
    for (const id of needVid) { if (handle.isCancelled()) break; const u = urls.get(id); const r = u ? await geelarkUploadVideo(o.bearer, u, glog) : null; if (r) hosted.set(id, r) }
    for (const id of needImg) { if (handle.isCancelled()) break; const u = urls.get(id); const r = u ? await geelarkUploadImage(o.bearer, u, glog) : null; if (r) hosted.set(id, r) }

    // 5. Comptes en parallèle (pool). Rotation d'IP ⇒ série : roter l'IP d'un
    //    proxy partagé couperait les autres téléphones en plein bloc.
    run.status = 'running'; emit()
    const conc = o.rotationUrls?.length ? 1 : Math.max(1, Math.min(o.concurrency, n))
    glog(`▶ ${n} compte(s), ${conc} à la fois — ${active.length} bloc(s) actif(s)`)
    const ctx: Ctx = { run, flow, o, handle, assign, urls, hosted, credit, posted: new Map() }
    // Historique (page Activité) écrit dès le lancement, compte par compte.
    hist = await startRunHistory({
      userId: o.scope.userId, orgId: o.scope.orgId, type: 'flow',
      accounts: o.targets.map(t => ({ key: t.key, name: t.name, geelarkId: t.geelarkId })),
    }).catch(() => null)
    let next = 0
    const worker = async () => {
      while (next < n) {
        const i = next++
        await runPhone(ctx, i)
        const ph = run.phones[i]
        if (ph.status !== 'cancelled') hist?.set(ph.key, { ok: ph.status === 'done', error: ph.status === 'done' ? undefined : (ph.errors.find(Boolean) ?? 'échec') })
        handle.tick(ph.status === 'done')
      }
    }
    await Promise.all(Array.from({ length: conc }, worker))

    // 6. Usage unique : les vidéos réellement publiées partent à la corbeille.
    const trash = [...new Set(flow.blocks.filter(b => b.params.removeAfter).flatMap(b => [...(ctx.posted.get(b.id) ?? [])]))]
    if (trash.length) {
      const { error } = await supabase.from('content_bank').update({ deleted_at: new Date().toISOString() }).in('id', trash)
      glog(error ? `⚠ Usage unique : mise à la corbeille échouée (${error.message})` : `🗑 ${trash.length} vidéo(s) publiée(s) → corbeille (usage unique)`)
    }

    const settled = await Promise.all([...credit.values()].map(c => c.settle()))
    const refunded = settled.reduce((s, r) => s + r.refunded, 0)
    const ok = run.phones.filter(p => p.status === 'done').length
    glog(`✔ Terminé : ${ok}/${n} compte(s) OK${refunded ? ` — ${refunded} crédit(s) remboursé(s)` : ''}`)
    run.status = handle.isCancelled() ? 'cancelled' : 'done'
  } catch (e) {
    for (const c of credit.values()) { c.abort(); await c.settle().catch(() => undefined) }
    glog(`❌ Erreur : ${e instanceof Error ? e.message : String(e)}`)
    run.phones.forEach(p => { if (p.status === 'pending') { p.status = 'failed'; p.steps = p.steps.map(s => s === 'pending' ? 'skipped' : s) } })
    run.status = 'error'
  }
  await hist?.finish('annulé').catch(() => null)
  run.endedAt = Date.now(); emit()
  handle.finish(run.status === 'error' ? 'error' : run.status === 'cancelled' ? 'cancelled' : 'done')
}

const rand = (lo: number, hi: number) => lo + Math.random() * Math.max(0, hi - lo)

// Attente pendant un flow. ≥ 3 min : le téléphone est éteint (GeeLark facture le
// temps allumé) puis relancé automatiquement par le bloc suivant. Renvoie false si
// le run est annulé pendant l'attente.
async function idle(ctx: Ctx, gid: string, ms: number, log: (m: string) => void, what: string): Promise<boolean> {
  const mins = Math.round(ms / 60_000)
  if (ms >= 3 * 60_000) {
    log(`⏸ ${what} ${mins} min — téléphone éteint pendant l'attente`)
    setPhoneManaged(gid, false)
    await stopPhoneSurely(ctx.o.bearer, gid, log)
    setPhoneManaged(gid, true)
  } else if (ms > 0) log(`⏸ ${what} ${mins < 1 ? `${Math.round(ms / 1000)} s` : `${mins} min`}`)
  let left = ms
  while (left > 0) {
    if (ctx.handle.isCancelled()) return false
    if (ms < 3 * 60_000) heartbeatPhone(gid)   // attente courte, téléphone allumé
    const step = Math.min(5000, left)
    await sleep(step)
    left -= step
  }
  return !ctx.handle.isCancelled()
}

async function runPhone(ctx: Ctx, i: number) {
  const { run, flow, o, handle, credit } = ctx
  const pr = run.phones[i]
  const gid = o.targets[i].geelarkId
  const log = (m: string) => { pr.logs.push(m); if (pr.logs.length > 200) pr.logs.shift(); emit() }
  const skipRest = (from: number) => { for (let k = from; k < pr.steps.length; k++) if (pr.steps[k] === 'pending') pr.steps[k] = 'skipped' }
  const refundUnplayed = () => flow.blocks.forEach((b, k) => { if (pr.steps[k] !== 'ok') credit.get(b.id)?.markFailed() })

  if (handle.isCancelled()) { pr.status = 'cancelled'; skipRest(0); refundUnplayed(); emit(); return }
  pr.status = 'booting'; emit()
  handle.detail(`${pr.name} · démarrage`)
  let managed = false
  let failed = false
  try {
    const boot = await ensurePhoneRunning(o.bearer, gid, log, o.rotationUrls)
    if (!boot.ok) {
      failed = true
      const k0 = pr.steps.findIndex(s => s === 'pending')
      if (k0 >= 0) { pr.steps[k0] = 'failed'; pr.errors[k0] = boot.reason ?? 'Téléphone non démarré' }
      skipRest(0)
      log(`❌ ${boot.reason ?? 'Téléphone non démarré'}`)
      return
    }
    setPhoneManaged(gid, true); managed = true
    pr.status = 'running'; emit()
    for (let k = 0; k < flow.blocks.length; k++) {
      const b = flow.blocks[k]
      if (!isActive(b)) continue
      if (handle.isCancelled()) { pr.status = 'cancelled'; skipRest(k); break }
      pr.current = k; emit()
      const name = blockName(b)
      // Délai aléatoire avant le bloc.
      const dMax = Math.max(0, b.params.delayMax ?? 0)
      if (dMax > 0) {
        const ms = rand(Math.max(0, b.params.delayMin ?? 0), dMax) * 60_000
        if (!(await idle(ctx, gid, ms, log, `Délai avant « ${name} »`))) { pr.status = 'cancelled'; skipRest(k); break }
      }
      pr.steps[k] = 'running'; emit()
      handle.detail(`${pr.name} · ${name}`)
      log(`── ${k + 1}. ${name} ──`)
      const tries = 1 + retriesOf(b.params)
      let r: GuardedResult = { ok: false }
      for (let t = 0; t < tries; t++) {
        pr.attempts[k] = t + 1
        if (t > 0) { log(`↻ Nouvel essai ${t + 1}/${tries}`); await sleep(5000) }
        r = await runGuarded(ctx, b, i, gid, log)
        if (r.ok || r.cancelled || r.stuck || handle.isCancelled()) break
      }
      if (r.cancelled) { pr.steps[k] = 'skipped'; pr.status = 'cancelled'; skipRest(k + 1); break }
      // Bloc resté bloqué malgré l'interruption : l'état du téléphone est inconnu →
      // on n'enchaîne RIEN d'autre dessus (quelle que soit la politique d'erreur).
      if (r.stuck) { pr.steps[k] = 'failed'; pr.errors[k] = r.error; failed = true; log(`❌ ${r.error}`); skipRest(k + 1); break }
      pr.steps[k] = r.ok ? 'ok' : 'failed'; pr.errors[k] = r.error
      if (r.ok && b.type === 'post' && b.params.removeAfter) {
        const m = ctx.assign[i].get(b.id)?.media
        if (m) { if (!ctx.posted.has(b.id)) ctx.posted.set(b.id, new Set()); ctx.posted.get(b.id)!.add(m) }
      }
      if (!r.ok) {
        failed = true
        log(`❌ ${r.error ?? 'échec'}`)
        const policy = b.params.onError && b.params.onError !== 'inherit' ? b.params.onError : flow.onError
        if (policy === 'stop') { skipRest(k + 1); break }
      }
      emit()
    }
  } catch (e) {
    failed = true
    const k = pr.current >= 0 ? pr.current : 0
    if (pr.steps[k] === 'running' || pr.steps[k] === 'pending') { pr.steps[k] = 'failed'; pr.errors[k] = e instanceof Error ? e.message : String(e) }
    skipRest(k + 1)
  } finally {
    // Toujours : le téléphone est rendu et éteint, quoi qu'il arrive.
    if (managed) setPhoneManaged(gid, false)
    await stopPhoneSurely(o.bearer, gid, log)
    if (pr.status !== 'cancelled') pr.status = failed ? 'failed' : 'done'
    refundUnplayed()
    emit()
  }
}

// ── Garde-fous d'un bloc ─────────────────────────────────────────────────────
// Quelle que soit la combinaison de blocs, chaque bloc :
//   1. part d'un téléphone ALLUMÉ (une pause longue l'a peut-être éteint) et d'un
//      Instagram FERMÉ (le bloc précédent a pu le laisser sur n'importe quel écran) ;
//   2. a un délai max : au-delà, la primitive est interrompue et sa tâche GeeLark
//      annulée (aucune tâche orpheline ne continue pendant le bloc suivant) ;
//   3. s'arrête vite si le run est annulé.
const DEADLINE_MIN: Record<BlockType, number> = { login: 15, username: 8, avatar: 8, bio: 12, warmup: 20, post: 25, story: 20, pause: 0 }
export function blockDeadlineMs(b: FlowBlock): number {
  if (b.type === 'pause') return 0
  if (b.type === 'warmup') return ((b.params.maxMin ?? 15) + DEADLINE_MIN.warmup) * 60_000
  return DEADLINE_MIN[b.type] * 60_000
}
// Marge laissée à une primitive interrompue pour rendre la main (elle vérifie
// l'interruption à chaque attente / commande ADB, et le réseau a un délai de 45 s).
const ABORT_GRACE_MS = 90_000
// Échelle des délais (tests uniquement : rend les délais de quelques millisecondes).
let timeScale = 1
export function _setFlowTimeScaleForTests(x: number): void { timeScale = x }

type GuardedResult = { ok: boolean; error?: string; cancelled?: boolean; stuck?: boolean }

async function runGuarded(ctx: Ctx, b: FlowBlock, i: number, gid: string, log: (m: string) => void): Promise<GuardedResult> {
  const { o, handle } = ctx
  if (b.type === 'pause') {
    try { return await execBlock(ctx, b, i, gid, log) } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
  }
  const boot = await ensurePhoneRunning(o.bearer, gid, log)
  if (!boot.ok) return { ok: false, error: boot.reason ?? 'Téléphone non démarré' }
  await resetInstagram(o.bearer, gid, log)
  if (handle.isCancelled()) return { ok: false, cancelled: true }

  const limit = blockDeadlineMs(b)
  clearPhoneAbort(gid)
  let timedOut = false, cancelledDuring = false
  const watch = setInterval(() => { if (handle.isCancelled() && !cancelledDuring) { cancelledDuring = true; abortPhone(gid) } }, Math.max(5, 1000 * timeScale))
  const timer = setTimeout(() => { timedOut = true; abortPhone(gid) }, limit * timeScale)
  let hardTimer: ReturnType<typeof setTimeout> | null = null
  const STUCK = Symbol('stuck')
  const stuckAfter = new Promise<typeof STUCK>(res => { hardTimer = setTimeout(() => res(STUCK), limit * timeScale + Math.max(ABORT_GRACE_MS * timeScale, 200)) })
  let r: { ok: boolean; error?: string; cancelled?: boolean } | typeof STUCK
  const execP = execBlock(ctx, b, i, gid, log).catch(e => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
  try {
    r = await Promise.race([execP, stuckAfter])
  } finally {
    clearInterval(watch); clearTimeout(timer); if (hardTimer) clearTimeout(hardTimer)
  }
  const mins = Math.round(limit / 60_000)
  if (r === STUCK) {
    // La primitive n'a pas rendu la main : on laisse l'interruption active pour
    // qu'elle s'arrête dès que possible, et on ne lance plus rien sur ce téléphone.
    await cancelPhoneTask(o.bearer, gid, log).catch(() => {})
    void execP.finally(() => clearPhoneAbort(gid))
    return { ok: false, stuck: true, error: `Bloc bloqué (délai max ${mins} min dépassé) — étapes suivantes annulées` }
  }
  clearPhoneAbort(gid)
  // Résultat réel du bloc s'il a fini de lui-même (même si l'annulation arrive juste
  // après) ; sinon, c'est l'interruption (annulation / délai max) qui l'a arrêté.
  if (r.ok || (!cancelledDuring && !timedOut)) return r
  await cancelPhoneTask(o.bearer, gid, log).catch(() => {})
  if (cancelledDuring) return { ok: false, cancelled: true }
  return { ok: false, error: `Délai max du bloc dépassé (${mins} min)` }
}

async function execBlock(ctx: Ctx, b: FlowBlock, i: number, gid: string, log: (m: string) => void): Promise<{ ok: boolean; error?: string; cancelled?: boolean }> {
  const { o } = ctx
  const p = b.params
  const a = ctx.assign[i].get(b.id) ?? {}
  switch (b.type) {
    case 'login': {
      const c = o.creds[o.targets[i].key]
      if (!c?.email?.trim() || !c.password?.trim()) return { ok: false, error: 'Identifiants manquants pour ce compte' }
      return loginInstagramOnPhone(o.bearer, gid, { email: c.email.trim(), password: c.password.trim(), totp: c.totp }, log)
    }
    case 'username':
      if (!a.username) return { ok: false, error: 'Aucun pseudo attribué' }
    {
      const handle = a.username.trim().replace(/^@/, '')
      const r = await changeUsernameOnPhone(o.bearer, gid, handle, log, o.targets[i].username)
      // Pseudo VÉRIFIÉ à l'écran → on garde le @ à jour dans ScaleFlow (repère du prochain changement).
      if (r.ok) { o.targets[i].username = handle; void Promise.resolve(supabase.from('phones').update({ ig_username: handle }).eq('id', o.targets[i].key)).catch(() => {}) }
      return r
    }
    case 'avatar': {
      if (!a.media) return { ok: false, error: emptyPoolMsg(b) }
      const u = ctx.urls.get(a.media)
      if (!u) return { ok: false, error: 'Image introuvable dans la banque' }
      return changeProfilePicOnPhone(o.bearer, gid, u, log, o.targets[i].username)
    }
    case 'bio':
      return editProfileOnPhone(o.bearer, gid, {
        ...(a.name ? { nickname: a.name } : {}),
        ...(a.bio ? { biography: a.bio } : {}),
        ...(p.link?.trim() ? { linkURL: p.link.trim() } : {}),
        ...(p.linkTitle?.trim() ? { linkTitle: p.linkTitle.trim() } : {}),
      }, log)
    case 'warmup': {
      const minutes = Math.round(rand(p.minMin ?? 8, p.maxMin ?? 15))
      const browseVideo = Math.max(1, Math.min(100, minutes * 2))   // ≈ 2 vidéos/min
      log(`🔥 Chauffe ≈ ${minutes} min${a.keyword ? ` · « ${a.keyword} »` : ''}`)
      return warmupAccountNative(o.bearer, gid, { browseVideo, keyword: a.keyword || undefined }, log)
    }
    case 'pause': {
      const ms = rand(p.minMin ?? 10, p.maxMin ?? 30) * 60_000
      return (await idle(ctx, gid, ms, log, 'Pause')) ? { ok: true } : { ok: false, cancelled: true }
    }
    case 'post': {
      if (!a.media) return { ok: false, error: emptyPoolMsg(b) }
      const res = ctx.hosted.get(a.media)
      if (!res) return { ok: false, error: 'Vidéo non hébergée chez GeeLark' }
      return postReelToPhone(o.bearer, gid, res, a.caption ?? '', log, undefined, !!p.trial)
    }
    case 'story': {
      if (!a.media) return { ok: false, error: emptyPoolMsg(b) }
      const res = ctx.hosted.get(a.media)
      if (!res) return { ok: false, error: 'Image non hébergée chez GeeLark' }
      if (!a.link) return { ok: false, error: 'Aucun lien pour ce compte' }
      return postStoryToPhone(o.bearer, gid, { imageResourceUrl: res, linkUrl: a.link, linkText: p.linkText?.trim() || undefined }, log)
    }
  }
}

function emptyPoolMsg(b: FlowBlock): string {
  const w = BLOCK[b.type].media === 'video' ? 'vidéo' : 'image'
  const src = b.params.source ?? 'pick'
  return src === 'folder' ? `Aucune ${w} dans le dossier « ${b.params.folder ?? '?'} »` : src === 'all' ? `Aucune ${w} dans la banque` : `Aucune ${w} choisie`
}
