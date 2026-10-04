import { supabase } from './supabase'

// Enregistre une programmation « directe GeeLark » (tâches créées avec scheduleAt futur,
// exécutées par GeeLark PC éteint) dans scheduled_posts avec status='geelark' — l'edge
// function ne traite QUE status='pending', donc aucun double post. Sert à afficher la
// liste « Programmé » et à annuler (cancel GeeLark + remboursement).
export interface GeelarkSchedule {
  userId: string; orgId: string | null; ownerId: string
  type: string; scheduledAtUnix: number
  phones: { geelark_id: string; name: string }[]
  taskIds: string[]; caption?: string; trial?: boolean; platform?: string
  creditsTotal: number   // crédits réellement débités pour ces tâches (à rembourser si annulé)
}
export async function recordGeelarkSchedule(r: GeelarkSchedule): Promise<void> {
  try {
    await supabase.from('scheduled_posts').insert({
      user_id: r.userId, org_id: r.orgId,
      created_by_name: 'Programmé (GeeLark)', type: r.type,
      status: 'geelark', scheduled_at: new Date(r.scheduledAtUnix * 1000).toISOString(),
      phones: r.phones, videos: [], caption: r.caption ?? '',
      delay_minutes: 0, mode: 'seq', bearer_token: '', reels_trial: !!r.trial,
      result: { geelark_task_ids: r.taskIds, platform: r.platform ?? 'instagram', owner_id: r.ownerId, credits_total: r.creditsTotal },
    })
  } catch { /* best-effort — ne casse jamais la programmation */ }
}
