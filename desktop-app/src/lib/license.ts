import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { OrgState } from './data'

// Licence — sous-ensemble RÉEL porté de electron-app/src/lib/license.ts.
// On ne retient ici que ce dont l'app desktop a besoin pour le moment : l'add-on
// `blowsome` (accès à l'infra VIP) et `isSuperAdmin`. MÊME logique de portes que le web.
export interface License {
  isSuperAdmin: boolean
  blowsome: boolean
  loading: boolean
}

const HARDCODED_SUPER_ADMINS = ['tintin.aunea@gmail.com']

async function checkLicense(userId: string, orgId: string | null): Promise<{ isSuperAdmin: boolean; blowsome: boolean }> {
  // Le superadmin a TOUJOURS Blowsome, même base injoignable (email pris de la session).
  let authEmail = ''
  try { authEmail = (await supabase.auth.getUser()).data.user?.email ?? '' } catch { /* hors ligne */ }
  if (HARDCODED_SUPER_ADMINS.includes(authEmail)) return { isSuperAdmin: true, blowsome: true }

  try {
    const { data: profile, error } = await supabase
      .from('profiles').select('is_super_admin, email').eq('id', userId).maybeSingle()
    if (error) return { isSuperAdmin: false, blowsome: false } // fail-closed pour Blowsome
    const isSuperAdmin = !!(profile as any)?.is_super_admin
      || HARDCODED_SUPER_ADMINS.includes((profile as any)?.email ?? '')
    if (isSuperAdmin) return { isSuperAdmin: true, blowsome: true }

    let blowsome = false
    // Add-on hérité de l'orga (l'OWNER a Blowsome) — RPC SECURITY DEFINER best-effort.
    if (orgId) {
      try {
        const { data: rpcBlow } = await supabase.rpc('org_owner_blowsome', { p_org: orgId })
        if (rpcBlow === true) blowsome = true
      } catch { /* RPC absente */ }
    }
    // Clé de licence personnelle avec l'add-on blowsome.
    if (!blowsome) {
      try {
        const { data: keys } = await supabase
          .from('license_keys').select('blowsome, is_active').eq('user_id', userId).eq('is_active', true)
        if (Array.isArray(keys) && keys.some((k: any) => k?.blowsome === true)) blowsome = true
      } catch { /* colonne/table absente */ }
    }
    return { isSuperAdmin: false, blowsome }
  } catch {
    return { isSuperAdmin: false, blowsome: false }
  }
}

export function useLicense(user: User, org: OrgState): License {
  const { currentOrg } = org
  const [lic, setLic] = useState<License>({ isSuperAdmin: false, blowsome: false, loading: true })
  useEffect(() => {
    let cancelled = false
    setLic(l => ({ ...l, loading: true }))
    checkLicense(user.id, currentOrg?.id ?? null).then(r => {
      if (!cancelled) setLic({ ...r, loading: false })
    })
    return () => { cancelled = true }
  }, [user.id, currentOrg?.id])
  return lic
}
