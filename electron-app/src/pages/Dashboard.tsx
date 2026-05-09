import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type UserItem } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input }  from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'

interface DashboardProps {
  user: User
}

export function Dashboard({ user }: DashboardProps) {
  const [items, setItems]       = useState<UserItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [error, setError]       = useState<string | null>(null)

  // ── Chargement des données ──────────────────────────────────────────────────
  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems() {
    setLoading(true)
    // RLS garantit que chaque utilisateur ne voit QUE ses données
    const { data, error } = await supabase
      .from('user_items')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError('Erreur lors du chargement.')
    } else {
      setItems(data || [])
    }
    setLoading(false)
  }

  // ── Ajouter un élément ─────────────────────────────────────────────────────
  async function addItem() {
    if (!newTitle.trim()) return
    setAdding(true)
    setError(null)

    const { data, error } = await supabase
      .from('user_items')
      .insert({
        user_id: user.id,        // Lié à l'utilisateur connecté
        title:   newTitle.trim(),
        content: newContent.trim(),
      })
      .select()
      .single()

    if (error) {
      setError('Erreur lors de l\'ajout.')
    } else {
      setItems(prev => [data, ...prev])  // Ajoute en haut de la liste
      setNewTitle('')
      setNewContent('')
    }
    setAdding(false)
  }

  // ── Supprimer un élément ───────────────────────────────────────────────────
  async function deleteItem(id: string) {
    const { error } = await supabase
      .from('user_items')
      .delete()
      .eq('id', id)

    if (!error) {
      setItems(prev => prev.filter(item => item.id !== id))
    }
  }

  // ── Déconnexion ────────────────────────────────────────────────────────────
  async function signOut() {
    await supabase.auth.signOut()
    // useAuth() détecte la déconnexion → App revient sur AuthPage
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
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
          <SidebarItem icon="📊" label="Dashboard" active />
          <SidebarItem icon="📱" label="Téléphones" />
          <SidebarItem icon="🎬" label="Banque vidéos" />
          <SidebarItem icon="⚙️" label="Paramètres" />
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

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-8">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text">Dashboard</h1>
            <p className="text-text2 text-sm mt-1">Tes données synchronisées en temps réel</p>
          </div>

          {/* Formulaire d'ajout */}
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-text mb-4">Ajouter un élément</h2>
            <div className="space-y-3">
              <Input
                placeholder="Titre…"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addItem()}
              />
              <Input
                placeholder="Contenu (optionnel)…"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
              />
              <Button onClick={addItem} loading={adding} disabled={!newTitle.trim()}>
                + Ajouter
              </Button>
            </div>
          </div>

          {/* Erreur */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}

          {/* Liste */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-text2">
              <p className="text-3xl mb-3">📭</p>
              <p className="text-sm">Aucun élément — ajoute-en un ci-dessus.</p>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              {items.map(item => (
                <div
                  key={item.id}
                  className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-3 hover:border-accent/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text">{item.title}</p>
                    {item.content && (
                      <p className="text-xs text-text2 mt-1">{item.content}</p>
                    )}
                    <p className="text-xs text-muted mt-2">
                      {new Date(item.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => deleteItem(item.id)}
                    className="flex-shrink-0"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// Composant sidebar item
function SidebarItem({ icon, label, active = false }: { icon: string; label: string; active?: boolean }) {
  return (
    <button
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 text-left
        ${active
          ? 'bg-surface2 text-text border-l-2 border-accent pl-[10px]'
          : 'text-text2 hover:bg-surface2 hover:text-text'
        }
      `}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
