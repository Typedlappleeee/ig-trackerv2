// Onglet fusionné « Activité » = Journal (History) + Comptes & Stats (Reports).
// Simplifie la nav : un seul endroit pour « ce qui s'est passé + l'état des comptes ».
import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Page } from '@/components/Layout'
import { History } from './History'
import { Reports } from './Reports'
import { SubTabBar } from '@/components/SubTabBar'
import { useTr } from '@/lib/i18n'

export function Activity({ user, onNavigate }: {
  user: User
  onNavigate?: (page: Page) => void
}) {
  const tr = useTr()
  const [tab, setTab] = useState<'journal' | 'accounts'>('journal')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SubTabBar
        active={tab}
        onChange={id => setTab(id as 'journal' | 'accounts')}
        tabs={[
          { id: 'journal', label: tr('Journal', 'Log'), emoji: '🕑' },
          { id: 'accounts', label: tr('Comptes & Stats', 'Accounts & Stats'), emoji: '📊' },
        ]}
      />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {tab === 'journal'
          ? <History user={user} onNavigate={onNavigate} />
          : <Reports user={user} />}
      </div>
    </div>
  )
}

export default Activity
