// « Mode Metricool » côté app desktop — connexion officielle Instagram (Graph API).
// L'app Electron tourne avec webSecurity:false → elle appelle graph.facebook.com en
// direct. Le App SECRET n'est JAMAIS ici (il reste sur Vercel, dans le callback).
// Ici on n'a besoin que du App ID + redirect (non secrets) pour construire le lien,
// et des tokens de Page (stockés par le callback) pour lire les insights.
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { OrgState } from './data'

const GRAPH = 'https://graph.facebook.com/v21.0'
const SCOPES = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'business_management'].join(',')

export interface MetaConfig { appId: string; redirectUri: string; loading: boolean }
export interface MetaConnection {
  id: string
  ig_user_id: string
  ig_username: string | null
  page_id: string | null
  page_access_token: string
  last_synced_at: string | null
  connected_at: string
}

// Config (App ID + redirect) depuis org_config/app_config — posée par toi quand
// l'App Meta existe. Tant qu'elle est vide, la connexion est simplement indisponible.
export function useMetaConfig(user: User, org: OrgState): MetaConfig {
  const { currentOrg } = org
  const [cfg, setCfg] = useState<MetaConfig>({ appId: '', redirectUri: '', loading: true })
  useEffect(() => {
    let cancelled = false
    setCfg(c => ({ ...c, loading: true }))
    ;(async () => {
      const q = currentOrg
        ? supabase.from('org_config').select('meta_app_id, meta_redirect_uri').eq('org_id', currentOrg.id).maybeSingle()
        : supabase.from('app_config').select('meta_app_id, meta_redirect_uri').eq('user_id', user.id).maybeSingle()
      const { data } = await q
      if (cancelled) return
      const d = data as Record<string, string> | null
      setCfg({ appId: d?.meta_app_id ?? '', redirectUri: d?.meta_redirect_uri ?? '', loading: false })
    })().catch(() => { if (!cancelled) setCfg({ appId: '', redirectUri: '', loading: false }) })
    return () => { cancelled = true }
  }, [currentOrg?.id, user.id])
  return cfg
}

// Le « lien » à ouvrir dans le navigateur pour qu'un compte s'autorise (Facebook Login).
export function buildMetaAuthUrl(appId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: appId, redirect_uri: redirectUri, state,
    scope: SCOPES, response_type: 'code',
  })
  return `https://www.facebook.com/v21.0/dialog/oauth?${p.toString()}`
}

// Liste des comptes déjà connectés (lecture ; l'écriture se fait via le callback).
export async function fetchMetaConnections(user: User, org: OrgState): Promise<MetaConnection[]> {
  const { currentOrg } = org
  const q = currentOrg
    ? supabase.from('meta_connections').select('*').eq('org_id', currentOrg.id)
    : supabase.from('meta_connections').select('*').eq('user_id', user.id).is('org_id', null)
  const { data } = await q
  return (data ?? []) as MetaConnection[]
}

export interface MediaInsight {
  id: string; ig_username: string | null; media_type: string | null; caption: string | null
  thumbnail_url: string | null; permalink: string | null
  views: number; likes: number; comments: number; reach: number; taken_at: string | null
}

// Lit les insights média (Reels) sur une fenêtre (jours), triés par vues.
export async function fetchTopReels(user: User, org: OrgState, sinceDays: number | null): Promise<MediaInsight[]> {
  const { currentOrg } = org
  let q = currentOrg
    ? supabase.from('media_insights').select('*').eq('org_id', currentOrg.id)
    : supabase.from('media_insights').select('*').eq('user_id', user.id).is('org_id', null)
  if (sinceDays != null) q = q.gte('taken_at', new Date(Date.now() - sinceDays * 86400000).toISOString())
  const { data } = await q.order('views', { ascending: false }).limit(200)
  return (data ?? []) as MediaInsight[]
}

// Poller d'insights OFFICIELS : pour chaque compte connecté, lit followers_count
// (fiable) + une somme best-effort des vues des médias récents, puis écrit dans la
// table phones (match par ig_username). Tourne dans Electron (fetch direct Graph).
export async function syncMetaInsights(
  user: User, org: OrgState, conns: MetaConnection[], log: (m: string) => void,
): Promise<{ updated: number; errors: number }> {
  const { currentOrg } = org
  let updated = 0, errors = 0
  for (const c of conns) {
    try {
      log(`— @${c.ig_username ?? c.ig_user_id} —`)
      // Abonnés + nb de médias.
      const infoRes = await fetch(`${GRAPH}/${c.ig_user_id}?fields=followers_count,media_count&access_token=${encodeURIComponent(c.page_access_token)}`)
      const info = await infoRes.json()
      if (info.error) throw new Error(info.error.message)
      const followers = Number(info.followers_count ?? 0)

      // Vues + insights PAR MÉDIA (Reels) → table media_insights (classement + courbe).
      let totalViews = 0
      try {
        const mediaRes = await fetch(`${GRAPH}/${c.ig_user_id}/media?fields=id,caption,media_type,thumbnail_url,permalink,timestamp,like_count,comments_count,insights.metric(views,reach)&limit=50&access_token=${encodeURIComponent(c.page_access_token)}`)
        const media = await mediaRes.json()
        const rows: any[] = []
        for (const m of (media.data ?? [])) {
          const views = Number(m?.insights?.data?.find((x: any) => x.metric === 'views')?.values?.[0]?.value ?? 0)
          const reach = Number(m?.insights?.data?.find((x: any) => x.metric === 'reach')?.values?.[0]?.value ?? 0)
          if (views > 0) totalViews += views
          rows.push({
            user_id: user.id, org_id: currentOrg?.id ?? null, ig_user_id: c.ig_user_id, ig_username: c.ig_username,
            media_id: String(m.id), media_type: m.media_type ?? null, caption: (m.caption ?? '').slice(0, 300),
            thumbnail_url: m.thumbnail_url ?? null, permalink: m.permalink ?? null,
            views, likes: Number(m.like_count ?? 0), comments: Number(m.comments_count ?? 0), reach,
            taken_at: m.timestamp ?? null, synced_at: new Date().toISOString(),
          })
        }
        if (rows.length) await supabase.from('media_insights').upsert(rows, { onConflict: 'user_id,media_id' })
      } catch { /* insights média indisponibles — on garde les abonnés */ }

      // Écriture dans phones (match par username, scoping orga/perso).
      let upd = supabase.from('phones').update({
        followers,
        ...(totalViews > 0 ? { total_views: totalViews } : {}),
      }).eq('ig_username', c.ig_username ?? '__none__')
      upd = currentOrg ? upd.eq('org_id', currentOrg.id) : upd.eq('user_id', user.id).is('org_id', null)
      await upd
      await supabase.from('meta_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', c.id)
      log(`   ✅ ${followers.toLocaleString('fr-FR')} abonnés${totalViews ? `, ${totalViews.toLocaleString('fr-FR')} vues` : ''}`)
      updated++
    } catch (e) {
      log(`   ⚠ ${e instanceof Error ? e.message : 'échec'}`)
      errors++
    }
  }
  return { updated, errors }
}
