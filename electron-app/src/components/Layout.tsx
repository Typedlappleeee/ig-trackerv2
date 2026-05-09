import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type Page = 'dashboard' | 'phones' | 'bank' | 'settings'

interface LayoutProps {
  user: User
  page: Page
  onNavigate: (page: Page) => void
  children: React.ReactNode
}

interface NavItem {
  id: Page
  icon: string
  label: string
}

const NAV: NavItem[] = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard'     },
  { id: 'phones',    icon: '📱', label: 'Téléphones'    },
  { id: 'bank',      icon: '🎬', label: 'Banque vidéos' },
  { id: 'settings',  icon: '⚙️', label: 'Paramètres'   },
]

export function Layout({ user, page, onNavigate, children }: LayoutProps) {
  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-surface">
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold bg-accent/10 text-accent">
            IG
          </div>
          <span className="font-semibold text-sm text-text">IG Tracker</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 space-y-0.5">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 text-left
                ${page === item.id
                  ? 'bg-surface2 text-text border-l-2 border-accent pl-[10px]'
                  : 'text-text2 hover:bg-surface2 hover:text-text'
                }
              `}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
              {user.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text truncate">{user.email}</p>
            </div>
            <button
              onClick={signOut}
              className="text-text2 hover:text-danger transition-colors text-xs p-1 rounded"
              title="Se déconnecter"
            >
              ↩
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
