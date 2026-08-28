import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  supabase,
  type Organization, type OrgMember, type OrgRole, type PermOverrides,
  type ScheduledPost, type PostRun,
} from './supabase'
import type { InfraKey } from './theme'

// ── Séparation des infrastructures ───────────────────────────────────────────
// Les deux infras sont distinctes niveau données. Discriminateur : la colonne
// `geelark_id` de la table `phones`. Un téléphone GeeLark en a un ; un téléphone
// ScaleFlow Cloud (auto-hébergé) n'en a pas. Donc ScaleFlow Cloud n'affiche JAMAIS
// les appareils GeeLark (et vice-versa). Aucune modif de schéma nécessaire.
export function scopeInfra<T>(q: T, infra: InfraKey): T {
  const anyQ = q as any
  return (infra === 'cloud' ? anyQ.is('geelark_id', null) : anyQ.not('geelark_id', 'is', null)) as T
}

const LS_ORG = 'ig-tracker-current-org'
const EMPTY_PERMS: PermOverrides = {}

// ── Solde crédits (porté de electron-app/src/lib/credits.ts) ────────────────────
export async function fetchBalance(userId: string): Promise<number> {
  try {
    const { data } = await supabase.from('user_credits').select('balance').eq('user_id', userId).maybeSingle()
    return data?.balance ?? 0
  } catch { return 0 }
}
export async function fetchOrgBalance(orgId: string, ownerUserId?: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_org_credit_balance', { p_org_id: orgId })
    if (error) throw error
    return typeof data === 'number' ? data : 0
  } catch {
    if (ownerUserId) return fetchBalance(ownerUserId)
    return 0
  }
}

// ── Organisation courante (porté/simplifié de orgContext.tsx) ───────────────────
export interface OrgState {
  currentOrg: Organization | null
  myOrgs: { org: Organization; member: OrgMember }[]
  role: OrgRole | null
  perms: PermOverrides
  loading: boolean
  switchOrg: (id: string | null) => void
}

export function useOrg(user: User): OrgState {
  const [myOrgs, setMyOrgs] = useState<{ org: Organization; member: OrgMember }[]>([])
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(LS_ORG))
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    let members: any[] | null = null
    // Voie rapide : RPC SECURITY DEFINER (contourne les RLS récursives).
    try {
      const rpc: any = await supabase.rpc('get_my_orgs')
      if (!rpc.error && Array.isArray(rpc.data)) {
        members = rpc.data.map((r: { org: unknown; member: Record<string, unknown> }) => ({ ...r.member, organizations: r.org }))
      }
    } catch { /* fallback */ }
    // Fallback : requête directe.
    if (members === null) {
      const r: any = await supabase.from('organization_members').select('*, organizations(*)').eq('user_id', user.id)
      members = r.error ? [] : ((r.data as any[]) ?? [])
    }
    const list = (members ?? [])
      .filter((m: { organizations: Organization | null }) => m.organizations)
      .map((m: OrgMember & { organizations: Organization }) => ({
        org: m.organizations,
        member: { ...m, organizations: undefined } as OrgMember,
      }))
    setMyOrgs(list)
    let effective = localStorage.getItem(LS_ORG)
    if (effective && !list.some((x: { org: Organization }) => x.org.id === effective)) {
      localStorage.removeItem(LS_ORG); effective = null
    }
    if (!effective && list.length > 0) {
      effective = list[0].org.id; localStorage.setItem(LS_ORG, effective)
    }
    setCurrentId(effective ?? null)
    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

  const current = myOrgs.find(x => x.org.id === currentId) ?? null
  const switchOrg = (id: string | null) => {
    if (id) localStorage.setItem(LS_ORG, id); else localStorage.removeItem(LS_ORG)
    setCurrentId(id)
  }
  return {
    currentOrg: current?.org ?? null,
    myOrgs,
    role: current?.member.role ?? null,
    perms: current?.member.perm_overrides ?? EMPTY_PERMS,
    loading,
    switchOrg,
  }
}

// ── Données de l'Accueil (requêtes IDENTIQUES à electron-app/src/pages/Hub.tsx) ──
export interface HubData {
  displayName: string | null
  phoneCount: number
  videoCount: number
  weekPosts: number
  balance: number | null
  upcoming: ScheduledPost[]
  recent: Array<
    | { kind: 'scheduled'; data: ScheduledPost }
    | { kind: 'run'; data: PostRun }
  >
}

