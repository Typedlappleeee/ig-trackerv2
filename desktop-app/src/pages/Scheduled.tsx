import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead, Empty } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { useConnections } from '@/lib/connections'
import { cancelGeelarkTask } from '@/lib/geelark'
import { refundCredits } from '@/lib/credits'

// Liste des publications PROGRAMMÉES (programmation directe GeeLark, status='geelark',
// + posts programmés serveur pending/done/failed). Annulation = cancel GeeLark +
// remboursement des crédits + suppression de la ligne.
interface Sched {
  id: string; type: string; status: string; scheduled_at: string; caption: string | null
  phones: { geelark_id?: string; name?: string; phone_name?: string }[] | null
  created_by_name: string | null; executed_at: string | null; error_msg: string | null
  result: { geelark_task_ids?: string[]; platform?: string; owner_id?: string; credits_total?: number } | null
}

const TYPE_LABEL: Record<string, string> = { mass_posting: 'Reels', posting: 'Reels', story: 'Story', cross: 'Cross-post', tiktok: 'TikTok' }
function statusInfo(s: Sched): { label: string; tone: 'ok' | 'info' | 'warn' | 'bad' | 'mute' } {
  const future = new Date(s.scheduled_at).getTime() > Date.now()
  if (s.status === 'geelark') return future ? { label: 'Programmé', tone: 'info' } : { label: 'Envoyé à GeeLark', tone: 'ok' }
  if (s.status === 'pending') return { label: 'En attente (serveur)', tone: 'info' }
  if (s.status === 'running') return { label: 'En cours', tone: 'warn' }
  if (s.status === 'done') return { label: 'Publié', tone: 'ok' }
  if (s.status === 'failed') return { label: 'Échec', tone: 'bad' }
  if (s.status === 'cancelled') return { label: 'Annulé', tone: 'mute' }
  return { label: s.status, tone: 'mute' }
}

export default function Scheduled({ theme, infra, user, org }: { theme: Theme; infra: InfraKey; user: User; org: OrgState }) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const [rows, setRows] = useState<Sched[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(t) } }, [notice])

  const load = useCallback(async () => {
    setLoading(true)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await scope(supabase.from('scheduled_posts').select('id,type,status,scheduled_at,caption,phones,created_by_name,executed_at,error_msg,result'))
      .order('scheduled_at', { ascending: false }).limit(200)
    setRows((data ?? []) as Sched[])
    setLoading(false)
  }, [currentOrg?.id, user.id])
  useEffect(() => { load() }, [load])

  // Rafraîchissement live (une programmation créée ailleurs apparaît).
  useEffect(() => {
    const ch = supabase.channel('scheduled-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_posts' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function cancel(s: Sched) {
    setBusy(s.id)
    try {
      // 1) Annule les tâches GeeLark programmées (si elles ne sont pas déjà parties).
      const ids = s.result?.geelark_task_ids ?? []
      if (conns.bearer && ids.length) { for (const tid of ids) await cancelGeelarkTask(conns.bearer, tid) }
      // 2) Rembourse les crédits (débités à la programmation).
      const owner = s.result?.owner_id, total = s.result?.credits_total ?? 0
      if (owner && total > 0) { await refundCredits(owner, total); }
      // 3) Retire la ligne (ou marque annulée pour les posts serveur).
      if (s.status === 'geelark') await supabase.from('scheduled_posts').delete().eq('id', s.id)
      else await supabase.from('scheduled_posts').update({ status: 'cancelled' }).eq('id', s.id)
      setNotice(total > 0 ? `Annulé — ${total} crédits remboursés.` : 'Annulé.')
      load()
    } catch (e) { setNotice(`Échec de l'annulation : ${e instanceof Error ? e.message : ''}`) }
    setBusy(null)
  }

  const cell: CSSProperties = { fontSize: 12.5, color: '#D4D4D8' }
  const upcoming = rows.filter(r => new Date(r.scheduled_at).getTime() > Date.now())
  const past = rows.filter(r => new Date(r.scheduled_at).getTime() <= Date.now())

  const rowView = (s: Sched) => {
    const st = statusInfo(s)
    const n = s.phones?.length ?? 0
    const cancellable = s.status === 'geelark' && new Date(s.scheduled_at).getTime() > Date.now()
    const cancelServer = s.status === 'pending'
    return (
      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderTop: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: `rgba(${theme.tone},0.12)`, border: `1px solid rgba(${theme.tone},0.22)`, color: theme.accentText }}><Icon d="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" size={15} /></span>
        <span style={{ minWidth: 130 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F6' }}>{TYPE_LABEL[s.type] ?? s.type}</span>{s.result?.platform && s.result.platform !== 'instagram' && <Chip text={s.result.platform} tone="mute" />}</div>
          <div style={{ fontSize: 11, color: '#71717A' }}>{n} compte{n > 1 ? 's' : ''}</div>
        </span>
        <span style={{ ...cell, minWidth: 150 }}>{new Date(s.scheduled_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span style={{ flex: 1, minWidth: 120, fontSize: 11.5, color: '#8B8898', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.caption || '—'}</span>
        <Chip text={st.label} tone={st.tone} />
        {(cancellable || cancelServer) && <Btn theme={theme} sm tone="danger" label={busy === s.id ? '…' : 'Annuler'} disabled={busy === s.id} onClick={() => cancel(s)} />}
      </div>
    )
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Programmé" sub="Toutes tes publications programmées (PC éteint, via GeeLark). Annule ici pour récupérer les crédits."
        actions={<Btn theme={theme} sm tone="quiet" icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8|M3 22v-6h6|M21 12a9 9 0 0 1-15 6.7L3 16" label="Rafraîchir" onClick={load} />} />
      {notice && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 9, background: `rgba(${theme.tone},0.12)`, border: `1px solid rgba(${theme.tone},0.3)`, color: theme.accentText, fontSize: 12.5 }}>{notice}</div>}

      {loading ? <Panel theme={theme}><div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 13 }}>…</div></Panel>
        : rows.length === 0 ? (
          <Panel theme={theme}><Empty icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
            title="Aucune publication programmée" text="Depuis Posting / Story / Cross-post, clique « Programmer (PC éteint) » — elles apparaîtront ici." /></Panel>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Panel theme={theme}>
              <PanelHead title="À venir" sub={`${upcoming.length}`} />
              {upcoming.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Rien de programmé pour l'instant.</div> : upcoming.map(rowView)}
            </Panel>
            {past.length > 0 && (
              <Panel theme={theme}>
                <PanelHead title="Passées" sub={`${past.length}`} />
                {past.slice(0, 60).map(rowView)}
              </Panel>
            )}
          </div>
        )}
    </div>
  )
}
