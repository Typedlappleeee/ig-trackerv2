// Onglet fusionné « Automatisation » = Programmé (Scheduler) + Récurrent (Tasks).
// Simplifie la nav : un seul endroit mental pour « ce qui part tout seul ».
// Le sous-onglet Récurrent (tâches) n'est proposé qu'aux superadmins (comme avant).
import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Scheduler } from './Scheduler'
import { Tasks } from './Tasks'
import { SubTabBar } from '@/components/SubTabBar'
import { useTr } from '@/lib/i18n'

export function Automation({ user, onNavigate, showRecurring = false }: {
  user: User
  onNavigate?: (page: string, tab?: string) => void
  showRecurring?: boolean
}) {
  const tr = useTr()
  const [tab, setTab] = useState<'scheduled' | 'recurring'>('scheduled')
  const eff = showRecurring ? tab : 'scheduled'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {showRecurring && (
        <SubTabBar
          active={eff}
          onChange={id => setTab(id as 'scheduled' | 'recurring')}
          tabs={[
            { id: 'scheduled', label: tr('Programmé', 'Scheduled'), emoji: '📅' },
            { id: 'recurring', label: tr('Récurrent', 'Recurring'), emoji: '🤖' },
          ]}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {eff === 'scheduled'
          ? <Scheduler user={user} onNavigate={onNavigate} />
          : <Tasks user={user} />}
      </div>
    </div>
  )
}

export default Automation
