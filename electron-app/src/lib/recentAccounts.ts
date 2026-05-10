// Stores the last few accounts used on this machine so the user can flip
// between them without retyping a password. Each entry holds the Supabase
// refresh token, which can be exchanged for a fresh access token via
// supabase.auth.setSession({ access_token: '', refresh_token }).
//
// Same security profile as the existing single-session in localStorage:
// anyone with access to this machine's storage can use these tokens.

import { supabase } from './supabase'

const KEY  = 'ig-tracker-recent-accounts'
const MAX  = 5

export interface RecentAccount {
  email:         string
  user_id:       string
  refresh_token: string
  last_used_at:  string   // ISO
}

export function getRecentAccounts(): RecentAccount[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((a: unknown): a is RecentAccount =>
      !!a && typeof a === 'object'
      && typeof (a as RecentAccount).email === 'string'
      && typeof (a as RecentAccount).user_id === 'string'
      && typeof (a as RecentAccount).refresh_token === 'string'
    )
  } catch {
    return []
  }
}

export function rememberCurrentAccount(): void {
  supabase.auth.getSession().then(({ data }) => {
    const session = data.session
    if (!session?.refresh_token || !session.user.email) return
    upsertAccount({
      email:         session.user.email,
      user_id:       session.user.id,
      refresh_token: session.refresh_token,
      last_used_at:  new Date().toISOString(),
    })
  })
}

export function upsertAccount(a: RecentAccount): void {
  const list = getRecentAccounts().filter(x => x.user_id !== a.user_id)
  list.unshift(a)
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
}

export function forgetAccount(user_id: string): void {
  const list = getRecentAccounts().filter(a => a.user_id !== user_id)
  localStorage.setItem(KEY, JSON.stringify(list))
}

// Restore a stored account. If the refresh token is still valid, this signs
// the user in without prompting for a password. Returns true on success.
export async function switchToAccount(a: RecentAccount): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: a.refresh_token })
  if (error || !data.session) {
    forgetAccount(a.user_id)
    return { ok: false, error: error?.message ?? 'Session expirée' }
  }
  upsertAccount({ ...a, refresh_token: data.session.refresh_token, last_used_at: new Date().toISOString() })
  return { ok: true }
}
