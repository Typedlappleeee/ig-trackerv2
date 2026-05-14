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
    const { data: members, error } = await supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', user.id)

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
    const stored = localStorage.getItem(LS_KEY)
    if (stored && !list.some(x => x.org.id === stored)) {
      localStorage.removeItem(LS_KEY)
      setCurrentId(null)
    }
    // Auto-select first org if nothing is selected (removes need for solo mode)
    if (!stored && list.length > 0) {
      localStorage.setItem(LS_KEY, list[0].org.id)
      setCurrentId(list[0].org.id)
    }
    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

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