export function useHubData(user: User, org: OrgState, infra: InfraKey) {
  const { currentOrg, role, perms, loading: orgLoading } = org
  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // 🔒 KPI téléphones : membre restreint à des groupes → on ne compte que ceux-là.
    const restrictedGroups = (role && role !== 'owner' && role !== 'admin' && perms?.phone_groups?.mode === 'allow')
      ? (perms.phone_groups.list ?? [])
      : null

    let phonesQ = currentOrg
      ? supabase.from('phones').select('id', { count: 'exact', head: true }).eq('org_id', currentOrg.id)
      : supabase.from('phones').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('org_id', null)
    phonesQ = scopeInfra(phonesQ, infra)
    if (restrictedGroups) phonesQ = phonesQ.in('group_name', restrictedGroups)

    const bankQ = currentOrg
      ? supabase.from('content_bank').select('id', { count: 'exact', head: true }).eq('org_id', currentOrg.id)
      : supabase.from('content_bank').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('org_id', null)

    const spQ = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const prQ = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)

    const balanceP = currentOrg
      ? fetchOrgBalance(currentOrg.id, currentOrg.owner_id)
      : fetchBalance(user.id)

    const [phonesRes, videosRes, weekRes, runsRes, upcomingRes, recentRes, directRunsRes, profileRes, balance] = await Promise.all([
      phonesQ,
      bankQ,
      spQ(supabase.from('scheduled_posts').select('id', { count: 'exact', head: true }))
        .in('status', ['done', 'failed']).gte('created_at', weekAgo),
      prQ(supabase.from('post_runs').select('ok_count')).gte('created_at', weekAgo),
      spQ(supabase.from('scheduled_posts').select('*'))
        .eq('status', 'pending').order('scheduled_at', { ascending: true }).limit(5),
      spQ(supabase.from('scheduled_posts').select('*'))
        .in('status', ['done', 'failed']).order('executed_at', { ascending: false }).limit(8),
      prQ(supabase.from('post_runs').select('*')).order('created_at', { ascending: false }).limit(8),
      supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      balanceP,
    ])

    const runPosts = ((runsRes.data ?? []) as Array<{ ok_count: number | null }>)
      .reduce((sum, r) => sum + (r.ok_count ?? 0), 0)

    const recentScheduled = ((recentRes.data ?? []) as ScheduledPost[])
      .map(d => ({ kind: 'scheduled' as const, data: d, _date: d.executed_at ?? d.created_at ?? '' }))
    const recentRuns = ((directRunsRes?.data ?? []) as PostRun[])
      .map(d => ({ kind: 'run' as const, data: d, _date: d.created_at ?? '' }))
    const merged = [...recentScheduled, ...recentRuns]
      .sort((a, b) => (b._date ?? '').localeCompare(a._date ?? '')).slice(0, 5)

    setData({
      displayName: (profileRes.data as { display_name?: string } | null)?.display_name ?? null,
      phoneCount: phonesRes.count ?? 0,
      videoCount: videosRes.count ?? 0,
      weekPosts: (weekRes.count ?? 0) + runPosts,
      balance,
      upcoming: (upcomingRes.data ?? []) as ScheduledPost[],
      recent: merged.map(({ kind, data }) => ({ kind, data } as HubData['recent'][number])),
    })
    setLoading(false)
  }, [currentOrg?.id, currentOrg?.owner_id, user.id, role, perms, infra])

  useEffect(() => { if (!orgLoading) load() }, [load, orgLoading])

  return { data, loading: loading || orgLoading, reload: load }
}

// ── Helpers d'affichage ──────────────────────────────────────────────────────
export function firstNameFrom(displayName: string | null, email: string | undefined): string {
  if (displayName && displayName.trim()) return displayName.trim().split(/\s+/)[0]
  const base = (email?.split('@')[0] ?? 'créateur').replace(/[._]/g, ' ')
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function fmtNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

// Libellé d'affichage d'un téléphone : le NOM GeeLark d'abord (beaucoup de comptes
// n'ont pas de @username), le compte IG en secondaire.
export function phoneLabel(p: { phone_name?: string | null; ig_username?: string | null }): string {
  return (p.phone_name && p.phone_name.trim()) || (p.ig_username ? `@${p.ig_username}` : 'Appareil')
}
export function phoneSub(p: { ig_username?: string | null }): string {
  return p.ig_username ? `@${p.ig_username}` : 'sans compte lié'
}

export function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDay(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + time
}

export function phoneCountOf(post: ScheduledPost): number {
  return Array.isArray(post.phones) ? post.phones.length : 0
}
