// Genjutsu : presets de prompt enregistrés par l'équipe (table genjutsu_prompt_presets, partagée dans
// l'espace). Sans la table (SQL pas encore passé) : gardés sur ce navigateur.
import { supabase } from './supabase'
import type { BankScope } from './bankFolders'

export interface PromptPreset { id: string; name: string; prompt: string }
const LOCAL = 'sf-gj-my-presets'
const space = (s: BankScope) => s.orgId ?? `u:${s.userId}`
const missing = (m: string) => /relation|does not exist|schema cache|not find/i.test(m)
const readLocal = (): PromptPreset[] => { try { return JSON.parse(localStorage.getItem(LOCAL) || '[]') as PromptPreset[] } catch { return [] } }
const writeLocal = (l: PromptPreset[]) => { try { localStorage.setItem(LOCAL, JSON.stringify(l)) } catch { /* bloqué */ } }
export const cleanPresetName = (n: string) => n.replace(/\s+/g, ' ').trim().slice(0, 60)
/** Ajoute ou remplace (même nom, sans tenir compte des majuscules) ; liste triée par nom. */
export function upsertPreset(list: PromptPreset[], p: PromptPreset): PromptPreset[] {
  const k = p.name.toLowerCase()
  return [...list.filter(x => x.name.toLowerCase() !== k), p].sort((a, b) => a.name.localeCompare(b.name))
}

export async function listPresets(s: BankScope): Promise<{ list: PromptPreset[]; shared: boolean }> {
  const { data, error } = await supabase.from('genjutsu_prompt_presets').select('id, name, prompt').eq('space', space(s)).order('name')
  if (error) { if (missing(error.message)) return { list: readLocal(), shared: false }; throw new Error(error.message) }
  return { list: (data ?? []) as PromptPreset[], shared: true }
}
export async function savePreset(s: BankScope, shared: boolean, name: string, prompt: string): Promise<PromptPreset> {
  const n = cleanPresetName(name)
  if (!n) throw new Error('donne un nom au preset')
  if (!prompt.trim()) throw new Error('le prompt est vide')
  if (!shared) { const p = { id: `local:${n.toLowerCase()}`, name: n, prompt }; writeLocal(upsertPreset(readLocal(), p)); return p }
  const { data, error } = await supabase.from('genjutsu_prompt_presets')
    .upsert({ org_id: s.orgId, user_id: s.userId, name: n, prompt, updated_at: new Date().toISOString() }, { onConflict: 'space,name' })
    .select('id, name, prompt').single()
  if (error) throw new Error(error.message)
  return data as PromptPreset
}
export async function deletePreset(shared: boolean, id: string): Promise<void> {
  if (!shared) { writeLocal(readLocal().filter(p => p.id !== id)); return }
  const { error } = await supabase.from('genjutsu_prompt_presets').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
