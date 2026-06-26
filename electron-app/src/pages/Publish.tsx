/**
 * Publish — page « Publication ».
 * Le posting simple a été retiré : la page rend directement le Mass Posting.
 * La Programmation reste une page à part.
 */
import { Suspense, lazy } from 'react'
import type { User } from '@supabase/supabase-js'
import { Spinner } from '@/components/ui/Spinner'

const MassPosting = lazy(() => import('@/pages/MassPosting').then(m => ({ default: m.MassPosting })))

export function Publish({ user }: { user: User }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Suspense fallback={
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      }>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <MassPosting user={user} />
        </div>
      </Suspense>
    </div>
  )
}
