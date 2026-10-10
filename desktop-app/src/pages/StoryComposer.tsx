import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { startRunHistory } from '@/lib/runHistory'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, StatusDot, Panel, PanelHead, PageHead, FIELD, FIELD_SM, Toggle, Segmented, MONO, useNarrow, SkeletonRows, Empty } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { useBankThumbs, phoneLabel, phoneSub } from '@/lib/data'
import { useConnections } from '@/lib/connections'
import BankPicker, { type PickerKind } from '@/components/BankPicker'
import { geelarkUploadImage, postStoryToPhone, scheduleStoryOnPhone } from '@/lib/geelark'
import ScheduleModal from '@/components/ScheduleModal'
import { recordGeelarkSchedule } from '@/lib/scheduling'
import { startCreditRun, isCreditError, CREDIT_COSTS } from '@/lib/credits'
import { startRun } from '@/lib/runStore'
import { loadProxyRotation, resolveRotationUrls } from '@/lib/proxyRotation'
import { registerPhoneWatch, unregisterPhoneWatch } from '@/lib/phoneWatch'

interface Phone { id: string; ig_username: string | null; phone_name: string; status: string; group_name: string | null; geelark_id: string | null }
interface Media { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null; notes: string | null }

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
const PHONE_ICON = 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01'

