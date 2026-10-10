import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type RecurringTask } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Icon, Panel, PageHead, Empty, Modal, FIELD, Toggle, SkeletonRows, toast } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import CreateTaskModal from '@/components/CreateTaskModal'

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

export default function Recipes({ theme, infra, user, org }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState
}) {
  const { currentOrg } = org
  const [tasks, setTasks] = useState<RecurringTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTask, setEditTask] = useState<RecurringTask | null>(null)

  // Rejouer : planifie l'exécution de la séquence MAINTENANT (le serveur la prendra
  // au prochain tick). Écrit next_run_at = now + réactive la tâche.
  async function replay(t: RecurringTask) {
    const { error: err } = await supabase.from('recurring_tasks')
      .update({ next_run_at: new Date().toISOString(), status: 'active' }).eq('id', t.id)
    toast(err ? `Échec : ${err.message}` : `« ${t.name || 'Séquence'} » planifiée maintenant — le serveur la lance au prochain passage.`, err ? 'bad' : 'ok')
  }

  // Programmer : planifie au prochain cycle (now + recur_hours) et réactive.
  async function scheduleNext(t: RecurringTask) {
    const h = t.recur_hours || 24
    const at = new Date(Date.now() + h * 3600 * 1000)
    const { error: err } = await supabase.from('recurring_tasks')
      .update({ next_run_at: at.toISOString(), status: 'active' }).eq('id', t.id)
    toast(err ? `Échec : ${err.message}` : `« ${t.name || 'Séquence'} » programmée pour ${at.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`, err ? 'bad' : 'ok')
    load()
  }

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
        actions={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Nouvelle séquence" onClick={() => setCreateOpen(true)} />}
      />

      {loading ? (
        <Panel theme={theme}><SkeletonRows rows={3} avatar /></Panel>
      ) : error ? (
        <Panel theme={theme}><Empty icon="M12 9v4|M12 17h.01|M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" title="Erreur" text={error} /></Panel>
      ) : tasks.length === 0 ? (
        <Panel theme={theme}>
          <Empty icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6"
            title="Aucune séquence enregistrée"
            text="Enregistre une diffusion (comptes + contenu + réglages + horaire) comme séquence pour la rejouer en un clic."
            action={<Btn theme={theme} tone="primary" icon="M12 5v14|M5 12h14" label="Nouvelle séquence" onClick={() => setCreateOpen(true)} />} />
        </Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(320px,100%),1fr))', gap: 12 }}>
          {tasks.map(t => {
            const chips = stepChips(t)
            return (
              <Panel key={t.id} theme={theme}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 16px 0' }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                    background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: theme.accentText,
                  }}><Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15h6" size={14} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#EDEDEF' }}>{t.name || 'Séquence'}</span>
                    <span style={{ fontSize: 12, lineHeight: 1.5, color: '#8B8B94' }}>{describe(t)}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', flexWrap: 'wrap' }}>
                  {chips.map((sp, k) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px', borderRadius: 5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, fontWeight: 500, color: '#A1A1AA', boxSizing: 'border-box' }}>{sp}</span>
                      {k < chips.length - 1 && <span style={{ color: '#5A5A63', fontSize: 11 }}>→</span>}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>
                    {(t.run_count ?? 0)} fois · {relDay(t.last_run_at)}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Btn theme={theme} sm tone="quiet" icon="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" label="Modifier" onClick={() => setEditTask(t)} />
                    <Btn theme={theme} sm tone="quiet" icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" label="Programmer" onClick={() => scheduleNext(t)} />
                    <Btn theme={theme} sm tone="primary" icon="M5 3l14 9-14 9z" label="Rejouer" onClick={() => replay(t)} />
                  </span>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {createOpen && (
        <CreateTaskModal theme={theme} user={user} org={org} infra={infra} mode="recurring"
          onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load() }} />
      )}

      {editTask && (
        <EditSeq theme={theme} task={editTask} onClose={() => setEditTask(null)}
          onSaved={() => { setEditTask(null); load() }} />
      )}
    </div>
  )
}

// ── Édition rapide d'une séquence : nom + fréquence + statut ───────────────────
function EditSeq({ theme, task, onClose, onSaved }: {
  theme: Theme; task: RecurringTask; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(task.name ?? '')
  const [hours, setHours] = useState(task.recur_hours ?? 24)
  const [active, setActive] = useState(task.status === 'active')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inp = FIELD
  const lbl = { fontSize: 12, fontWeight: 500 as const, color: '#8B8B94', marginBottom: 6, display: 'block' as const }

  async function save() {
    setSaving(true); setErr(null)
    const { error } = await supabase.from('recurring_tasks')
      .update({ name: name.trim() || 'Séquence', recur_hours: hours, status: active ? 'active' : 'paused' }).eq('id', task.id)
    if (error) { setErr(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <Modal theme={theme} title="Modifier la séquence" icon="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" onClose={onClose} width={440}
      footer={<><Btn theme={theme} tone="quiet" label="Annuler" onClick={onClose} /><Btn theme={theme} tone="primary" label={saving ? 'Enregistrement…' : 'Enregistrer'} disabled={saving} onClick={save} /></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label style={lbl}>Nom</label><input value={name} onChange={e => setName(e.target.value)} style={inp} autoFocus /></div>
        <div>
          <label style={lbl}>Fréquence</label>
          <select value={hours} onChange={e => setHours(Number(e.target.value))} style={{ ...inp, cursor: 'pointer' }}>
            {[[6, 'Toutes les 6 h'], [12, 'Toutes les 12 h'], [24, 'Chaque jour'], [48, 'Tous les 2 jours'], [168, 'Chaque semaine']].map(([h, l]) => (
              <option key={h} value={h} style={{ background: '#161618' }}>{l}</option>
            ))}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
          <Toggle on={active} onChange={() => setActive(a => !a)} />
          <span style={{ fontSize: 13, color: '#EDEDEF' }}>{active ? 'Active' : 'En pause'}</span>
        </label>
        {err && <p style={{ margin: 0, fontSize: 12, color: '#F87171' }}>{err}</p>}
      </div>
    </Modal>
  )
}
