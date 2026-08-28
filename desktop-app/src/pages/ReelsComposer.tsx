import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, StatusDot, Panel, PanelHead, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { useConnections } from '@/lib/connections'
import { geelarkUploadVideo, postReelToPhone } from '@/lib/geelark'
import { startCreditRun, isCreditError, CREDIT_COSTS } from '@/lib/credits'

interface Phone { id: string; ig_username: string | null; status: string; group_name: string | null; geelark_id: string | null }
interface Video { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_path: string | null; thumbnail_url: string | null; notes: string | null }

const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
function isVideo(v: Video): boolean {
  if (SENTINELS.includes(v.notes ?? '') && !v.storage_path && !v.file_url) return false
  const ext = (v.storage_path ?? v.file_url ?? '').toLowerCase().split('.').pop() ?? ''
  return !IMG_EXT.includes(ext)
}
function dotKind(s: string): string { return s === 'warming' ? 'warmup' : s }

type Phase = 'pending' | 'running' | 'done' | 'failed'
interface RunItem { id: string; name: string; phase: Phase; detail?: string }

export default function ReelsComposer({ theme, user, org, onBack }: {
  theme: Theme; user: User; org: OrgState; onBack: () => void
}) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const bearer = conns.bearer

  const [phones, setPhones] = useState<Phone[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [group, setGroup] = useState('Tous')
  const [videoId, setVideoId] = useState<string | null>(null)
  const [caption, setCaption] = useState('')

  const [running, setRunning] = useState(false)
  const [runItems, setRunItems] = useState<RunItem[]>([])
  const [logs, setLogs] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [phRes, vRes] = await Promise.all([
      scope(supabase.from('phones').select('id,ig_username,status,group_name,geelark_id')).not('geelark_id', 'is', null).order('phone_name'),
      scope(supabase.from('content_bank').select('id,title,storage_path,file_url,thumbnail_path,thumbnail_url,notes')).order('created_at', { ascending: false }),
    ])
    setPhones((phRes.data ?? []) as Phone[])
    setVideos(((vRes.data ?? []) as Video[]).filter(isVideo))
    setLoading(false)
  }, [currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const s = new Set<string>()
    phones.forEach(p => { if (p.group_name) s.add(p.group_name) })
    return ['Tous', ...[...s].sort()]
  }, [phones])
  const shownPhones = useMemo(() => phones.filter(p => group === 'Tous' || p.group_name === group), [phones, group])

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const nSel = sel.size
  const chosen = videos.find(v => v.id === videoId) ?? null
  const ready = nSel > 0 && !!chosen && !!bearer && !running

  // Résout l'URL téléchargeable d'une vidéo (objet privé signé, ou URL directe).
  async function resolveVideoUrl(v: Video): Promise<string | null> {
    if (v.storage_path) {
      const { data } = await supabase.storage.from('content').createSignedUrl(v.storage_path, 3600)
      if (data?.signedUrl) return data.signedUrl
    }
    return v.file_url ?? v.thumbnail_url ?? null
  }

  async function launch() {
    if (!ready || !chosen) return
    const targets = phones.filter(p => sel.has(p.id) && p.geelark_id)
    if (targets.length === 0) return
    setRunning(true)
    setLogs([])
    setRunItems(targets.map(p => ({ id: p.id, name: p.ig_username ?? p.geelark_id ?? p.id, phase: 'pending' as Phase })))
    const pushLog = (m: string) => setLogs(l => [...l.slice(-250), m])

    // 0) Débit des crédits d'avance (2/compte). Débité sur le propriétaire de l'orga
    //    (ou l'utilisateur en perso). Les comptes échoués sont remboursés au settle().
    const ownerId = currentOrg?.owner_id ?? user.id
    const run = await startCreditRun(ownerId, CREDIT_COSTS.mass_posting, targets.length)
    if (isCreditError(run)) {
      pushLog(`❌ Crédits insuffisants : ${run.error} (il faut ${CREDIT_COSTS.mass_posting * targets.length} crédits).`)
      setRunItems([]); setRunning(false); return
    }
    pushLog(`💳 ${CREDIT_COSTS.mass_posting * targets.length} crédits débités (${CREDIT_COSTS.mass_posting}/compte).`)

    // 1) Résoudre l'URL de la vidéo puis l'héberger UNE fois chez GeeLark.
    pushLog('🔗 Préparation de la vidéo…')
    const url = await resolveVideoUrl(chosen)
    if (!url) { pushLog('❌ Impossible de récupérer la vidéo.'); run.abort(); await run.settle(); pushLog('↩︎ Crédits remboursés.'); setRunning(false); return }
    const resourceUrl = await geelarkUploadVideo(bearer, url, pushLog)
    if (!resourceUrl) { pushLog('❌ Envoi de la vidéo échoué.'); run.abort(); await run.settle(); pushLog('↩︎ Crédits remboursés.'); setRunning(false); return }

    // 2) Publier sur chaque téléphone (séquentiel : évite de saturer le démon shell).
    for (const p of targets) {
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'running' } : it))
      pushLog(`— @${p.ig_username ?? p.geelark_id} —`)
      const r = await postReelToPhone(bearer, p.geelark_id!, resourceUrl, caption, pushLog)
      if (!r.ok) run.markFailed()
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.error } : it))
    }
    const { refunded } = await run.settle()
    if (refunded > 0) pushLog(`↩︎ ${refunded} crédits remboursés (comptes échoués).`)
    pushLog('✔ Publication terminée.')
    setRunning(false)
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Publier des Reels"
        sub="Une vidéo sur les comptes sélectionnés, en parallèle. 2 crédits par compte."
        actions={<>
          <Btn theme={theme} tone="quiet" label="Retour" onClick={onBack} />
          <Btn theme={theme} tone="primary" disabled={!ready} icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z"
            label={running ? 'Publication…' : ready ? `Publier sur ${nSel}` : 'Publier'} onClick={launch} />
        </>}
      />

      {!bearer && !conns.loading && (
        <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', fontSize: 12, color: '#FBBF24' }}>
          Connecte ton compte GeeLark (token) dans les Réglages de l'app web pour publier.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
        {/* Comptes */}
        <Panel theme={theme}>
          <PanelHead title="Comptes" sub={nSel ? `${nSel} × 2 crédits` : 'aucun'} right={<Btn theme={theme} sm tone="quiet" label="Tout" onClick={() => setSel(new Set(shownPhones.map(p => p.id)))} />} />
          <div style={{ display: 'flex', gap: 4, padding: '8px 11px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {groups.map(g => (
              <button key={g} onClick={() => setGroup(g)} style={{
                height: 24, padding: '0 9px', border: 'none', borderRadius: 6, cursor: 'pointer',
                background: group === g ? `rgba(${theme.tone},0.16)` : 'transparent',
                color: group === g ? theme.accentText : '#71717A', fontSize: 11, fontWeight: 700,
              }}>{g}</button>
            ))}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading ? <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div>
              : shownPhones.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucun compte.</div>
              : shownPhones.map(p => {
                const on = sel.has(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 13px', border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderLeft: '2px solid ' + (on ? theme.accent : 'transparent'),
                    background: on ? `rgba(${theme.tone},0.07)` : 'transparent', boxSizing: 'border-box',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? theme.accent : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 8.5, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                    <StatusDot kind={dotKind(p.status)} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: on ? '#F4F4F6' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.ig_username ?? '—'}</span>
                    {!p.geelark_id && <Chip text="pas GeeLark" tone="mute" />}
                  </button>
                )
              })}
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Vidéo */}
          <Panel theme={theme}>
            <PanelHead title="Vidéo à publier" sub={chosen ? chosen.title : 'choisis une vidéo de la banque'} />
            {videos.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucune vidéo dans la banque.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(74px,1fr))', gap: 8, padding: 13, maxHeight: 260, overflowY: 'auto' }}>
                {videos.map((v, i) => {
                  const on = videoId === v.id
                  const hue = ['139,92,246', '6,182,212', '236,72,153', '16,185,129', '245,158,11'][i % 5]
                  return (
                    <button key={v.id} onClick={() => setVideoId(v.id)} title={v.title} style={{
                      position: 'relative', aspectRatio: '9 / 16', borderRadius: 8, padding: 0, cursor: 'pointer', overflow: 'hidden',
                      border: '1.5px solid ' + (on ? theme.accent : 'rgba(255,255,255,0.07)'),
                      background: v.thumbnail_url ? `center/cover url(${v.thumbnail_url})` : `linear-gradient(160deg, rgba(${hue},0.16), rgba(${hue},0.035))`,
                    }}>
                      <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 5, background: on ? theme.accent : 'rgba(11,11,15,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 9, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Panel>

          {/* Légende */}
          <Panel theme={theme}>
            <PanelHead title="Légende" sub="optionnelle" />
            <div style={{ padding: 13 }}>
              <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Écris une légende (facultatif)…" rows={3}
                style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }} />
            </div>
          </Panel>

          {/* Progression + logs */}
          {runItems.length > 0 && (
            <Panel theme={theme}>
              <PanelHead title="Publication en direct" sub={`${runItems.filter(r => r.phase === 'done').length}/${runItems.length} terminés`} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '11px 15px' }}>
                {runItems.map(it => {
                  const c = it.phase === 'done' ? 'ok' : it.phase === 'failed' ? 'bad' : it.phase === 'running' ? 'warn' : 'mute'
                  const m = it.phase === 'done' ? '✓' : it.phase === 'failed' ? '✕' : it.phase === 'running' ? '…' : '·'
                  return <Chip key={it.id} text={`${m} @${it.name}`} tone={c as any} />
                })}
              </div>
              <div style={{ margin: '0 15px 13px', padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.05)', maxHeight: 220, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>
                {logs.length === 0 ? '…' : logs.join('\n')}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