export default function StoryComposer({ theme, user, org, onBack }: {
  theme: Theme; user: User; org: OrgState; onBack: () => void
}) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const bearer = conns.bearer
  const narrow = useNarrow()

  const [phones, setPhones] = useState<Phone[]>([])
  const [images, setImages] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [group, setGroup] = useState('Tous')
  const [rotationConfigured, setRotationConfigured] = useState(false)
  const [rotationOn, setRotationOn] = useState(false)   // OFF par défaut → tout lancer en parallèle
  const [imageIds, setImageIds] = useState<string[]>([])       // pool d'images
  const [imgMode, setImgMode] = useState<'seq' | 'random'>('seq')
  const [stickerTexts, setStickerTexts] = useState<string[]>(['Voir plus'])  // pool de textes sticker
  const [stMode, setStMode] = useState<'seq' | 'random'>('seq')
  const [links, setLinks] = useState<Record<string, string>>({})

  const [running, setRunning] = useState(false)
  const [runItems, setRunItems] = useState<RunItem[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [picker, setPicker] = useState<PickerKind | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const [phRes, mRes] = await Promise.all([
      scope(supabase.from('phones').select('id,ig_username,phone_name,status,group_name,geelark_id')).not('geelark_id', 'is', null).order('phone_name'),
      scope(supabase.from('content_bank').select('*')).order('created_at', { ascending: false }),
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

  // Recharge UNIQUEMENT la banque d'images (après un ajout/import depuis le BankPicker), sinon une
  // photo fraîchement importée a bien son id dans `imageIds` mais pas dans `images` → pool vide.
  const reloadImages = useCallback(async () => {
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await scope(supabase.from('content_bank').select('*')).order('created_at', { ascending: false })
    const all = ((data ?? []) as Media[]).filter(m => !(SENTINELS.includes(m.notes ?? '') && !m.storage_path && !m.file_url))
    const imgs = all.filter(isImage)
    setImages(imgs.length > 0 ? imgs : all)
  }, [currentOrg?.id, user.id])

  // Proxy rotatif dispo ? (Paramètres). Par défaut OFF → tout lancer en parallèle.
  useEffect(() => {
    loadProxyRotation(currentOrg?.id ?? null, user.id).then(c => {
      setRotationConfigured(c.enabled && c.urls.some(u => /^https?:\/\//i.test(u.trim())))
      setRotationOn(false)
    })
  }, [currentOrg?.id, user.id])

  const { thumbFor } = useBankThumbs(images)
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const setLink = (p: Phone, v: string) => {
    setLinks(l => ({ ...l, [p.id]: v }))
    try { localStorage.setItem(linkKey(p), v) } catch { /* ignore */ }
  }
  const setStickerAt = (i: number, v: string) => setStickerTexts(c => c.map((x, k) => k === i ? v : x))
  const removeSticker = (i: number) => setStickerTexts(c => c.length <= 1 ? [''] : c.filter((_, k) => k !== i))
  const selected = phones.filter(p => sel.has(p.id))
  // Filtre par groupe (comme dans Publication/Reels).
  const groups = useMemo(() => {
    const s = new Set<string>()
    phones.forEach(p => { if (p.group_name) s.add(p.group_name) })
    return ['Tous', ...[...s].sort()]
  }, [phones])
  const shownPhones = useMemo(() => phones.filter(p => group === 'Tous' || p.group_name === group), [phones, group])
  const nSel = sel.size
  const chosenImgs = images.filter(m => imageIds.includes(m.id))
  const nLinked = selected.filter(p => (links[p.id] ?? '').trim()).length
  const nMissing = nSel - nLinked   // comptes cochés SANS lien (seront ignorés)
  // Publiable dès qu'AU MOINS un compte coché a un lien (les comptes sans lien sont
  // simplement ignorés + non débités). Avant : il fallait un lien sur TOUS → bloqué
  // dès qu'un seul manquait, sans dire lequel.
  const ready = nLinked > 0 && chosenImgs.length > 0 && !!bearer && !running
  const [schedOpen, setSchedOpen] = useState(false)

  async function resolveUrl(m: Media): Promise<string | null> {
    if (m.storage_path) {
      const { data } = await supabase.storage.from('content').createSignedUrl(m.storage_path, 3600)
      if (data?.signedUrl) return data.signedUrl
    }
    return m.file_url ?? m.thumbnail_url ?? null
  }

  async function launch(scheduledUnix?: number) {
    if (!ready) return
    // On ne poste (et ne débite) QUE les comptes qui ont un lien sticker.
    const targets = selected.filter(p => p.geelark_id && (links[p.id] ?? '').trim())
    if (targets.length === 0) return
    setRunning(true); setLogs([])
    if (nMissing > 0) setLogs(l => [...l, `⚠ ${nMissing} compte(s) sans lien — ignoré(s) et non débité(s).`])
    setRunItems(targets.map(p => ({ id: p.id, name: phoneLabel(p), phase: 'pending' as Phase })))
    const push = (m: string) => setLogs(l => [...l.slice(-250), m])
    await loadProxyRotation(currentOrg?.id ?? null, user.id)
    const rotU = resolveRotationUrls(); const rot = (rotationOn && rotU.length) ? rotU : undefined

    // Débit d'avance (1 crédit/compte pour une story), remboursement des échecs.
    const ownerId = currentOrg?.owner_id ?? user.id
    const run = await startCreditRun(ownerId, CREDIT_COSTS.story, targets.length)
    if (isCreditError(run)) {
      push(`❌ Crédits insuffisants : ${run.error} (il faut ${CREDIT_COSTS.story * targets.length} crédits).`)
      setRunItems([]); setRunning(false); return
    }
    push(`💳 ${CREDIT_COSTS.story * targets.length} crédits débités (${CREDIT_COSTS.story}/compte).`)
    const R = startRun('story', `${targets.length} compte${targets.length > 1 ? 's' : ''}`, targets.length)

    // Héberge chaque image du pool UNE fois.
    push(`🔗 Préparation de ${chosenImgs.length} image(s)…`)
    const resByImg = new Map<string, string>()
    for (const m of chosenImgs) {
      const url = await resolveUrl(m)
      if (!url) { push(`⚠ ${m.title} : introuvable, ignorée.`); continue }
      const ru = await geelarkUploadImage(bearer, url, push)
      if (ru) resByImg.set(m.id, ru)
    }
    const usableImgs = chosenImgs.filter(m => resByImg.has(m.id))
    if (usableImgs.length === 0) { push('❌ Aucune image hébergée.'); run.abort(); await run.settle(); push('↩︎ Crédits remboursés.'); R.finish('error'); setRunning(false); return }

    const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let k = b.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1));[b[k], b[j]] = [b[j], b[k]] } return b }
    const imgOrder = imgMode === 'random' ? shuffle(usableImgs) : usableImgs
    const sts = stickerTexts.map(s => s.trim()).filter(Boolean)

    // Sans proxy rotatif → tous les comptes en parallèle ; avec → en série.
    const jobs = targets.map((p, k) => ({
      p, img: imgOrder[k % imgOrder.length],
      st: sts.length === 0 ? 'Voir plus' : stMode === 'random' ? sts[Math.floor(Math.random() * sts.length)] : sts[k % sts.length],
    }))
    // Programmation (PC éteint) : tâches GeeLark avec scheduleAt futur (cf. Reels).
    if (scheduledUnix) {
      push(`🗓 Programmation pour le ${new Date(scheduledUnix * 1000).toLocaleString('fr-FR')} (GeeLark, PC éteint)…`)
      let sok = 0, serr = 0
      const schedTaskIds: string[] = []; const schedPhones: { geelark_id: string; name: string }[] = []
      for (const { p, img, st } of jobs) {
        const r = await scheduleStoryOnPhone(bearer, p.geelark_id!, { imageResourceUrl: resByImg.get(img.id)!, linkUrl: links[p.id], linkText: st }, scheduledUnix, push)
        if (r.ok) { sok++; if (r.taskId) schedTaskIds.push(r.taskId); schedPhones.push({ geelark_id: p.geelark_id!, name: phoneLabel(p) }) } else { run.markFailed(); serr++ }
        setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.ok ? 'programmée ✓' : r.error } : it))
      }
      R.finish()
      const { refunded } = await run.settle()
      if (refunded > 0) push(`↩︎ ${refunded} crédits remboursés (échecs).`)
      if (sok > 0) await recordGeelarkSchedule({ userId: user.id, orgId: currentOrg?.id ?? null, ownerId, type: 'story', scheduledAtUnix: scheduledUnix, phones: schedPhones, taskIds: schedTaskIds, platform: 'instagram', creditsTotal: sok * CREDIT_COSTS.story })
      push(sok > 0 ? `✅ ${sok} story(s) programmée(s). Visibles dans « Programmé ». Elles partiront tout seules, PC éteint.` : '❌ Aucune programmation créée.')
      setRunning(false)
      return
    }

    // Historique écrit DÈS MAINTENANT (avant : seulement à la fin → rien si l'onglet se fermait).
    const hist = await startRunHistory({
      userId: user.id, orgId: currentOrg?.id ?? null, type: 'story',
      accounts: jobs.map(j => ({ key: j.p.id, name: phoneLabel(j.p), geelarkId: j.p.geelark_id })),
    })
    const concurrency = rot ? 1 : jobs.length
    push(rot ? '🔁 Envoi en série (proxy rotatif).' : `⚡ ${jobs.length} compte(s) en parallèle.`)
    const results = new Map<string, { name: string; ok: boolean; error?: string }>()
    const postOne = async ({ p, img, st }: (typeof jobs)[number]) => {
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'running' } : it))
      push(`— ${phoneLabel(p)} · ${img.title} —`)
      const r = await postStoryToPhone(bearer, p.geelark_id!, { imageResourceUrl: resByImg.get(img.id)!, linkUrl: links[p.id], linkText: st, rotationUrls: rot }, push)
      const already = results.get(p.id)?.ok === true
      results.set(p.id, { name: phoneLabel(p), ok: r.ok || already, error: r.ok ? undefined : r.error })
      hist.set(p.id, { ok: r.ok || already, error: r.ok ? undefined : r.error })
      if (!already) R.tick(r.ok)
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.error } : it))
    }
    const runBatches = async (list: typeof jobs) => {
      for (let b = 0; b < list.length; b += concurrency) {
        if (R.isCancelled()) { push('⏹ Annulé.'); break }
        const batch = list.slice(b, b + concurrency)
        const batchIds = [...new Set(batch.map(j => j.p.geelark_id).filter((x): x is string => !!x))]
        await registerPhoneWatch(batchIds, { orgId: currentOrg?.id ?? null, userId: user.id, stopAt: new Date(Date.now() + 10 * 60_000) })
        await Promise.all(batch.map(postOne))
        await unregisterPhoneWatch(batchIds)
      }
    }
    await runBatches(jobs)
    // Réessai automatique des comptes échoués (2 passes max) → monte le taux de réussite
    // bien au-dessus de 50 %. Une story échouée n'a pas été publiée → pas de doublon.
    for (let attempt = 1; attempt <= 2 && !R.isCancelled(); attempt++) {
      const failed = jobs.filter(j => results.get(j.p.id)?.ok === false)
      if (failed.length === 0) break
      push(`↻ Réessai ${attempt}/2 — ${failed.length} compte(s) échoué(s)…`)
      await runBatches(failed)
    }
    // Comptage final (après réessais) + crédits : on ne rembourse que les comptes
    // DÉFINITIVEMENT échoués.
    const finals = [...results.values()]
    const okN = finals.filter(r => r.ok).length
    const errN = finals.filter(r => !r.ok).length
    // Remboursement : échecs définitifs + comptes jamais lancés (annulation).
    const refundN = jobs.filter(j => results.get(j.p.id)?.ok !== true).length
    for (let i = 0; i < refundN; i++) run.markFailed()
    R.finish()
    const prErr = await hist.finish('annulé')
    if (prErr) push(`⚠ Historique Activité non enregistré : ${prErr}`)
    const { refunded } = await run.settle()
    if (refunded > 0) push(`↩︎ ${refunded} crédits remboursés (comptes échoués).`)
    push('✔ Stories terminées.')
    setRunning(false)
  }

  const inputStyle = FIELD

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead
        title="Publier une Story"
        sub="Une image et un sticker lien propre à chaque compte. 1 crédit par compte."
        actions={<>
          <Btn theme={theme} tone="quiet" label="Retour" onClick={onBack} />
          <Btn theme={theme} tone="ghost" disabled={!ready} icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
            label="Programmer" onClick={() => setSchedOpen(true)} />
          <Btn theme={theme} tone="primary" disabled={!ready} icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z"
            label={running ? 'Publication…' : ready ? `Publier sur ${nLinked}${nMissing > 0 ? ` (${nMissing} sans lien)` : ''}` : 'Publier'} onClick={() => launch()} />
        </>}
      />

      {!bearer && !conns.loading && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: '#111113', border: '1px solid rgba(251,191,36,0.22)', fontSize: 12.5, lineHeight: 1.5, color: '#FBBF24' }}>
          Connecte ton compte GeeLark (token) dans les Réglages de l'app web pour publier.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : '280px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
        {/* Comptes + liens */}
        <Panel theme={theme}>
          <PanelHead title="Comptes & liens" sub={nSel ? `${nLinked}/${nSel} liens · ${nSel} crédit${nSel > 1 ? 's' : ''}` : 'aucun'}
            right={<>
              <Btn theme={theme} sm label="Tout" onClick={() => setSel(s => { const n = new Set(s); shownPhones.forEach(p => n.add(p.id)); return n })} />
              <Btn theme={theme} sm tone="quiet" label="Aucun" onClick={() => setSel(new Set())} />
            </>} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Groupe</span>
            <select value={group} onChange={e => setGroup(e.target.value)} style={{ ...FIELD_SM, width: 'auto', padding: '0 8px', cursor: 'pointer' }}>
              {groups.map(g => <option key={g} value={g} style={{ background: '#161618' }}>{g === 'Tous' ? 'Tous les groupes' : g}</option>)}
            </select>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#71717A', fontVariantNumeric: 'tabular-nums' }}>{shownPhones.length} affichés · {nSel} cochés</span>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {loading ? <SkeletonRows rows={5} avatar />
              : shownPhones.length === 0 ? <Empty icon={PHONE_ICON} title="Aucun compte." text={null} />
              : shownPhones.map(p => {
                const on = sel.has(p.id)
                return (
                  <div key={p.id} style={{ background: on ? 'rgba(255,255,255,0.04)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <button onClick={() => toggle(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 16px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', boxSizing: 'border-box' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: 4, flexShrink: 0, boxSizing: 'border-box', background: on ? theme.accentBtn : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, fontWeight: 600 }}>{on ? '✓' : ''}</span>
                      <StatusDot kind={dotKind(p.status)} />
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: on ? '#EDEDEF' : '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneLabel(p)}</span>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phoneSub(p)}</span>
                      </span>
                    </button>
                    {on && (() => {
                      const missing = !(links[p.id] ?? '').trim()
                      return (
                      <div style={{ padding: '0 16px 10px 41px' }}>
                        <input value={links[p.id] ?? ''} onChange={e => setLink(p, e.target.value)} placeholder="https://lien-du-compte…"
                          style={{ ...inputStyle, border: `1px solid ${missing ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.09)'}` }} />
                        {missing && <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: '#F87171' }}>Lien requis — ce compte sera ignoré</span>}
                      </div>
                      )
                    })()}
                  </div>
                )
              })}
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Image */}
          <Panel theme={theme}>
            <PanelHead title="Images de la story" sub={chosenImgs.length > 1 ? 'Réparties entre les comptes' : chosenImgs.length === 1 ? chosenImgs[0].title : 'choisis une ou plusieurs images'}
              right={<Btn theme={theme} sm tone="ghost" icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" label="Ouvrir la banque" onClick={() => setPicker('images')} />} />
            {chosenImgs.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#71717A', fontSize: 12.5, lineHeight: 1.6 }}>Aucune image choisie.<br />Clique <b style={{ color: '#EDEDEF', fontWeight: 500 }}>Ouvrir la banque</b>.</div>
            ) : (<>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(74px,1fr))', gap: 8, padding: 16, maxHeight: 240, overflowY: 'auto' }}>
                {chosenImgs.map((m, i) => {
                  const prev = thumbFor(m)
                  return (
                    <button key={m.id} onClick={() => setImageIds(ids => ids.filter(x => x !== m.id))} title={`${m.title} — clic pour retirer`} style={{
                      position: 'relative', aspectRatio: '9 / 16', borderRadius: 8, padding: 0, cursor: 'pointer', overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.08)', background: '#161618',
                    }}>
                      {prev && <img src={prev} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                      <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, boxSizing: 'border-box', background: 'rgba(10,10,11,0.72)', border: '1px solid rgba(255,255,255,0.16)', color: '#EDEDEF', fontSize: 11, fontWeight: 600 }}>✕</span>
                    </button>
                  )
                })}
              </div>
              {chosenImgs.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 16px' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>Répartition</span>
                  <Segmented value={imgMode} onChange={setImgMode} options={[{ v: 'seq', l: 'Séquentiel' }, { v: 'random', l: 'Aléatoire' }]} />
                </div>
              )}
            </>)}
          </Panel>

          {/* Textes du sticker (pool) */}
          <Panel theme={theme}>
            <PanelHead title="Texte du sticker lien" sub={stickerTexts.filter(s => s.trim()).length > 1 ? 'Répartis entre les comptes' : "ce qui s'affiche sur le sticker"}
              right={<Btn theme={theme} sm tone="quiet" icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" label="Depuis la banque" onClick={() => setPicker('captions')} />} />
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stickerTexts.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <input value={s} onChange={e => setStickerAt(i, e.target.value)} placeholder="Voir plus" style={inputStyle} />
                  {stickerTexts.length > 1 && <button onClick={() => removeSticker(i)} title="Retirer" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: '#161618', color: '#8B8B94', cursor: 'pointer' }}>✕</button>}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Btn theme={theme} sm tone="quiet" icon="M12 5v14|M5 12h14" label="Ajouter" onClick={() => setStickerTexts(c => [...c, ''])} />
                {stickerTexts.filter(s => s.trim()).length > 1 && (
                  <span style={{ display: 'flex', marginLeft: 'auto' }}>
                    <Segmented value={stMode} onChange={setStMode} options={[{ v: 'seq', l: 'Séquentiel' }, { v: 'random', l: 'Aléatoire' }]} />
                  </span>
                )}
              </div>
            </div>
          </Panel>

          {/* Comportement du run : tout lancer en parallèle OU rotation IP (série) */}
          <Panel theme={theme}>
            <PanelHead title="Comportement du run" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#EDEDEF' }}>Rotation d’IP proxy</span>
                <span style={{ fontSize: 12, color: '#8B8B94' }}>{!rotationConfigured ? 'Aucun proxy — configure dans Paramètres → Proxy & rotation' : rotationOn ? 'IP changée avant chaque compte → envoi en série' : 'Désactivée → tout lancer en même temps (parallèle)'}</span>
              </span>
              <span title={rotationConfigured ? '' : 'Configure d’abord un proxy rotatif dans les Paramètres'} style={{ display: 'flex', flexShrink: 0 }}>
                <Toggle on={rotationOn} disabled={!rotationConfigured} onChange={() => rotationConfigured && setRotationOn(v => !v)} />
              </span>
            </div>
          </Panel>

          {/* Progression + logs */}
          {runItems.length > 0 && (
            <Panel theme={theme}>
              <PanelHead title="Publication en direct" sub={`${runItems.filter(r => r.phase === 'done').length}/${runItems.length} terminés`} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 16px' }}>
                {runItems.map(it => {
                  const c = it.phase === 'done' ? 'ok' : it.phase === 'failed' ? 'bad' : it.phase === 'running' ? 'warn' : 'mute'
                  const m = it.phase === 'done' ? '✓' : it.phase === 'failed' ? '✕' : it.phase === 'running' ? '…' : '·'
                  return <Chip key={it.id} text={`${m} @${it.name}`} tone={c as any} />
                })}
              </div>
              <div style={{ margin: '0 16px 16px', padding: '10px 12px', borderRadius: 6, background: '#0A0A0B', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 220, overflowY: 'auto', fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>
                {logs.length === 0 ? '…' : logs.join('\n')}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {picker && (
        <BankPicker theme={theme} user={user} org={org} kind={picker} multi
          initialIds={picker === 'images' ? imageIds : []}
          title={picker === 'captions' ? 'Choisir des textes de sticker' : 'Choisir des images'}
          onClose={() => setPicker(null)}
          onApply={r => {
            if (r.kind === 'images') { setImageIds(r.ids); reloadImages() }
            else if (r.kind === 'captions') setStickerTexts(cur => { const base = cur.filter(s => s.trim()); return [...base, ...r.texts.filter(t => !base.includes(t))] })
          }} />
      )}

      {schedOpen && (
        <ScheduleModal theme={theme} count={nSel} kind="la story" onClose={() => setSchedOpen(false)}
          onSchedule={(unix) => { setSchedOpen(false); launch(unix) }} />
      )}
    </div>
  )
}
