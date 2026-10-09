import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, StatusDot, Panel, PanelHead, PageHead, Kpi, Empty, ConnectBanner } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { scopeInfra } from '@/lib/data'
import { deriveHealth, healthColor, healthReason } from '@/lib/health'

interface Phone {
  id: string
  ig_username: string | null
  ig_status: string | null
  status: string
  group_name: string | null
  last_post_at: string | null
  account_state: string | null
  created_at: string | null
}

function dotKind(status: string): string { return status === 'warming' ? 'warmup' : status }

function ageLabel(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days < 1) return "auj."
  if (days < 30) return `${days} j`
  const months = Math.floor(days / 30)
  return `${months} mois`
}

// Barre de santé (barre colorée + score mono), portée du prototype _health().
function Bar({ v }: { v: number }) {
  const c = healthColor(v)
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ flex: 1, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${v}%`, borderRadius: 99, background: c }} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: c, minWidth: 24, textAlign: 'right' }}>{v}</span>
    </span>
  )
}

const COLS = 'minmax(0,1.2fr) 168px 84px 84px 96px'

const CRITERIA: [string, number, string, string][] = [
  ['Âge du compte', 20, 'Un compte de moins de 14 jours est fragile', '#6366F1'],
  ['Cadence', 25, 'Posts par jour comparés au seuil sûr de la plateforme', '#06B6D4'],
  ['Blocages récents', 30, 'Actions refusées sur les 7 derniers jours', '#EF4444'],
  ['Taux de succès', 15, 'Publications réussies sur les 30 dernières', '#10B981'],
  ['Warmup', 10, 'Sessions de chauffe effectuées ce mois', '#F59E0B'],
]

export default function Health({ theme, infra, user, org, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; onNavigate?: (p: string) => void
}) {
  const { currentOrg } = org
  const [phones, setPhones] = useState<Phone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase.from('phones').select('id,ig_username,ig_status,status,group_name,last_post_at,account_state,created_at')
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    q = scopeInfra(q, infra)
    const { data, error: err } = await q
    if (err) { setError('Impossible de charger la santé des comptes.'); setLoading(false); return }
    setPhones((data ?? []) as Phone[])
    setLoading(false)
  }, [currentOrg?.id, user.id, infra])

  useEffect(() => { load() }, [load])

  const rows = useMemo(
    () => phones.map(p => ({ ...p, health: deriveHealth(p) })).sort((a, b) => a.health - b.health),
    [phones],
  )
  const risk = rows.filter(p => p.health < 70)
  const watch = rows.filter(p => p.health >= 70 && p.health < 85)
  const banned = phones.filter(p => p.account_state === 'banned').length
  const avg = rows.length ? Math.round(rows.reduce((s, p) => s + p.health, 0) / rows.length) : 0
  const alerts = risk.slice(0, 3)

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Santé des comptes"
        sub="Un score par compte, calculé sur l'âge, la cadence, les blocages récents et le taux de succès. Agis avant de perdre un compte."
        actions={<Btn theme={theme} icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8|M3 22v-6h6|M21 12a9 9 0 0 1-15 6.7L3 16" label={loading ? 'Recalcul…' : 'Recalculer'} disabled={loading} onClick={load} />}
      />

      <ConnectBanner theme={theme} onConnect={() => onNavigate?.('connections')} />

      {/* Comment le score est calculé */}
      <div style={{ marginBottom: 16 }}>
        <Panel theme={theme}>
          <PanelHead title="Comment le score est calculé" sub="Cinq critères, recalculés à chaque exécution" right={<Chip text="sur 100" tone="mute" />} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 0 }}>
            {CRITERIA.map(([l, w, d, c], i) => (
              <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRight: i < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{w}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#71717A' }}>pts</span>
                </span>
                <span style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${(w / 30) * 100}%`, borderRadius: 99, background: c }} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{l}</span>
                <span style={{ fontSize: 12, lineHeight: 1.5, color: '#8B8B94' }}>{d}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, flexWrap: 'wrap' }}>
            {[['#4ADE80', '85 à 100 · solide'], ['#FBBF24', '70 à 84 · à surveiller'], ['#F87171', 'sous 70 · action requise']].map(([c, l]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#8B8B94' }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: c }} />{l}
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        <Kpi theme={theme} label="Score moyen" value={rows.length ? avg : '—'} color={rows.length ? healthColor(avg) : undefined} />
        <Kpi theme={theme} label="À risque" value={risk.length} color={risk.length ? '#F87171' : undefined} hint={risk.length ? 'sous 70 · action requise' : undefined} hintColor="#F87171" />
        <Kpi theme={theme} label="À surveiller" value={watch.length} color={watch.length ? '#FBBF24' : undefined} />
        <Kpi theme={theme} label="Comptes bannis" value={banned} color={banned ? '#F87171' : '#4ADE80'} />
      </div>

      {loading ? (
        <Panel theme={theme}><div style={{ padding: 40, textAlign: 'center', color: '#71717A', fontSize: 13 }}>Chargement…</div></Panel>
      ) : error ? (
        <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01|M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" title="Erreur" text={error} /></Panel>
      ) : rows.length === 0 ? (
        <Panel theme={theme}><Empty icon="M12 21s-8-4.5-8-11a5 5 0 0 1 8-3 5 5 0 0 1 8 3c0 6.5-8 11-8 11z" title="Aucun compte" text="Ajoute des appareils pour suivre la santé de tes comptes." /></Panel>
      ) : (
        <>
          {/* Alertes actionnables */}
          {alerts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Panel theme={theme}>
                <PanelHead title="Ce qu'il faut faire maintenant" sub={`${alerts.length} compte${alerts.length > 1 ? 's demandent' : ' demande'} une action`} />
                {alerts.map((p, i) => {
                  const r = healthReason(p)
                  const bad = r.sev === 'bad'
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', minHeight: 52, boxSizing: 'border-box', flexWrap: 'wrap', borderBottom: i < alerts.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <span style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        background: '#18181B',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: bad ? '#F87171' : '#FBBF24',
                      }}><Icon d="M12 9v4|M12 17h.01|M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" size={13} /></span>
                      <span style={{ width: 160, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.ig_username ?? 'compte'}</span>
                        <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: bad ? '#F87171' : '#FBBF24' }}>santé {p.health}</span>
                      </span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13, color: '#A1A1AA' }}>{r.why}</span>
                        <span style={{ fontSize: 12, color: '#71717A' }}>→ {r.fix}</span>
                      </span>
                      <Btn theme={theme} sm tone="primary" label="Corriger" onClick={() => onNavigate?.('warmup')} />
                    </div>
                  )
                })}
              </Panel>
            </div>
          )}

          {/* Classement complet */}
          <Panel theme={theme}>
            <PanelHead title="Tous les comptes" sub="Trié du plus fragile au plus solide" />
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '0 16px', height: 36, borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 11, fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#71717A' }}>
              {['Compte', 'Santé', 'Groupe', 'Âge', 'Cadence'].map((h, i) => <span key={i}>{h}</span>)}
            </div>
            {rows.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '0 16px', minHeight: 44, boxSizing: 'border-box', fontSize: 13, borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', transition: 'background .12s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <StatusDot kind={dotKind(p.status)} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.ig_username ?? '—'}</span>
                </span>
                <span><Bar v={p.health} /></span>
                <span style={{ fontSize: 12, color: '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.group_name ?? '—'}</span>
                <span style={{ fontSize: 12, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{ageLabel(p.created_at)}</span>
                <span><Chip text={p.health >= 85 ? 'normale' : p.health >= 70 ? 'à réduire' : 'trop élevée'} tone={p.health >= 85 ? 'ok' : p.health >= 70 ? 'warn' : 'bad'} /></span>
              </div>
            ))}
          </Panel>
        </>
      )}
    </div>
  )
}
