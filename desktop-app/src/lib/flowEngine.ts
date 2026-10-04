// Moteur du Flow Builder (GeeLark · Instagram).
//
// Un flow = une chaîne de blocs (connexion, pseudo, photo, bio, chauffe, post,
// story, pause) exécutée dans l'ordre sur chaque compte choisi, depuis le
// navigateur. Chaque téléphone ne démarre qu'UNE fois pour tout le flow : le moteur
// le marque « géré » (setPhoneManaged) pour que les primitives ne le redémarrent ni
// ne l'éteignent entre deux blocs, puis l'éteint à la fin.
//
// L'état des runs vit hors React (singleton) → la progression survit à la
// navigation, et le run apparaît dans la pastille globale (runStore).
import { useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ensurePhoneRunning, setPhoneManaged, stopPhoneSurely, sleep,
  loginInstagramOnPhone, editProfileOnPhone, warmupAccountNative, postReelToPhone, postStoryToPhone,
  geelarkUploadVideo, geelarkUploadImage,
} from '@/lib/geelark'
import { changeUsernameOnPhone, changeProfilePicOnPhone } from '@/lib/geelarkAdb'
import { startCreditRun, isCreditError, CREDIT_COSTS, type CreditRun } from '@/lib/credits'
import { startRun, type RunHandle } from '@/lib/runStore'

// ── Modèle ───────────────────────────────────────────────────────────────────
export type BlockType = 'login' | 'username' | 'avatar' | 'bio' | 'warmup' | 'post' | 'story' | 'pause'
export type PoolMode = 'seq' | 'random'

export interface BlockParams {
  usernames?: string        // username : un par ligne, {4} = 4 chiffres aléatoires
  imageIds?: string[]       // avatar / story : images de la banque
  videoIds?: string[]       // post : vidéos de la banque
  mode?: PoolMode           // distribution des médias / textes entre comptes
  bios?: string             // bio : une par ligne
  names?: string            // bio : nom affiché, un par ligne (optionnel)
  link?: string             // bio : lien du profil / story : lien du sticker
  linkText?: string         // story : texte du sticker
  captions?: string         // post : une légende par ligne
  trial?: boolean           // post : Reel d'essai (non-abonnés)
  minMin?: number           // warmup / pause : durée mini (min)
  maxMin?: number           // warmup / pause : durée maxi (min)
  keyword?: string          // warmup : mot-clé de recherche (optionnel)
}

export interface FlowBlock { id: string; type: BlockType; params: BlockParams }
export type OnError = 'stop' | 'continue'
export interface Flow { id: string; name: string; blocks: FlowBlock[]; onError: OnError; updatedAt?: string }

export interface BlockDef {
  type: BlockType
  label: string
  group: 'Compte' | 'Activité' | 'Contenu'
  icon: string          // chemin(s) SVG séparés par |
  color: string         // rgb « r,g,b »
  hint: string
  credits: number       // crédits par compte
  defaults: () => BlockParams
  estimate: (p: BlockParams) => [number, number]   // minutes [min, max]
}

