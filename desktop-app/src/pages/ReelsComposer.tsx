import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import { Btn, Chip, StatusDot, Panel, PanelHead, PageHead, Icon, Modal } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { useBankThumbs, phoneLabel, phoneSub, fetchBalance, fetchOrgBalance } from '@/lib/data'
import { deriveHealth } from '@/lib/health'
import { useConnections } from '@/lib/connections'
import { geelarkUploadVideo, geelarkUploadImageData, postReelToPhone, scheduleReelOnPhone, startPhones } from '@/lib/geelark'
import { startCreditRun, isCreditError, CREDIT_COSTS } from '@/lib/credits'
import BankPicker, { type PickerKind } from '@/components/BankPicker'
import { generateCaption } from '@/lib/ai'
import { startRun, cancelRun } from '@/lib/runStore'
import { loadProxyRotation, resolveRotationUrls } from '@/lib/proxyRotation'
import { registerPhoneWatch, unregisterPhoneWatch } from '@/lib/phoneWatch'
import { recordGeelarkSchedule } from '@/lib/scheduling'
import { loadPresets, savePreset, deletePreset, type ComposerPreset } from '@/lib/composerPrefs'

// Valeur datetime-local (fuseau LOCAL) décalée de `plusMin` minutes par rapport à maintenant.
function schedLocalValue(plusMin: number): string {
  const d = new Date(Date.now() + plusMin * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const defaultSchedVal = () => schedLocalValue(60)   // par défaut : dans 1h

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
  const [vidMode, setVidMode] = useState<'seq' | 'random'>('random')  // répartition vidéo → compte (aléatoire par défaut)
  const [autoRemove, setAutoRemove] = useState(true)               // usage unique
  const [reelsTrial, setReelsTrial] = useState(false)              // essai Reels
  const [schedOpen, setSchedOpen] = useState(false)                // modale de programmation
  const [schedVal, setSchedVal] = useState('')                     // valeur datetime-local
  // Miniature (couverture) PAR vidéo = une FRAME de la vidéo, capturée avant de poster.
  // covers[videoId] = data URL JPEG de la frame choisie.
  const [coverPickerFor, setCoverPickerFor] = useState<{ id: string; url: string } | null>(null)
  const [covers, setCovers] = useState<Record<string, string>>({})

  const [running, setRunning] = useState(false)
  const [runItems, setRunItems] = useState<RunItem[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [picker, setPicker] = useState<PickerKind | null>(null)
  const [genning, setGenning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [rotationConfigured, setRotationConfigured] = useState(false) // proxy rotatif dispo (Paramètres)
  const [rotationOn, setRotationOn] = useState(false)                 // activé POUR CE RUN (togglable)
  const [simulPhones, setSimulPhones] = useState<'all' | number>('all')  // téléphones simultanés

  // ── Presets & mémorisation des réglages ───────────────────────────────────
  // Config complète mémorisée (dernier réglage auto-restauré + presets nommés),
  // pour ne plus refaire les réglages ni recoller les captions à chaque fois.
  type ReelsCfg = {
    captions: string[]; capMode: 'seq' | 'random'; vidMode: 'seq' | 'random'
    autoRemove: boolean; reelsTrial: boolean; simulPhones: 'all' | number
    rotationOn: boolean; group: string; healthy: boolean
  }
  const COMPOSER = 'reels'
  const orgId = currentOrg?.id ?? null
  const [presets, setPresets] = useState<ComposerPreset<ReelsCfg>[]>([])
  const [presetSel, setPresetSel] = useState('')

  const currentCfg = (): ReelsCfg => ({ captions, capMode, vidMode, autoRemove, reelsTrial, simulPhones, rotationOn, group, healthy })
  const applyCfg = (c: Partial<ReelsCfg>, rotOk: boolean) => {
    if (c.captions && c.captions.length) setCaptions(c.captions); else if (c.captions) setCaptions([''])
    if (c.capMode) setCapMode(c.capMode)
    if (c.vidMode) setVidMode(c.vidMode)
    if (typeof c.autoRemove === 'boolean') setAutoRemove(c.autoRemove)
    if (typeof c.reelsTrial === 'boolean') setReelsTrial(c.reelsTrial)
    if (c.simulPhones !== undefined) setSimulPhones(c.simulPhones)
    if (typeof c.group === 'string') setGroup(c.group)
    if (typeof c.healthy === 'boolean') setHealthy(c.healthy)
    setRotationOn(rotOk && !!c.rotationOn)  // rotation seulement si un proxy est configuré
  }

  // Charge la config proxy/rotation (dispo ou non) — sans activer la rotation par défaut.
  useEffect(() => {
    loadProxyRotation(currentOrg?.id ?? null, user.id).then(c => {
      const ok = c.enabled && c.urls.some(u => /^https?:\/\//i.test(u.trim()))
      setRotationConfigured(ok); setRotationOn(false)
    })
  }, [currentOrg?.id, user.id])

  // Charge la LISTE des presets nommés (aucune restauration automatique de réglages).
  useEffect(() => { setPresets(loadPresets<ReelsCfg>(COMPOSER, orgId)) }, [orgId])

  const doSavePreset = () => {
    const name = window.prompt('Nom du preset (réglages + captions) :', presetSel || '')
    if (!name || !name.trim()) return
    setPresets(savePreset<ReelsCfg>(COMPOSER, orgId, name, currentCfg()))
    setPresetSel(name.trim())
  }
  const doLoadPreset = (name: string) => {
    const p = presets.find(x => x.name === name)
    if (p) { applyCfg(p.config, rotationConfigured); setPresetSel(name) }
  }
  const doDeletePreset = () => {
    if (!presetSel) return
    if (!window.confirm(`Supprimer le preset « ${presetSel} » ?`)) return
    setPresets(deletePreset<ReelsCfg>(COMPOSER, orgId, presetSel)); setPresetSel('')
  }

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
    const [phRes, vRes, bal] = await Promise.all([
      scope(supabase.from('phones').select('id,ig_username,phone_name,status,group_name,geelark_id,ig_status,last_post_at,account_state')).not('geelark_id', 'is', null).order('phone_name'),
      scope(supabase.from('content_bank').select('*')).order('created_at', { ascending: false }),
      // Solde fiable (RPC SECURITY DEFINER côté perso → contourne la RLS de user_credits).
      currentOrg ? fetchOrgBalance(currentOrg.id, currentOrg.owner_id) : fetchBalance(user.id),
    ])
    setPhones((phRes.data ?? []) as Phone[])
    const all = ((vRes.data ?? []) as Video[]).filter(v => !(SENTINELS.includes(v.notes ?? '') && !v.storage_path && !v.file_url))
    const vids = all.filter(isVideo)
    setVideos(vids.length > 0 ? vids : all)
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

  async function launch(scheduledUnix?: number) {
    if (!canLaunch) return
    const targets = phones.filter(p => sel.has(p.id) && p.geelark_id)
    const chosenVids = videos.filter(v => vidSel.has(v.id))
    if (targets.length === 0 || chosenVids.length === 0) return
    setRunning(true); setLogs([])
    setRunItems(targets.map(p => ({ id: p.id, name: phoneLabel(p), phase: 'pending' as Phase })))
    const push = (m: string) => setLogs(l => [...l.slice(-300), m])
    await loadProxyRotation(currentOrg?.id ?? null, user.id)
    // Proxy rotatif utilisé seulement si CONFIGURÉ et ACTIVÉ pour ce run.
    const rotU = resolveRotationUrls(); const rot = (rotationOn && rotU.length) ? rotU : undefined
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

    // 2b) Miniatures PAR vidéo (frame capturée) → chacune hébergée une fois via base64.
    const coverByVid = new Map<string, string>()
    for (const v of distinct) {
      const dataUrl = covers[v.id]; if (!dataUrl) continue
      const b64 = dataUrl.split(',')[1] || ''
      if (b64) { const cru = await geelarkUploadImageData(bearer, b64, push); if (cru) { coverByVid.set(v.id, cru); push(`🖼 Miniature hébergée (${v.title}).`) } }
    }

    // 3) Poste : chaque téléphone reçoit SA vidéo assignée.
    //    Sans proxy rotatif → tous les téléphones EN PARALLÈLE (rapide).
    //    Avec proxy rotatif → en série (1 IP à la fois, l'IP change avant chaque tel).
    // Vidéos RÉELLEMENT publiées (post OK sur ≥ 1 téléphone) → seules celles-ci
    // sont retirées en « usage unique ». Une vidéo dont le post échoue est CONSERVÉE.
    const postedVidIds = new Set<string>()
    const jobs = targets.map((p, k) => ({
      p, v: assignment[k],
      cap: caps.length === 0 ? '' : capMode === 'random' ? caps[Math.floor(Math.random() * caps.length)] : caps[k % caps.length],
    }))

    // ── PROGRAMMATION (PC éteint) : on crée les tâches RPA GeeLark avec un scheduleAt
    // FUTUR. GeeLark démarre les téléphones et poste à l'heure prévue, dans son cloud —
    // pas besoin de serveur ni de PC allumé. On ne boote/poll/éteint donc rien ici.
    if (scheduledUnix) {
      push(`🗓 Programmation pour le ${new Date(scheduledUnix * 1000).toLocaleString('fr-FR')} (GeeLark, PC éteint)…`)
      let okN = 0, errN = 0
      const schedTaskIds: string[] = []; const schedPhones: { geelark_id: string; name: string }[] = []
      for (const { p, v, cap } of jobs) {
        const ru = resourceByVid.get(v.id)
        if (!ru) { run.markFailed(); errN++; setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'failed', detail: 'vidéo non hébergée' } : it)); continue }
        const r = await scheduleReelOnPhone(bearer, p.geelark_id!, ru, cap, scheduledUnix, push, reelsTrial, coverByVid.get(v.id))
        if (r.ok) { okN++; postedVidIds.add(v.id); if (r.taskId) schedTaskIds.push(r.taskId); schedPhones.push({ geelark_id: p.geelark_id!, name: phoneLabel(p) }) } else { run.markFailed(); errN++ }
        setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.ok ? 'programmé ✓' : r.error } : it))
      }
      R.finish(); setRunId(null)
      const { refunded } = await run.settle()
      if (refunded > 0) push(`↩︎ ${refunded} crédits remboursés (échecs de programmation).`)
      if (okN > 0) await recordGeelarkSchedule({ userId: user.id, orgId: currentOrg?.id ?? null, ownerId, type: 'mass_posting', scheduledAtUnix: scheduledUnix, phones: schedPhones, taskIds: schedTaskIds, caption: caps[0], trial: reelsTrial, platform: 'instagram', creditsTotal: okN * CREDIT_COSTS.mass_posting })
      // Usage unique : NE PAS supprimer les vidéos ici — elles seront postées plus tard.
      push(okN > 0 ? `✅ ${okN} post(s) programmé(s). Visibles dans « Programmé ». Ils partiront tout seuls, PC éteint.` : '❌ Aucune programmation créée.')
      setRunning(false); load()
      return
    }

    const concurrency = rot ? 1 : (simulPhones === 'all' ? jobs.length : Math.max(1, Number(simulPhones)))
    push(rot ? '🔁 Envoi en série (proxy rotatif).' : concurrency >= jobs.length ? `⚡ ${jobs.length} téléphone(s) en parallèle.` : `⚡ Par lots de ${concurrency} téléphone(s).`)

    // Sans proxy rotatif, on démarre le lot en UN SEUL appel /phone/start groupé
    // (comme l'ancienne app) au lieu de N démarrages simultanés que GeeLark refuse
    // en partie → chaque post saute alors son démarrage individuel (skipStart).
    let okN = 0, errN = 0
    // Détail par compte pour l'historique (page Activité) : qui a posté, qui a échoué.
    const results = new Map<string, { name: string; ok: boolean; error?: string }>()
    const postOne = async ({ p, v, cap }: (typeof jobs)[number], skipStart: boolean) => {
      const ru = resourceByVid.get(v.id)
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'running' } : it))
      if (!ru) { run.markFailed(); errN++; R.tick(false); results.set(p.id, { name: phoneLabel(p), ok: false, error: 'vidéo non hébergée' }); setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: 'failed', detail: 'vidéo non hébergée' } : it)); return }
      push(`— ${phoneLabel(p)} · ${v.title}${cap ? ' · légende' : ''} —`)
      const r = await postReelToPhone(bearer, p.geelark_id!, ru, cap, push, rot, reelsTrial, coverByVid.get(v.id), skipStart)
      if (r.ok) { postedVidIds.add(v.id); okN++ } else { run.markFailed(); errN++ }
      results.set(p.id, { name: phoneLabel(p), ok: r.ok, error: r.ok ? undefined : r.error })
      R.tick(r.ok)
      setRunItems(items => items.map(it => it.id === p.id ? { ...it, phase: r.ok ? 'done' : 'failed', detail: r.error } : it))
    }

    for (let b = 0; b < jobs.length; b += concurrency) {
      if (R.isCancelled()) { push('⏹ Annulé.'); break }
      const batch = jobs.slice(b, b + concurrency)
      const batchIds = [...new Set(batch.map(j => j.p.geelark_id).filter((x): x is string => !!x))]
      // Filet anti-coût : si l'onglet se ferme en plein run, le watchdog serveur éteint
      // ces téléphones après stop_at (30 min) — sinon ils restent allumés indéfiniment.
      await registerPhoneWatch(batchIds, { orgId: currentOrg?.id ?? null, userId: user.id, stopAt: new Date(Date.now() + 30 * 60_000) })
      // Sans proxy rotatif : démarrage GROUPÉ du lot en UN appel /phone/start (comme
      // l'ancienne app) au lieu de N démarrages simultanés que GeeLark refuse en partie.
      // → chaque post saute son démarrage individuel (skipStart). Si le groupé plante,
      // on retombe sur le démarrage par téléphone.
      let batchSkip = false
      if (!rot) {
        push(`📱 Démarrage groupé de ${batchIds.length} téléphone(s)…`)
        try {
          const n = await startPhones(bearer, batchIds)
          batchSkip = true
          if (n < batchIds.length) push(`  ⚠ ${batchIds.length - n} téléphone(s) non démarré(s) — limite GeeLark de téléphones simultanés ? Baisse « Téléphones simultanés ».`)
        } catch (e) { push(`  ⚠ Démarrage groupé : ${e instanceof Error ? e.message : 'échec'} — chaque tel démarrera seul.`) }
      }
      await Promise.all(batch.map(j => postOne(j, batchSkip)))
      // Lot terminé (tels déjà éteints par postReelToPhone) → on retire du watchdog.
      await unregisterPhoneWatch(batchIds)
    }
    R.finish()
    // Historique (page Activité) + compteur : on enregistre TOUJOURS le run. On AWAIT
    // et on log l'échec éventuel (avant, fire-and-forget → des runs manquaient en silence).
    if (jobs.length > 0) {
      const { error: prErr } = await supabase.from('post_runs').insert({
        user_id: user.id, org_id: currentOrg?.id ?? null,
        type: 'mass_posting', ok_count: okN, err_count: errN, total: jobs.length,
        details: [...results.values()],
      })
      if (prErr) push(`⚠ Historique Activité non enregistré : ${prErr.message}`)
    }
    setRunId(null)
    const { refunded } = await run.settle()
    if (refunded > 0) push(`↩︎ ${refunded} crédits remboursés (comptes échoués).`)

    // Usage unique : retire de la banque UNIQUEMENT les vidéos réellement publiées
    // (les échecs restent dans la banque pour pouvoir relancer).
    if (autoRemove && postedVidIds.size > 0) {
      const ids = [...postedVidIds]
      const objs = distinct.filter(v => postedVidIds.has(v.id)).map(v => v.storage_path).filter(Boolean) as string[]
      try {
        await supabase.from('content_bank').delete().in('id', ids)
        if (objs.length) await supabase.storage.from('content').remove(objs)
        push(`🗑 ${ids.length} vidéo(s) retirée(s) de la banque (usage unique).`)
      } catch { push('⚠ Retrait des vidéos (usage unique) échoué — à faire manuellement.') }
    } else if (!autoRemove && postedVidIds.size > 0) {
      // Usage unique désactivé → on garde les vidéos mais on incrémente leur compteur
      // de publications (pour « Jamais publiées » / tri « Moins publiées » dans la banque).
      try {
        const ids = [...postedVidIds]
        const { data: rows } = await supabase.from('content_bank').select('id,used_count').in('id', ids)
        await Promise.all((rows ?? []).map((r: { id: string; used_count: number | null }) =>
          supabase.from('content_bank').update({ used_count: (r.used_count ?? 0) + 1 }).eq('id', r.id)))
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

      {/* ── Barre de presets (réglages + captions mémorisés) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 12px', padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#52525B' }}>Presets</span>
        <select value={presetSel} onChange={e => { const v = e.target.value; if (v) doLoadPreset(v); else setPresetSel('') }}
          style={{ height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.09)', background: '#101015', color: '#E4E4E7', fontSize: 12, fontWeight: 600, outline: 'none', minWidth: 170, cursor: 'pointer' }}>
          <option value="" style={{ background: '#16161C' }}>{presets.length ? '— Charger un preset —' : 'Aucun preset enregistré'}</option>
          {presets.map(p => <option key={p.name} value={p.name} style={{ background: '#16161C' }}>{p.name}</option>)}
        </select>
        <Btn theme={theme} sm tone="primary" icon="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z|M17 21v-8H7v8|M7 3v5h8" label="Enregistrer" onClick={doSavePreset} />
        {presetSel && <Btn theme={theme} sm tone="quiet" icon="M3 6h18|M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" label="Supprimer" onClick={doDeletePreset} />}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#52525B' }}>Tes réglages sont mémorisés automatiquement</span>
      </div>

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
                    {/* Miniature par vidéo = une FRAME de la vidéo. Clic → sélecteur d'image (n'active pas le toggle). */}
                    <span role="button" title={covers[v.id] ? 'Miniature choisie — cliquer pour changer' : 'Choisir la miniature (image de la vidéo)'}
                      onClick={async e => { e.stopPropagation(); const url = await resolveVideoUrl(v); setCoverPickerFor({ id: v.id, url: url ?? '' }) }}
                      style={{ position: 'absolute', bottom: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, overflow: 'hidden', backgroundColor: covers[v.id] ? theme.accentBtn : 'rgba(11,11,15,0.72)', backgroundImage: covers[v.id] ? `url(${covers[v.id]})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', border: covers[v.id] ? `1px solid ${theme.accentBtnEdge}` : '1px solid rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer' }}>
                      {!covers[v.id] && <Icon d="M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" size={11} />}
                    </span>
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
            {/* Proxy rotatif — togglable pour CE run (si configuré dans Paramètres) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#E4E4E7' }}>Proxy rotatif</span>
                <span style={{ fontSize: 11, color: '#52525B' }}>{!rotationConfigured ? 'Aucun proxy — configure dans Paramètres → Proxy & rotation' : rotationOn ? 'IP changée avant chaque téléphone → envoi en série' : 'Désactivé pour ce run → envoi en parallèle'}</span>
              </span>
              <span onClick={() => rotationConfigured && setRotationOn(v => !v)}
                title={rotationConfigured ? '' : 'Configure d’abord un proxy rotatif dans les Paramètres'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: rotationOn ? 'flex-end' : 'flex-start', width: 40, height: 23, padding: 2, borderRadius: 99, flexShrink: 0, cursor: rotationConfigured ? 'pointer' : 'not-allowed', opacity: rotationConfigured ? 1 : 0.4, background: rotationOn ? theme.accentBtn : 'rgba(255,255,255,0.12)', transition: 'background .15s ease' }}>
                <span style={{ width: 19, height: 19, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
              </span>
            </div>
            {/* Téléphones simultanés (ignoré si proxy rotatif → série) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: rotationOn ? 0.5 : 1 }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#E4E4E7' }}>Téléphones simultanés</span>
                <span style={{ fontSize: 11, color: '#52525B' }}>{rotationOn ? 'Forcé à 1 (proxy rotatif)' : 'Combien postent en même temps'}</span>
              </span>
              <select value={rotationOn ? '1' : String(simulPhones)} disabled={rotationOn}
                onChange={e => setSimulPhones(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{ height: 30, padding: '0 8px', borderRadius: 8, cursor: rotationOn ? 'default' : 'pointer', border: '1px solid rgba(255,255,255,0.09)', background: '#101015', color: '#E4E4E7', fontSize: 11.5, fontWeight: 700, outline: 'none' }}>
                {rotationOn ? <option value="1" style={{ background: '#16161C' }}>1 (série)</option> : <>
                  <option value="all" style={{ background: '#16161C' }}>Tous</option>
                  {[1, 2, 3, 5, 10].map(n => <option key={n} value={n} style={{ background: '#16161C' }}>{n}</option>)}
                </>}
              </select>
            </div>
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
            <RunToggle label="Essai Reels" hint="Publie en mode essai (visible non-abonnés)" on={reelsTrial} onToggle={() => setReelsTrial(v => !v)} theme={theme} border />
            {/* Miniatures par vidéo (définies à l'étape Vidéos) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px' }}>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#E4E4E7' }}>Miniatures (couverture)</span>
                <span style={{ fontSize: 11, color: '#52525B' }}>{Object.keys(covers).length > 0 ? `${Object.keys(covers).length} vidéo(s) avec miniature — modifiable à l’étape Vidéos` : 'Optionnel — choisis une miniature par vidéo à l’étape Vidéos (icône 🖼)'}</span>
              </span>
            </div>
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
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Btn theme={theme} tone="primary" disabled={!canLaunch} icon="M22 2L11 13|M22 2l-7 20-4-9-9-4 20-7z"
                  label={running ? 'Publication…' : nSel === 0 ? 'Sélectionne des comptes' : nVid === 0 ? 'Choisis une vidéo' : `Lancer sur ${nSel} comptes`} onClick={() => launch()} />
                <Btn theme={theme} tone="quiet" disabled={!canLaunch} icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"
                  label="Programmer (PC éteint)" onClick={() => { setSchedVal(defaultSchedVal()); setSchedOpen(true) }} />
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

      {coverPickerFor && (
        <CoverFramePicker theme={theme} videoUrl={coverPickerFor.url}
          onClose={() => setCoverPickerFor(null)}
          onPick={(dataUrl) => { const id = coverPickerFor.id; setCovers(prev => ({ ...prev, [id]: dataUrl })); setCoverPickerFor(null) }} />
      )}

      {schedOpen && (
        <Modal theme={theme} title="Programmer la publication" sub="GeeLark postera à l'heure choisie, dans son cloud — PC et ScaleFlow éteints."
          icon="M8 2v4M16 2v4|M3 10h18|M5 21h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" onClose={() => setSchedOpen(false)} width={430}
          footer={<>
            <Btn theme={theme} tone="quiet" label="Annuler" onClick={() => setSchedOpen(false)} />
            <Btn theme={theme} tone="primary" label={`Programmer sur ${nSel} compte${nSel > 1 ? 's' : ''}`} disabled={!schedVal}
              onClick={() => {
                const ms = new Date(schedVal).getTime()
                if (!isFinite(ms) || ms < Date.now() + 60_000) { alert('Choisis une heure future (au moins +1 min).'); return }
                if (ms > Date.now() + 29 * 86_400_000) { alert('Max ~29 jours : les vidéos hébergées chez GeeLark expirent après 30 jours.'); return }
                setSchedOpen(false); launch(Math.floor(ms / 1000))
              }} />
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#71717A' }}>Date et heure</label>
            <input type="datetime-local" value={schedVal} min={schedLocalValue(1)} max={schedLocalValue(29 * 24 * 60)}
              onChange={e => setSchedVal(e.target.value)}
              style={{ height: 40, padding: '0 12px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: '#F4F4F6', fontSize: 13, outline: 'none', colorScheme: 'dark' }} />
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: '#71717A' }}>
              La tâche est créée <b>maintenant</b> sur GeeLark (vidéos hébergées + crédits débités) et s'exécutera <b>toute seule</b> à l'heure prévue. Tu peux la voir/annuler dans les <b>Task Logs</b> de GeeLark. Max ~29 jours (au-delà, l'hébergement vidéo GeeLark expire).
              {reelsTrial ? ' Mode essai activé.' : ''}
            </p>
          </div>
        </Modal>
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

// Sélecteur de miniature = une FRAME de la vidéo. On charge la vidéo en blob (même
// origine → pas de canvas « tainted »), on scrube au curseur, puis on capture l'image
// courante dans un canvas → JPEG (data URL) renvoyé comme couverture.
function CoverFramePicker({ theme, videoUrl, onClose, onPick }: {
  theme: Theme; videoUrl: string; onClose: () => void; onPick: (dataUrl: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [dur, setDur] = useState(0)
  const [t, setT] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!videoUrl) { setErr('Vidéo indisponible.'); return }
    let obj: string | null = null, alive = true
    fetch(videoUrl).then(r => r.blob()).then(b => { if (!alive) return; obj = URL.createObjectURL(b); setSrc(obj) })
      .catch(() => { if (alive) setErr('Impossible de charger la vidéo.') })
    return () => { alive = false; if (obj) URL.revokeObjectURL(obj) }
  }, [videoUrl])

  const seek = (nt: number) => { setT(nt); const v = videoRef.current; if (v) v.currentTime = nt }
  const capture = () => {
    const v = videoRef.current; if (!v) return
    try {
      const c = document.createElement('canvas')
      c.width = v.videoWidth || 720; c.height = v.videoHeight || 1280
      const ctx = c.getContext('2d'); if (!ctx) return
      ctx.drawImage(v, 0, 0, c.width, c.height)
      onPick(c.toDataURL('image/jpeg', 0.9))
    } catch { setErr('Capture impossible (vidéo protégée).') }
  }

  return (
    <Modal theme={theme} title="Choisir la miniature" sub="Déplace le curseur sur l'image de la vidéo à utiliser en couverture"
      icon="M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" onClose={onClose} width={420}
      footer={<>
        <Btn theme={theme} tone="quiet" label="Annuler" onClick={onClose} />
        <Btn theme={theme} tone="primary" label="Utiliser cette image" disabled={!ready} onClick={capture} />
      </>}>
      {err ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: '#F87171' }}>{err}</div>
        : !src ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: '#71717A' }}>Chargement de la vidéo…</div>
        : (
          <div>
            <video ref={videoRef} src={src} preload="metadata" playsInline muted
              onLoadedMetadata={e => { setDur(e.currentTarget.duration || 0); setReady(true) }}
              style={{ width: '100%', maxHeight: 360, borderRadius: 10, background: '#000', objectFit: 'contain' }} />
            <input type="range" min={0} max={dur || 0} step={0.05} value={t}
              onChange={e => seek(Number(e.target.value))}
              style={{ width: '100%', marginTop: 12, accentColor: `rgb(${theme.tone})`, cursor: 'pointer' }} />
            <div style={{ textAlign: 'center', fontSize: 11.5, color: '#71717A', fontFamily: "'JetBrains Mono',monospace" }}>{t.toFixed(1)}s / {dur.toFixed(1)}s</div>
          </div>
        )}
    </Modal>
  )
}
