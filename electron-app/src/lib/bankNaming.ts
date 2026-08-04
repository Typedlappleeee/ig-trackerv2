// Nommage unifié des médias générés par les outils (incrustation, spoof…) :
// « scaleflow<N>.mp4 », numéroté en continu pour ne JAMAIS créer deux fois le
// même nom (sinon les fichiers se regroupent/écrasent dans la banque).
import { supabase } from './supabase'

// Renvoie le prochain numéro libre, en repartant du plus grand déjà en banque.
// Portée : l'agence si elle existe, sinon le compte perso.
export async function nextScaleflowNumber(userId: string, orgId?: string | null): Promise<number> {
  let next = 1
  try {
    const q = supabase.from('content_bank').select('title').ilike('title', 'scaleflow%')
    const { data } = await (orgId ? q.eq('org_id', orgId) : q.eq('user_id', userId))
    for (const row of data ?? []) {
      const m = /^scaleflow(\d+)/i.exec(String((row as { title?: string }).title ?? ''))
      if (m) next = Math.max(next, Number(m[1]) + 1)
    }
  } catch { /* pas bloquant : on démarre à 1 */ }
  return next
}

export function scaleflowName(n: number): string { return `scaleflow${n}.mp4` }
