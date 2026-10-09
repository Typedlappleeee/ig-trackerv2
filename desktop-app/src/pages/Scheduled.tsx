import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, PanelHead, PageHead, Empty, Modal, SkeletonRows } from '@/lib/ui'
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<Sched | null>(null)

  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(t) } }, [notice])

  // background = rafraîchissement silencieux (pas de clignotement « Chargement »).
  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data, error } = await scope(supabase.from('scheduled_posts').select('id,type,status,scheduled_at,caption,phones,created_by_name,executed_at,error_msg,result'))
      .order('scheduled_at', { ascending: false }).limit(200)
    if (error) setLoadError(error.message)
    else { setLoadError(null); setRows((data ?? []) as Sched[]) }
    setLoading(false)
  }, [currentOrg?.id, user.id])
  useEffect(() => { load() }, [load])

  // Rafraîchissement live, limité à MES programmations et regroupé (le serveur met
  // à jour la progression des stories à chaque tick → rafale d'événements).
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const filter = currentOrg ? `org_id=eq.${currentOrg.id}` : `user_id=eq.${user.id}`
    const ch = supabase.channel('scheduled-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_posts', filter }, () => {
        if (liveTimer.current) clearTimeout(liveTimer.current)
        liveTimer.current = setTimeout(() => load(true), 1500)
      })
      .subscribe()
    return () => { if (liveTimer.current) clearTimeout(liveTimer.current); supabase.removeChannel(ch) }
  }, [load, currentOrg?.id, user.id])

  // Annulation sûre :
  // 1) la ligne est « réclamée » de façon conditionnelle (statut inchangé) → deux
  //    clics / deux onglets ne peuvent pas rembourser deux fois ;
  // 2) on ne rembourse QUE les tâches GeeLark réellement annulées (une tâche déjà
  //    partie publie quand même → pas de post gratuit).
  async function cancel(s: Sched) {
    setConfirmCancel(null)
    const ids = s.result?.geelark_task_ids ?? []
    if (s.status === 'geelark' && ids.length && !conns.bearer) { setNotice('Connexion GeeLark en cours de chargement — réessaie dans un instant.'); return }
    setBusy(s.id)
    try {
      const claim = s.status === 'geelark'
        ? await supabase.from('scheduled_posts').delete().eq('id', s.id).eq('status', 'geelark').select('id')
        : await supabase.from('scheduled_posts').update({ status: 'cancelled' }).eq('id', s.id).eq('status', 'pending').select('id')
      if (claim.error) throw new Error(claim.error.message)
      if (!claim.data?.length) { setNotice('Déjà annulé ou déjà parti — rien à rembourser.'); load(true); return }
      let okC = ids.length
      if (s.status === 'geelark' && ids.length) okC = (await Promise.all(ids.map(t => cancelGeelarkTask(conns.bearer!, t)))).filter(Boolean).length
      const owner = s.result?.owner_id, total = s.result?.credits_total ?? 0
      const refund = ids.length ? Math.round(total * okC / ids.length) : total
      if (owner && refund > 0) await refundCredits(owner, refund)
      const lost = ids.length - okC
      setNotice(lost > 0
        ? `Annulé — ${refund} crédits remboursés. ${lost} post(s) déjà parti(s) chez GeeLark, non remboursé(s).`
        : refund > 0 ? `Annulé — ${refund} crédits remboursés.` : 'Annulé.')
      load(true)
    } catch (e) { setNotice(`Échec de l'annulation : ${e instanceof Error ? e.message : ''}`) }
    setBusy(null)
  }

  const cell: CSSProperties = { fontSize: 13, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }
  const upcoming = rows.filter(r => new Date(r.scheduled_at).getTime() > Date.now())
  const past = rows.filter(r => new Date(r.scheduled_at).getTime() <= Date.now())

  const rowView = (s: Sched, i = 0) => {
    const st = statusInfo(s)
    const n = s.phones?.length ?? 0
    const cancellable = s.status === 'geelark' && new Date(s.scheduled_at).getTime() > Date.now()
    const cancelServer = s.status === 'pending'
    return (
      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', minHeight: 52, boxSizing: 'border-box', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap', transition: 'background .12s ease' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', color: theme.accentText }}><Icon d="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" size={14} /></span>
        <span style={{ minWidth: 130, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>{TYPE_LABEL[s.type] ?? s.type}</span>{s.result?.platform && s.result.platform !== 'instagram' && <Chip text={s.result.platform} tone="mute" />}</div>
          <div style={{ fontSize: 12, color: '#71717A' }}>{n} compte{n > 1 ? 's' : ''}</div>
        </span>
        <span style={{ ...cell, minWidth: 150 }}>{new Date(s.scheduled_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span style={{ flex: 1, minWidth: 120, fontSize: 12, color: '#8B8B94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.caption || '—'}</span>
        <Chip text={st.label} tone={st.tone} />
        {(cancellable || cancelServer) && <Btn theme={theme} sm tone="danger" label={busy === s.id ? '…' : 'Annuler'} disabled={busy === s.id} onClick={() => setConfirmCancel(s)} />}
      </div>
    )
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Programmé" sub="Toutes tes publications programmées (PC éteint, via GeeLark). Annule ici pour récupérer les crédits."
        actions={<Btn theme={theme} sm tone="quiet" icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8|M3 22v-6h6|M21 12a9 9 0 0 1-15 6.7L3 16" label="Rafraîchir" onClick={() => load()} />} />
      {loadError && <div style={{ padding: '10px 12px', marginBottom: 12, borderRadius: 8, background: '#111113', border: '1px solid rgba(248,113,113,0.25)', color: '#F87171', fontSize: 13 }}>Impossible de charger les programmations : {loadError}</div>}
      {confirmCancel && (
        <Modal theme={theme} title="Annuler cette programmation ?" sub={`${confirmCancel.phones?.length ?? 0} compte(s) · ${new Date(confirmCancel.scheduled_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}`} icon="M18 6L6 18|M6 6l12 12" width={460}
          onClose={() => setConfirmCancel(null)}
          footer={<><Btn theme={theme} tone="ghost" label="Garder" onClick={() => setConfirmCancel(null)} /><Btn theme={theme} tone="danger" label="Annuler la programmation" onClick={() => cancel(confirmCancel)} /></>}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#A1A1AA' }}>Les tâches sont annulées chez GeeLark et les crédits remboursés{(confirmCancel.result?.credits_total ?? 0) > 0 ? ` (jusqu'à ${confirmCancel.result?.credits_total} crédits)` : ''}. Un post déjà parti ne peut plus être annulé ni remboursé.</div>
        </Modal>
      )}
      {notice && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', color: '#A1A1AA', fontSize: 13 }}>{notice}</div>}

      {loading ? <Panel theme={theme}><SkeletonRows rows={4} avatar /></Panel>
        : rows.length === 0 ? (
          <Panel theme={theme}><Empty icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
            title="Aucune publication programmée" text="Depuis Posting / Story / Cross-post, clique « Programmer (PC éteint) » — elles apparaîtront ici." /></Panel>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Panel theme={theme}>
              <PanelHead title="À venir" sub={`${upcoming.length}`} />
              {upcoming.length === 0 ? <div style={{ padding: '24px 16px', textAlign: 'center', color: '#8B8B94', fontSize: 13 }}>Rien de programmé pour l'instant.</div> : upcoming.map((s, i) => rowView(s, i))}
            </Panel>
            {past.length > 0 && (
              <Panel theme={theme}>
                <PanelHead title="Passées" sub={`${past.length}`} />
                {past.slice(0, 60).map((s, i) => rowView(s, i))}
              </Panel>
            )}
          </div>
        )}
    </div>
  )
}
