// Espace de travail d'un outil du Studio : sources (glisser-déposer, Banque, PC), aperçu en
// direct, réglages + lancement (progression globale, annulation), résultats. Les traitements
// tournent sur l'ordinateur (ffmpeg.wasm) ; chaque sortie est enregistrée dans la Banque.
import { usePartnerSend, PartnerSendSelect } from '@/components/PartnerSendSelect'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import { useBankThumbs } from '@/lib/data'
import { fetchAllRows, uploadThumbFor } from '@/lib/bankStorage'
import { openTool as openToolPage } from '@/lib/openTool'
import { Icon, FIELD, TEXTAREA, Segmented, toast, useNarrow } from '@/lib/ui'
import { useConnections } from '@/lib/connections'
import BankPicker, { type PickerResult } from '@/components/BankPicker'
import { Bento, Label, DropZone, MediaTile, ProgressBar, FieldRow, SwitchRow, ChoiceCards, RunLog } from '@/components/Kit'
import { Preview, type StudioToolId } from '@/components/studio/Preview'
import type { StudioResult } from '@/components/studio/Results'
import {
  resolveSourceBytes, saveOutputToBank, GPS_CITIES, gpsFor, SPOOF_DEVICES,
  runSpoof, runRemix, runMontage, runConcat, runOverlay, runCaption, runSubtitles, runImageSpoof,
  captionLines, captionFor, type RemixToggles, type CaptionStyle,
} from '@/lib/studioTools'
import type { RemixIntensity } from '@/lib/studioFilters'
import { getFFmpeg, isFfmpegReady } from '@/lib/ffmpeg'
import { startRun, cancelRun } from '@/lib/runStore'

export interface BankItem { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null; notes: string | null; folder: string | null; deleted_at?: string | null }
const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
export const isVid = (v: { storage_path: string | null; file_url: string | null }) => !IMG_EXT.includes((v.storage_path ?? v.file_url ?? '').toLowerCase().split('.').pop() ?? '')
const fmtDur = (s?: number) => s && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : undefined
const POS9: [number, number][] = [[18, 14], [50, 14], [82, 14], [18, 50], [50, 50], [82, 50], [18, 84], [50, 84], [82, 84]]
const INTENSITY = [
  { v: 'subtle' as const, l: 'Légère', d: 'Presque invisible' },
  { v: 'normal' as const, l: 'Normale', d: 'Recommandé' },
  { v: 'strong' as const, l: 'Forte', d: 'Plus de différence' },
]

function Stepper({ value, onChange, min = 1, max = 24 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const b = (d: number, icon: string) => (
    <button type="button" onClick={() => onChange(Math.min(max, Math.max(min, value + d)))} disabled={d < 0 ? value <= min : value >= max}
      style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#E4E4E7', cursor: 'pointer', opacity: (d < 0 ? value <= min : value >= max) ? 0.3 : 1 }}><Icon d={icon} size={14} sw={2.2} /></button>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 11, border: '1px solid rgba(255,255,255,0.1)', background: '#141416' }}>
      {b(-1, 'M5 12h14')}
      <input type="number" min={min} max={max} value={value} onChange={e => { const n = Math.round(Number(e.target.value)); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))) }}
        style={{ width: 44, height: 34, border: 'none', background: 'transparent', color: '#F4F4F5', textAlign: 'center', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
      {b(1, 'M12 5v14|M5 12h14')}
    </span>
  )
}
const SELECT: React.CSSProperties = { ...FIELD, cursor: 'pointer', width: '100%' }

