import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, type RecurringTask } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Icon, Panel, PageHead, Empty, Modal } from '@/lib/ui'
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
  const [notice, setNotice] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTask, setEditTask] = useState<RecurringTask | null>(null)

  // Rejouer : planifie l'exécution de la séquence MAINTENANT (le serveur la prendra
  // au prochain tick). Écrit next_run_at = now + réactive la tâche.
  async function replay(t: RecurringTask) {
    setNotice(null)
    const { error: err } = await supabase.from('recurring_tasks')
      .update({ next_run_at: new Date().toISOString(), status: 'active' }).eq('id', t.id)
    setNotice(err ? `Échec : ${err.message}` : `« ${t.name || 'Séquence'} » planifiée maintenant — le serveur la lance au prochain passage.`)
  }

  // Programmer : planifie au prochain cycle (now + recur_hours) et réactive.
  async function scheduleNext(t: RecurringTask) {
    setNotice(null)
    const h = t.recur_hours || 24
    const at = new Date(Date.now() + h * 3600 * 1000)
    const { error: err } = await supabase.from('recurring_tasks')
      .update({ next_run_at: at.toISOString(), status: 'active' }).eq('id', t.id)
    setNotice(err ? `Échec : ${err.message}` : `« ${t.name || 'Séquence'} » programmée pour ${at.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`)
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

      {notice && (
        <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 8, background: `rgba(${theme.tone},0.08)`, border: `1px solid rgba(${theme.tone},0.22)`, fontSize: 12, color: '#E4E4E7' }}>{notice}</div>
      )}

      {loading ? (
        <Panel theme={theme}><div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div></Panel>
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
        <CreateTaskModal theme={theme} user={user} org={org} mode="recurring"
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
  const inp = { width: '100%', boxSizing: 'border-box' as const, height: 36, padding: '0 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.09)', color: '#F4F4F6', fontSize: 12.5, outline: 'none' }
  const lbl = { fontSize: 10.5, fontWeight: 800 as const, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#71717A', marginBottom: 7, display: 'block' as const }

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <div><label style={lbl}>Nom</label><input value={name} onChange={e => setName(e.target.value)} style={inp} autoFocus /></div>
        <div>
          <label style={lbl}>Fréquence</label>
          <select value={hours} onChange={e => setHours(Number(e.target.value))} style={{ ...inp, cursor: 'pointer' }}>
            {[[6, 'Toutes les 6 h'], [12, 'Toutes les 12 h'], [24, 'Chaque jour'], [48, 'Tous les 2 jours'], [168, 'Chaque semaine']].map(([h, l]) => (
              <option key={h} value={h} style={{ background: '#16161C' }}>{l}</option>
            ))}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
          <span onClick={() => setActive(a => !a)} style={{ display: 'flex', alignItems: 'center', justifyContent: active ? 'flex-end' : 'flex-start', width: 34, height: 19, padding: 2, borderRadius: 99, background: active ? '#10B981' : 'rgba(255,255,255,0.1)' }}>
            <span style={{ width: 15, height: 15, borderRadius: 99, background: '#fff' }} />
          </span>
          <span style={{ fontSize: 12.5, color: '#D4D4D8' }}>{active ? 'Active' : 'En pause'}</span>
        </label>
        {err && <p style={{ margin: 0, fontSize: 11.5, color: '#F87171' }}>{err}</p>}
      </div>
    </Modal>
  )
}
