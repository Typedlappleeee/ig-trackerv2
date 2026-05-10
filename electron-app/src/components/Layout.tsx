import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type Page = 'dashboard' | 'phones' | 'stats' | 'posting' | 'massposting' | 'bank' | 'montage' | 'aitools' | 'settings'

interface LayoutProps {
  user: User
  page: Page
  onNavigate: (page: Page) => void
  children: React.ReactNode
}

interface NavItem { id: Page; label: string; icon: string }
interface NavSection { title: string; items: NavItem[] }

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { id: 'dashboard',   label: 'Dashboard',    icon: '📊' },
      { id: 'phones',      label: 'Téléphones',   icon: '📱' },
    ],
  },
  {
    title: 'Instagram',
    items: [
      { id: 'stats',       label: 'Stats IG',     icon: '📈' },
      { id: 'posting',     label: 'Posting',      icon: '🚀' },
      { id: 'massposting', label: 'Mass Posting',  icon: '⚡' },
      { id: 'bank',        label: 'Banque vidéos', icon: '🗂' },
    ],
  },
  {
    title: 'Création',
    items: [
      { id: 'montage',     label: 'Montage',      icon: '✂️' },
      { id: 'aitools',     label: 'Outils IA',    icon: '🤖' },
    ],
  },
  {
    title: 'Général',
    items: [
      { id: 'settings',    label: 'Paramètres',   icon: '⚙️' },
    ],
  },
]

export function Layout({ user, page, onNavigate, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-bg flex">
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-border bg-surface">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-2.5 border-b border-border">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-accent/15 text-accent border border-accent/20">
            IG
          </div>
          <div>
            <p className="font-bold text-sm text-text leading-none">IG Tracker</p>
            <p className="text-[10px] text-text2 leading-none mt-0.5">v2.0</p>
          </div>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-auto py-2">
          {NAV_SECTIONS.map(section => (
            <div key={section.title} className="mb-1">
              <p className="px-4 py-1.5 text-[10px] font-semibold text-text2 uppercase tracking-widest">
                {section.title}
              </p>
              <div className="space-y-0.5 px-2">
                {section.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 text-left
                      ${page === item.id
                        ? 'bg-accent/10 text-accent border border-accent/20'
                        : 'text-text2 hover:bg-surface2 hover:text-text border border-transparent'
                      }
                    `}
                  >
                    <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">
              {user.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text truncate">{user.email}</p>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-text2 hover:text-danger transition-colors text-xs p-1 rounded"
              title="Se déconnecter"
            >
              ↩
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