export function Workspace({ theme, user, org, tool, label, desc, icon, a, b, onNavigate, initialIds, addResult }: {
  theme: Theme; user: User; org: OrgState; tool: StudioToolId; label: string; desc: string; icon: string; a: string; b: string
  onNavigate?: (p: string) => void; initialIds?: string[]; addResult: (r: StudioResult) => void
}) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const narrow = useNarrow(1100)
  const imgTool = tool === 'imgspoof'
  const [items, setItems] = useState<BankItem[]>([])
  const [src, setSrc] = useState<string[]>(initialIds ?? [])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [signed, setSigned] = useState<Record<string, string>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  const [picker, setPicker] = useState<'src' | 'ov' | null>(null)
  const dragIdx = useRef<number | null>(null)
  const { thumbFor } = useBankThumbs(items)

  // ── Réglages ──
  const [copies, setCopies] = useState(3)
  const [intensity, setIntensity] = useState<RemixIntensity>('normal')
  const [toggles, setToggles] = useState<RemixToggles>({ color: true, speed: true, crop: true, mirror: false })
  const [gpsCity, setGpsCity] = useState('none')
  const [device, setDevice] = useState('none')
  const [destFolder, setDestFolder] = useState('')
  const ps = usePartnerSend(currentOrg?.id ?? null, 'sf-partner-send-studio')   // envoi direct au site partenaire
  const [mMode, setMMode] = useState<'cut' | 'join'>('cut')
  const [trim, setTrim] = useState<{ start: number; end: number | null }>({ start: 0, end: null })
  const [ovImgs, setOvImgs] = useState<{ id: string; title: string; storage_path: string | null; file_url: string | null }[]>([])
  const [ovMode, setOvMode] = useState<'seq' | 'random'>('seq')
  const [ov, setOv] = useState({ x: 50, y: 50, size: 40 })
  const [ovWhen, setOvWhen] = useState<'all' | 'range'>('all')
  const [ovFrom, setOvFrom] = useState(0)
  const [ovTo, setOvTo] = useState(3)
  const [capText, setCapText] = useState('')
  const [capMode, setCapMode] = useState<'seq' | 'random'>('seq')
  const [capStyle, setCapStyle] = useState<CaptionStyle>('outline')
  const [cap, setCap] = useState({ x: 50, y: 82 })
  const [subsUnique, setSubsUnique] = useState(true)

  // ── Exécution ──
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const runId = useRef<string | null>(null)
  const push = (m: string) => setLogs(l => [...l.slice(-200), m])

  const load = useCallback(async () => {
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null) // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = await fetchAllRows<BankItem>(() => scope(supabase.from('content_bank').select('*')).order('created_at', { ascending: false }).order('id'))
    // Ni dossiers « sentinelles », ni éléments de la corbeille.
    setItems(((data ?? []) as BankItem[]).filter(v => !v.deleted_at && !(SENTINELS.includes(v.notes ?? '') && !v.storage_path && !v.file_url)))
  }, [currentOrg?.id, user.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [load])

  // Changement d'outil : on garde les sources si elles restent compatibles (vidéo ↔ vidéo).
  const kindOk = useCallback((v: BankItem) => imgTool ? !isVid(v) : isVid(v), [imgTool])
  useEffect(() => { setSrc(s => s.filter(id => { const v = items.find(x => x.id === id); return !v || kindOk(v) })) }, [tool, items, kindOk])
  const chosen = useMemo(() => src.map(id => items.find(v => v.id === id)).filter((v): v is BankItem => !!v && kindOk(v)), [src, items, kindOk])
  useEffect(() => { if (!previewId || !chosen.some(v => v.id === previewId)) setPreviewId(chosen[0]?.id ?? null) }, [chosen, previewId])

  // URL signées (aperçu + vignettes vidéo) des sources choisies et de la photo à incruster.
  useEffect(() => {
    const paths = [...chosen, ...ovImgs.slice(0, 1)].map(v => v.storage_path).filter((p): p is string => !!p && !signed[p])
    if (!paths.length) return
    let alive = true
    void supabase.storage.from('content').createSignedUrls([...new Set(paths)], 3600).then(({ data }) => {
      if (alive && data) setSigned(m => { const n = { ...m }; data.forEach(d => { if (d.path && d.signedUrl) n[d.path] = d.signedUrl }); return n })
    })
    return () => { alive = false }
  }, [chosen, ovImgs]) // eslint-disable-line react-hooks/exhaustive-deps
  const mediaUrl = (v?: { storage_path: string | null; file_url: string | null } | null) => v ? (v.storage_path ? signed[v.storage_path] ?? null : v.file_url) : null
  // Durées des vidéos choisies (métadonnées du navigateur, sans ffmpeg).
  useEffect(() => {
    if (imgTool) return
    const els: HTMLVideoElement[] = []
    for (const v of chosen) {
      const u = mediaUrl(v); if (!u || durations[v.id]) continue
      const el = document.createElement('video'); el.preload = 'metadata'; el.muted = true; el.src = u
      el.onloadedmetadata = () => setDurations(d => ({ ...d, [v.id]: el.duration || 0 }))
      els.push(el)
    }
    return () => { els.forEach(el => { el.onloadedmetadata = null; el.removeAttribute('src') }) }
  }, [chosen, signed, imgTool]) // eslint-disable-line react-hooks/exhaustive-deps

  // Import « Mon PC » / glisser-déposer : envoi dans la Banque PUIS sélection automatique.
  async function importFiles(files: File[]) {
    const list = files.filter(f => imgTool ? f.type.startsWith('image') : f.type.startsWith('video'))
    if (!list.length) { toast(imgTool ? 'Choisis des photos (.jpg, .png…).' : 'Choisis des vidéos (.mp4, .mov…).', 'bad'); return }
    const scopeFolder = currentOrg ? `orgs/${currentOrg.id}` : `users/${user.id}`
    const added: string[] = []
    let n = 0
    for (const file of list) {
      setUploading(`Envoi ${++n}/${list.length} · ${file.name}`)
      try {
        const ext = (file.name.split('.').pop() ?? '').toLowerCase() || (file.type.startsWith('image') ? 'jpg' : 'mp4')
        const storagePath = `videos/${scopeFolder}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('content').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
        if (up.error) { toast(`Envoi impossible : ${file.name}`, 'bad'); continue }
        const th = file.type.startsWith('image') ? { thumbPath: null, duration: null } : await uploadThumbFor(file, storagePath)
        const { data } = await supabase.from('content_bank').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null, title: file.name.replace(/\.[a-z0-9]+$/i, ''), storage_path: storagePath,
          thumbnail_path: th.thumbPath, file_url: null, folder: null, duration: th.duration, tags: [], notes: null, used_count: 0,
        }).select('id').maybeSingle()
        if (data?.id) added.push(data.id as string)
      } catch { toast(`Envoi impossible : ${file.name}`, 'bad') }
    }
    setUploading(null)
    await load()
    if (added.length) { setSrc(s => [...s, ...added.filter(id => !s.includes(id))]); toast(`${added.length} fichier(s) ajouté(s).`, 'ok') }
  }

  // ── Ce qui bloque le lancement (affiché en clair sous le bouton) ──
  const lines = captionLines(capText)
  const perOut = tool === 'remix' || tool === 'spoof' || imgTool ? copies : 1
  const outCount = tool === 'montage' && mMode === 'join' ? (chosen.length >= 2 ? 1 : 0) : chosen.length * perOut
  const blocker: { msg: string; action?: { l: string; go: () => void } } | null =
    !chosen.length ? { msg: imgTool ? 'Ajoute au moins une photo.' : 'Ajoute au moins une vidéo.' }
    : tool === 'montage' && mMode === 'join' && chosen.length < 2 ? { msg: 'Choisis au moins 2 vidéos à assembler.' }
    : tool === 'overlay' && !ovImgs.length ? { msg: 'Choisis la photo à incruster.', action: { l: 'Choisir', go: () => setPicker('ov') } }
    : tool === 'mixer' && !lines.length ? { msg: 'Écris au moins une légende.' }
    : tool === 'subs' && !conns.groq ? { msg: 'Ajoute ta clé Groq (transcription) dans les Réglages.', action: onNavigate ? { l: 'Réglages', go: () => openToolPage(onNavigate, 'settings', { tab: 'integrations' }) } : undefined }
    : null

  async function generate() {
    if (running || blocker) return
    const list = chosen
    setRunning(true); setLogs([]); setDone(0); setStep(0); setTotal(outCount); setPhase('Préparation…')
    const R = startRun('studio', `${label} · ${list.length} ${imgTool ? 'photo' : 'vidéo'}${list.length > 1 ? 's' : ''}`, outCount)
    runId.current = R.id
    const hooks = { onProgress: (r: number) => setStep(r), onLog: (m: string) => { if (/Video:|Audio:|error|Error|decod|Invalid|unable|hevc|Duration/i.test(m)) push(m.trim()) } }
    const save = async (title: string, data: Uint8Array, ext = 'mp4') => {
      const savedId = await saveOutputToBank(user.id, currentOrg?.id ?? null, data, title, ext, destFolder || null)
      ps.queue(savedId, title, push)
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: ext === 'jpg' ? 'image/jpeg' : 'video/mp4' }))
      addResult({ id: crypto.randomUUID(), title, url, ext, tool, at: Date.now() })
      R.tick(true); setDone(d => d + 1)
    }
    let failed = 0
    try {
      if (!imgTool && !isFfmpegReady()) { setPhase('Chargement du moteur vidéo (~30 Mo, une seule fois)…'); await getFFmpeg() }
      if (tool === 'montage' && mMode === 'join') {
        setPhase(`Assemblage de ${list.length} vidéos…`)
        const bytes: Uint8Array[] = []
        for (const v of list) bytes.push(await resolveSourceBytes(v))
        const r = await runConcat(bytes, hooks)
        if (!r.withAudio) toast('Une des vidéos n’a pas de son : montage assemblé sans le son.', 'info', 6000)
        await save(`Montage · ${list.length} vidéos`, r.data)
      } else {
        const ovs = tool === 'overlay' ? await Promise.all(ovImgs.map(async im => ({ data: await resolveSourceBytes(im), ext: ((im.storage_path ?? im.file_url ?? 'png').split('.').pop() ?? 'png').toLowerCase() }))) : []
        for (let i = 0; i < list.length; i++) {
          if (R.isCancelled()) break
          const v = list[i]
          try {
            setPhase(`${v.title} · lecture…`); setStep(0)
            const bytes = await resolveSourceBytes(v)
            const sOpts = { intensity, gps: gpsFor(gpsCity), device: device === 'none' ? null : device }
            if (tool === 'remix' || tool === 'spoof' || imgTool) {
              for (let k = 0; k < copies; k++) {
                if (R.isCancelled()) break
                setPhase(`${v.title} · variante ${k + 1}/${copies}`); setStep(0)
                const seed = Math.random() * 1000 + 1
                if (imgTool) await save(`${v.title} · v${k + 1}`, await runImageSpoof(bytes, { seed, ...sOpts }), 'jpg')
                else if (tool === 'remix') await save(`${v.title} · remix ${k + 1}`, await runRemix(bytes, seed, hooks, { ...sOpts, toggles }))
                else await save(`${v.title} · spoof ${k + 1}`, await runSpoof(bytes, seed, hooks, sOpts))
              }
            } else if (tool === 'montage') {
              setPhase(`${v.title} · découpe…`)
              await save(`${v.title} · coupe`, await runMontage(bytes, trim.start, trim.end, hooks))
            } else if (tool === 'overlay') {
              const o = ovMode === 'random' ? ovs[Math.floor(Math.random() * ovs.length)] : ovs[i % ovs.length]
              setPhase(`${v.title} · incrustation…`)
              await save(`${v.title} · incrustation`, await runOverlay(bytes, o.data, o.ext, { x: ov.x, y: ov.y, sizePct: ov.size, from: ovWhen === 'range' ? ovFrom : 0, to: ovWhen === 'range' ? ovTo : null }, hooks))
            } else if (tool === 'mixer') {
              setPhase(`${v.title} · légende…`)
              await save(`${v.title} · texte`, await runCaption(bytes, captionFor(lines, i, capMode), { x: cap.x, y: cap.y }, hooks, capStyle))
            } else if (tool === 'subs') {
              setPhase(`${v.title} · transcription et sous-titres…`)
              await save(`${v.title} · sous-titres`, await runSubtitles(bytes, conns.groq, { onProgress: setStep, onLog: push }, subsUnique ? { ...sOpts, intensity: 'subtle' } : false))
            }
          } catch (e) {
            failed++; R.tick(false)
            const m = e instanceof Error ? e.message : 'Échec du traitement'
            push(`✕ ${v.title} : ${m}`); toast(`${v.title} : ${m}`, 'bad', 7000)
          }
        }
      }
      const sent = await ps.flush()
      R.finish(R.isCancelled() ? 'cancelled' : failed ? 'error' : 'done')
      if (R.isCancelled()) toast('Arrêté.', 'info')
      else if (sent.failed && ps.partner) toast(`${sent.failed} envoi(s) chez ${ps.partner.name} échoué(s) — vois le journal.`, 'bad', 7000)
      else if (!failed && sent.ok && ps.partner) toast(`Terminé — ${sent.ok} montage(s) envoyé(s) chez ${ps.partner.name} › ${ps.folder}.`, 'ok')
      else if (!failed) toast('Terminé — tout est dans ta Banque.', 'ok')
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Échec du traitement'
      push(`✕ ${m}`); toast(m, 'bad', 8000); R.finish('error')
    }
    runId.current = null
    setRunning(false); setPhase(''); setStep(0)
    void load()
  }

  const folders = [...new Set(items.map(v => v.folder).filter((f): f is string => !!f))].sort()
  const preview = chosen.find(v => v.id === previewId) ?? chosen[0] ?? null
  const ovUrl = mediaUrl(ovImgs[0] ?? null)
  const join = tool === 'montage' && mMode === 'join'

  // ── Réglages propres à l'outil ──
  const spoofExtras = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <FieldRow label="Localisation GPS"><select value={gpsCity} onChange={e => setGpsCity(e.target.value)} style={SELECT}>{GPS_CITIES.map(c => <option key={c.k} value={c.k} style={{ background: '#161618' }}>{c.label}</option>)}</select></FieldRow>
      <FieldRow label="Appareil simulé"><select value={device} onChange={e => setDevice(e.target.value)} style={SELECT}>{SPOOF_DEVICES.map(d => <option key={d.k} value={d.k} style={{ background: '#161618' }}>{d.label}</option>)}</select></FieldRow>
    </div>
  )
  const settings = (() => {
    switch (tool) {
      case 'remix': return <>
        <FieldRow inline label="Variantes par vidéo" hint="Jusqu’à 24, toutes différentes"><Stepper value={copies} onChange={setCopies} /></FieldRow>
        <FieldRow label="Intensité"><ChoiceCards value={intensity} onChange={setIntensity} options={INTENSITY} /></FieldRow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SwitchRow label="Couleurs" hint="Luminosité, contraste, saturation, teinte" on={toggles.color} onChange={v => setToggles(t => ({ ...t, color: v }))} />
          <SwitchRow label="Recadrage" hint="Zoom léger, cadre différent" on={toggles.crop} onChange={v => setToggles(t => ({ ...t, crop: v }))} />
          <SwitchRow label="Vitesse" hint="±3 % et micro-coupe du début, son synchro" on={toggles.speed} onChange={v => setToggles(t => ({ ...t, speed: v }))} />
          <SwitchRow label="Miroir" hint="Retourne l’image (gauche ↔ droite)" on={toggles.mirror} onChange={v => setToggles(t => ({ ...t, mirror: v }))} />
        </div>
        {spoofExtras}
      </>
      case 'spoof': case 'imgspoof': return <>
        <FieldRow inline label={imgTool ? 'Variantes par photo' : 'Variantes par vidéo'} hint="Chaque copie a une empreinte unique"><Stepper value={copies} onChange={setCopies} /></FieldRow>
        <FieldRow label="Intensité du recadrage"><ChoiceCards value={intensity} onChange={setIntensity} options={INTENSITY} /></FieldRow>
        {spoofExtras}
        <span style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>Métadonnées d’origine effacées, puis appareil et GPS réécrits{imgTool ? ' dans l’EXIF du .jpg' : ''}.</span>
      </>
      case 'subs': return <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: conns.groq ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)', border: `1px solid ${conns.groq ? 'rgba(74,222,128,0.22)' : 'rgba(251,191,36,0.28)'}` }}>
          <span style={{ display: 'flex', color: conns.groq ? '#4ADE80' : '#FBBF24' }}><Icon d={conns.groq ? 'M20 6L9 17l-5-5' : 'M12 9v4|M12 17h.01'} size={15} sw={2.4} /></span>
          <span style={{ flex: 1, fontSize: 12.5, color: conns.groq ? '#BBF7D0' : '#FDE68A', lineHeight: 1.45 }}>{conns.groq ? 'Transcription prête (Groq Whisper), langue détectée automatiquement.' : 'Il faut une clé Groq pour transcrire l’audio.'}</span>
        </div>
        <SwitchRow label="Rendre la vidéo unique" hint="Métadonnées effacées, GPS et appareil réécrits, micro-recadrage" on={subsUnique} onChange={setSubsUnique} />
        {subsUnique && spoofExtras}
      </>
      case 'overlay': return <>
        <FieldRow label="Photo(s) à incruster" hint={ovImgs.length > 1 ? 'Une photo différente par vidéo' : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {ovImgs.slice(0, 6).map(im => <span key={im.id} data-no-tr title={im.title} style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '5px 10px', borderRadius: 99, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', fontSize: 12, color: '#DDD6FE' }}>{im.title}</span>)}
            {ovImgs.length > 6 && <span style={{ fontSize: 12, color: '#8B8B94' }}>+{ovImgs.length - 6}</span>}
            <button type="button" onClick={() => setPicker('ov')} style={{ height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: '#151517', color: '#E4E4E7', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>{ovImgs.length ? 'Changer' : 'Choisir dans la Banque'}</button>
          </div>
        </FieldRow>
        {ovImgs.length > 1 && <FieldRow inline label="Répartition"><Segmented value={ovMode} onChange={setOvMode} options={[{ v: 'seq', l: 'Dans l’ordre' }, { v: 'random', l: 'Au hasard' }]} /></FieldRow>}
        <FieldRow label={<span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Taille</span><b style={{ color: '#C4B5FD' }}>{ov.size} %</b></span>} hint="de la largeur de la vidéo">
          <input type="range" min={8} max={100} value={ov.size} onChange={e => setOv(o => ({ ...o, size: Number(e.target.value) }))} style={{ width: '100%', accentColor: '#A78BFA' }} />
        </FieldRow>
        <FieldRow label="Position" hint="Clique un repère ou glisse la photo sur l’aperçu">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 5 }}>
            {POS9.map(([x, y]) => { const on = Math.abs(ov.x - x) < 6 && Math.abs(ov.y - y) < 6; return <button key={`${x}-${y}`} type="button" aria-label={`Position ${x} ${y}`} onClick={() => setOv(o => ({ ...o, x, y }))} style={{ width: 34, height: 26, borderRadius: 7, border: `1px solid ${on ? '#A78BFA' : 'rgba(255,255,255,0.1)'}`, background: on ? 'rgba(167,139,250,0.25)' : '#141416', cursor: 'pointer' }} /> })}
          </div>
        </FieldRow>
        <FieldRow label="Quand">
          <ChoiceCards value={ovWhen} onChange={setOvWhen} options={[{ v: 'all', l: 'Toute la vidéo' }, { v: 'range', l: 'Un moment précis' }]} />
        </FieldRow>
        {ovWhen === 'range' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FieldRow label="De (s)"><input type="number" min={0} step={0.5} value={ovFrom} onChange={e => setOvFrom(Math.max(0, Number(e.target.value)))} style={FIELD} /></FieldRow>
            <FieldRow label="À (s)"><input type="number" min={0} step={0.5} value={ovTo} onChange={e => setOvTo(Math.max(ovFrom + 0.5, Number(e.target.value)))} style={FIELD} /></FieldRow>
          </div>
        )}
      </>
      case 'montage': return <>
        <FieldRow label="Mode"><ChoiceCards value={mMode} onChange={setMMode} options={[{ v: 'cut', l: 'Couper', d: 'Garde un extrait de chaque vidéo', icon: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M20 4L8.12 15.88|M14.47 14.48L20 20|M8.12 8.12L12 12' }, { v: 'join', l: 'Assembler', d: 'Une seule vidéo, dans l’ordre', icon: 'M3 12h18|M8 7l-5 5 5 5|M16 7l5 5-5 5' }]} /></FieldRow>
        {mMode === 'cut'
          ? <span style={{ fontSize: 12.5, color: '#8B8B94', lineHeight: 1.5 }}>Règle le début et la fin sous l’aperçu. Le même extrait (en secondes) est appliqué à chaque vidéo choisie.</span>
          : <span style={{ fontSize: 12.5, color: '#8B8B94', lineHeight: 1.5 }}>Les vidéos sont mises au format 9:16 (1080×1920) et assemblées dans l’ordre des sources — <b style={{ color: '#E4E4E7' }}>glisse les vignettes pour les réordonner</b>.</span>}
      </>
      case 'mixer': return <>
        <FieldRow label="Légende(s)" hint={lines.length > 1 ? `${lines.length} légendes → une par vidéo` : 'Une par ligne pour une légende différente par vidéo'}>
          <textarea value={capText} onChange={e => setCapText(e.target.value)} rows={4} placeholder={'POV : tu restes jusqu’à la fin 👀\nAttends la fin…'} style={{ ...TEXTAREA, minHeight: 92 }} />
        </FieldRow>
        {lines.length > 1 && <FieldRow inline label="Répartition"><Segmented value={capMode} onChange={setCapMode} options={[{ v: 'seq', l: 'Dans l’ordre' }, { v: 'random', l: 'Au hasard' }]} /></FieldRow>}
        <FieldRow label="Style"><ChoiceCards value={capStyle} onChange={setCapStyle} options={[{ v: 'outline', l: 'Contour', d: 'Texte blanc, contour noir' }, { v: 'snapchat', l: 'Bandeau', d: 'Bande grise, façon Snapchat' }]} /></FieldRow>
        <FieldRow label="Position" hint="Ou glisse la légende sur l’aperçu">
          <Segmented value={cap.y < 33 ? 'top' : cap.y > 66 ? 'bottom' : 'center'} onChange={v => setCap({ x: 50, y: v === 'top' ? 14 : v === 'center' ? 50 : 82 })} options={[{ v: 'top', l: 'Haut' }, { v: 'center', l: 'Centre' }, { v: 'bottom', l: 'Bas' }]} />
        </FieldRow>
      </>
    }
  })()

  return (
    <div>
      {/* Titre de l'outil */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 15, background: `linear-gradient(135deg, ${a}, ${b})`, color: '#fff', boxShadow: '0 12px 30px -12px rgba(0,0,0,.8), inset 0 0 0 1px rgba(255,255,255,0.2)', flexShrink: 0 }}><Icon d={icon} size={22} /></span>
        <span style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.035em', color: '#F4F4F5' }}>{label}</h1>
          <span style={{ display: 'block', marginTop: 3, fontSize: 14, color: '#8B8B94' }}>{desc}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 99, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.22)', color: '#86EFAC', fontSize: 12.5, fontWeight: 700 }}><Icon d="M20 6L9 17l-5-5" size={12} sw={2.6} />Gratuit · sur ton ordinateur</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1fr) 390px', gap: 16, alignItems: 'start' }}>
        {/* ── Sources + aperçu ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Bento pad="18px 18px 16px">
            <Label icon={imgTool ? 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21' : 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z'}
              right={<span style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setPicker('src')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: '#151517', color: '#E4E4E7', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}><Icon d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" size={13} />Banque</button>
                {chosen.length > 0 && <button type="button" onClick={() => setSrc([])} style={{ height: 30, padding: '0 10px', borderRadius: 9, border: 'none', background: 'transparent', color: '#71717A', fontSize: 12.5, fontWeight: 650, cursor: 'pointer' }}>Tout retirer</button>}
              </span>}>
              {imgTool ? 'Photos' : 'Vidéos'} <span style={{ color: '#5A5A63', fontWeight: 600 }}>{chosen.length}</span>
            </Label>
            <div style={{ marginTop: 14 }}>
              {chosen.length === 0
                ? <DropZone accept={imgTool ? 'image/*' : 'video/*'} onFiles={fs => void importFiles(fs)} busy={uploading} title={imgTool ? 'Glisse tes photos ici' : 'Glisse tes vidéos ici'} hint={<>ou clique pour les choisir sur ton ordinateur · ou prends-les dans la <b style={{ color: '#E4E4E7' }}>Banque</b></>} />
                : <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 10, maxHeight: 330, overflowY: 'auto', paddingBottom: 2 }}>
                    {chosen.map((v, i) => (
                      <div key={v.id} draggable={join} onDragStart={() => { dragIdx.current = i }} onDragOver={e => { if (join) e.preventDefault() }}
                        onDrop={() => { const from = dragIdx.current; dragIdx.current = null; if (from == null || from === i) return; setSrc(s => { const ids = chosen.map(x => x.id); const [m] = ids.splice(from, 1); ids.splice(i, 0, m); return [...ids, ...s.filter(id => !ids.includes(id))] }) }}
                        style={{ cursor: join ? 'grab' : undefined }}>
                        <MediaTile thumb={thumbFor(v)} video={!imgTool && !v.thumbnail_url && !v.thumbnail_path ? mediaUrl(v) : null} aspect={imgTool ? '4 / 5' : '9 / 16'} title={v.title} sub={fmtDur(durations[v.id])}
                          selected={preview?.id === v.id} onClick={() => setPreviewId(v.id)} onRemove={() => setSrc(s => s.filter(id => id !== v.id))}
                          badge={join ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 99, background: '#F4F4F5', color: '#0A0A0B', fontSize: 11.5, fontWeight: 800 }}>{i + 1}</span> : undefined} />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12 }}><DropZone compact accept={imgTool ? 'image/*' : 'video/*'} onFiles={fs => void importFiles(fs)} busy={uploading} title={imgTool ? 'Ajouter des photos' : 'Ajouter des vidéos'} hint="Glisse-les ici ou clique" /></div>
                </>}
            </div>
          </Bento>

          <Bento pad={18}>
            <Label icon="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" right={preview ? <span data-no-tr style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#71717A' }}>{preview.title}</span> : undefined}>Aperçu</Label>
            <div style={{ marginTop: 14 }}>
              <Preview src={mediaUrl(preview)} kind={imgTool ? 'image' : 'video'} tool={tool}
                caption={tool === 'mixer' ? { text: lines[0] ?? '', x: cap.x, y: cap.y, style: capStyle } : undefined} onCaptionMove={(x, y) => setCap({ x, y })}
                overlay={tool === 'overlay' ? { url: ovUrl, ...ov } : undefined} onOverlayChange={setOv}
                trim={tool === 'montage' && mMode === 'cut' ? trim : undefined} onTrim={(s, e) => setTrim({ start: s, end: e })}
                remix={{ intensity, toggles }}
                empty={chosen.length ? 'Chargement de l’aperçu…' : imgTool ? 'Ajoute une photo pour voir l’aperçu.' : 'Ajoute une vidéo pour voir l’aperçu en direct.'} />
            </div>
          </Bento>
        </div>

        {/* ── Réglages + lancement ── */}
        <div style={{ position: narrow ? 'static' : 'sticky', top: 66, minWidth: 0 }}>
          <Bento pad={18} glow="rgba(139,92,246,0.14)">
            <Label icon="M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M1 14h6|M9 8h6|M17 16h6">Réglages</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
              {settings}
              <FieldRow label="Enregistrer dans">
                <select value={destFolder} onChange={e => setDestFolder(e.target.value)} style={SELECT}>
                  <option value="" style={{ background: '#161618' }}>Banque · sans dossier</option>
                  {folders.map(f => <option key={f} value={f} style={{ background: '#161618' }}>{f}</option>)}
                </select>
              </FieldRow>
              {ps.partner && (
                <FieldRow label="Envoyer direct vers">
                  <PartnerSendSelect ps={ps} style={SELECT} optStyle={{ background: '#161618' }} />
                </FieldRow>
              )}
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '18px -18px 16px' }} />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#8B8B94' }}>{join ? `${chosen.length} vidéos → 1 montage` : `${chosen.length} source(s)${perOut > 1 ? ` × ${perOut}` : ''}`}</span>
              <span style={{ fontSize: 22, fontWeight: 850, letterSpacing: '-0.04em', color: '#F4F4F5', fontVariantNumeric: 'tabular-nums' }}>{outCount} <span style={{ fontSize: 13, fontWeight: 650, color: '#71717A', letterSpacing: 0 }}>fichier(s)</span></span>
            </div>
            {running ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ProgressBar value={total ? (done + Math.min(0.99, step)) / total : 0} step={step} label={<span data-no-tr>{phase}</span>} right={`${done}/${total}`} />
                <button type="button" onClick={() => { if (runId.current) cancelRun(runId.current) }} style={{ height: 40, borderRadius: 12, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#FCA5A5', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              </div>
            ) : (
              <>
                <button type="button" onClick={() => void generate()} disabled={!!blocker}
                  style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 14, border: 'none', cursor: blocker ? 'not-allowed' : 'pointer', fontSize: 15.5, fontWeight: 800, color: '#fff',
                    background: blocker ? '#1C1C1F' : 'linear-gradient(135deg,#8B5CF6,#EC4899)', boxShadow: blocker ? 'none' : '0 14px 34px -14px rgba(236,72,153,.75)', opacity: blocker ? 0.75 : 1, transition: 'transform .12s ease' }}
                  onMouseDown={e => { if (!blocker) e.currentTarget.style.transform = 'scale(.985)' }} onMouseUp={e => { e.currentTarget.style.transform = 'none' }} onMouseLeave={e => { e.currentTarget.style.transform = 'none' }}>
                  <Icon d="M5 3l14 9-14 9z" size={15} sw={2.2} />{outCount > 0 ? `Générer ${outCount} fichier(s)` : 'Générer'}
                </button>
                {blocker && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, color: '#FBBF24' }}>
                    <Icon d="M12 9v4|M12 17h.01" size={14} sw={2.4} /><span style={{ flex: 1 }}>{blocker.msg}</span>
                    {blocker.action && <button type="button" onClick={blocker.action.go} style={{ padding: 0, border: 'none', background: 'transparent', color: '#C4B5FD', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{blocker.action.l} →</button>}
                  </div>
                )}
                {!blocker && !imgTool && <div style={{ marginTop: 10, fontSize: 11.5, color: '#5A5A63', textAlign: 'center' }}>Le premier lancement charge le moteur vidéo (~30 Mo, une seule fois).</div>}
              </>
            )}
            {logs.length > 0 && <div style={{ marginTop: 12 }}><RunLog lines={logs} /></div>}
          </Bento>
        </div>
      </div>

      {picker === 'src' && (
        <BankPicker theme={theme} user={user} org={org} kind={imgTool ? 'images' : 'videos'} multi initialIds={src}
          title={imgTool ? 'Choisir des photos' : 'Choisir des vidéos'} onClose={() => setPicker(null)}
          onApply={(r: PickerResult) => { void load(); if ((imgTool && r.kind === 'images') || (!imgTool && r.kind === 'videos')) setSrc(s => [...s.filter(id => r.ids.includes(id)), ...r.ids.filter(id => !s.includes(id))]) }} />
      )}
      {picker === 'ov' && (
        <BankPicker theme={theme} user={user} org={org} kind="images" multi initialIds={ovImgs.map(i => i.id)}
          title="Choisir la photo à incruster" onClose={() => setPicker(null)}
          onApply={(r: PickerResult) => {
            if (r.kind !== 'images' || r.ids.length === 0) { setOvImgs([]); return }
            // Lu en base (une photo tout juste importée depuis le sélecteur n'est pas encore dans `items`).
            const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null) // eslint-disable-line @typescript-eslint/no-explicit-any
            void scope(supabase.from('content_bank').select('id,title,storage_path,file_url')).in('id', r.ids).then(({ data }: { data: unknown[] | null }) => {
              const rows = (data ?? []) as { id: string; title: string; storage_path: string | null; file_url: string | null }[]
              setOvImgs(r.ids.map(id => rows.find(x => x.id === id)).filter((v): v is { id: string; title: string; storage_path: string | null; file_url: string | null } => !!v))
            })
            void load()
          }} />
      )}
    </div>
  )
}
