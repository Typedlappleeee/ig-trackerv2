import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { useOrg } from './orgContext'

// Connection-level config that switches between solo (app_config) and org (org_config).
// Connection-only fields: bearer/groq/proxy/ig_sessionid. Other settings (theme,
// language, notifications, profile name…) stay user-level in app_config.
export interface ActiveConnections {
  bearer:       string
  groq:         string
  anthropic:    string
  proxy:        string
  ig_sessionid: string
  source:       'user' | 'org'
  loading:      boolean
}

const EMPTY: ActiveConnections = {
  bearer: '', groq: '', anthropic: '', proxy: '', ig_sessionid: '',
  source: 'user', loading: true,
}

// Pub-sub so Settings can force a re-fetch after save without prop-drilling.
const listeners = new Set<() => void>()
export function notifyConnectionsChanged() {
  for (const l of listeners) l()
}

// Re-fetches whenever the active org switches OR notifyConnectionsChanged()
// is called. Returns empty strings (not null) so consumers can safely
// string-compare without optional chaining everywhere.
export function useConnections(user: User): ActiveConnections {
  const { currentOrg } = useOrg()
  const [conns, setConns] = useState<ActiveConnections>(EMPTY)
  const [tick, setTick]   = useState(0)

  // Subscribe to external invalidation events
  useEffect(() => {
    const cb = () => setTick(t => t + 1)
    listeners.add(cb)
    return () => { listeners.delete(cb) }
  }, [])

  useEffect(() => {
    let cancelled = false
    setConns(c => ({ ...c, loading: true }))

    async function fetchOrg() {
      let { data, error } = await supabase
        .from('org_config')
        .select('bearer_token, groq_api_key, anthropic_api_key, proxy, ig_sessionid')
        .eq('org_id', currentOrg!.id).maybeSingle()
      if (error && /anthropic|column|schema cache/i.test(error.message)) {
        const r = await supabase
          .from('org_config')
          .select('bearer_token, groq_api_key, proxy, ig_sessionid')
          .eq('org_id', currentOrg!.id).maybeSingle()
        data = r.data as typeof data
      }
      if (cancelled) return
      setConns({
        bearer:       (data as Record<string,string> | null)?.bearer_token ?? '',
        groq:         (data as Record<string,string> | null)?.groq_api_key ?? '',
        anthropic:    (data as Record<string,string> | null)?.anthropic_api_key ?? '',
        proxy:        (data as Record<string,string> | null)?.proxy ?? '',
        ig_sessionid: (data as Record<string,string> | null)?.ig_sessionid ?? '',
        source:       'org',
        loading:      false,
      })
    }

    async function fetchUser() {
      let { data, error } = await supabase
        .from('app_config')
        .select('bearer_token, groq_api_key, anthropic_api_key, proxy, ig_sessionid')
        .eq('user_id', user.id).maybeSingle()
      if (error && /anthropic|column|schema cache/i.test(error.message)) {
        const r = await supabase
          .from('app_config')
          .select('bearer_token, groq_api_key, proxy, ig_sessionid')
          .eq('user_id', user.id).maybeSingle()
        data = r.data as typeof data
      }
      if (cancelled) return
      setConns({
        bearer:       (data as Record<string,string> | null)?.bearer_token ?? '',
        groq:         (data as Record<string,string> | null)?.groq_api_key ?? '',
        anthropic:    (data as Record<string,string> | null)?.anthropic_api_key ?? '',
        proxy:        (data as Record<string,string> | null)?.proxy ?? '',
        ig_sessionid: (data as Record<string,string> | null)?.ig_sessionid ?? '',
        source:       'user',
        loading:      false,
      })
    }

    if (currentOrg) {
      fetchOrg()
    } else {
      fetchUser()
    }

    return () => { cancelled = true }
  }, [currentOrg?.id, user.id, tick])

  return conns
}
