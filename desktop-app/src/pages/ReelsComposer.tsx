import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, StatusDot, Panel, PanelHead, PageHead } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { useBankThumbs, phoneLabel, phoneSub } from '@/lib/data'
import { deriveHealth } from '@/lib/health'
import { useConnections } from '@/lib/connections'
import { geelarkUploadVideo, postReelToPhone } from '@/lib/geelark'
import { startCreditRun, isCreditError, CREDIT_COSTS } from '@/lib/credits'
import BankPicker, { type PickerKind } from '@/components/BankPicker'
import { generateCaption } from '@/lib/ai'
import { startRun, cancelRun } from '@/lib/runStore'
import { loadProxyRotation, resolveRotationUrls } from '@/lib/proxyRotation'

interface Phone { id: string; ig_username: string | null; phone_name: string; status: string; group_name: string | null; geelark_id: string | null; ig_status: string | null; last_post_at: string | null; account_state: string | null }
interface Video { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null; duration: number | null; notes: string | null }

const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
function isVideo(v: Video): boolean {
  const ext = (v.storage_path ?? v.file_url ?? '').toLowerCase().split('.').pop() ?? ''
  return !IMG_EXT.includes(ext)
}
function dotKind(s: string): string { return s === 'warming' ? 'warmup' : s }
function fmtDur(s: number | null): string {
  if (!s || s <= 0) return ''
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
const HUES = ['139,92,246', '6,182,212', '236,72,153', '16,185,129', '245,158,11', '99,102,241']

type Phase = 'pending' | 'running' | 'done' | 'failed'
interface RunItem { id: string; name: string; phase: Phase; detail?: string }
const STEPS = ['Comptes', 'Vidéos', 'Légende', 'Lancement']

export default function ReelsComposer({ theme, user, org, onBack }: {
  theme: Theme; user: User; org: OrgState; onBack: () => void
}) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const bearer = conns.bearer

  const [step, setStep] = useState(1)
  const [phones, setPhones] = useState<Phone[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [group, setGroup] = useState('Tous')
  const [healthy, setHealthy] = useState(false)
  const [vidSel, setVidSel] = useState<Set<string>>(new Set())
  const [captions, setCaptions] = useState<string[]>([''])   // pool de légendes
  const [capMode, setCapMode] = useState<'seq' | 'random'>('seq')
  const [balance, setBalance] = useState<number | null>(null)

  // Options de run (fonctionnelles).
  const [vidMode, setVidMode] = useState<'seq' | 'random'>('seq')  // répartition vidéo → compte
  const [autoRemove, setAutoRemove] = useState(true)               // usage unique
  const [reelsTrial, setReelsTrial] = useState(false)              // essai Reels

  const [running, setRunning] = useState(false)
  const [runItems, setRunItems] = useState<RunItem[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [picker, setPicker] = useState<PickerKind | null>(null)
  const [genning, setGenning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)

  const setCaptionAt = (i: number, v: string) => setCaptions(c => c.map((x, k) => k === i ? v : x))
  const addCaption = (v = '') => setCaptions(c => [...c, v])
  const removeCaption = (i: number) => setCaptions(c => c.length <= 1 ? [''] : c.filter((_, k) => k !== i))

  async function genCaption() {
    if (genning) return
    setGenning(true)
    const txt = await generateCaption(conns.groq, videos.find(v => vidSel.has(v.id))?.title)
    if (txt) setCaptions(c => { const n = [...c]; const empty = n.findIndex(x => !x.trim()); if (empty >= 0) n[empty] = txt; else n.push(txt); return n })
    setGenning(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [phRes, vRes, balRes] = await Promise.all([
      scope(supabase.from('phones').select('id,ig_username,phone_name,status,group_name,geelark_id,ig_status,last_post_at,account_state')).not('geelark_id', 'is', null).order('phone_name'),
      scope(supabase.from('content_bank').select('*')).order('created_at', { ascending: false }),
      currentOrg ? supabase.rpc('get_org_credit_balance', { p_org_id: currentOrg.id }) : supabase.from('user_credits').select('balance').eq('user_id', user.id).maybeSingle(),
    ])
    setPhones((phRes.data ?? []) as Phone[])
    const all = ((vRes.data ?? []) as Video[]).filter(v => !(SENTINELS.includes(v.notes ?? '') && !v.storage_path && !v.file_url))
    const vids = all.filter(isVideo)
    setVideos(vids.length > 0 ? vids : all)
    const bal = currentOrg ? (typeof (balRes as any).data === 'number' ? (balRes as any).data : null) : ((balRes as any).data?.balance ?? null)
    setBalance(typeof bal === 'number' ? bal : null)
    setLoading(false)
  }, [currentOrg?.id, user.id])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const s = new Set<string>()
    phones.forEach(p => { if (p.group_name) s.add(p.group_name) })
    return ['Tous', ...[...s].sort()]
  }, [phones])
  const shownPhones = useMemo(() => phones.filter(p =>
    (group === 'Tous' || p.group_name === group) && (!healthy || deriveHealth(p) >= 70)
  ), [phones, group, healthy])

  const { thumbFor } = useBankThumbs(videos)
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleVid = (id: string) => setVidSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const nSel = sel.size
  const nVid = vidSel.size
  const cost = nSel * CREDIT_COSTS.mass_posting
  const canLaunch = nSel > 0 && nVid > 0 && !!bearer && !running

  async function resolveVideoUrl(v: Video): Promise<string | null> {
    if (v.storage_path) {
      const { data } = await supabase.storage.from('content').createSignedUrl(v.storage_path, 3600)
      if (data?.signedUrl) return data.signedUrl
    }
    return v.file_url ?? null
  }

  async function launch() {
    if (!canLaunch) return
    const targets = phones.filter(p => sel.has(p.id) && p.geelark_id)
    const chosenVids = videos.filter(v => vidSel.has(v.id))
    if (targets.length === 0 || chosenVids.length === 0) return
    setRunning(true); setLogs([])
    setRunItems(targets.map(p => ({ id: p.id, name: p.ig_username ?? p.geelark_id ?? p.id, phase: 'pending' as Phase })))
    const push = (m: string) => setLogs(l => [...l.slice(-300), m])
    await loadProxyRotation(currentOrg?.id ?? null, user.id)
    const rotU = resolveRotationUrls(); const rot = rotU.length ? rotU : undefined
    if (rot) push(`🔁 Rotation d'IP proxy activée (${rot.length} proxy) — IP changée avant chaque téléphone.`)

    const ownerId = currentOrg?.owner_id ?? user.id
    const run = await startCreditRun(ownerId, CREDIT_COSTS.mass_posting, targets.length)
    if (isCreditError(run)) { push(`❌ Crédits insuffisants : ${run.error} (il faut ${cost} crédits).`); setRunItems([]); setRunning(false); return }
    push(`💳 ${cost} crédits débités (${CREDIT_COSTS.mass_posting}/compte).`)

    // Suivi global (widget flottant + annulation), survit à la navigation.
    const R = startRun('reels', `${targets.length} compte${targets.length > 1 ? 's' : ''}`, targets.length)
    setRunId(R.id)

    // 1) Répartition D'ABORD : UNE vidéo par compte (séquentielle ou aléatoire).
    const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let k = b.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1));[b[k], b[j]] = [b[j], b[k]] } return b }
    const order = vidMode === 'random' ? shuffle(chosenVids) : chosenVids
    const assignment = targets.map((_, i) => order[i % order.length])   // vidéo assignée à chaque téléphone
    const caps = captions.map(c => c.trim()).filter(Boolean)

    // 2) Héberge SEULEMENT les vidéos réellement assignées (distinctes) — pas toute la sélection.
    const distinct = [...new Map(assignment.map(v => [v.id, v])).values()]
    push(`⬆ Hébergement de ${distinct.length} vidéo(s) (1 par compte)…`)
    const resourceByVid = new Map<string, string>()
    for (const v of distinct) {
      if (R.isCancelled()) break
      const url = await resolveVideoUrl(v)
      if (!url) { push(`⚠ ${v.title} : URL introuvable.`); continue }
      const ru = await geelarkUploadVideo(bearer, url, push)
      if (ru) resourceByVid.set(v.id, ru)
    }
    if (resourceByVid.size === 0) { push('❌ Aucune vidéo hébergée.'); run.abort(); await run.settle(); push('↩︎ Crédits remboursés.'); setRunning(false); return }

    // 3) Poste : chaque téléphone reçoit SA vidéo assignée.
    //    Sans proxy rotatif → tous les téléphones EN PARALLÈLE (rapide).
    //    Avec proxy rotatif → en série (1 IP à la fois, l'IP change avant chaque tel).
    const usedVidIds = new Set<string>()
    const jobs = targets.map((p, k) => ({
      p, v: assignment[k],
      cap: caps.length === 0 ? '' : capMode === 'random' ? caps[Math.floor(Math.random() * caps.length)] : caps[k % caps.length],
    }))
    const concurrency = rot ? 1 : jobs.length
    push(rot ? '🔁 Envoi en série (proxy rotatif).' : `⚡ ${jobs.length} téléphone(s) en parallèle.`)

    const postOne = async ({ p, v, cap }: (typeof jobs)[number]) => {
      const ru = resourceByVid.get(v.id)
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'running' } : it))
      if (!ru) { run.markFailed(); R.tick(false); setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'failed', detail: 'vidéo non hébergée' } : it)); return }
      usedVidIds.add(v.id)
      push(`— @${p.ig_username ?? p.geelark_id} · ${v.title}${cap ? ' · légende' : ''} —`)
      const r = await postReelToPhone(bearer, p.geelark_id!, ru, cap, push, rot, reelsTrial)
      if (!r.ok) run.markFailed()
      R.tick(r.ok)
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.error } : it))
    }

    for (let b = 0; b < jobs.length; b += concurrency) {
      if (R.isCancelled()) { push('⏹ Annulé.'); break }
      await Promise.all(jobs.slice(b, b + concurrency).map(postOne))
    }
    R.finish()
    setRunId(null)
    const { refunded } = await run.settle()
    if (refunded > 0) push(`↩︎ ${refunded} crédits remboursés (comptes échoués).`)

    // Usage unique : retire de la banque les vidéos réellement utilisées.
    if (autoRemove && usedVidIds.size > 0) {
      const ids = [...usedVidIds]
      const objs = distinct.filter(v => usedVidIds.has(v.id)).map(v => v.storage_path).filter(Boolean) as string[]
      try {
        await supabase.from('content_bank').delete().in('id', ids)
        if (objs.length) await supabase.storage.from('content').remove(objs)
        push(`🗑 ${ids.length} vidéo(s) retirée(s) de la banque (usage unique).`)
      } catch { /* best-effort */ }
    }
    push('✔ Publication terminée.')
    setRunning(false)
    load()
  }

  // ── Stepper ─────────────────────────────────────────────────────────────────
  const stepper = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
      {STEPS.map((s, i) => {
        const n = i + 1, active = step === n, past = step > n
        return (
          <button key={s} onClick={() => setStep(n)} style={{
            display: 'flex', alignItems: 'center', gap: 7, flex: 1, height: 32, padding: '0 12px', border: 'none', borderRadius: 7, cursor: 'pointer', justifyContent: 'center',
            background: active ? `rgba(${theme.tone},0.16)` : 'transparent',
            color: active ? theme.accentText : past ? '#A1A1AA' : '#52525B', fontSize: 12, fontWeight: 700, transition: 'all .16s ease',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17, borderRadius: 5, flexShrink: 0, background: active ? theme.accentBtn : past ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.05)', color: active ? '#fff' : past ? '#34D399' : '#52525B', fontSize: 9.5, fontWeight: 900 }}>{past ? '✓' : n}</span>
            {s}
          </button>
        )
      })}
    </div>
  )

  const selectStyle: CSSProperties = {
    height: 28, padding: '0 8px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${group !== 'Tous' ? theme.selEdge : 'rgba(255,255,255,0.07)'}`,
    background: '#101015', color: group !== 'Tous' ? theme.accentText : '#A1A1AA', fontSize: 11.5, fontWeight: 700, outline: 'none',
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Publier un Reel"
        sub={`Instagram · ${nSel} compte${nSel > 1 ? 's' : ''} · ${nVid} vidéo${nVid > 1 ? 's' : ''}`}
        actions={<>
          <Btn theme={theme} tone="quiet" label="Retour" onClick={onBack} />
          {step > 1 && <Btn theme={theme} tone="ghost" label="Précédent" onClick={() => setStep(s => s - 1)} />}
          {step < 4 && <Btn theme={theme} tone="primary" icon="M9 18l6-6-6-6" label="Suivant" onClick={() => setStep(s => s + 1)} />}
        </>}
      />

      {!bearer && !conns.loading && (
        <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', fontSize: 12, color: '#FBBF24' }}>
          Connecte ton compte GeeLark (token) dans les Réglages de l'app web pour publier.
        </div>
      )}

      {stepper}

      {/* ── Étape 1 : Comptes ── */}
      {step === 1 && (
        <Panel theme={theme}>
          <PanelHead title="Qui publie ?" sub="Coche les comptes qui recevront la vidéo. 2 crédits par compte." right={<>
            <Btn theme={theme} sm label="Tout" onClick={() => setSel(new Set(shownPhones.map(p => p.id)))} />
            <Btn theme={theme} sm tone="quiet" label="Aucun" onClick={() => setSel(new Set())} />
          </>} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#52525B' }}>Groupe</span>
            <select value={group} onChange={e => setGroup(e.target.value)} style={selectStyle}>
              {groups.map(g => <option key={g} value={g} style={{ background: '#16161C' }}>{g === 'Tous' ? 'Tous les groupes' : g}</option>)}
            </select>
            <button onClick={() => setHealthy(h => !h)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 11px', borderRadius: 8, cursor: 'pointer',
              background: healthy ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (healthy ? 'rgba(16,185,129,0.32)' : 'rgba(255,255,255,0.07)'),
              color: healthy ? '#34D399' : '#71717A', fontSize: 11.5, fontWeight: 700,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: 4, background: healthy ? '#10B981' : 'transparent', border: healthy ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#04140C', fontSize: 8, fontWeight: 900 }}>{healthy ? '✓' : ''}</span>
              Santé ≥ 70 seulement
            </button>
            <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#52525B' }}>{shownPhones.length} affichés · {nSel} cochés</span>
          </div>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Chargement…</div>
            : shownPhones.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 12 }}>Aucun compte.</div>
            : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(196px,1fr))', gap: 8, padding: 13 }}>
              {shownPhones.map(p => {
                const on = sel.has(p.id)
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                    background: on ? `rgba(${theme.tone},0.09)` : 'rgba(255,255,255,0.015)', border: '1px solid ' + (on ? theme.selEdge : 'rgba(255,255,255,0.06)'),
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: 4, flexShrink: 0, background: on ? theme.accentBtn : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 9, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: on ? '#F4F4F6' : '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: '#52525B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneSub(p)}</span>
                    </span>
                    <StatusDot kind={dotKind(p.status)} />
                  </button>
                )
              })}
            </div>
          )}
        </Panel>
      )}

      {/* ── Étape 2 : Vidéos ── */}
      {step === 2 && (
        <Panel theme={theme}>
          <PanelHead title="Quel contenu ?" sub="Plusieurs vidéos ? Elles seront réparties entre les comptes." right={<>
            <Btn theme={theme} sm tone="primary" icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" label="Ouvrir la banque" onClick={() => setPicker('videos')} />
            <Chip text={`${nVid} sélectionnée${nVid > 1 ? 's' : ''}`} tone={nVid ? 'violet' : 'mute'} />
          </>} />
          {nVid === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#52525B', fontSize: 12, lineHeight: 1.6 }}>Aucune vidéo choisie.<br />Clique <b style={{ color: theme.accentText }}>Ouvrir la banque</b> pour en sélectionner.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 8, padding: 13, maxHeight: 420, overflowY: 'auto' }}>
              {videos.filter(v => vidSel.has(v.id)).map((v, i) => {
                const on = vidSel.has(v.id); const h = HUES[i % 6]
                const prev = thumbFor(v); const vid = isVideo(v)
                return (
                  <button key={v.id} onClick={() => toggleVid(v.id)} title={v.title} style={{
                    position: 'relative', aspectRatio: '9 / 16', borderRadius: 8, padding: 0, cursor: 'pointer', overflow: 'hidden',
                    border: '1.5px solid ' + (on ? theme.accent : 'rgba(255,255,255,0.07)'),
                    background: `linear-gradient(160deg, rgba(${h},0.16), rgba(${h},0.04))`,
                  }}>
                    {prev && (vid && !v.thumbnail_url && !v.thumbnail_path
                      ? <video src={prev + '#t=0.1'} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <img src={prev} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)}
                    <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 5, background: on ? theme.accentBtn : 'rgba(11,11,15,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 9, fontWeight: 900 }}>{on ? '✓' : ''}</span>
                    {fmtDur(v.duration) && <span style={{ position: 'absolute', bottom: 5, left: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: 'rgba(255,255,255,0.7)' }}>{fmtDur(v.duration)}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </Panel>
      )}

      {/* ── Étape 3 : Légende ── */}
      {step === 3 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 10 }}>
          <Panel theme={theme}>
            <PanelHead title="Légendes" sub={captions.filter(c => c.trim()).length > 1 ? 'Réparties entre les comptes' : 'Une légende commune (facultatif)'}
              right={<Btn theme={theme} sm tone="primary" disabled={genning} icon="M9.9 15.5A2 2 0 0 0 8.5 14L2.4 12.5a.5.5 0 0 1 0-1L8.5 10A2 2 0 0 0 9.9 8.5l1.6-6.1a.5.5 0 0 1 1 0L14.1 8.5A2 2 0 0 0 15.5 9.9l6.1 1.6a.5.5 0 0 1 0 1L15.5 14a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z" label={genning ? '…' : 'IA'} onClick={genCaption} />} />
            <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {captions.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <textarea value={c} onChange={e => setCaptionAt(i, e.target.value)} placeholder={`Légende ${i + 1} (facultatif)…`} rows={2}
                    style={{ flex: 1, minHeight: 52, resize: 'vertical', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', color: '#D4D4D8', fontSize: 12.5, lineHeight: 1.6, fontFamily: 'inherit', outline: 'none' }} />
                  {captions.length > 1 && <button onClick={() => removeCaption(i)} title="Retirer" style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 7, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#71717A', cursor: 'pointer' }}>✕</button>}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Btn theme={theme} sm tone="quiet" icon="M12 5v14|M5 12h14" label="Ajouter" onClick={() => addCaption()} />
                <Btn theme={theme} sm tone="quiet" icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" label="Depuis la banque" onClick={() => setPicker('captions')} />
                {captions.filter(c => c.trim()).length > 1 && (
                  <span style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', marginLeft: 'auto' }}>
                    {(['seq', 'random'] as const).map(m => (
                      <button key={m} onClick={() => setCapMode(m)} style={{ height: 24, padding: '0 10px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: capMode === m ? theme.accentBtn : 'transparent', color: capMode === m ? '#fff' : '#71717A' }}>{m === 'seq' ? 'Séquentiel' : 'Aléatoire'}</button>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </Panel>
          <Panel theme={theme}>
            <PanelHead title="Aperçu" />
            <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: 99, background: `linear-gradient(140deg,${theme.accentSoft},${theme.accentBtn})`, flexShrink: 0 }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#E4E4E7' }}>@{phones.find(p => sel.has(p.id))?.ig_username ?? 'compte'}</span>
              </div>
              <div style={{ aspectRatio: '9 / 14', borderRadius: 8, background: `linear-gradient(160deg, rgba(${theme.tone},0.16), rgba(${theme.tone},0.03))`, border: '1px solid rgba(255,255,255,0.06)' }} />
              <div style={{ fontSize: 11, lineHeight: 1.6, color: '#71717A' }}>{(() => { const c = captions.find(x => x.trim()); return c ? c.split('\n')[0].slice(0, 62) + (c.length > 62 ? '…' : '') : 'Aucune légende' })()}</div>
            </div>
          </Panel>
        </div>
      )}

      {/* ── Étape 4 : Lancement ── */}
      {step === 4 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 10 }}>
          <Panel theme={theme}>
            <PanelHead title="Comportement du run" />
            {/* Répartition vidéo → compte */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#E4E4E7' }}>Répartition des vidéos</span>
                <span style={{ fontSize: 11, color: '#52525B' }}>Quelle vidéo va sur quel compte</span>
              </span>
              <span style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {(['seq', 'random'] as const).map(m => (
                  <button key={m} onClick={() => setVidMode(m)} style={{ height: 24, padding: '0 10px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, background: vidMode === m ? theme.accentBtn : 'transparent', color: vidMode === m ? '#fff' : '#71717A' }}>{m === 'seq' ? 'Séquentiel' : 'Aléatoire'}</button>
                ))}
              </span>
            </div>
            {/* Usage unique */}
            <RunToggle label="Usage unique des vidéos" hint="Retire de la banque les vidéos utilisées" on={autoRemove} onToggle={() => setAutoRemove(v => !v)} theme={theme} border />
            {/* Essai Reels */}
            <RunToggle label="Essai Reels" hint="Publie en mode essai (visible non-abonnés)" on={reelsTrial} onToggle={() => setReelsTrial(v => !v)} theme={theme} />
          </Panel>
          <Panel theme={theme}>
            <PanelHead title="Récapitulatif" />
            <div style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {([['Comptes', nSel], ['Vidéos', nVid], ['Plateforme', 'Instagram']] as [string, any][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#71717A' }}>{k}</span><span style={{ fontWeight: 700, color: '#E4E4E7' }}>{v}</span>
                </div>
              ))}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: '#71717A' }}>Coût</span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: '#FBBF24' }}>{cost} crédits</span>
                  {balance !== null && <span style={{ fontSize: 10.5, color: '#52525B' }}>solde après : {Math.max(0, balance - cost).toLocaleString('fr-FR')}</span>}
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                <Btn theme={theme} tone="primary" disabled={!canLaunch} icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z"
                  label={running ? 'Publication…' : nSel === 0 ? 'Sélectionne des comptes' : nVid === 0 ? 'Choisis une vidéo' : `Lancer sur ${nSel} comptes`} onClick={launch} />
              </div>
            </div>
          </Panel>

          {runItems.length > 0 && (
            <div style={{ gridColumn: '1/-1' }}>
              <Panel theme={theme}>
                <PanelHead title="Publication en direct" sub={`${runItems.filter(r => r.phase === 'done').length}/${runItems.length} terminés`}
                  right={runId ? <Btn theme={theme} sm tone="danger" icon="M6 6h12v12H6z" label="Annuler" onClick={() => cancelRun(runId)} /> : undefined} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '11px 15px' }}>
                  {runItems.map(it => {
                    const c = it.phase === 'done' ? 'ok' : it.phase === 'failed' ? 'bad' : it.phase === 'running' ? 'warn' : 'mute'
                    const m = it.phase === 'done' ? '✓' : it.phase === 'failed' ? '✕' : it.phase === 'running' ? '…' : '·'
                    return <Chip key={it.id} text={`${m} @${it.name}`} tone={c as any} />
                  })}
                </div>
                <div style={{ margin: '0 15px 13px', padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.05)', maxHeight: 240, overflowY: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>
                  {logs.length === 0 ? '…' : logs.join('\n')}
                </div>
              </Panel>
            </div>
          )}
        </div>
      )}

      {picker && (
        <BankPicker theme={theme} user={user} org={org} kind={picker}
          multi
          initialIds={picker === 'videos' ? [...vidSel] : []}
          title={picker === 'captions' ? 'Choisir des légendes' : 'Choisir des vidéos'}
          onClose={() => setPicker(null)}
          onApply={r => {
            if (r.kind === 'captions') setCaptions(cur => { const base = cur.filter(c => c.trim()); return [...base, ...r.texts.filter(t => !base.includes(t))] })
            else setVidSel(new Set(r.ids))
          }} />
      )}
    </div>
  )
}

// Interrupteur d'option de run (on/off).
function RunToggle({ label, hint, on, onToggle, theme, border }: { label: string; hint: string; on: boolean; onToggle: () => void; theme: Theme; border?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderBottom: border ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#E4E4E7' }}>{label}</span>
        <span style={{ fontSize: 11, color: '#52525B' }}>{hint}</span>
      </span>
      <span onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', width: 34, height: 19, padding: 2, borderRadius: 99, flexShrink: 0, cursor: 'pointer', background: on ? theme.accentBtn : 'rgba(255,255,255,0.12)' }}>
        <span style={{ width: 15, height: 15, borderRadius: 99, background: '#fff' }} />
      </span>
    </div>
  )
}
