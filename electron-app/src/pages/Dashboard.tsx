import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Spinner }  from '@/components/ui/Spinner'
import { Button }   from '@/components/ui/Button'

interface DashboardProps {
  user: User
}

interface KPIs {
  phones:       number
  phonesOnline: number
  phonesError:  number
  totalViews:   number
  bankCount:    number
}

interface KpiCardProps {
  icon:  string
  label: string
  value: string | number
  color: string
  sub?:  string
}

function KpiCard({ icon, label, value, color, sub }: KpiCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 border-t-2" style={{ borderTopColor: color }}>
      <div className="flex items-center gap-2 mb-3">
        <span>{icon}</span>
        <span className="text-xs font-semibold text-text2 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-3xl font-bold" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </p>
      {sub && <p className="text-xs text-text2 mt-1">{sub}</p>}
    </div>
  )
}

export function Dashboard({ user }: DashboardProps) {
  const [kpis, setKpis]       = useState<KPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => { loadKPIs() }, [])

  async function loadKPIs() {
    setLoading(true)
    setError(null)
    try {
      const [phonesRes, bankRes] = await Promise.all([
        supabase
          .from('phones')
          .select('status, total_views')
          .eq('user_id', user.id),
        supabase
          .from('content_bank')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ])

      if (phonesRes.error) throw phonesRes.error
      if (bankRes.error)   throw bankRes.error

      const phones = phonesRes.data ?? []
      setKpis({
        phones:       phones.length,
        phonesOnline: phones.filter(p => p.status === 'online').length,
        phonesError:  phones.filter(p => p.status === 'error').length,
        totalViews:   phones.reduce((s, p) => s + (p.total_views ?? 0), 0),
        bankCount:    bankRes.count ?? 0,
      })
    } catch {
      setError('Erreur lors du chargement des données.')
    }
    setLoading(false)
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Dashboard</h1>
          <p className="text-text2 text-sm mt-1">Vue d'ensemble de ton activité IG</p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadKPIs} loading={loading}>
          ↺ Rafraîchir
        </Button>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error ? (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {error}
        </div>
      ) : kpis ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard
              icon="📱" label="Téléphones" color="#4f9eff"
              value={kpis.phones}
              sub={`${kpis.phonesOnline} en ligne`}
            />
            <KpiCard
              icon="👁" label="Vues totales" color="#ffaa2a"
              value={kpis.totalViews}
              sub="Cumul tous téléphones"
            />
            <KpiCard
              icon="🎬" label="Banque vidéos" color="#00ccaa"
              value={kpis.bankCount}
              sub="Contenus disponibles"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <KpiCard
              icon="✅" label="Phones en ligne" color="#00ccaa"
              value={kpis.phonesOnline}
              sub={kpis.phones > 0 ? `${Math.round(kpis.phonesOnline / kpis.phones * 100)}% du parc` : undefined}
            />
            <KpiCard
              icon="🚫" label="Phones en erreur" color="#f03d55"
              value={kpis.phonesError}
              sub={kpis.phonesError > 0 ? 'Vérifier dans Téléphones' : 'Aucune erreur'}
            />
          </div>
        </>
      ) : null}

      {/* Quick-start tips */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text mb-4">Démarrage rapide</h2>
        <div className="space-y-2 text-sm text-text2">
          {kpis && kpis.phones > 0 && kpis.bankCount > 0 ? (
            <p className="text-ok">
              ✓ Tout est prêt — {kpis.phones} phone{kpis.phones > 1 ? 's' : ''}, {kpis.bankCount} vidéo{kpis.bankCount > 1 ? 's' : ''} disponible{kpis.bankCount > 1 ? 's' : ''}.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <span className="text-accent">1.</span>
                <span>Configure ton <span className="text-text font-medium">Bearer Token GéeLark</span> dans <span className="text-text font-medium">Paramètres</span>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-accent">2.</span>
                <span>Va dans <span className="text-text font-medium">Téléphones</span> et clique sur Synchroniser GéeLark.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-accent">3.</span>
                <span>Ajoute tes vidéos dans la <span className="text-text font-medium">Banque vidéos</span>.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
