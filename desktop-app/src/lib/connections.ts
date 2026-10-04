import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { OrgState } from './data'

// Config de connexion (token GeeLark + clés) — MÊMES tables que l'app web
// (org_config par orga, app_config en perso). Le token posé côté web est donc
// repris ici sans reconfiguration.
export interface ActiveConnections {
  bearer: string        // token GeeLark (Authorization: Bearer …)
  groq: string
  proxy: string
  source: 'user' | 'org'
  loading: boolean
}

const EMPTY: ActiveConnections = { bearer: '', groq: '', proxy: '', source: 'user', loading: true }

export function useConnections(user: User, org: OrgState): ActiveConnections {
  const { currentOrg } = org
  const [conns, setConns] = useState<ActiveConnections>(EMPTY)

  useEffect(() => {
    let cancelled = false
    setConns(c => ({ ...c, loading: true }))

    async function run() {
      if (currentOrg) {
        const { data } = await supabase
          .from('org_config')
          .select('bearer_token, groq_api_key, proxy')
          .eq('org_id', currentOrg.id).maybeSingle()
        if (cancelled) return
        const d = data as Record<string, string> | null
        setConns({ bearer: d?.bearer_token ?? '', groq: d?.groq_api_key ?? '', proxy: d?.proxy ?? '', source: 'org', loading: false })
      } else {
        const { data } = await supabase
          .from('app_config')
          .select('bearer_token, groq_api_key, proxy')
          .eq('user_id', user.id).maybeSingle()
        if (cancelled) return
        const d = data as Record<string, string> | null
        setConns({ bearer: d?.bearer_token ?? '', groq: d?.groq_api_key ?? '', proxy: d?.proxy ?? '', source: 'user', loading: false })
      }
    }
    run()
    return () => { cancelled = true }
  }, [currentOrg?.id, user.id])

  return conns
}
