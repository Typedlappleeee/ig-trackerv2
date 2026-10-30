// Dossiers de la Banque. Un dossier = un chemin « Parent/Enfant » dans content_bank.folder : les
// sous-dossiers ne demandent aucun changement de schéma (API, site partenaire et sélecteurs voient
// simplement le chemin). Un dossier vide existe par sa ligne sentinelle (notes = '__sf_folder__'),
// qui porte aussi l'association d'une modèle Genjutsu à son dossier (tag « gj:<id de l'Element> »).
import { supabase } from './supabase'

export const FOLDER_SENTINEL = '__sf_folder__'
export const segs = (p: string) => p.split('/').map(s => s.trim()).filter(Boolean)
export const normPath = (p: string) => segs(p).join('/')
export const leafOf = (p: string) => { const s = segs(p); return s[s.length - 1] ?? p }
export const parentOf = (p: string): string | null => { const s = segs(p); return s.length > 1 ? s.slice(0, -1).join('/') : null }
export const joinPath = (parent: string | null, name: string) => normPath(parent ? `${parent}/${cleanSeg(name)}` : cleanSeg(name))
// Le dossier lui-même ou l'un de ses sous-dossiers.
export const isWithin = (p: string | null | undefined, root: string) => {
  if (!p) return false
  const n = normPath(p)
  return n === root || n.startsWith(`${root}/`)
}
// Un nom de dossier (un seul niveau) : « / » réservé au chemin.
export const cleanSeg = (s: string) => s.replace(/\//g, '-').replace(/\s+/g, ' ').trim()
// Nouveau chemin d'un dossier (ou d'un de ses sous-dossiers) quand `oldRoot` devient `newRoot`.
export const renamedPath = (path: string, oldRoot: string, newRoot: string) => {
  const n = normPath(path)
  return n === oldRoot ? newRoot : `${newRoot}${n.slice(oldRoot.length)}`
}

export interface FolderNode { path: string; name: string; depth: number; hasChildren: boolean }
// Tous les chemins (et leurs parents implicites) en ordre d'arborescence, frères triés par nom.
export function folderTree(paths: Iterable<string | null | undefined>): FolderNode[] {
  const all = new Set<string>()
  for (const raw of paths) {
    if (!raw) continue
    const s = segs(raw)
    for (let i = 1; i <= s.length; i++) all.add(s.slice(0, i).join('/'))
  }
  const kids = new Map<string | null, string[]>()
  for (const p of all) {
    const par = parentOf(p)
    if (!kids.has(par)) kids.set(par, [])
    kids.get(par)!.push(p)
  }
  const out: FolderNode[] = []
  const walk = (par: string | null, depth: number) => {
    const l = (kids.get(par) ?? []).sort((a, b) => leafOf(a).localeCompare(leafOf(b), 'fr', { sensitivity: 'base', numeric: true }))
    for (const p of l) {
      out.push({ path: p, name: leafOf(p), depth, hasChildren: kids.has(p) })
      walk(p, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/* ── accès base (espace = organisation, ou perso) ── */
export interface BankScope { orgId: string | null; userId: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoped = (q: any, s: BankScope) => s.orgId ? q.eq('org_id', s.orgId) : q.eq('user_id', s.userId).is('org_id', null)

// Chemins des dossiers existants (médias + dossiers vides).
export async function listBankFolders(s: BankScope): Promise<string[]> {
  const { data } = await scoped(supabase.from('content_bank').select('folder').not('folder', 'is', null).is('deleted_at', null).limit(10000), s)
  return [...new Set(((data ?? []) as { folder: string | null }[]).map(r => r.folder ? normPath(r.folder) : '').filter(Boolean))]
}

// Crée le dossier (ligne sentinelle) s'il n'existe pas encore.
export async function ensureBankFolder(s: BankScope, path: string, tags: string[] = []): Promise<void> {
  const p = normPath(path)
  if (!p) return
  const { data } = await scoped(supabase.from('content_bank').select('id').eq('notes', FOLDER_SENTINEL).eq('folder', p).limit(1), s)
  if ((data ?? []).length) return
  await supabase.from('content_bank').insert({
    user_id: s.userId, org_id: s.orgId, title: leafOf(p), folder: p, file_url: null, storage_path: null, thumbnail_path: null,
    duration: null, tags, notes: FOLDER_SENTINEL,
  })
}

/* ── Genjutsu : le dossier de la Banque associé à chaque modèle ── */
const modelTag = (modelId: string) => `gj:${modelId}`
export async function loadModelFolders(s: BankScope): Promise<Record<string, string>> {
  const { data } = await scoped(supabase.from('content_bank').select('folder, tags').eq('notes', FOLDER_SENTINEL).not('folder', 'is', null), s)
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as { folder: string; tags: string[] | null }[])
    for (const t of r.tags ?? []) if (t.startsWith('gj:')) out[t.slice(3)] = normPath(r.folder)
  return out
}
export async function setModelFolder(s: BankScope, modelId: string, path: string): Promise<void> {
  const tag = modelTag(modelId), p = normPath(path)
  // l'ancienne association est retirée…
  const { data: old } = await scoped(supabase.from('content_bank').select('id, folder, tags').eq('notes', FOLDER_SENTINEL).contains('tags', [tag]), s)
  for (const r of (old ?? []) as { id: string; folder: string; tags: string[] | null }[]) {
    if (normPath(r.folder) === p) return
    await supabase.from('content_bank').update({ tags: (r.tags ?? []).filter(t => t !== tag) }).eq('id', r.id)
  }
  // …et portée par le dossier choisi (créé au besoin).
  const { data: cur } = await scoped(supabase.from('content_bank').select('id, tags').eq('notes', FOLDER_SENTINEL).eq('folder', p).limit(1), s)
  const row = ((cur ?? []) as { id: string; tags: string[] | null }[])[0]
  if (row) await supabase.from('content_bank').update({ tags: [...new Set([...(row.tags ?? []), tag])] }).eq('id', row.id)
  else await ensureBankFolder(s, p, [tag])
}
