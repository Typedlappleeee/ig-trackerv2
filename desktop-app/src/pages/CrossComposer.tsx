import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, StatusDot, Panel, PanelHead, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { phoneLabel, phoneSub, useBankThumbs } from '@/lib/data'
import { useConnections } from '@/lib/connections'
import { geelarkUploadVideo, crossPostToPhone, CROSS_PLATFORMS, type CrossPlatform } from '@/lib/geelark'
import { startCreditRun, isCreditError, CREDIT_COSTS } from '@/lib/credits'
import BankPicker from '@/components/BankPicker'

interface Phone { id: string; ig_username: string | null; phone_name: string; status: string; geelark_id: string | null }
interface Video { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null; notes: string | null }
const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
function isVid(v: Video): boolean {
  const ext = (v.storage_path ?? v.file_url ?? '').toLowerCase().split('.').pop() ?? ''
  return !IMG_EXT.includes(ext)
}
function dotKind(s: string): string { return s === 'warming' ? 'warmup' : s }
type Phase = 'pending' | 'running' | 'done' | 'failed'
interface RunItem { id: string; name: string; phase: Phase; detail?: string }

export default function CrossComposer({ theme, user, org, onBack }: {
  theme: Theme; user: User; org: OrgState; onBack: () => void
}) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const bearer = conns.bearer
  const [phones, setPhones] = useState<Phone[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [videoId, setVideoId] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [plats, setPlats] = useState<Set<CrossPlatform>>(new Set(['tiktok']))
  const [running, setRunning] = useState(false)
  const [runItems, setRunItems] = useState<RunItem[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [phRes, vRes] = await Promise.all([
      scope(supabase.from('phones').select('id,ig_username,phone_name,status,geelark_id')).not('geelark_id', 'is', null).order('phone_name'),
      scope(supabase.from('content_bank').select('*')).order('created_at', { ascending: false }),
    ])
    setPhones((phRes.data ?? []) as Phone[])
    setVideos(((vRes.data ?? []) as Video[]).filter(v => !(SENTINELS.includes(v.notes ?? '') && !v.storage_path && !v.file_url)))
    setLoading(false)
  }, [currentOrg?.id, user.id])
  useEffect(() => { load() }, [load])

  const { thumbFor } = useBankThumbs(videos)
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const togglePlat = (p: CrossPlatform) => setPlats(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })
  const nSel = sel.size
  const chosen = videos.find(v => v.id === videoId) ?? null
  const cost = nSel * plats.size * CREDIT_COSTS.mass_posting
  const ready = nSel > 0 && !!chosen && plats.size > 0 && !!bearer && !running

  async function resolveUrl(v: Video): Promise<string | null> {
    if (v.storage_path) { const { data } = await supabase.storage.from('content').createSignedUrl(v.storage_path, 3600); if (data?.signedUrl) return data.signedUrl }
    return v.file_url ?? null
  }

  async function launch() {
    if (!ready || !chosen) return
    const targets = phones.filter(p => sel.has(p.id) && p.geelark_id)
    const platList = [...plats]
    setRunning(true); setLogs([])
    setRunItems(targets.flatMap(p => platList.map(pl => ({ id: `${p.id}:${pl}`, name: `${phoneLabel(p)} · ${pl}`, phase: 'pending' as Phase }))))
    const push = (m: string) => setLogs(l => [...l.slice(-300), m])
    const rot = conns.proxy ? conns.proxy.split(/[\n,]/).map(s => s.trim()).filter(Boolean) : undefined
    const ownerId = currentOrg?.owner_id ?? user.id
    const run = await startCreditRun(ownerId, CREDIT_COSTS.mass_posting, targets.length * platList.length)
    if (isCreditError(run)) { push(`❌ Crédits insuffisants (il faut ${cost}).`); setRunItems([]); setRunning(false); return }
    push(`💳 ${cost} crédits débités.`)
    push('🔗 Préparation de la vidéo…')
    const url = await resolveUrl(chosen)
    if (!url) { push('❌ Vidéo introuvable.'); run.abort(); await run.settle(); setRunning(false); return }
    const resourceUrl = await geelarkUploadVideo(bearer, url, push)
    if (!resourceUrl) { push('❌ Envoi vidéo échoué.'); run.abort(); await run.settle(); setRunning(false); return }
    for (const p of targets) {
      for (const pl of platList) {
        const key = `${p.id}:${pl}`
        setRunItems(items => items.map(it => it.id === key ? { ...it, phase: 'running' } : it))
        push(`— ${phoneLabel(p)} · ${pl} —`)
        const r = await crossPostToPhone(bearer, p.geelark_id!, pl, { mediaResourceUrl: resourceUrl, caption, rotationUrls: rot }, push)
        if (!r.ok) run.markFailed()
        setRunItems(items => items.map(it => it.id === key ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.error } : it))
      }
    }
    const { refunded } = await run.settle()
    if (refunded > 0) push(`↩︎ ${refunded} crédits remboursés.`)
    push('✔ Cross-posting terminé.'); setRunning(false)
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Cross-posting" sub="Une vidéo sur plusieurs réseaux (TikTok, Threads, Facebook, Shorts, X, Reddit, Pinterest)."
        actions={<>
          <Btn theme={theme} tone="quiet" label="Retour" onClick={onBack} />
          <Btn theme={theme} tone="primary" disabled={!ready} icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z" label={running ? 'Publication…' : ready ? `Publier (${cost} cr.)` : 'Publier'} onClick={launch} />
        </>} />
      {!bearer && !conns.loading && <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', fontSize: 12, color: '#FBBF24' }}>Connecte ton token GeeLark (Réglages app web) pour publier.</div>}

      <Panel theme={theme} style={{ marginBottom: 10 }}>
        <PanelHead title="Réseaux" sub={`${plats.size} sélectionné${plats.size > 1 ? 's' : ''}`} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 13 }}>
          {CROSS_PLATFORMS.map(pl => {
            const on = plats.has(pl.key)
            return (
              <button key={pl.key} onClick={() => togglePlat(pl.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', borderRadius: 9, cursor: 'pointer', background: on ? `rgba(${theme.tone},0.12)` : 'rgba(255,255,255,0.02)', border: '1px solid ' + (on ? theme.selEdge : 'rgba(255,255,255,0.08)'), color: on ? '#F4F4F6' : '#A1A1AA', fontSize: 12.5, fontWeight: 700 }}>
                <span>{pl.emoji}</span>{pl.label}
              </button>
            )
          })}
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
        <Panel theme={theme}>
          <PanelHead title="Comptes" sub={nSel ? `${nSel} × ${plats.size} réseaux` : 'aucun'} right={<Btn theme={theme} sm tone="quiet" label="Tout" onClick={() => setSel(new Set(phones.map(p => p.id)))} />} />
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading ? <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div>
              : phones.map(p => {
                const on = sel.has(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 13px', border: 'none', cursor: 'pointer', textAlign: 'left', borderLeft: '2px solid ' + (on ? theme.accent : 'transparent'), background: on ? `rgba(${theme.tone},0.06)` : 'transparent', boxSizing: 'border-box' }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? theme.accentBtn : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 8.5, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                    <StatusDot kind={dotKind(p.status)} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: on ? '#F4F4F6' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#52525B' }}>{phoneSub(p)}</span>
                    </span>
                  </button>
                )
              })}
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Panel theme={theme}>
            <PanelHead title="Vidéo" sub={chosen ? chosen.title : 'choisis une vidéo'}
              right={<Btn theme={theme} sm tone="primary" icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" label="Ouvrir la banque" onClick={() => setPickerOpen(true)} />} />
            {videos.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Banque vide.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(74px,1fr))', gap: 8, padding: 13, maxHeight: 240, overflowY: 'auto' }}>
                {videos.map((v, i) => {
                  const on = videoId === v.id; const hue = ['139,92,246', '6,182,212', '236,72,153', '16,185,129', '245,158,11'][i % 5]
                  const prev = thumbFor(v); const vid = isVid(v)
                  return (
                    <button key={v.id} onClick={() => setVideoId(v.id)} title={v.title} style={{ position: 'relative', aspectRatio: '9 / 16', borderRadius: 8, padding: 0, cursor: 'pointer', overflow: 'hidden', border: '1.5px solid ' + (on ? theme.accent : 'rgba(255,255,255,0.07)'), background: `linear-gradient(160deg, rgba(${hue},0.16), rgba(${hue},0.035))` }}>
                      {prev && (vid && !v.thumbnail_url && !v.thumbnail_path
                        ? <video src={prev + '#t=0.1'} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <img src={prev} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)}
                      <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 5, background: on ? theme.accentBtn : 'rgba(11,11,15,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 9, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel theme={theme}>
            <PanelHead title="Légende" />
            <div style={{ padding: 13 }}>
              <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3} placeholder="Légende (facultatif)…" style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', padding: 11, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }} />
            </div>
          </Panel>
          {runItems.length > 0 && (
            <Panel theme={theme}>
              <PanelHead title="En direct" sub={`${runItems.filter(r => r.phase === 'done').length}/${runItems.length}`} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '11px 15px' }}>
                {runItems.map(it => <Chip key={it.id} text={`${it.phase === 'done' ? '✓' : it.phase === 'failed' ? '✕' : it.phase === 'running' ? '…' : '·'} ${it.name}`} tone={(it.phase === 'done' ? 'ok' : it.phase === 'failed' ? 'bad' : it.phase === 'running' ? 'warn' : 'mute') as any} />)}
              </div>
              <div style={{ margin: '0 15px 13px', padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.05)', maxHeight: 200, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>{logs.length === 0 ? '…' : logs.join('\n')}</div>
            </Panel>
          )}
        </div>
      </div>

      {pickerOpen && (
        <BankPicker theme={theme} user={user} org={org} kind="videos" multi={false}
          initialIds={videoId ? [videoId] : []} title="Choisir une vidéo"
          onClose={() => setPickerOpen(false)}
          onApply={r => { if (r.kind === 'videos') setVideoId(r.ids[0] ?? null) }} />
      )}
    </div>
  )
}
