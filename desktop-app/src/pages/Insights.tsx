import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, StatusDot, Panel, PanelHead, PageHead, Kpi, Empty } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { scopeInfra } from '@/lib/data'

interface Phone { id: string; ig_username: string | null; status: string; group_name: string | null; total_views: number | null }
function dotKind(status: string): string { return status === 'warming' ? 'warmup' : status }

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K`
  return String(n)
}

const TONES = ['6,182,212', '139,92,246', '236,72,153', '16,185,129', '245,158,11', '99,102,241', '113,113,122']
function toneFor(i: number): string { return TONES[i % TONES.length] }

export default function Insights({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const { currentOrg } = org
  const [phones, setPhones] = useState<Phone[]>([])
  const [posts, setPosts] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [phRes, prRes, spRes] = await Promise.all([
      scopeInfra(scope(supabase.from('phones').select('id,ig_username,status,group_name,total_views')), infra),
      scope(supabase.from('post_runs').select('ok_count')),
      scope(supabase.from('scheduled_posts').select('id', { count: 'exact', head: true })).eq('status', 'done'),
    ])
    if (phRes.error) { setError('Impossible de charger les performances.'); setLoading(false); return }
    setPhones((phRes.data ?? []) as Phone[])
    const runPosts = ((prRes.data ?? []) as { ok_count: number | null }[]).reduce((s, r) => s + (r.ok_count ?? 0), 0)
    setPosts(runPosts + (spRes.count ?? 0))
    setLoading(false)
  }, [currentOrg?.id, user.id, infra])

  useEffect(() => { load() }, [load])

  const ranked = useMemo(
    () => phones.map(p => ({ ...p, views: p.total_views ?? 0 })).sort((a, b) => b.views - a.views),
    [phones],
  )
  const totalViews = ranked.reduce((s, p) => s + p.views, 0)
  const maxV = ranked.length ? Math.max(1, ranked[0].views) : 1
  const avgV = ranked.length ? Math.round(totalViews / ranked.length) : 0
  const topViews = ranked.slice(0, 8)

  // Répartition des vues par groupe (RÉEL, somme des total_views par group_name).
  const byGroup = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of ranked) { const g = p.group_name ?? 'Sans groupe'; m.set(g, (m.get(g) ?? 0) + p.views) }
    const arr = [...m.entries()].map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v).slice(0, 6)
    return arr.map((x, i) => ({ ...x, pct: totalViews ? Math.round((x.v / totalViews) * 100) : 0, tone: toneFor(i) }))
  }, [ranked, totalViews])

  const RANK_COLS = '26px minmax(150px,1.6fr) minmax(140px,1.4fr) 96px 90px'

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Performances"
        sub="Tes vues cumulées par compte et par groupe, remontées depuis tes appareils. Les métriques natives détaillées (croissance, engagement) arrivent bientôt."
        actions={<Btn theme={theme} tone="ghost" icon="M12 15V3|M7 10l5 5 5-5|M4 21h16" label="Exporter" />}
      />

      {loading ? (
        <Panel theme={theme}><div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div></Panel>
      ) : error ? (
        <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01|M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" title="Erreur" text={error} /></Panel>
      ) : phones.length === 0 ? (
        <Panel theme={theme}><Empty icon="M3 3v18h18|M7 15l4-6 4 3 5-8" title="Aucune donnée" text="Ajoute des comptes et publie pour voir tes vues cumulées apparaître ici." /></Panel>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10, marginBottom: 12 }}>
            <Kpi theme={theme} label="Vues cumulées" value={fmtViews(totalViews)} color={theme.accentText} />
            <Kpi theme={theme} label="Comptes" value={phones.length} />
            <Kpi theme={theme} label="Vues moy. / compte" value={fmtViews(avgV)} />
            <Kpi theme={theme} label="Posts publiés" value={posts.toLocaleString('fr-FR')} hint="cumul" />
          </div>

          {/* Top comptes (barres) + répartition par groupe */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 10, marginBottom: 12 }}>
            <Panel theme={theme}>
              <PanelHead title="Vues par compte" right={<Chip text={`${phones.length} comptes`} tone="mute" />} />
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                {topViews.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ width: 108, flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.ig_username ?? '—'}</span>
                    <span style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.max(2, Math.round((p.views / maxV) * 100))}%`, borderRadius: 99, background: `rgb(${toneFor(i)})` }} />
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 700, color: `rgb(${toneFor(i)})`, width: 54, textAlign: 'right' }}>{fmtViews(p.views)}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel theme={theme}>
              <PanelHead title="Par groupe" />
              <div style={{ padding: 16 }}>
                {byGroup.length === 0 ? (
                  <div style={{ padding: 12, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucune vue enregistrée.</div>
                ) : byGroup.map((x, i) => (
                  <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: i < byGroup.length - 1 ? 13 : 0 }}>
                    <span style={{ width: 76, flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.l}</span>
                    <span style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${x.pct}%`, borderRadius: 99, background: `rgb(${x.tone})` }} />
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: `rgb(${x.tone})`, width: 34, textAlign: 'right' }}>{x.pct}%</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Meilleurs comptes (classement réel) */}
          <Panel theme={theme}>
            <PanelHead title="Meilleurs comptes" sub="Classés par vues cumulées" right={<Chip text={`${phones.length} comptes`} tone="mute" />} />
            <div style={{ display: 'grid', gridTemplateColumns: RANK_COLS, gap: 10, alignItems: 'center', padding: '9px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#52525B' }}>
              {['#', 'Compte', 'Vues', 'Groupe', 'Statut'].map((h, i) => <span key={i} style={{ textAlign: i === 2 ? 'left' : 'left' }}>{h}</span>)}
            </div>
            {ranked.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: RANK_COLS, gap: 10, alignItems: 'center', padding: '10px 15px', fontSize: 12, borderBottom: i < ranked.length - 1 ? '1px solid rgba(255,255,255,0.035)' : 'none', transition: 'background .14s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: i === 0 ? '#FBBF24' : i < 3 ? '#A1A1AA' : '#3F3F46' }}>{i + 1}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: `rgb(${toneFor(i)})`, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: '#F4F4F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.ig_username ?? '—'}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ flex: 1, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.max(2, Math.round((p.views / maxV) * 100))}%`, borderRadius: 99, background: `rgb(${toneFor(i)})` }} />
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color: '#D4D4D8', width: 48, textAlign: 'right' }}>{fmtViews(p.views)}</span>
                </span>
                <span style={{ fontSize: 11.5, color: '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.group_name ?? '—'}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot kind={dotKind(p.status)} />
                  <span style={{ fontSize: 11, color: '#71717A' }}>{p.status === 'online' ? 'En ligne' : p.status === 'warming' ? 'Warmup' : p.status === 'offline' ? 'Hors ligne' : p.status === 'error' ? 'Erreur' : p.status}</span>
                </span>
              </div>
            ))}
          </Panel>
        </>
      )}
    </div>
  )
}
