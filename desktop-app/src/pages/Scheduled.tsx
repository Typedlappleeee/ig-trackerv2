import { useCallback, useEffect, useRef, useState } from 'react'
import { takeOpenArg } from '@/lib/openTool'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Icon, Panel, Empty, Modal, SkeletonRows, toast } from '@/lib/ui'
import { PageHeader, UnderlineTabs } from '@/components/Kit'
import { StatBar } from '@/components/CineHero'
import ScheduleCalendar from '@/components/ScheduleCalendar'
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
  const [busy, setBusy] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<Sched | null>(null)
  const [view, setView] = useState<'list' | 'calendar'>(() => { const o = takeOpenArg<{ view?: 'list' | 'calendar' }>('scheduled'); if (o?.view) return o.view; try { return localStorage.getItem('sf-sched-view') === 'calendar' ? 'calendar' : 'list' } catch { return 'list' } })
  const changeView = (v: 'list' | 'calendar') => { setView(v); try { localStorage.setItem('sf-sched-view', v) } catch { /* ignore */ } }
  // Calendrier : décale un post serveur en attente (même heure, autre jour).
  async function movePost(p: { id: string }, to: Date) {
    const { data, error } = await supabase.from('scheduled_posts').update({ scheduled_at: to.toISOString() }).eq('id', p.id).eq('status', 'pending').select('id')
    if (error || !data?.length) { toast(error ? `Échec : ${error.message}` : 'Ce post ne peut plus être déplacé (déjà lancé ?).', 'bad'); return }
    toast(`Post décalé au ${to.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}.`, 'ok')
    load(true)
  }

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
    if (s.status === 'geelark' && ids.length && !conns.bearer) { toast('Connexion GeeLark en cours de chargement — réessaie dans un instant.', 'info'); return }
    setBusy(s.id)
    try {
      const claim = s.status === 'geelark'
        ? await supabase.from('scheduled_posts').delete().eq('id', s.id).eq('status', 'geelark').select('id')
        : await supabase.from('scheduled_posts').update({ status: 'cancelled' }).eq('id', s.id).eq('status', 'pending').select('id')
      if (claim.error) throw new Error(claim.error.message)
      if (!claim.data?.length) { toast('Déjà annulé ou déjà parti — rien à rembourser.', 'info'); load(true); return }
      let okC = ids.length
      if (s.status === 'geelark' && ids.length) okC = (await Promise.all(ids.map(t => cancelGeelarkTask(conns.bearer!, t)))).filter(Boolean).length
      const owner = s.result?.owner_id, total = s.result?.credits_total ?? 0
      const refund = ids.length ? Math.round(total * okC / ids.length) : total
      if (owner && refund > 0) await refundCredits(owner, refund)
      const lost = ids.length - okC
      toast(lost > 0
        ? `Annulé — ${refund} crédits remboursés. ${lost} post(s) déjà parti(s) chez GeeLark, non remboursé(s).`
        : refund > 0 ? `Annulé — ${refund} crédits remboursés.` : 'Annulé.', 'ok')
      load(true)
    } catch (e) { toast(`Échec de l'annulation : ${e instanceof Error ? e.message : ''}`, 'bad') }
    setBusy(null)
  }

  const cell: CSSProperties = { fontSize: 13, color: '#A1A1AA', fontVariantNumeric: 'tabular-nums' }
  // À venir : le plus proche d'abord (la requête trie du plus récent au plus ancien).
  const upcoming = rows.filter(r => new Date(r.scheduled_at).getTime() > Date.now()).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const past = rows.filter(r => new Date(r.scheduled_at).getTime() <= Date.now())
  const [showPast, setShowPast] = useState(false)
  const todayKey = new Date().toDateString()
  const todayN = upcoming.filter(r => new Date(r.scheduled_at).toDateString() === todayKey).length
  const committed = upcoming.reduce((t, r) => t + (r.result?.credits_total ?? 0), 0)
  const failedN = past.filter(r => statusInfo(r).tone === 'bad').length
  const dayOf = (iso: string) => { const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0); const k = new Date(d); k.setHours(0, 0, 0, 0); const diff = Math.round((k.getTime() - t.getTime()) / 86400000); if (diff === 0) return 'Aujourd’hui'; if (diff === 1) return 'Demain'; if (diff === -1) return 'Hier'; const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1) }
  const grouped = (list: Sched[]) => list.map((r, i) => ({ r, head: i === 0 || dayOf(list[i - 1].scheduled_at) !== dayOf(r.scheduled_at) ? dayOf(r.scheduled_at) : null }))

  const rowView = (s: Sched, i = 0) => {
    const st = statusInfo(s)
    const n = s.phones?.length ?? 0
    const cancellable = s.status === 'geelark' && new Date(s.scheduled_at).getTime() > Date.now()
    const cancelServer = s.status === 'pending'
    return (
      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 20px', minHeight: 62, boxSizing: 'border-box', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap', transition: 'background .12s ease' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: '#C4B5FD', minWidth: 50, fontVariantNumeric: 'tabular-nums' }}>{new Date(s.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 99, flexShrink: 0, background: 'rgba(167,139,250,0.1)', color: '#C4B5FD' }}><Icon d={s.type === 'story' ? 'M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1' : 'M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z'} size={14} /></span>
        <span style={{ minWidth: 130, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 14, fontWeight: 650, color: '#F4F4F5' }}>{TYPE_LABEL[s.type] ?? s.type}</span>{s.result?.platform && s.result.platform !== 'instagram' && <Chip text={s.result.platform} tone="mute" />}</div>
          <div style={{ fontSize: 12, color: '#71717A' }}>{n} compte{n > 1 ? 's' : ''}</div>
        </span>
        <span style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
          <span data-no-tr style={{ fontSize: 12, color: '#8B8B94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.caption || '—'}</span>
          {s.error_msg && <span data-no-tr title={s.error_msg} style={{ fontSize: 11.5, color: '#F87171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.error_msg}</span>}
        </span>
        <span title={s.error_msg ?? undefined}><Chip text={st.label} tone={st.tone} /></span>
        {(cancellable || cancelServer) && <Btn theme={theme} sm tone="danger" label={busy === s.id ? '…' : 'Annuler'} disabled={busy === s.id} onClick={() => setConfirmCancel(s)} />}
      </div>
    )
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHeader kicker={loading ? 'Diffusion' : `${upcoming.length} à venir`} title="Programmé" sub="Toutes tes publications programmées : elles partent même PC éteint. Annule ici pour récupérer les crédits."
        actions={<Btn theme={theme} icon="M21 2v6h-6|M3 12a9 9 0 0 1 15-6.7L21 8|M3 22v-6h6|M21 12a9 9 0 0 1-15 6.7L3 16" label="Rafraîchir" onClick={() => load()} />} />
      {loadError && <div style={{ padding: '12px 14px', marginBottom: 14, borderRadius: 14, background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.28)', color: '#F87171', fontSize: 13 }}>Impossible de charger les programmations : {loadError}</div>}
      {!loading && rows.length > 0 && (
        <StatBar items={[
          { l: 'À venir', v: upcoming.length, sub: <span style={{ color: '#71717A' }}>publications</span> },
          { l: 'Aujourd’hui', v: todayN, c: todayN ? '#C4B5FD' : undefined },
          { l: 'Crédits engagés', v: committed.toLocaleString('fr-FR'), sub: <span style={{ color: '#71717A' }}>remboursés si annulés</span> },
          { l: 'Échecs', v: failedN, c: failedN ? '#F87171' : undefined, sub: failedN ? <span style={{ color: '#71717A' }}>dans les passées</span> : <span style={{ color: '#4ADE80' }}>aucun</span> },
        ]} />
      )}
      <UnderlineTabs value={view} onChange={changeView} items={[{ k: 'list', l: 'Liste', icon: 'M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01' }, { k: 'calendar', l: 'Calendrier', icon: 'M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z' }]} />
      {confirmCancel && (
        <Modal theme={theme} title="Annuler cette programmation ?" sub={`${confirmCancel.phones?.length ?? 0} compte(s) · ${new Date(confirmCancel.scheduled_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}`} icon="M18 6L6 18|M6 6l12 12" width={460}
          onClose={() => setConfirmCancel(null)}
          footer={<><Btn theme={theme} tone="ghost" label="Garder" onClick={() => setConfirmCancel(null)} /><Btn theme={theme} tone="danger" label="Annuler la programmation" onClick={() => cancel(confirmCancel)} /></>}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#A1A1AA' }}>Les tâches sont annulées chez GeeLark et les crédits remboursés{(confirmCancel.result?.credits_total ?? 0) > 0 ? ` (jusqu'à ${confirmCancel.result?.credits_total} crédits)` : ''}. Un post déjà parti ne peut plus être annulé ni remboursé.</div>
        </Modal>
      )}

      {loading ? <Panel theme={theme}><SkeletonRows rows={4} avatar /></Panel>
        : view === 'calendar' ? (
          <ScheduleCalendar theme={theme} posts={rows} onMove={movePost} onOpen={s => { const r = rows.find(x => x.id === s.id); if (r && ((r.status === 'geelark' && new Date(r.scheduled_at).getTime() > Date.now()) || r.status === 'pending')) setConfirmCancel(r) }} />
        ) : rows.length === 0 ? (
          <Panel theme={theme}><Empty icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
            title="Aucune publication programmée" text="Depuis Posting / Story / Cross-post, clique « Programmer (PC éteint) » — elles apparaîtront ici." /></Panel>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Panel theme={theme}>
              {upcoming.length === 0 ? <div style={{ padding: '28px 16px', textAlign: 'center', color: '#8B8B94', fontSize: 13 }}>Rien de programmé pour l'instant.</div> : grouped(upcoming).map(({ r, head }, i) => (
                <div key={r.id}>
                  {head && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px 6px', borderTop: i ? '1px solid rgba(255,255,255,0.06)' : 'none' }}><span style={{ fontSize: 13, fontWeight: 750, color: '#F4F4F5' }}>{head}</span><span style={{ fontSize: 12, color: '#5A5A63' }}>{upcoming.filter(x => dayOf(x.scheduled_at) === head).length}</span></div>}
                  {rowView(r, head ? 0 : 1)}
                </div>
              ))}
            </Panel>
            {past.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowPast(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 6px', border: 'none', background: 'transparent', color: '#A1A1AA', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  <span style={{ display: 'flex', transform: showPast ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}><Icon d="M9 18l6-6-6-6" size={14} sw={2.2} /></span>
                  Passées <span style={{ color: '#5A5A63', fontWeight: 600 }}>{past.length}</span>
                </button>
                {showPast && <Panel theme={theme} style={{ marginTop: 8 }}>{past.slice(0, 60).map((s, i) => rowView(s, i))}</Panel>}
              </div>
            )}
          </div>
        )}
    </div>
  )
}
