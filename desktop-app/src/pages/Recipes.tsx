import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type RecurringTask } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Icon, Panel, PageHead, Empty } from '@/lib/ui'
import type { OrgState } from '@/lib/data'

function asArray(v: unknown): any[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

// Étapes lisibles : appareils + type de chaque step (ou le type plat si aucun step).
function stepChips(t: RecurringTask): string[] {
  const n = asArray(t.phones).length
  const chips: string[] = [n ? `${n} appareil${n > 1 ? 's' : ''}` : 'appareils']
  const steps = asArray(t.steps)
  if (steps.length) {
    for (const s of steps) {
      const ty = (s as any)?.type
      chips.push(ty === 'warmup' ? 'Warmup' : ty === 'story' ? 'Story + lien' : 'Reel')
    }
  } else {
    chips.push(t.task_type === 'story' ? 'Story + lien' : 'Reel')
  }
  if (t.mode) chips.push(t.mode === 'seq' ? 'Séquentiel' : 'Aléatoire')
  return chips
}

function relDay(iso: string | null): string {
  if (!iso) return 'jamais lancée'
  const d = new Date(iso); const ms = Date.now() - d.getTime()
  if (isNaN(d.getTime())) return '—'
  const h = Math.floor(ms / 3600000)
  if (h < 1) return "il y a moins d'1 h"
  if (h < 24) return `il y a ${h} h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Description synthétique honnête à partir des vrais champs.
function describe(t: RecurringTask): string {
  const parts: string[] = []
  const steps = asArray(t.steps)
  if (steps.length) parts.push(`${steps.length} étape${steps.length > 1 ? 's' : ''}`)
  else parts.push(t.task_type === 'story' ? 'Story + lien par compte' : 'Publication Reels')
  if (t.recur_hours) parts.push(`toutes les ${t.recur_hours}h`)
  if (t.mode) parts.push(t.mode === 'seq' ? 'séquentiel' : 'aléatoire')
  return parts.join(' · ')
}

const TONES = ['6,182,212', '139,92,246', '245,158,11', '236,72,153', '16,185,129', '99,102,241']
function toneFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return TONES[h % TONES.length]
}

export default function Recipes({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const { currentOrg } = org
  const [tasks, setTasks] = useState<RecurringTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase.from('recurring_tasks').select('*').order('created_at', { ascending: false })
    q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data, error: err } = await q
    if (err) { setError('Impossible de charger tes séquences.'); setLoading(false); return }
    setTasks((data ?? []) as RecurringTask[])
    setLoading(false)
  }, [currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Mes séquences"
        sub="Une séquence enregistrée : les comptes, le contenu, les réglages et l'horaire. Tu la rejoues en un clic au lieu de refaire le parcours."
        actions={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Nouvelle séquence" />}
      />

      {loading ? (
        <Panel theme={theme}><div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div></Panel>
      ) : error ? (
        <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01|M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" title="Erreur" text={error} /></Panel>
      ) : tasks.length === 0 ? (
        <Panel theme={theme}>
          <Empty icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6"
            title="Aucune séquence enregistrée"
            text="Enregistre une diffusion (comptes + contenu + réglages + horaire) comme séquence pour la rejouer en un clic."
            action={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Nouvelle séquence" />} />
        </Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          {tasks.map(t => {
            const tone = toneFor(t.id)
            const chips = stepChips(t)
            return (
              <Panel key={t.id} theme={theme}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 16px 0' }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: `rgba(${tone},0.12)`, border: `1px solid rgba(${tone},0.26)`, color: `rgb(${tone})`,
                  }}><Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6" size={15} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#F4F4F6' }}>{t.name || 'Séquence'}</span>
                    <span style={{ fontSize: 11.5, lineHeight: 1.5, color: '#71717A' }}>{describe(t)}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '13px 16px', flexWrap: 'wrap' }}>
                  {chips.map((sp, k) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 10.5, fontWeight: 600, color: '#A1A1AA' }}>{sp}</span>
                      {k < chips.length - 1 && <span style={{ color: '#3F3F46', fontSize: 10 }}>→</span>}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: '#3F3F46' }}>
                    {(t.run_count ?? 0)} fois · {relDay(t.last_run_at)}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <Btn theme={theme} sm tone="quiet" icon="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" label="Modifier" />
                    <Btn theme={theme} sm tone="quiet" icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" label="Programmer" />
                    <Btn theme={theme} sm tone="primary" icon="M5 3l14 9-14 9z" label="Rejouer" />
                  </span>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
