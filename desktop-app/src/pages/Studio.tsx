import { useCallback, useEffect, useRef, useState } from 'react'
import { ToolPreview } from '@/components/ToolArt'
import { FeatureBanner } from '@/components/CineHero'
import { usePhotos } from '@/pages/Explore'
import { fetchAllRows } from '@/lib/bankStorage'
import { takeOpenArg } from '@/lib/openTool'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Theme, InfraKey } from '@/lib/theme'
import { Btn, Chip, Empty, FIELD, FIELD_SM, Icon, MONO, Panel, PanelHead, PageHead, Segmented, TEXTAREA, Toggle, useNarrow } from '@/lib/ui'
import type { OrgState } from '@/lib/data'
import { useBankThumbs } from '@/lib/data'
import BankPicker, { type PickerResult } from '@/components/BankPicker'
import { useConnections } from '@/lib/connections'
import {
  resolveSourceBytes, saveOutputToBank, GPS_CITIES, gpsFor, SPOOF_DEVICES,
  runSpoof, runRemixVariant, runMontage, runOverlay, runCaption, runSubtitles, runImageSpoof,
} from '@/lib/studioTools'
import { getFFmpeg, isFfmpegReady } from '@/lib/ffmpeg'
import { startRun } from '@/lib/runStore'

// Studio vidéo : hub des outils (gratuits) + wizard par outil (fidèle à _studio()).
// La génération n'est pas encore branchée (outils serveur) — le wizard prépare tout.
interface Tool { k: string; t: string; d: string; tag: string; i: string }
const TOOLS: Tool[] = [
  { k: 'overlay', t: 'Incrustation photo/vidéo', d: 'Mets une vidéo, choisis une photo et place-la où tu veux, le temps que tu veux.', tag: 'photo', i: 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21' },
  { k: 'montage', t: 'Montage', d: 'Assemble et découpe tes vidéos : coupe, ordre, transitions simples.', tag: 'découpe', i: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M20 4L8.12 15.88|M14.47 14.48L20 20|M8.12 8.12L12 12' },
  { k: 'mixer', t: 'Mixer', d: 'Ajoute une légende / un montage par-dessus ta vidéo, rendu côté serveur.', tag: 'overlay', i: 'M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M1 14h6|M9 8h6|M17 16h6' },
  { k: 'remix', t: 'Remix', d: 'Une vidéo devient des dizaines de variantes uniques : luminosité, zoom, vitesse, recadrage.', tag: '×24 variantes', i: 'M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l6 6' },
  { k: 'spoof', t: 'Spoof', d: "Anti-empreinte : réécrit device, GPS, EXIF et micro-varie l'image. Rend chaque vidéo unique pour l'algo.", tag: 'anti-détection', i: 'M12 22s8-4.5 8-11a8 8 0 1 0-16 0c0 6.5 8 11 8 11z|M9 12l2 2 4-4' },
  { k: 'imgspoof', t: 'Spoof image', d: 'Photos → variantes uniques en .jpg : micro-zoom, EXIF effacé puis device/GPS réécrits. Anti-doublon pour l’algo.', tag: 'photo · .jpg', i: 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21' },
  { k: 'subs', t: 'Sous-titres', d: 'Sous-titres automatiques (Groq Whisper), incrustés mot par mot.', tag: 'Whisper', i: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z|M7 9h10|M7 13h6' },
]
interface Video { id: string; title: string; storage_path: string | null; file_url: string | null; thumbnail_url: string | null; thumbnail_path: string | null; notes: string | null; folder: string | null }

const SENTINELS = ['__sf_folder__', '__sf_drive_folder__']
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif']
function isVid(v: Video): boolean {
  const ext = (v.storage_path ?? v.file_url ?? '').toLowerCase().split('.').pop() ?? ''
  return !IMG_EXT.includes(ext)
}

// Carte d'outil du Studio : aperçu animé, survol bien visible (soulèvement, contour violet,
// zoom de l'aperçu, bouton « Ouvrir » qui s'allume) et focus clavier.
function StudioCard({ t, ti, pick, onOpen }: { t: Tool; ti: number; pick: (k: number) => string | null; onOpen: () => void }) {
  const [h, setH] = useState(false)
  return (
    <button type="button" onClick={onOpen} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onFocus={() => setH(true)} onBlur={() => setH(false)}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: 18, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box', outline: 'none',
        background: h ? '#151418' : '#111113', border: `1px solid ${h ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.07)'}`,
        transform: h ? 'translateY(-4px)' : 'none', boxShadow: h ? '0 24px 50px -24px rgba(139,92,246,0.75)' : 'none',
        transition: 'transform .25s cubic-bezier(0.16,1,0.3,1), box-shadow .25s ease, border-color .2s ease, background .2s ease',
        animation: `aIn .4s cubic-bezier(0.16,1,0.3,1) ${ti * 40}ms both`,
      }}>
      <span style={{ display: 'block', padding: '16px 16px 0' }}>
        <span style={{ display: 'block', transform: h ? 'scale(1.02)' : 'none', transition: 'transform .5s cubic-bezier(0.16,1,0.3,1)' }}>
          <ToolPreview id={t.k} pick={pick} height={150} />
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px 16px', flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: h ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : '#18181B', border: h ? 'none' : '1px solid rgba(255,255,255,0.08)', color: h ? '#fff' : '#C4B5FD', transition: 'background .2s ease' }}>
            <Icon d={t.i} size={15} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#F4F4F5', letterSpacing: '-0.02em' }}>{t.t}</span>
          <span style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#A1A1AA', background: 'rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{t.tag}</span>
        </span>
        <span style={{ fontSize: 13, lineHeight: 1.55, color: '#9A9AA3' }}>{t.d}</span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#71717A' }}>Gratuit</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 800, color: h ? '#fff' : '#A1A1AA', background: h ? '#8B5CF6' : 'rgba(255,255,255,0.05)', transition: 'all .2s ease' }}>
            Ouvrir<Icon d="M5 12h14|M13 6l6 6-6 6" size={13} />
          </span>
        </span>
      </span>
    </button>
  )
}

export default function Studio({ theme, infra, user, org, onNavigate }: {
  theme: Theme; infra: InfraKey; user: User; org: OrgState; onNavigate?: (p: string) => void
}) {
  const { currentOrg } = org
  const conns = useConnections(user, org)
  const photos = usePhotos(user, org)
  const [tool, setTool] = useState<string | null>(() => (takeOpenArg<{ tool?: string }>('studio')?.tool) ?? null)
  const [videos, setVideos] = useState<Video[]>([])
  const [src, setSrc] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { thumbFor } = useBankThumbs(videos)
  const narrow = useNarrow()

  // ── Paramètres par outil ──
  const [copies, setCopies] = useState(3)          // spoof / remix : nb de variantes/source
  const [caption, setCaption] = useState('')       // mixer
  const [capPos, setCapPos] = useState<'top' | 'center' | 'bottom'>('bottom')
  const [trimStart, setTrimStart] = useState(0)    // montage
  const [trimEnd, setTrimEnd] = useState('')       // montage (vide = jusqu'à la fin)
  const [overlayImgs, setOverlayImgs] = useState<{ id: string; storage_path: string | null; file_url: string | null; title: string }[]>([])
  const [ovMode, setOvMode] = useState<'seq' | 'random'>('seq')
  const [imgPicker, setImgPicker] = useState(false)
  // Anti-détect (spoof/remix) : intensité + localisation GPS écrite dans les métadonnées.
  const [intensity, setIntensity] = useState<'subtle' | 'normal' | 'strong'>('normal')
  const [gpsCity, setGpsCity] = useState('none')
  const [device, setDevice] = useState('none')   // appareil spoofé (EXIF/métadonnées make/model)
  // Mixer : placement manuel de la légende (sinon preset top/center/bottom).
  const [capManual, setCapManual] = useState(false)
  const [capX, setCapX] = useState(50)   // % largeur
  const [capY, setCapY] = useState(85)   // % hauteur
  // Dossier de destination des sorties (banque).
  const [destFolder, setDestFolder] = useState<string>('')

  // ── État d'exécution ──
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [results, setResults] = useState<{ title: string; url: string; ext?: string }[]>([])

  const load = useCallback(async () => {
    const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
    const { data } = await fetchAllRows<any>(() => scope(supabase.from('content_bank').select('*')).order('created_at', { ascending: false }).order('id'))
    setVideos(((data ?? []) as Video[]).filter(v => !(SENTINELS.includes(v.notes ?? '') && !v.storage_path && !v.file_url)))
  }, [currentOrg?.id, user.id])
  useEffect(() => { load() }, [load])

  const toggleSrc = (id: string) => setSrc(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Import « Mon PC » : upload vers le bucket content puis insert content_bank (comme la banque).
  async function importFromPC(files: FileList | File[]) {
    const list = Array.from(files); if (list.length === 0) return
    const scopeFolder = currentOrg ? `orgs/${currentOrg.id}` : `users/${user.id}`
    let done = 0
    for (const file of list) {
      setUploading(`${file.name} (${++done}/${list.length})`)
      try {
        let ext = (file.name.split('.').pop() ?? '').toLowerCase()
        if (!ext) ext = file.type.startsWith('image') ? 'jpg' : 'mp4'
        const id = crypto.randomUUID()
        const storagePath = `videos/${scopeFolder}/${id}.${ext}`
        const up = await supabase.storage.from('content').upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
        if (up.error) continue
        await supabase.from('content_bank').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          title: file.name.replace(/\.[a-z0-9]+$/i, ''), storage_path: storagePath, thumbnail_path: null,
          file_url: null, folder: null, duration: null, tags: [], notes: null, used_count: 0,
        })
      } catch { /* ignore */ }
    }
    setUploading(null)
    await load()
  }

  const push = (m: string) => setLogs(l => [...l.slice(-200), m])

  // Résout toutes les photos d'incrustation (pool) en octets.
  async function overlayAll(): Promise<{ data: Uint8Array; ext: string }[]> {
    const out: { data: Uint8Array; ext: string }[] = []
    for (const im of overlayImgs) {
      const ext = ((im.storage_path ?? im.file_url ?? 'png').split('.').pop() ?? 'png').toLowerCase()
      out.push({ data: await resolveSourceBytes(im), ext })
    }
    return out
  }

  // ── Lancement du traitement réel (ffmpeg.wasm) ──
  async function generate() {
    if (running) return
    const isImgTool = tool === 'imgspoof'
    const chosen = videos.filter(v => src.has(v.id) && (isImgTool ? !isVid(v) : isVid(v)))
    if (chosen.length === 0) { push(isImgTool ? '⚠ Sélectionne au moins une photo source.' : '⚠ Sélectionne au moins une vidéo source.'); return }
    if (tool === 'overlay' && overlayImgs.length === 0) { push('⚠ Choisis d’abord une ou des photos à incruster.'); return }
    if (tool === 'mixer' && !caption.trim()) { push('⚠ Écris une légende à incruster.'); return }
    if (tool === 'subs' && !conns.groq) { push('⚠ Clé Groq manquante (Réglages) pour la transcription.'); return }

    setRunning(true); setLogs([]); setResults([]); setProgress(0)
    // On remonte les logs ffmpeg pertinents (codec source, erreurs de décodage) dans le
    // panneau → indispensable pour diagnostiquer les sorties noires (.mov HEVC, etc.).
    const hooks = { onProgress: setProgress, onLog: (m: string) => { if (/Video:|Audio:|error|Error|decod|Invalid|unable|hevc|Duration/i.test(m)) push(m.trim()) } }
    const perOut = (tool === 'spoof' || tool === 'remix' || isImgTool) ? Math.max(1, Math.min(24, copies)) : 1
    const R = startRun('studio', `${T.t} · ${chosen.length} ${isImgTool ? 'photo' : 'vidéo'}${chosen.length > 1 ? 's' : ''}`, chosen.length * perOut)
    try {
      if (!isImgTool && !isFfmpegReady()) { push('⏳ Chargement du moteur vidéo (~30 Mo, une seule fois)…'); await getFFmpeg(); push('✅ Moteur prêt.') }
      const ovs = tool === 'overlay' ? await overlayAll() : []
      let vIdx = 0
      for (const v of chosen) {
        if (R.isCancelled()) { push('⏹ Annulé.'); break }
        push(`— ${v.title} —`)
        setProgress(0)
        const bytes = await resolveSourceBytes(v)
        const outs: { title: string; data: Uint8Array; ext?: string }[] = []
        if (tool === 'imgspoof') {
          const n = Math.max(1, Math.min(24, copies))
          for (let i = 0; i < n; i++) {
            if (R.isCancelled()) break
            push(`  · variante ${i + 1}/${n}…`)
            const data = await runImageSpoof(bytes, { seed: Math.random() * 1000, intensity, gps: gpsFor(gpsCity), device })
            outs.push({ title: `${v.title} · img ${i + 1}`, data, ext: 'jpg' })
            setProgress((i + 1) / n)
          }
        } else if (tool === 'spoof' || tool === 'remix') {
          const n = Math.max(1, Math.min(24, copies))
          for (let i = 0; i < n; i++) {
            if (R.isCancelled()) break
            push(`  · variante ${i + 1}/${n}…`)
            const seed = Math.random() * 1000
            const sOpts = { intensity, gps: gpsFor(gpsCity), device }
            const data = tool === 'spoof' ? await runSpoof(bytes, seed, hooks, sOpts) : await runRemixVariant(bytes, seed, hooks, sOpts)
            outs.push({ title: `${v.title} · ${tool} ${i + 1}`, data })
          }
        } else if (tool === 'montage') {
          push('  · découpe…')
          const end = trimEnd.trim() ? Number(trimEnd) : null
          outs.push({ title: `${v.title} · montage`, data: await runMontage(bytes, trimStart, isFinite(end as number) ? end : null, hooks) })
        } else if (tool === 'overlay' && ovs.length > 0) {
          const ov = ovMode === 'random' ? ovs[Math.floor(Math.random() * ovs.length)] : ovs[vIdx % ovs.length]
          push('  · incrustation…')
          outs.push({ title: `${v.title} · incrust`, data: await runOverlay(bytes, ov.data, ov.ext, { widthPx: 420, from: 0, to: null }, hooks) })
        } else if (tool === 'mixer') {
          push('  · légende…')
          outs.push({ title: `${v.title} · mixer`, data: await runCaption(bytes, caption, capManual ? { x: capX, y: capY } : capPos, hooks) })
        } else if (tool === 'subs') {
          outs.push({ title: `${v.title} · sous-titres`, data: await runSubtitles(bytes, conns.groq, { onProgress: setProgress, onLog: push }) })
        }
        // Sauvegarde banque + lien de téléchargement.
        for (const o of outs) {
          const ext = o.ext ?? 'mp4'
          await saveOutputToBank(user.id, currentOrg?.id ?? null, o.data, o.title, ext, destFolder || null)
          const url = URL.createObjectURL(new Blob([o.data as BlobPart], { type: ext === 'jpg' ? 'image/jpeg' : ext === 'mov' ? 'video/quicktime' : 'video/mp4' }))
          setResults(r => [...r, { title: o.title, url, ext }])
          R.tick(true)
        }
        vIdx++
      }
      push(R.isCancelled() ? '⏹ Arrêté.' : '✔ Terminé — sorties enregistrées dans la banque.')
      R.finish()
      load()
    } catch (e) {
      push(`❌ ${e instanceof Error ? e.message : 'Échec du traitement'}`)
      R.finish('error')
    }
    setRunning(false); setProgress(0)
  }

  // Ouvre un outil (depuis le hub ou la barre d'outils) : repart d'un état propre.
  const openTool = (k: string) => { setTool(k); setSrc(new Set()); setResults([]); setLogs([]); setOverlayImgs([]) }

  // ── Hub ──
  if (!tool) {
    return (
      <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
        <PageHead title="Studio vidéo" sub="Une vidéo source, tous tes outils VIP — incrustation, montage, mixer, remix, spoof, sous-titres. Tout est gratuit, aucun crédit consommé." />
        {/* Auto-contenu mis en avant : grand bandeau photo plein cadre. */}
        {onNavigate && (
          <div style={{ marginBottom: 16 }}>
            <FeatureBanner height={240} kicker="Recommandé · Auto-contenu" line1="Une vidéo," line2="des dizaines de variantes"
              text="Légende (pool + style), coupe, micro-vitesse, mode Tendance et spoof device/GPS — en un clic, chaque compte reçoit une vidéo unique."
              cta="Lancer l’Auto-contenu →" onCta={() => onNavigate('blowContent')} meta="GRATUIT"
              photos={[0, 1, 2, 3].map(k => { const pool = [...photos.viral, ...photos.bank]; return pool.length ? pool[k % pool.length] : null })} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px,100%),1fr))', gap: 14 }}>
          {TOOLS.map((t, ti) => (
            <StudioCard key={t.k} t={t} ti={ti} onOpen={() => openTool(t.k)}
              pick={k => { const pool = [...photos.bank, ...photos.viral]; return pool.length ? pool[(ti * 3 + k) % pool.length] : null }} />
          ))}
        </div>
      </div>
    )
  }

  // ── Wizard d'un outil ──
  const T = TOOLS.find(x => x.k === tool)!
  const isImgTool = tool === 'imgspoof'
  const hasSpoofOpts = tool === 'spoof' || tool === 'remix' || isImgTool
  const nSrc = src.size
  // Dossiers existants (banque) pour le sélecteur de destination des sorties.
  const folders = [...new Set(videos.map(v => v.folder).filter((f): f is string => !!f))].sort()
  const per = hasSpoofOpts ? copies : 1
  const output = `${nSrc * per} fichier${nSrc * per > 1 ? 's' : ''}`
  const numInp: React.CSSProperties = { ...FIELD, width: 80, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* Barre des outils : l'outil ouvert est bien visible, on passe d'un outil à l'autre en 1 clic. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', margin: '0 -4px 18px', padding: '8px 4px', background: 'rgba(10,10,11,0.85)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', scrollbarWidth: 'none' }}>
        <button type="button" onClick={() => setTool(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#A1A1AA', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>
          <Icon d="M15 18l-6-6 6-6" size={14} />Studio
        </button>
        <span style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', flexShrink: 0, margin: '0 4px' }} />
        {TOOLS.map(x => {
          const on = x.k === tool
          return (
            <button key={x.k} type="button" onClick={() => { if (!on) openTool(x.k) }} aria-current={on ? 'page' : undefined}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, height: 36, padding: '0 13px', borderRadius: 10, cursor: on ? 'default' : 'pointer', fontSize: 13, fontWeight: on ? 800 : 600,
                border: on ? 'none' : '1px solid rgba(255,255,255,0.08)', color: on ? '#fff' : '#D4D4D8',
                background: on ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : '#111113', boxShadow: on ? '0 3px 0 #6D28D9' : 'none', transition: 'background .15s ease, border-color .15s ease' }}
              onMouseEnter={e => { if (!on) { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.6)'; e.currentTarget.style.background = '#17151C' } }}
              onMouseLeave={e => { if (!on) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = '#111113' } }}>
              <Icon d={x.i} size={14} />{x.t}
            </button>
          )
        })}
      </div>
      <PageHead title={T.t} sub={T.d} actions={<Chip text="Gratuit · 0 crédit" tone="ok" />} />
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : 'minmax(0,1.4fr) minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel theme={theme}>
            <PanelHead title={isImgTool ? 'Photos sources' : 'Vidéos sources'} sub={uploading ? `Import : ${uploading}` : `${nSrc} sélectionnée${nSrc > 1 ? 's' : ''}`} right={<>
              <Btn theme={theme} sm icon="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z" label="Banque" onClick={() => setPickerOpen(true)} />
              <Btn theme={theme} sm tone="quiet" icon="M12 3v12|M7 10l5 5 5-5|M4 21h16" label="Mon PC" disabled={!!uploading} onClick={() => fileRef.current?.click()} />
              <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{ display: 'none' }}
                onChange={e => { if (e.target.files) importFromPC(e.target.files); e.target.value = '' }} />
            </>} />
            {nSrc === 0 ? <Empty icon={isImgTool ? 'M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21' : 'm22 8-6 4 6 4V8Z|M14 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z'} title={isImgTool ? 'Aucune photo choisie.' : 'Aucune vidéo choisie.'} text="Clique « Banque » ou « Mon PC »." /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(74px,1fr))', gap: 8, padding: 16, maxHeight: 300, overflowY: 'auto' }}>
                {videos.filter(v => src.has(v.id)).map((v) => {
                  const on = src.has(v.id); const prev = thumbFor(v); const vid = isVid(v)
                  return (
                    <button key={v.id} onClick={() => toggleSrc(v.id)} title={v.title} style={{
                      position: 'relative', aspectRatio: '9 / 16', borderRadius: 6, padding: 0, cursor: 'pointer', overflow: 'hidden',
                      border: '1px solid ' + (on ? theme.accent : 'rgba(255,255,255,0.07)'),
                      background: '#161618',
                    }}>
                      {prev && (vid && !v.thumbnail_url && !v.thumbnail_path
                        ? <video src={prev + '#t=0.1'} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <img src={prev} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)}
                      <span style={{ position: 'absolute', top: 5, right: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 4, background: on ? theme.accent : 'rgba(10,10,11,0.7)', border: on ? 'none' : '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 11, fontWeight: 600 }}>{on ? '✓' : ''}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel theme={theme}>
            <PanelHead title="Réglages" />
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {hasSpoofOpts && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: 1, fontSize: 13, color: '#A1A1AA' }}>{isImgTool ? 'Variantes par photo' : 'Variantes par vidéo'}</span>
                    <input type="number" min={1} max={24} value={copies} onChange={e => setCopies(Number(e.target.value))} style={numInp} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: 1, fontSize: 13, color: '#A1A1AA' }}>Intensité anti-détection</span>
                    <select value={intensity} onChange={e => setIntensity(e.target.value as any)} style={{ ...FIELD, width: 130, cursor: 'pointer' }}>
                      <option value="subtle" style={{ background: '#161618' }}>Subtile</option>
                      <option value="normal" style={{ background: '#161618' }}>Normale</option>
                      <option value="strong" style={{ background: '#161618' }}>Forte</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: 1, fontSize: 13, color: '#A1A1AA' }}>Localisation GPS</span>
                    <select value={gpsCity} onChange={e => setGpsCity(e.target.value)} style={{ ...FIELD, width: 150, cursor: 'pointer' }}>
                      {GPS_CITIES.map(c => <option key={c.k} value={c.k} style={{ background: '#161618' }}>{c.label}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: 1, fontSize: 13, color: '#A1A1AA' }}>Appareil (spoof)</span>
                    <select value={device} onChange={e => setDevice(e.target.value)} style={{ ...FIELD, width: 150, cursor: 'pointer' }}>
                      {SPOOF_DEVICES.map(d => <option key={d.k} value={d.k} style={{ background: '#161618' }}>{d.label}</option>)}
                    </select>
                  </label>
                </>
              )}
              {tool === 'montage' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: 1, fontSize: 13, color: '#A1A1AA' }}>Début (s)</span>
                    <input type="number" min={0} step={0.1} value={trimStart} onChange={e => setTrimStart(Number(e.target.value))} style={numInp} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: 1, fontSize: 13, color: '#A1A1AA' }}>Fin (s, vide = fin)</span>
                    <input type="number" min={0} step={0.1} value={trimEnd} onChange={e => setTrimEnd(e.target.value)} placeholder="—" style={numInp} />
                  </label>
                </>
              )}
              {tool === 'mixer' && (
                <>
                  <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={2} placeholder="Ta légende à incruster…"
                    style={{ ...TEXTAREA, minHeight: 60 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#A1A1AA', cursor: 'pointer' }}>
                    <Toggle on={capManual} onChange={() => setCapManual(v => !v)} />
                    Placement manuel
                  </label>
                  {!capManual ? (
                    <div>
                      <Segmented value={capPos} onChange={setCapPos} options={(['top', 'center', 'bottom'] as const).map(p => ({ v: p, l: p === 'top' ? 'Haut' : p === 'center' ? 'Centre' : 'Bas' }))} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#A1A1AA' }}>
                        <span style={{ width: 78 }}>Horizontal</span>
                        <input type="range" min={0} max={100} value={capX} onChange={e => setCapX(Number(e.target.value))} style={{ flex: 1, accentColor: theme.accent }} />
                        <span style={{ width: 38, textAlign: 'right', color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{capX}%</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#A1A1AA' }}>
                        <span style={{ width: 78 }}>Vertical</span>
                        <input type="range" min={0} max={100} value={capY} onChange={e => setCapY(Number(e.target.value))} style={{ flex: 1, accentColor: theme.accent }} />
                        <span style={{ width: 38, textAlign: 'right', color: '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{capY}%</span>
                      </label>
                      <span style={{ fontSize: 11.5, color: '#71717A' }}>0 % = haut/gauche · 100 % = bas/droite. La légende est centrée sur ce point.</span>
                    </div>
                  )}
                </>
              )}
              {tool === 'overlay' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Btn theme={theme} sm tone="primary" icon="M3 3h18v18H3z|M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" label={overlayImgs.length ? `${overlayImgs.length} photo(s)` : 'Choisir des photos'} onClick={() => setImgPicker(true)} />
                  {overlayImgs.map(im => <Chip key={im.id} text={im.title} tone="violet" />)}
                  {overlayImgs.length > 1 && (
                    <span style={{ marginLeft: 'auto' }}>
                      <Segmented sm value={ovMode} onChange={setOvMode} options={(['seq', 'random'] as const).map(mm => ({ v: mm, l: mm === 'seq' ? 'Séquentiel' : 'Aléatoire' }))} />
                    </span>
                  )}
                  <span style={{ width: '100%', fontSize: 11.5, color: '#71717A' }}>Photo incrustée au centre. Plusieurs photos → réparties entre les vidéos (séquentiel/aléatoire).</span>
                </div>
              )}
              {tool === 'subs' && (
                <span style={{ fontSize: 12, color: conns.groq ? '#A1A1AA' : '#FBBF24', lineHeight: 1.55 }}>
                  {conns.groq ? 'Transcription automatique via Groq Whisper, puis incrustation mot-groupe par mot-groupe. Langue auto.' : 'Aucune clé Groq détectée — configure-la dans les Réglages de l’app pour activer les sous-titres.'}
                </span>
              )}
            </div>
          </Panel>
        </div>

        <Panel theme={theme}>
          <PanelHead title="Sortie" />
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {([[isImgTool ? 'Photos sources' : 'Vidéos sources', String(nSrc)], ['Sortie', output], ['Coût', 'Gratuit']] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                <span style={{ color: '#8B8B94' }}>{k}</span><span style={{ fontWeight: 500, color: k === 'Coût' ? '#4ADE80' : '#EDEDEF', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span style={{ color: '#8B8B94' }}>Dossier de destination</span>
              <select value={destFolder} onChange={e => setDestFolder(e.target.value)} style={{ ...FIELD_SM, width: 'auto', marginLeft: 'auto', cursor: 'pointer', maxWidth: 150 }}>
                <option value="" style={{ background: '#161618' }}>Racine (aucun)</option>
                {folders.map(f => <option key={f} value={f} style={{ background: '#161618' }}>{f}</option>)}
              </select>
            </label>

            {running && (
              <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: theme.accent, transition: 'width .2s ease' }} />
              </div>
            )}

            <Btn theme={theme} tone="primary" disabled={nSrc === 0 || running} icon="M5 3l14 9-14 9z"
              label={running ? `Traitement… ${Math.round(progress * 100)}%` : nSrc === 0 ? 'Choisis des sources' : 'Générer'} onClick={generate} />
            <div style={{ fontSize: 11.5, color: '#71717A', textAlign: 'center', lineHeight: 1.5 }}>{isImgTool ? 'Traitement local instantané (aucun moteur à charger).' : 'Traitement local (ffmpeg) — le premier lancement charge le moteur (~30 Mo).'}</div>

            {logs.length > 0 && (
              <div style={{ padding: 10, borderRadius: 6, background: '#0E0E10', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 140, overflowY: 'auto', fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: '#A1A1AA', whiteSpace: 'pre-wrap' }}>{logs.join('\n')}</div>
            )}

            {results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#4ADE80' }}>{results.length} sortie(s) · enregistrées dans la banque</span>
                {results.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', height: 32, borderRadius: 6, background: '#161618', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#EDEDEF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    <a href={r.url} download={`${r.title}.${r.ext ?? 'mp4'}`} style={{ fontSize: 12, fontWeight: 500, color: theme.accentText, textDecoration: 'none' }}>Télécharger</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {pickerOpen && (
        <BankPicker theme={theme} user={user} org={org} kind={isImgTool ? 'images' : 'videos'} multi initialIds={[...src]}
          title={isImgTool ? 'Choisir des photos sources' : 'Choisir des vidéos sources'} onClose={() => setPickerOpen(false)}
          onApply={r => { if ((isImgTool && r.kind === 'images') || (!isImgTool && r.kind === 'videos')) setSrc(new Set(r.ids)) }} />
      )}

      {imgPicker && (
        <BankPicker theme={theme} user={user} org={org} kind="images" multi initialIds={overlayImgs.map(i => i.id)}
          title="Choisir des photos à incruster" onClose={() => setImgPicker(false)}
          onApply={(r: PickerResult) => {
            if (r.kind !== 'images' || r.ids.length === 0) { setOverlayImgs([]); return }
            const scope = (q: any) => currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
            scope(supabase.from('content_bank').select('id,title,storage_path,file_url')).in('id', r.ids).then(({ data }: any) => {
              setOverlayImgs((data ?? []) as any[])
            })
          }} />
      )}
    </div>
  )
}