export const BLOCKS: BlockDef[] = [
  { type: 'login', label: 'Connexion', group: 'Compte', color: '56,189,248', credits: 0,
    icon: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4|M10 17l5-5-5-5|M15 12H3',
    hint: 'Connecte le compte Instagram (2FA supportée). Identifiants demandés au lancement, jamais enregistrés.',
    defaults: () => ({}), estimate: () => [3, 6] },
  { type: 'username', label: 'Changer le pseudo', group: 'Compte', color: '167,139,250', credits: 0,
    icon: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8|M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    hint: 'Change le @ via le Centre de comptes. Un pseudo par compte.',
    defaults: () => ({ usernames: '' }), estimate: () => [2, 4] },
  { type: 'avatar', label: 'Photo de profil', group: 'Compte', color: '244,114,182', credits: 0,
    icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    hint: 'Met une photo de ta banque en photo de profil.',
    defaults: () => ({ imageIds: [], mode: 'seq' }), estimate: () => [3, 5] },
  { type: 'bio', label: 'Bio & lien', group: 'Compte', color: '45,212,191', credits: 0,
    icon: 'M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z',
    hint: 'Bio, nom affiché et lien du profil (RPA natif GeeLark).',
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
  { type: 'post', label: 'Publier une vidéo', group: 'Contenu', color: '139,92,246', credits: CREDIT_COSTS.posting,
    icon: 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z',
    hint: 'Publie un Reel (vidéo de la banque + légende).',
    defaults: () => ({ videoIds: [], captions: '', mode: 'seq', trial: false }), estimate: () => [4, 8] },
  { type: 'story', label: 'Story', group: 'Contenu', color: '249,115,22', credits: CREDIT_COSTS.story,
    icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 8v4l3 2',
    hint: 'Publie une story (image de la banque) avec sticker lien.',
    defaults: () => ({ imageIds: [], link: '', linkText: '', mode: 'seq' }), estimate: () => [4, 8] },
]
export const BLOCK: Record<BlockType, BlockDef> = Object.fromEntries(BLOCKS.map(b => [b.type, b])) as Record<BlockType, BlockDef>

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
export function newBlock(type: BlockType): FlowBlock { return { id: uid('blk'), type, params: BLOCK[type].defaults() } }
export function newFlow(name = 'Nouveau flow', types: BlockType[] = []): Flow {
  return { id: uid('flw'), name, blocks: types.map(newBlock), onError: 'stop' }
}

export const BOOT_ESTIMATE: [number, number] = [1, 2]
export function estimateFlow(f: Flow): [number, number] {
  return f.blocks.reduce<[number, number]>((acc, b) => {
    const [lo, hi] = BLOCK[b.type].estimate(b.params)
    return [acc[0] + lo, acc[1] + hi]
  }, [...BOOT_ESTIMATE])
}
export function flowCredits(f: Flow): number { return f.blocks.reduce((s, b) => s + BLOCK[b.type].credits, 0) }
export function fmtMinutes([lo, hi]: [number, number]): string {
  const f = (m: number) => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`
  return lo === hi ? f(lo) : `${f(lo)} – ${f(hi)}`
}

export const TEMPLATES: { name: string; desc: string; types: BlockType[] }[] = [
  { name: 'Nouveau compte', desc: 'Connexion → Chauffe → Publier', types: ['login', 'warmup', 'post'] },
  { name: 'Rebrand', desc: 'Pseudo → Photo → Bio', types: ['username', 'avatar', 'bio'] },
  { name: 'Routine quotidienne', desc: 'Chauffe → Publier → Pause → Story', types: ['warmup', 'post', 'pause', 'story'] },
]

// ── Textes multi-lignes & pseudos ────────────────────────────────────────────
export const lines = (s?: string) => (s ?? '').split('\n').map(l => l.trim()).filter(Boolean)
const hasRandom = (s: string) => /\{\d{1,2}\}/.test(s)
function expandUsername(tpl: string): string {
  return tpl.replace(/\{(\d{1,2})\}/g, (_, n) => Array.from({ length: Math.min(12, +n) }, () => Math.floor(Math.random() * 10)).join(''))
}
function pick<T>(arr: T[], i: number, mode: PoolMode | undefined): T | undefined {
  if (arr.length === 0) return undefined
  return mode === 'random' ? arr[Math.floor(Math.random() * arr.length)] : arr[i % arr.length]
}

// ── Validation avant lancement ───────────────────────────────────────────────
export interface Creds { email: string; password: string; totp: string }
export function validateFlow(f: Flow, nPhones: number, creds?: Record<string, Creds>, phoneIds?: string[]): string[] {
  const issues: string[] = []
  if (f.blocks.length === 0) issues.push('Le flow est vide — ajoute au moins un bloc.')
  f.blocks.forEach((b, i) => {
    const n = `Bloc ${i + 1} (${BLOCK[b.type].label})`
    const p = b.params
    if (b.type === 'username') {
      const ls = lines(p.usernames)
      if (ls.length === 0) issues.push(`${n} : ajoute au moins un pseudo.`)
      else if (nPhones > 0 && ls.length < nPhones && !ls.every(hasRandom)) issues.push(`${n} : ${ls.length} pseudo(s) pour ${nPhones} compte(s) — ajoute-en ou utilise {4} pour des chiffres aléatoires.`)
    }
    if ((b.type === 'avatar' || b.type === 'story') && !(p.imageIds?.length)) issues.push(`${n} : choisis au moins une image.`)
    if (b.type === 'story' && !p.link?.trim()) issues.push(`${n} : renseigne le lien du sticker.`)
    if (b.type === 'post' && !(p.videoIds?.length)) issues.push(`${n} : choisis au moins une vidéo.`)
    if (b.type === 'bio' && lines(p.bios).length === 0 && lines(p.names).length === 0 && !p.link?.trim()) issues.push(`${n} : renseigne une bio, un nom ou un lien.`)
    if ((b.type === 'warmup' || b.type === 'pause') && (p.maxMin ?? 0) < (p.minMin ?? 0)) issues.push(`${n} : la durée maxi doit être ≥ la durée mini.`)
  })
  if (creds && phoneIds && f.blocks.some(b => b.type === 'login')) {
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

function fromRow(r: Record<string, unknown>): Flow {
  const steps = r['steps']
  const meta = (Array.isArray(steps) ? { blocks: steps } : (steps ?? {})) as { blocks?: FlowBlock[]; onError?: OnError }
  return { id: String(r['id']), name: String(r['name'] ?? 'Flow'), blocks: meta.blocks ?? [], onError: meta.onError ?? 'stop', updatedAt: r['updated_at'] as string | undefined }
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
    const { error } = await supabase.from('automation_flows').upsert({
      id: f.id, name: f.name.trim() || 'Flow', app: APP_TAG, org_id: orgId,
      visibility: orgId ? 'org' : 'private', steps: { blocks: f.blocks, onError: f.onError }, updated_at: updatedAt,
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

// ── Médias de la banque ──────────────────────────────────────────────────────
// URL signées longues : un post peut partir des heures après le lancement
// (chauffe + pauses avant), l'URL doit rester valide jusque-là.
async function bankUrls(ids: string[]): Promise<Map<string, string>> {
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
  logs: string[]
}
export interface FlowRun {
  id: string; flowName: string; blocks: FlowBlock[]
  status: 'preparing' | 'running' | 'done' | 'cancelled' | 'error'
  phones: PhoneRun[]; log: string[]; startedAt: number; endedAt?: number
  handleId: string
}

const runs = new Map<string, FlowRun>()
const listeners = new Set<() => void>()
let snapshot: FlowRun[] = []
let emitQueued = false
// Les logs arrivent par rafales (dizaines de téléphones) → on regroupe les
// notifications React sur une frame.
function emit() {
  if (emitQueued) return
  emitQueued = true
  requestAnimationFrame(() => {
    emitQueued = false
    snapshot = [...runs.values()].map(r => ({ ...r, phones: r.phones.map(p => ({ ...p })) })).sort((a, b) => b.startedAt - a.startedAt)
    listeners.forEach(l => l())
  })
}
export function useFlowRuns(): FlowRun[] {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => snapshot, () => snapshot)
}
export function dismissFlowRun(id: string) { runs.delete(id); emit() }

// ── Exécution ────────────────────────────────────────────────────────────────
export interface RunTarget { key: string; geelarkId: string; name: string }
export interface RunOptions {
  bearer: string
  flow: Flow
  targets: RunTarget[]
  creds: Record<string, Creds>       // par target.key (si bloc Connexion)
  concurrency: number                 // téléphones simultanés
  rotationUrls?: string[]             // rotation d'IP avant chaque boot (force le série)
  creditOwnerId: string
}

export async function runFlow(o: RunOptions): Promise<string> {
  const flow: Flow = JSON.parse(JSON.stringify(o.flow))
  const handle: RunHandle = startRun('flow', flow.name, o.targets.length)
  const run: FlowRun = {
    id: uid('run'), flowName: flow.name, blocks: flow.blocks, status: 'preparing',
    phones: o.targets.map(t => ({ key: t.key, name: t.name, status: 'pending', current: -1, steps: flow.blocks.map(() => 'pending'), errors: flow.blocks.map(() => undefined), logs: [] })),
    log: [], startedAt: Date.now(), handleId: handle.id,
  }
  runs.set(run.id, run); emit()
  void execute(run, handle, flow, o)
  return run.id
}

async function execute(run: FlowRun, handle: RunHandle, flow: Flow, o: RunOptions) {
  const glog = (m: string) => { run.log.push(m); if (run.log.length > 300) run.log.shift(); emit() }
  const credit: Map<string, CreditRun> = new Map()   // blockId → run de crédits
  try {
    // 1. Crédits : un débit par bloc payant (2/compte pour un post, 1 pour une story),
    //    remboursé compte par compte si le bloc échoue ou n'est pas joué.
    for (const b of flow.blocks) {
      const cost = BLOCK[b.type].credits
      if (cost <= 0) continue
      const cr = await startCreditRun(o.creditOwnerId, cost, o.targets.length)
      if (isCreditError(cr)) {
        for (const c of credit.values()) { c.abort(); await c.settle() }
        glog(`❌ Crédits insuffisants : ${cr.error}`)
        run.status = 'error'; run.endedAt = Date.now(); emit(); handle.finish('error'); return
      }
      credit.set(b.id, cr)
    }

    // 2. Attribution des contenus par compte (pseudos, médias, textes).
    const n = o.targets.length
    const assign = o.targets.map(() => new Map<string, Record<string, string>>())
    const allImg = new Set<string>(), allVid = new Set<string>()
    flow.blocks.forEach(b => { b.params.imageIds?.forEach(id => allImg.add(id)); b.params.videoIds?.forEach(id => allVid.add(id)) })
    const urls = await bankUrls([...allImg, ...allVid])
    for (const b of flow.blocks) {
      const p = b.params
      const userLines = lines(p.usernames), bioLines = lines(p.bios), nameLines = lines(p.names), capLines = lines(p.captions)
      for (let i = 0; i < n; i++) {
        const a: Record<string, string> = {}
        if (b.type === 'username') { const t = userLines[i % Math.max(1, userLines.length)]; if (t) a.username = expandUsername(t) }
        if (b.type === 'avatar' || b.type === 'story') { const id = pick(p.imageIds ?? [], i, p.mode); if (id) a.media = id }
        if (b.type === 'post') { const id = pick(p.videoIds ?? [], i, p.mode); if (id) a.media = id; a.caption = pick(capLines, i, p.mode) ?? '' }
        if (b.type === 'bio') { a.bio = pick(bioLines, i, p.mode) ?? ''; a.name = pick(nameLines, i, p.mode) ?? '' }
        assign[i].set(b.id, a)
      }
    }

    // 3. Hébergement GeeLark UNE fois par média (vidéos des posts, images des stories).
    const hosted = new Map<string, string>()
    const needVid = new Set<string>(), needImg = new Set<string>()
    for (const b of flow.blocks) for (let i = 0; i < n; i++) {
      const m = assign[i].get(b.id)?.media
      if (!m) continue
      if (b.type === 'post') needVid.add(m)
      if (b.type === 'story') needImg.add(m)
    }
    if (needVid.size + needImg.size > 0) glog(`⬆️ Hébergement de ${needVid.size + needImg.size} média(s) chez GeeLark…`)
    for (const id of needVid) { const u = urls.get(id); const r = u ? await geelarkUploadVideo(o.bearer, u, glog) : null; if (r) hosted.set(id, r) }
    for (const id of needImg) { const u = urls.get(id); const r = u ? await geelarkUploadImage(o.bearer, u, glog) : null; if (r) hosted.set(id, r) }

    // 4. Comptes en parallèle (pool). Rotation d'IP ⇒ série : roter l'IP d'un
    //    proxy partagé couperait les autres téléphones en plein bloc.
    run.status = 'running'; emit()
    const conc = o.rotationUrls?.length ? 1 : Math.max(1, Math.min(o.concurrency, n))
    glog(`▶ ${n} compte(s), ${conc} à la fois — ${flow.blocks.length} bloc(s)`)
    let next = 0
    const worker = async () => {
      while (next < n) {
        const i = next++
        await runPhone(run, i, flow, o, assign[i], urls, hosted, credit, handle)
        handle.tick(run.phones[i].status === 'done')
      }
    }
    await Promise.all(Array.from({ length: conc }, worker))

    const settled = await Promise.all([...credit.values()].map(c => c.settle()))
    const refunded = settled.reduce((s, r) => s + r.refunded, 0)
    const ok = run.phones.filter(p => p.status === 'done').length
    glog(`✔ Terminé : ${ok}/${n} compte(s) OK${refunded ? ` — ${refunded} crédit(s) remboursé(s)` : ''}`)
    run.status = handle.isCancelled() ? 'cancelled' : 'done'
  } catch (e) {
    for (const c of credit.values()) { c.abort(); await c.settle().catch(() => undefined) }
    glog(`❌ Erreur : ${e instanceof Error ? e.message : String(e)}`)
    run.status = 'error'
  }
  run.endedAt = Date.now(); emit()
  handle.finish(run.status === 'error' ? 'error' : run.status === 'cancelled' ? 'cancelled' : 'done')
}

async function runPhone(
  run: FlowRun, i: number, flow: Flow, o: RunOptions, assign: Map<string, Record<string, string>>,
  urls: Map<string, string>, hosted: Map<string, string>, credit: Map<string, CreditRun>, handle: RunHandle,
) {
  const pr = run.phones[i]
  const gid = o.targets[i].geelarkId
  const log = (m: string) => { pr.logs.push(m); if (pr.logs.length > 200) pr.logs.shift(); emit() }
  const skipRest = (from: number) => { for (let k = from; k < pr.steps.length; k++) if (pr.steps[k] === 'pending') pr.steps[k] = 'skipped' }
  const refundUnplayed = () => flow.blocks.forEach((b, k) => { if (pr.steps[k] !== 'ok') credit.get(b.id)?.markFailed() })

  if (handle.isCancelled()) { pr.status = 'cancelled'; skipRest(0); refundUnplayed(); emit(); return }
  pr.status = 'booting'; emit()
  handle.detail(`${pr.name} · démarrage`)
  const boot = await ensurePhoneRunning(o.bearer, gid, log, o.rotationUrls)
  if (!boot.ok) {
    pr.status = 'failed'; pr.errors[0] = boot.reason ?? 'Téléphone non démarré'
    skipRest(0); refundUnplayed(); log(`❌ ${pr.errors[0]}`); emit()
    await stopPhoneSurely(o.bearer, gid, log)
    return
  }
  setPhoneManaged(gid, true)
  pr.status = 'running'; emit()
  let failed = false
  try {
    for (let k = 0; k < flow.blocks.length; k++) {
      if (handle.isCancelled()) { pr.status = 'cancelled'; skipRest(k); break }
      const b = flow.blocks[k]
      pr.current = k; pr.steps[k] = 'running'; emit()
      handle.detail(`${pr.name} · ${BLOCK[b.type].label}`)
      log(`── ${k + 1}. ${BLOCK[b.type].label} ──`)
      const r = await execBlock(b, assign.get(b.id) ?? {}, gid, o, urls, hosted, log, handle)
      pr.steps[k] = r.ok ? 'ok' : 'failed'; pr.errors[k] = r.error
      if (!r.ok) {
        failed = true
        log(`❌ ${r.error ?? 'échec'}`)
        if (flow.onError === 'stop') { skipRest(k + 1); break }
      }
      emit()
    }
  } catch (e) {
    failed = true
    const k = Math.max(0, pr.current)
    pr.steps[k] = 'failed'; pr.errors[k] = e instanceof Error ? e.message : String(e)
    skipRest(k + 1)
  } finally {
    setPhoneManaged(gid, false)
    await stopPhoneSurely(o.bearer, gid, log)
  }
  if (pr.status !== 'cancelled') pr.status = failed ? 'failed' : 'done'
  refundUnplayed()
  emit()
}

const rand = (lo: number, hi: number) => lo + Math.random() * Math.max(0, hi - lo)

async function execBlock(
  b: FlowBlock, a: Record<string, string>, gid: string, o: RunOptions,
  urls: Map<string, string>, hosted: Map<string, string>, log: (m: string) => void, handle: RunHandle,
): Promise<{ ok: boolean; error?: string }> {
  const p = b.params
  switch (b.type) {
    case 'login': {
      const key = o.targets.find(t => t.geelarkId === gid)?.key ?? ''
      const c = o.creds[key]
      if (!c?.email?.trim() || !c.password?.trim()) return { ok: false, error: 'Identifiants manquants pour ce compte' }
      return loginInstagramOnPhone(o.bearer, gid, { email: c.email.trim(), password: c.password.trim(), totp: c.totp }, log)
    }
    case 'username':
      if (!a.username) return { ok: false, error: 'Aucun pseudo attribué' }
      return changeUsernameOnPhone(o.bearer, gid, a.username, log)
    case 'avatar': {
      const u = a.media ? urls.get(a.media) : undefined
      if (!u) return { ok: false, error: 'Image introuvable dans la banque' }
      return changeProfilePicOnPhone(o.bearer, gid, u, log)
    }
    case 'bio':
      return editProfileOnPhone(o.bearer, gid, {
        ...(a.name ? { nickname: a.name } : {}),
        ...(a.bio ? { biography: a.bio } : {}),
        ...(p.link?.trim() ? { linkURL: p.link.trim() } : {}),
      }, log)
    case 'warmup': {
      const minutes = Math.round(rand(p.minMin ?? 8, p.maxMin ?? 15))
      const browseVideo = Math.max(1, Math.min(100, minutes * 2))   // ≈ 2 vidéos/min
      log(`🔥 Chauffe ≈ ${minutes} min`)
      return warmupAccountNative(o.bearer, gid, { browseVideo, keyword: p.keyword?.trim() || undefined }, log)
    }
    case 'pause': {
      const ms = rand(p.minMin ?? 10, p.maxMin ?? 30) * 60_000
      const mins = Math.round(ms / 60_000)
      // Pause longue : on éteint le téléphone (GeeLark facture le temps allumé) ;
      // le bloc suivant le redémarre automatiquement.
      if (ms >= 3 * 60_000) {
        log(`⏸ Pause ${mins} min — téléphone éteint pendant l'attente`)
        setPhoneManaged(gid, false)
        await stopPhoneSurely(o.bearer, gid, log)
        setPhoneManaged(gid, true)
      } else log(`⏸ Pause ${mins} min`)
      const end = Date.now() + ms
      while (Date.now() < end) {
        if (handle.isCancelled()) return { ok: false, error: 'Annulé' }
        await sleep(Math.min(5000, end - Date.now()))
      }
      return { ok: true }
    }
    case 'post': {
      const res = a.media ? hosted.get(a.media) : undefined
      if (!res) return { ok: false, error: 'Vidéo non hébergée chez GeeLark' }
      return postReelToPhone(o.bearer, gid, res, a.caption ?? '', log, undefined, !!p.trial)
    }
    case 'story': {
      const res = a.media ? hosted.get(a.media) : undefined
      if (!res) return { ok: false, error: 'Image non hébergée chez GeeLark' }
      return postStoryToPhone(o.bearer, gid, { imageResourceUrl: res, linkUrl: p.link?.trim() ?? '', linkText: p.linkText?.trim() || undefined }, log)
    }
  }
}
