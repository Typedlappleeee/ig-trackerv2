import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type Organization, type OrgMember, type OrgRole, type PermOverrides } from './supabase'

const LS_KEY = 'ig-tracker-current-org'

interface OrgContextValue {
  myOrgs:        { org: Organization; member: OrgMember }[]
  currentOrg:    Organization | null   // null = solo mode
  myMembership:  OrgMember | null
  role:          OrgRole | null         // null when solo
  perms:         PermOverrides          // empty {} when solo
  loading:       boolean
  loadError:     boolean               // true if the org query failed (e.g. Supabase 500)
  switchOrg:     (orgId: string | null) => void
  refresh:       () => Promise<void>
}

const Ctx = createContext<OrgContextValue | null>(null)

export function OrgProvider({ user, children }: { user: User; children: ReactNode }) {
  const [myOrgs, setMyOrgs]         = useState<{ org: Organization; member: OrgMember }[]>([])
  const [currentId, setCurrentId]   = useState<string | null>(() => localStorage.getItem(LS_KEY))
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | { data: null; error: Error }> =>
      Promise.race([p, new Promise<{ data: null; error: Error }>(res =>
        setTimeout(() => res({ data: null, error: new Error('timeout') }), ms))])

    // 1) Voie rapide : RPC SECURITY DEFINER (contourne les RLS — la jointure
    //    directe organization_members↔organizations peut récursionner et timeout).
    let members: any[] | null = null
    let error: Error | null = null
    try {
      const rpc: any = await withTimeout(Promise.resolve(supabase.rpc('get_my_orgs')), 6000)
      if (!rpc.error && Array.isArray(rpc.data)) {
        members = rpc.data.map((r: { org: unknown; member: Record<string, unknown> }) => ({ ...r.member, organizations: r.org }))
      }
    } catch { /* tombe sur le fallback */ }

    // 2) Fallback : requête directe (si la fonction get_my_orgs n'existe pas encore)
    if (members === null) {
      const r: any = await withTimeout(
        Promise.resolve(supabase.from('organization_members').select('*, organizations(*)').eq('user_id', user.id)),
        7000)
      if (r.error) { error = r.error as Error; console.warn('[orgContext] fallback échoué:', error.message) }
      else members = (r.data as any[]) ?? []
    }

    if (error) {
      console.error('[orgContext] load error:', error)
      setLoadError(true)
      setLoading(false)
      return
    }

    setLoadError(false)
    const list = (members ?? [])
      .filter((m: { organizations: Organization | null }) => m.organizations)
      .map((m: OrgMember & { organizations: Organization }) => ({
        org:    m.organizations,
        member: { ...m, organizations: undefined } as OrgMember,
      }))
    setMyOrgs(list)
    // Validate persisted choice; if stale, clear it
    let effective = localStorage.getItem(LS_KEY)
    if (effective && !list.some((x: { org: Organization }) => x.org.id === effective)) {
      localStorage.removeItem(LS_KEY)
      effective = null
    }
    // Auto-select first org if nothing valid is selected (removes need for solo mode)
    if (!effective && list.length > 0) {
      effective = list[0].org.id
      localStorage.setItem(LS_KEY, effective)
    }
    setCurrentId(effective ?? null)
    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

  // Instant kick — listen for a broadcast from an admin who removed this user.
  // The kicked member's session reloads immediately (no manual refresh needed).
  // We can't rely on a postgres_changes DELETE event: RLS hides the row from the
  // user once their membership is gone, so a broadcast on the org room is used.
  useEffect(() => {
    if (!currentId) return
    const ch = supabase.channel(`org-room-${currentId}`)
      .on('broadcast', { event: 'member_removed' }, ({ payload }) => {
        if ((payload as { userId?: string })?.userId === user.id) {
          if (localStorage.getItem(LS_KEY) === currentId) localStorage.removeItem(LS_KEY)
          window.location.reload()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [currentId, user.id])

  // Safety net — re-validate membership every 15s in case the broadcast was
  // missed (member was on another tab/org). If the row is gone, drop access.
  useEffect(() => {
    if (!currentId) return
    const id = setInterval(async () => {
      const { data, error } = await supabase
        .from('organization_members')
        .select('id')
        .eq('org_id', currentId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!error && !data) {
        if (localStorage.getItem(LS_KEY) === currentId) localStorage.removeItem(LS_KEY)
        window.location.reload()
      }
    }, 15000)
    return () => clearInterval(id)
  }, [currentId, user.id])

  const current = myOrgs.find(x => x.org.id === currentId) ?? null

  function switchOrg(orgId: string | null) {
    if (orgId) localStorage.setItem(LS_KEY, orgId)
    else       localStorage.removeItem(LS_KEY)
    setCurrentId(orgId)
  }

  const value: OrgContextValue = {
    myOrgs,
    currentOrg:   current?.org ?? null,
    myMembership: current?.member ?? null,
    role:         current?.member.role ?? null,
    perms:        current?.member.perm_overrides ?? {},
    loading,
    loadError,
    switchOrg,
    refresh: load,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOrg(): OrgContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOrg must be used inside OrgProvider')
  return v
}
