import type { User } from '@supabase/supabase-js'
import { MassRemix } from './MassRemix'

interface RemixProps { user: User }

export function Remix({ user }: RemixProps) {
  return <MassRemix user={user} />
}
