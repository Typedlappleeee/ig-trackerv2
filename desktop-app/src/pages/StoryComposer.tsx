import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, StatusDot, Panel, PanelHead, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { useConnections } from '@/lib/connections'
import { geelarkUploadImage, postStoryToPhone } from '@/lib/geelark'
import { startCreditRun, isCreditError, CREDIT_COSTS } from '@/lib/credits'

interface Phone { id: string; ig_username: string | null; status: string; group_name: string | null; geelark_id: string | null }
interface Media { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; notes: string | null }

const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
function isImage(v: Media): boolean {
  if (SENTINELS.includes(v.notes ?? '') && !v.storage_path && !v.file_url) return false
  const ext = (v.storage_path ?? v.file_url ?? '').toLowerCase().split('.').pop() ?? ''
  return IMG_EXT.includes(ext)
}
function dotKind(s: string): string { return s === 'warming' ? 'warmup' : s }
function linkKey(p: Phone): string { return `sf-story-link-${p.geelark_id ?? p.id}` }

type Phase = 'pending' | 'running' | 'done' | 'failed'
interface RunItem { id: string; name: string; phase: Phase; detail?: string }

export default function StoryComposer({ theme, user, org, onBack }: {
  theme: Theme; user: User; org: OrgState; onBack: () => void
}) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const bearer = conns.bearer

  const [phones, setPhones] = useState<Phone[]>([])
  const [images, setImages] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [imageId, setImageId] = useState<string | null>(null)
  const [linkText, setLinkText] = useState('Voir plus')
  const [links, setLinks] = useState<Record<string, string>>({})

  const [running, setRunning] = useState(false)
  const [runItems, setRunItems] = useState<RunItem[]>([])
  const [logs, setLogs] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [phRes, mRes] = await Promise.all([
      scope(supabase.from('phones').select('id,ig_username,status,group_name,geelark_id')).not('geelark_id', 'is', null).order('phone_name'),
      scope(supabase.from('content_bank').select('id,title,storage_path,file_url,thumbnail_url,notes')).order('created_at', { ascending: false }),
    ])
    const ph = (phRes.data ?? []) as Phone[]
    setPhones(ph)
    // Exclut les dossiers-sentinelles, garde les images ; fallback : si aucune image
    // détectée (chemins sans extension claire), on montre tout le média réel.
    const all = ((mRes.data ?? []) as Media[]).filter(m => !(SENTINELS.includes(m.notes ?? '') && !m.storage_path && !m.file_url))
    const imgs = all.filter(isImage)
    setImages(imgs.length > 0 ? imgs : all)
    // Pré-remplit les liens depuis localStorage (partagé avec l'onglet Story web).
    const initial: Record<string, string> = {}
    for (const p of ph) { try { const v = localStorage.getItem(linkKey(p)); if (v) initial[p.id] = v } catch { /* ignore */ } }
    setLinks(initial)
    setLoading(false)
  }, [currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const setLink = (p: Phone, v: string) => {
    setLinks(l => ({ ...l, [p.id]: v }))
    try { localStorage.setItem(linkKey(p), v) } catch { /* ignore */ }
  }
  const selected = phones.filter(p => sel.has(p.id))
  const nSel = sel.size
  const chosen = images.find(m => m.id === imageId) ?? null
  const nLinked = selected.filter(p => (links[p.id] ?? '').trim()).length
  const ready = nSel > 0 && !!chosen && nLinked === nSel && !!bearer && !running

  async function resolveUrl(m: Media): Promise<string | null> {
    if (m.storage_path) {
      const { data } = await supabase.storage.from('content').createSignedUrl(m.storage_path, 3600)
      if (data?.signedUrl) return data.signedUrl
    }
    return m.file_url ?? m.thumbnail_url ?? null
  }

  async function launch() {
    if (!ready || !chosen) return
    const targets = selected.filter(p => p.geelark_id)
    setRunning(true); setLogs([])
    setRunItems(targets.map(p => ({ id: p.id, name: p.ig_username ?? p.geelark_id ?? p.id, phase: 'pending' as Phase })))
    const push = (m: string) => setLogs(l => [...l.slice(-250), m])

    // Débit d'avance (1 crédit/compte pour une story), remboursement des échecs.
    const ownerId = currentOrg?.owner_id ?? user.id
    const run = await startCreditRun(ownerId, CREDIT_COSTS.story, targets.length)
    if (isCreditError(run)) {
      push(`❌ Crédits insuffisants : ${run.error} (il faut ${CREDIT_COSTS.story * targets.length} crédits).`)
      setRunItems([]); setRunning(false); return
    }
    push(`💳 ${CREDIT_COSTS.story * targets.length} crédits débités (${CREDIT_COSTS.story}/compte).`)

    push('🔗 Préparation de l\'image…')
    const url = await resolveUrl(chosen)
    if (!url) { push('❌ Image introuvable.'); run.abort(); await run.settle(); push('↩︎ Crédits remboursés.'); setRunning(false); return }
    const imageResourceUrl = await geelarkUploadImage(bearer, url, push)
    if (!imageResourceUrl) { push('❌ Envoi de l\'image échoué.'); run.abort(); await run.settle(); push('↩︎ Crédits remboursés.'); setRunning(false); return }

    for (const p of targets) {
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'running' } : it))
      push(`— @${p.ig_username ?? p.geelark_id} —`)
      const r = await postStoryToPhone(bearer, p.geelark_id!, { imageResourceUrl, linkUrl: links[p.id], linkText }, push)
      if (!r.ok) run.markFailed()
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.error } : it))
    }
    const { refunded } = await run.settle()
    if (refunded > 0) push(`↩︎ ${refunded} crédits remboursés (comptes échoués).`)
    push('✔ Stories terminées.')
    setRunning(false)
  }

  const inputStyle = { height: 28, padding: '0 9px', borderRadius: 7, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: '#E4E4E7', fontSize: 11.5, outline: 'none', boxSizing: 'border-box' as const, width: '100%' }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Publier une Story"
        sub="Une image et un sticker lien propre à chaque compte. 1 crédit par compte."
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

      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
        {/* Comptes + liens */}
        <Panel theme={theme}>
          <PanelHead title="Comptes & liens" sub={nSel ? `${nLinked}/${nSel} liens · ${nSel} crédit${nSel > 1 ? 's' : ''}` : 'aucun'}
            right={<Btn theme={theme} sm tone="quiet" label="Tout" onClick={() => setSel(new Set(phones.map(p => p.id)))} />} />
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {loading ? <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div>
              : phones.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucun compte.</div>
              : phones.map(p => {
                const on = sel.has(p.id)
                return (
                  <div key={p.id} style={{ borderLeft: '2px solid ' + (on ? theme.accent : 'transparent'), background: on ? `rgba(${theme.tone},0.06)` : 'transparent' }}>
                    <button onClick={() => toggle(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 13px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', boxSizing: 'border-box' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: on ? theme.accent : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 8.5, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                      <StatusDot kind={dotKind(p.status)} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: on ? '#F4F4F6' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.ig_username ?? '—'}</span>
                    </button>
                    {on && (
                      <div style={{ padding: '0 13px 9px 34px' }}>
                        <input value={links[p.id] ?? ''} onChange={e => setLink(p, e.target.value)} placeholder="https://lien-du-compte…" style={inputStyle} />
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Image */}
          <Panel theme={theme}>
            <PanelHead title="Image de la story" sub={chosen ? chosen.title : 'choisis une image de la banque'} />
            {images.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucune image dans la banque.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(74px,1fr))', gap: 8, padding: 13, maxHeight: 240, overflowY: 'auto' }}>
                {images.map((m, i) => {
                  const on = imageId === m.id
                  const hue = ['139,92,246', '6,182,212', '236,72,153', '16,185,129', '245,158,11'][i % 5]
                  return (
                    <button key={m.id} onClick={() => setImageId(m.id)} title={m.title} style={{
                      position: 'relative', aspectRatio: '9 / 16', borderRadius: 8, padding: 0, cursor: 'pointer', overflow: 'hidden',
                      border: '1.5px solid ' + (on ? theme.accent : 'rgba(255,255,255,0.07)'),
                      background: m.thumbnail_url ? `center/cover url(${m.thumbnail_url})` : `linear-gradient(160deg, rgba(${hue},0.16), rgba(${hue},0.035))`,
                    }}>
                      <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 5, background: on ? theme.accent : 'rgba(11,11,15,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 9, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Panel>

          {/* Texte du sticker */}
          <Panel theme={theme}>
            <PanelHead title="Texte du sticker lien" sub="ce qui s'affiche sur le sticker" />
            <div style={{ padding: 13 }}>
              <input value={linkText} onChange={e => setLinkText(e.target.value)} placeholder="Voir plus" style={{ ...inputStyle, height: 34, fontSize: 12.5 }} />
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
