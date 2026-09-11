// Blowsome — Auto-contenu (VIP, desktop only).
// Pipeline mains-libres : pioche des clips de la banque (par tag) → recadre 9:16 +
// variante unique → caption IA (transcription audio Whisper + frames + TON style) →
// renvoie en banque (description = caption) → le scheduler/posting peut poster.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { supabase, type ContentItem } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { useTr } from '@/lib/i18n'
import { logActivity } from '@/lib/activityLog'
import { resolveContentToLocalPath, uploadVideoFromPath, getSignedUrl, type UploadScope } from '@/lib/storage'
import { BankPicker } from '@/pages/Bank'
import { useBlowCSS, BlowCard, BlowButton, BlowBadge, BlowEmpty, BlowPageHeader, Ico, ICON, INK, MUTED, HAIR, GOLD } from '../ui'

interface Recipe {
  id: string
  name: string
  tag?: string           // legacy (ancien mode « par tag », plus utilisé)
  count: number
  style: string          // exemples de captions (texte, une fois)
  useTranscript: boolean
  burnText?: boolean     // écrire la caption sur la vidéo
  textPos?: 'top' | 'middle' | 'bottom'
  captionStyle?: 'outline' | 'snapchat'   // format du texte incrusté
  poolStrict?: boolean   // utiliser les captions du pool telles quelles (pas d'IA)
  spice?: 'soft' | 'medium'   // intensité du sous-entendu (contenu suggestif)
  spoof?: boolean        // rendre chaque variante « 100% neuve » (anti-détection IG)
}
type JobStatus = 'queued' | 'clip' | 'reframe' | 'transcribe' | 'caption' | 'overlay' | 'spoof' | 'saving' | 'done' | 'error'
interface GenJob { i: number; status: JobStatus; sourceTitle?: string; caption?: string; error?: string; noCtx?: boolean }

const RECIPES_KEY = 'sf-blow-autocontent-recipes'
const loadRecipes = (): Recipe[] => { try { const a = JSON.parse(localStorage.getItem(RECIPES_KEY) || '[]'); return Array.isArray(a) ? a : [] } catch { return [] } }
const saveRecipes = (r: Recipe[]) => localStorage.setItem(RECIPES_KEY, JSON.stringify(r))
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const STATUS_LABEL: Record<JobStatus, [string, string]> = {
  queued: ['En attente', 'Queued'], clip: ['Choix du clip', 'Picking clip'],
  reframe: ['Recadrage 9:16', 'Reframing 9:16'], transcribe: ['Transcription', 'Transcribing'],
  caption: ['Caption IA', 'AI caption'], overlay: ['Texte sur la vidéo', 'Text on video'], spoof: ['Rendre unique', 'Making unique'], saving: ['Envoi banque', 'Saving to bank'],
  done: ['Prêt', 'Ready'], error: ['Erreur', 'Error'],
}

export function BlowAutoContent({ user }: { user: User }) {
  useBlowCSS()
  const tr = useTr()
  const { currentOrg } = useOrg()
  const conns = useConnections(user)

  const [recipes, setRecipes] = useState<Recipe[]>(() => loadRecipes())
  const [editingId, setEditingId] = useState<string | null>(null)

  // Formulaire (recette en cours d'édition ou nouvelle)
  const [name, setName] = useState('')
  const [sourceMode, setSourceMode] = useState<'pick' | 'upload'>('pick')
  const [uploads, setUploads] = useState<File[]>([])
  const [pickedItems, setPickedItems] = useState<ContentItem[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [showCapPicker, setShowCapPicker] = useState(false)   // picker de captions (banque)
  const [count, setCount] = useState(10)
  const [style, setStyle] = useState('')
  const [useTranscript, setUseTranscript] = useState(true)
  const [burnText, setBurnText] = useState(true)
  const [textPos, setTextPos] = useState<'top' | 'middle' | 'bottom'>('bottom')
  const [captionStyle, setCaptionStyle] = useState<'outline' | 'snapchat'>('snapchat')
  const [poolStrict, setPoolStrict] = useState(false)   // utiliser le pool tel quel (pas d'IA)
  const [spice, setSpice] = useState<'soft' | 'medium'>('soft')
  const [spoof, setSpoof] = useState(true)   // « 100% neuve » : transforme + casse la signature
  // Timing : coupe (début/fin) et/ou micro-vitesse (0,98–1,02×) — via l'étape spoof serveur.
  const [useTrim, setUseTrim] = useState(false)
  const [trimStart, setTrimStart] = useState('0')
  const [trimEnd, setTrimEnd] = useState('')
  // Coupe aléatoire : retire une durée tirée au hasard [min,max] s au DÉBUT de chaque vidéo.
  const [trimRandom, setTrimRandom] = useState(true)
  const [trimRandMin, setTrimRandMin] = useState('0.1')
  const [trimRandMax, setTrimRandMax] = useState('1')
  const [useSpeed, setUseSpeed] = useState(false)
  const [speedMin, setSpeedMin] = useState('0.98')
  const [speedMax, setSpeedMax] = useState('1.02')

  const [jobs, setJobs] = useState<GenJob[]>([])
  const [running, setRunning] = useState(false)

  const isWeb = typeof window !== 'undefined' && (window as unknown as { __IS_WEB?: boolean }).__IS_WEB === true
  const hasNative = !isWeb && !!window.electronAPI

  function resetForm() { setEditingId(null); setName(''); setCount(10); setStyle(''); setUseTranscript(true); setBurnText(true); setTextPos('bottom'); setCaptionStyle('snapchat'); setPoolStrict(false); setSpice('soft'); setSpoof(true) }
  function loadRecipe(r: Recipe) {
    setEditingId(r.id); setName(r.name); setCount(r.count); setStyle(r.style)
    setUseTranscript(r.useTranscript); setBurnText(r.burnText ?? true); setTextPos(r.textPos ?? 'bottom'); setCaptionStyle(r.captionStyle ?? 'snapchat'); setPoolStrict(r.poolStrict ?? false); setSpice(r.spice ?? 'soft'); setSpoof(r.spoof ?? true)
  }
  function persistRecipe() {
    if (!name.trim()) return
    const r: Recipe = { id: editingId ?? newId(), name: name.trim(), count, style, useTranscript, burnText, textPos, captionStyle, poolStrict, spice, spoof }
    const next = editingId ? recipes.map(x => x.id === editingId ? r : x) : [...recipes, r]
    setRecipes(next); saveRecipes(next); setEditingId(r.id)
  }
  function deleteRecipe(id: string) {
    const next = recipes.filter(r => r.id !== id); setRecipes(next); saveRecipes(next)
    if (editingId === id) resetForm()
  }

  const setJob = (i: number, patch: Partial<GenJob>) => setJobs(prev => prev.map(j => j.i === i ? { ...j, ...patch } : j))

  // Résout une source (item banque OU fichier uploadé) en { nativePath, url }.
  async function resolveSource(src: { item?: ContentItem; file?: File }): Promise<{ nativePath: string | null; url: string }> {
    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }
    if (src.file) {
      // Desktop : le chemin natif du fichier suffit (traitement natif local).
      const p = (src.file as unknown as { path?: string }).path
      if (hasNative && p) return { nativePath: p, url: '' }
      // Web : on uploade le fichier pour obtenir une URL SIGNÉE — le serveur
      // (incrustation / transcription) ne peut pas lire une URL blob locale.
      const blobUrl = URL.createObjectURL(src.file)
      try {
        const up = await uploadVideoFromPath(blobUrl, scope)
        return { nativePath: null, url: (await getSignedUrl(up.storagePath)) ?? '' }
      } finally { URL.revokeObjectURL(blobUrl) }
    }
    const it = src.item!
    const nativePath = hasNative ? await resolveContentToLocalPath(it) : null
    const url = it.storage_path ? ((await getSignedUrl(it.storage_path)) ?? '') : (it.file_url ?? '')
    return { nativePath, url }
  }

  // ── Génération ─────────────────────────────────────────────────────────────
  // Réglages aléatoires PAR vidéo pour le spoof (mêmes leviers que l'onglet Spoof) :
  // vitesse x1→1.3, teinte, grain, zoom… → casse l'empreinte audio+visuelle côté IG.
  // Pas de miroir ici (le texte incrusté serait inversé).
  const randI = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a
  const randF = (a: number, b: number, d = 3) => +(Math.random() * (b - a) + a).toFixed(d)
  const randomAdjustments = () => ({
    brightness: randI(-12, 12), saturation: randI(-15, 15), contrast: randI(-12, 12),
    gamma: randF(0.90, 1.10), hue: randI(-15, 15), noise: randI(5, 14),
    sharpen: randF(0, 0.6, 2), zoomPct: randI(3, 9), panX: randI(-25, 25), panY: randI(-25, 25),
    speed: randF(1.0, 1.3), vignette: Math.random() < 0.35, flipH: false,
  })
  const randDate30 = () => new Date(Date.now() - randI(0, 30) * 86400000).toISOString().slice(0, 10)

  async function generate() {
    if (running) return
    const srcList: Array<{ title: string; item?: ContentItem; file?: File }> =
      sourceMode === 'upload'
        ? uploads.map(f => ({ title: f.name, file: f }))
        : pickedItems.map(it => ({ title: it.title, item: it }))
    if (srcList.length === 0) return
    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }
    const styleLines = style.split('\n').map(s => s.trim()).filter(Boolean)

    // Nettoyage d'une phrase (partagé caption + variantes anti-doublon).
    // On GARDE un éventuel emoji (le rendu navigateur les affiche) mais on retire
    // hashtags/guillemets/« hmm ». Emojis limités à 1 en aval (prompt).
    const cleanCap = (raw: string): string => raw
      .replace(/#[^\s#]+/g, '')
      .replace(/["«»]/g, '')
      .replace(/\bh+m+\b/gi, '')
      .split(/[\n]/)[0].replace(/\s+/g, ' ').trim()
      .replace(/^['’"]+|['’"]+$/g, '').trim()
    // Unicité du lot : on ne réutilise JAMAIS deux fois la même phrase.
    const usedCaptions = new Set<string>()
    const normCap = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

    setRunning(true)
    setJobs(Array.from({ length: count }, (_, i) => ({ i, status: 'queued' as JobStatus })))

    for (let i = 0; i < count; i++) {
      const src = srcList[i % srcList.length]
      try {
        setJob(i, { status: 'clip', sourceTitle: src.title })
        const { nativePath, url } = await resolveSource(src)
        // Overlay + caption sur la vidéo ORIGINALE (couleurs intactes pour l'IA/frames).
        // Le spoof (transforms + métadonnées) est appliqué APRÈS, à l'étape 4b, pour
        // que chaque variante soit « 100% neuve » côté IG.
        // desktop → chemin local ; web → URL (signée pour la banque, blob pour un upload).
        const mediaRef = (hasNative && nativePath) ? nativePath : url
        if (!mediaRef) throw new Error(tr('Source introuvable', 'Source not found'))

        // 2) Transcription audio (best-effort) — « ce qui est dit »
        let transcript = ''
        if (useTranscript && conns.groq && window.electronAPI?.groqTranscription) {
          setJob(i, { status: 'transcribe' })
          try {
            if (hasNative && nativePath && window.electronAPI.readFileBytes) {
              const b = await window.electronAPI.readFileBytes(nativePath)
              if (b?.ok && b.bytes) {
                const raw = b.bytes as ArrayBuffer | Uint8Array
                const buf = (raw instanceof Uint8Array ? raw.buffer : raw) as ArrayBuffer
                const tRes = await window.electronAPI.groqTranscription({ apiKey: conns.groq, audioBytes: buf, filename: 'clip.mp4' }) as { ok?: boolean; data?: { text?: string } }
                if (tRes?.ok) transcript = String(tRes.data?.text ?? '').trim()
              }
            } else if (/^https?:/i.test(mediaRef)) {
              // Web : le proxy récupère la vidéo par URL signée (marche aussi pour un upload).
              const gq = window.electronAPI.groqTranscription as unknown as (o: { apiKey: string; videoUrl: string; filename: string }) => Promise<{ ok?: boolean; data?: { text?: string } }>
              const tRes = await gq({ apiKey: conns.groq, videoUrl: mediaRef, filename: 'clip.mp4' })
              if (tRes?.ok) transcript = String(tRes.data?.text ?? '').trim()
            }
          } catch { /* transcription optionnelle */ }
        }

        // 3) Caption — « un peu des deux », en PRIORISANT tes phrases :
        //   ~40 % → ta phrase EXACTE (verbatim)
        //   ~35 % → variante minime de ta phrase (ajoute/enlève/change 1-2 mots)
        //   ~25 % → hook frais réactif à la vidéo, dans ton ton
        // (si aucun exemple fourni → toujours un hook frais réactif à la vidéo).
        setJob(i, { status: 'caption' })
        let caption = ''
        let gotFrames = 0
        const haveExamples = styleLines.length > 0
        const baseLine = haveExamples ? styleLines[i % styleLines.length] : ''  // rotation
        const roll = Math.random()
        // Pool STRICT : on utilise les phrases du pool TELLES QUELLES (rotation), sans IA.
        const strategy: 'verbatim' | 'variation' | 'fresh' =
          poolStrict && haveExamples ? 'verbatim'
          // ~15 % verbatim · ~30 % variante légère · ~55 % hook frais réactif à la vidéo.
          : !haveExamples ? 'fresh' : roll < 0.10 ? 'verbatim' : roll < 0.28 ? 'variation' : 'fresh'

        if (strategy === 'verbatim') {
          caption = baseLine
        } else if (strategy === 'variation') {
          caption = baseLine  // repli si l'IA n'est pas dispo / échoue
          if (conns.anthropic && window.electronAPI?.anthropicVisionRequest) {
            try {
              const prompt = buildVariationPrompt(baseLine, styleLines, tr)
              const vRes = await window.electronAPI.anthropicVisionRequest({ apiKey: conns.anthropic, model: 'claude-haiku-4-5-20251001', maxTokens: 100, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }] })
              if (vRes?.ok) {
                const data = vRes.data as { content?: Array<{ type: string; text?: string }> }
                const t = (data?.content?.find(b => b.type === 'text')?.text ?? '').trim().replace(/^["'«»\s]+|["'«»\s]+$/g, '')
                if (t) caption = t
              }
            } catch { /* variation best-effort → verbatim */ }
          }
        } else if (conns.anthropic && window.electronAPI?.anthropicVisionRequest) {
          // Hook frais réactif à la vidéo, dans ton ton (buildCaptionPrompt imite tes exemples).
          try {
            let images: Array<{ type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }> = []
            if (window.electronAPI.extractFrames) {
              const fr = await window.electronAPI.extractFrames({ filePath: mediaRef, endTime: 10, fps: 0.7 })
              const frames = (fr?.ok && fr.frames) ? fr.frames.slice(0, 8) : []
              images = frames.map(f => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.data } }))
            }
            gotFrames = images.length
            const ANGLES = ['la surprise', 'l\'agacement léger', 'l\'amusement', 'la gêne', 'le défi / la provoc', 'la résignation', 'l\'incrédulité', 'l\'admiration à contrecœur', 'le « j\'y crois pas »', 'la lassitude', 'la jalousie taquine', 'le fatalisme']
            const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)]
            const prompt = buildCaptionPrompt(styleLines, transcript, images.length > 0, spice, false, angle, tr)
            const content: unknown[] = images.length > 0 ? [...images, { type: 'text', text: prompt }] : [{ type: 'text', text: prompt }]
            const vRes = await window.electronAPI.anthropicVisionRequest({ apiKey: conns.anthropic, model: 'claude-haiku-4-5-20251001', maxTokens: 200, messages: [{ role: 'user', content }] })
            if (vRes?.ok) {
              const data = vRes.data as { content?: Array<{ type: string; text?: string }> }
              const t = (data?.content?.find(b => b.type === 'text')?.text ?? '').trim().replace(/^["'«»\s]+|["'«»\s]+$/g, '')
              if (t && !/ne vois pas|n'ai pas accès|pas d'accès|peux-tu (partager|me décrire|m'envoyer)|don'?t see|no access|can you (share|describe)|unable to (see|access)|share the (video|image)/i.test(t)) caption = t
            }
          } catch { /* caption best-effort */ }
        }
        if (!caption) caption = styleLines[Math.floor(Math.random() * styleLines.length)] ?? src.title

        // Nettoyage SANS charcuter la phrase (on garde la 1re ligne ENTIÈRE).
        caption = cleanCap(caption)

        // Anti-doublon : si cette phrase est déjà sortie dans le lot, on en régénère
        // une variante (IA) — ou on pioche un autre exemple — jusqu'à obtenir une
        // phrase INÉDITE. Jamais deux vidéos avec exactement le même texte.
        let dedupGuard = 0
        while (caption && usedCaptions.has(normCap(caption)) && dedupGuard < 5) {
          dedupGuard++
          let alt = ''
          if (haveExamples && conns.anthropic && window.electronAPI?.anthropicVisionRequest) {
            try {
              const vprompt = buildVariationPrompt(baseLine || caption, styleLines, tr)
              const vRes = await window.electronAPI.anthropicVisionRequest({ apiKey: conns.anthropic, model: 'claude-haiku-4-5-20251001', maxTokens: 100, messages: [{ role: 'user', content: [{ type: 'text', text: vprompt }] }] })
              if (vRes?.ok) {
                const data = vRes.data as { content?: Array<{ type: string; text?: string }> }
                alt = (data?.content?.find(b => b.type === 'text')?.text ?? '').trim()
              }
            } catch { /* ignore → tentative suivante */ }
          } else if (haveExamples) {
            alt = styleLines[(i + dedupGuard) % styleLines.length]   // pas d'IA : autre exemple
          }
          if (!alt) break
          caption = cleanCap(alt)
        }
        if (caption) usedCaptions.add(normCap(caption))

        // 3b) Incruste la caption SUR la vidéo (hook POV à l'écran). Bloquant si activé :
        // en cas d'échec on remonte l'erreur au lieu de sauver une vidéo sans texte.
        let finalRef = mediaRef
        if (burnText && caption) {
          setJob(i, { status: 'overlay' })
          if (!window.electronAPI?.runFfmpegMixOverlay) throw new Error(tr('Incrustation indisponible (rebuild desktop ?)', 'Overlay unavailable (rebuild desktop?)'))
          // La légende est rendue en PNG CÔTÉ NAVIGATEUR (vraies polices + emojis) →
          // le serveur se contente de l'incruster (ffmpeg Vercel n'a pas drawtext).
          const cap = renderCaptionPng(caption, captionStyle)
          const ov = await window.electronAPI.runFfmpegMixOverlay({ sourcePath: mediaRef, caption, position: textPos, fontSize: 54, fontColor: '#FFFFFF', captionStyle, captionPng: cap.png, captionH: cap.h })
          if (!ov?.ok || !ov.outputPath) throw new Error(`${tr('Incrustation échouée', 'Overlay failed')} : ${ov?.error ?? '?'}`)
          finalRef = ov.storagePath ? ((await getSignedUrl(ov.storagePath)) ?? ov.outputPath) : ov.outputPath
        }

        // 4) Envoi en banque : ré-upload dans l'emplacement permanent (vignette + accès OK)
        setJob(i, { status: 'saving', caption })
        const up = await uploadVideoFromPath(finalRef, scope)
        let storagePath = up.storagePath
        const thumbnailPath = up.thumbnailPath

        // 4b) Spoof « 100% neuve » : transforme (vitesse/teinte/grain/zoom) + nouvelles
        // métadonnées (appareil/GPS/date) + ré-encodage → casse l'empreinte IG. On
        // spoofe le fichier DÉJÀ uploadé (URL signée) et on garde la miniature d'origine
        // (même visuel). Best-effort : si le spoof échoue on garde la version overlay.
        // On lance l'étape serveur si spoof OU coupe OU vitesse est demandé.
        if (spoof || useTrim || useSpeed) {
          setJob(i, { status: 'spoof', caption })
          try {
            const sUrl = await getSignedUrl(storagePath)
            const { data: { session } } = await supabase.auth.getSession()
            // Ajustements : si spoof OFF mais coupe/vitesse ON → pas de transformation
            // visuelle (adjustments neutres), on ne fait que couper / changer la vitesse.
            const adj = spoof ? randomAdjustments() : ({} as Record<string, number>)
            if (useSpeed) {
              const lo = Math.max(0.9, Number(speedMin) || 0.98)
              const hi = Math.min(1.35, Number(speedMax) || 1.02)
              adj.speed = randF(Math.min(lo, hi), Math.max(lo, hi))
            }
            // Coupe : aléatoire (retire [min,max] s au DÉBUT ET à la FIN, unique par
            // vidéo) OU fixe (début / fin absolue).
            let tS: number | undefined
            let tE: number | undefined
            let tEndCut: number | undefined
            if (useTrim) {
              if (trimRandom) {
                const lo = Math.max(0, Number(trimRandMin) || 0.1)
                const hi = Math.max(lo, Number(trimRandMax) || 1)
                tS = randF(lo, hi, 2)        // début coupé d'une durée aléatoire
                tEndCut = randF(lo, hi, 2)   // fin coupée d'une durée aléatoire (résolue serveur)
              } else {
                tS = Math.max(0, Number(trimStart) || 0)
                const tEraw = trimEnd.trim() ? Number(trimEnd) : NaN
                tE = Number.isFinite(tEraw) ? tEraw : undefined
              }
            }
            const rr = await fetch('/api/repurpose', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mode: 'spoof', sourceUrl: sUrl, userId: user.id,
                preset: spoof ? 'random' : 'iphone17pro', gpsCity: spoof ? 'random' : 'newyork',
                customDate: randDate30().replace(/-/g, ':'),
                adjustments: adj,
                trimStart: tS, trimEnd: tE, trimEndCut: tEndCut,
                supabaseToken: session?.access_token, supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              }),
            }).then(r => r.json()).catch(() => ({ ok: false }))
            if (rr?.ok && rr.storagePath) storagePath = rr.storagePath
          } catch { /* best-effort : on garde le fichier overlay */ }
        }

        const baseTag = name.trim() || 'autocontent'
        const title = `${src.title || baseTag} · auto ${i + 1}`
        const { error } = await supabase.from('content_bank').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          title, file_url: null, storage_path: storagePath, thumbnail_path: thumbnailPath,
          tags: Array.from(new Set([baseTag, 'autocontent'].filter(Boolean))), notes: caption, description: caption,
        })
        if (error) throw new Error(error.message)
        logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_add', details: { title, source: 'autocontent' } })

        setJob(i, { status: 'done', caption, noCtx: gotFrames === 0 && !transcript.trim() })
      } catch (e) {
        setJob(i, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }
    setRunning(false)
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  const doneCount = jobs.filter(j => j.status === 'done').length
  const errCount = jobs.filter(j => j.status === 'error').length
  const canGenerate = !running && count > 0 && (
    sourceMode === 'pick' ? pickedItems.length > 0 : uploads.length > 0)

  return (
    <>
      <BlowPageHeader
        title={tr('Auto-contenu', 'Auto-content')}
        subtitle={tr('Génère des vidéos + captions prêtes à poster, en pilote automatique', 'Generate post-ready videos + captions on autopilot')}
        action={<BlowBadge tone="gold">✦ {tr('VIP', 'VIP')}</BlowBadge>}
      />

      {isWeb && (
        <BlowCard style={{ padding: 14, marginBottom: 18, borderColor: 'rgba(233,196,106,0.35)' }}>
          <p style={{ margin: 0, color: GOLD, fontSize: 12.5 }}>{tr('Web : le traitement vidéo passe par le serveur/navigateur (plus lent). Pour la vitesse max, utilise l\'app desktop.', 'Web: video processing runs via server/browser (slower). For max speed use the desktop app.')}</p>
        </BlowCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 18, alignItems: 'start' }}>
        {/* ── Colonne config ─────────────────────────────────────────── */}
        <BlowCard style={{ padding: 22 }}>
          <SectionLabel>{tr('1 · Type de vidéo (recette)', '1 · Video type (recipe)')}</SectionLabel>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={tr('Nom du type (ex : POV motivation)', 'Type name (e.g. POV motivation)')} style={inp} />

          <SectionLabel style={{ marginTop: 18 }}>{tr('2 · Clips source', '2 · Source clips')}</SectionLabel>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {(['pick', 'upload'] as const).map(m => (
              <button key={m} onClick={() => setSourceMode(m)} className="blow-tap"
                style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 9, cursor: 'pointer',
                  border: `1px solid ${sourceMode === m ? 'rgba(168,85,247,0.6)' : HAIR}`, background: sourceMode === m ? 'rgba(168,85,247,0.18)' : 'transparent', color: sourceMode === m ? '#E9D5FF' : MUTED }}>
                {m === 'pick' ? tr('Choisir dans la banque', 'Pick from bank') : tr('Mes vidéos (upload)', 'My videos (upload)')}
              </button>
            ))}
          </div>
          {sourceMode === 'pick' ? (
            <div>
              <button onClick={() => setShowPicker(true)} className="blow-tap"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 11, cursor: 'pointer', border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.03)', color: INK, fontSize: 13, fontWeight: 700 }}>
                <Ico d={ICON.folder} size={15} /> {pickedItems.length > 0 ? tr(`${pickedItems.length} vidéo(s) choisie(s) — modifier`, `${pickedItems.length} video(s) picked — edit`) : tr('Choisir des vidéos…', 'Pick videos…')}
              </button>
              {pickedItems.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {pickedItems.map(it => (
                    <span key={it.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '4px 9px', borderRadius: 99, background: 'rgba(255,255,255,0.05)', border: `1px solid ${HAIR}`, color: MUTED, maxWidth: 220 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                      <button onClick={() => setPickedItems(p => p.filter(x => x.id !== it.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171', padding: 0, display: 'flex' }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="blow-tap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 20, borderRadius: 12, border: `1px dashed ${HAIR}`, background: 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'center' }}>
                <input type="file" accept="video/*" multiple style={{ display: 'none' }}
                  onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) setUploads(u => [...u, ...fs]); e.currentTarget.value = '' }} />
                <span style={{ fontSize: 22 }}>⬆️</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{tr('Choisis tes vidéos originales', 'Pick your original videos')}</span>
                <span style={{ fontSize: 11.5, color: MUTED }}>{tr('MP4/MOV — plusieurs à la fois', 'MP4/MOV — multiple at once')}</span>
              </label>
              {uploads.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {uploads.map((f, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: `1px solid ${HAIR}` }}>
                      <span style={{ fontSize: 12, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                      <span style={{ fontSize: 10.5, color: MUTED, whiteSpace: 'nowrap' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button onClick={() => setUploads(u => u.filter((_, j) => j !== idx))} style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 14 }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => setUploads([])} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 11.5 }}>{tr('Tout retirer', 'Clear all')}</button>
                </div>
              )}
            </div>
          )}

          <SectionLabel style={{ marginTop: 18 }}>{tr('3 · Tes captions (une par ligne)', '3 · Your captions (one per line)')}</SectionLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setShowCapPicker(true)} className="blow-tap"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.03)', color: INK, fontSize: 12.5, fontWeight: 700 }}>
              <Ico d={ICON.folder} size={14} /> {tr('Choisir dans la banque', 'Pick from bank')}
            </button>
            {style.trim() && (
              <button onClick={() => setStyle('')} className="blow-tap"
                style={{ padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${HAIR}`, background: 'transparent', color: MUTED, fontSize: 12.5, fontWeight: 700 }}>
                {tr('Vider', 'Clear')}
              </button>
            )}
          </div>
          <textarea value={style} onChange={e => setStyle(e.target.value)} rows={5}
            placeholder={tr('Une phrase par ligne (vague, réaction)…\nSérieux là ?\nLe truc de fou !\nJ\'y crois pas', 'One line per row (vague, reaction)…\nAre you serious?\nThis is insane!\nI can\'t believe it')}
            style={{ ...inp, resize: 'vertical', minHeight: 110, fontFamily: 'inherit', lineHeight: 1.6 }} />
          {/* Mode « juste mes captions » (pas d'IA) */}
          <div style={{ marginTop: 12 }}>
            <Switch on={poolStrict} onChange={setPoolStrict}
              label={tr('Utiliser UNIQUEMENT mes captions (pas d\'IA)', 'Use ONLY my captions (no AI)')}
              sub={poolStrict
                ? tr('Tes phrases sont réparties telles quelles entre les vidéos.', 'Your lines are distributed as-is across the videos.')
                : tr('L\'IA s\'inspire de tes phrases pour en générer d\'autres dans le même ton.', 'The AI draws on your lines to generate more in the same tone.')} />
          </div>

          <SectionLabel style={{ marginTop: 18 }}>{tr('4 · Options', '4 · Options')}</SectionLabel>

          {/* ── Légende ─────────────────────────────────────────────── */}
          <OptGroup title={tr('Légende', 'Caption')}>
            <Switch on={burnText} onChange={setBurnText}
              label={tr('Écrire la caption sur la vidéo', 'Burn the caption on the video')}
              sub={tr('Hook POV affiché à l\'écran', 'POV hook shown on screen')} />
            {burnText && (
              <div style={insetStyle}>
                <Field label={tr('Format', 'Style')}>
                  <Seg value={captionStyle} onChange={setCaptionStyle} options={[
                    { v: 'snapchat', label: tr('Bande Snapchat', 'Snapchat bar') },
                    { v: 'outline', label: tr('Contour', 'Outline') }]} />
                </Field>
                <Field label={tr('Position', 'Position')}>
                  <Seg value={textPos} onChange={setTextPos} options={[
                    { v: 'top', label: tr('Haut', 'Top') },
                    { v: 'middle', label: tr('Milieu', 'Middle') },
                    { v: 'bottom', label: tr('Bas', 'Bottom') }]} />
                </Field>
              </div>
            )}
            <Switch on={useTranscript} onChange={setUseTranscript}
              label={tr('Transcrire l\'audio (Whisper)', 'Transcribe audio (Whisper)')}
              sub={tr('Caption fidèle à ce qui est dit', 'Caption true to what\'s said')} />
            <Field label={tr('Sous-entendu', 'Innuendo')}>
              <Seg value={spice} onChange={setSpice} options={[
                { v: 'soft', label: 'Soft' }, { v: 'medium', label: 'Medium' }]} />
              <span style={{ fontSize: 11, color: 'rgba(236,233,245,0.4)' }}>{tr('taquin, jamais explicite', 'teasing, never explicit')}</span>
            </Field>
          </OptGroup>

          {/* ── Anti-détection & montage ────────────────────────────── */}
          <OptGroup title={tr('Anti-détection & montage', 'Anti-detection & editing')}>
            <Switch on={spoof} onChange={setSpoof}
              label={tr('Rendre chaque variante « 100% neuve »', 'Make each variant “100% new”')}
              sub={tr('Teinte, grain, zoom + métadonnées (appareil/GPS/date) + ré-encodage', 'Hue, grain, zoom + metadata (device/GPS/date) + re-encode')} />
            <Switch on={useTrim} onChange={setUseTrim}
              label={tr('Couper la vidéo', 'Trim the video')}
              sub={tr('Retire un morceau au début ET à la fin — unique par vidéo', 'Trims a slice off the start AND the end — unique per video')} />
            {useTrim && (
              <div style={insetStyle}>
                <Seg value={trimRandom ? 'rand' : 'fixed'} onChange={v => setTrimRandom(v === 'rand')} options={[
                  { v: 'rand', label: tr('Aléatoire', 'Random') }, { v: 'fixed', label: tr('Fixe', 'Fixed') }]} />
                {trimRandom ? (
                  <Field label={tr('Entre', 'Between')}>
                    <input type="number" min={0} step={0.1} value={trimRandMin} onChange={e => setTrimRandMin(e.target.value)} style={numInp} />
                    <span style={{ fontSize: 12.5, color: MUTED }}>→</span>
                    <input type="number" min={0} step={0.1} value={trimRandMax} onChange={e => setTrimRandMax(e.target.value)} style={numInp} />
                    <span style={{ fontSize: 11, color: 'rgba(236,233,245,0.4)' }}>{tr('s — de chaque côté', 's — on each side')}</span>
                  </Field>
                ) : (
                  <Field label={tr('Début / Fin', 'Start / End')}>
                    <input type="number" min={0} step={0.1} value={trimStart} onChange={e => setTrimStart(e.target.value)} style={numInp} />
                    <span style={{ fontSize: 12.5, color: MUTED }}>→</span>
                    <input type="number" min={0} step={0.1} value={trimEnd} onChange={e => setTrimEnd(e.target.value)} placeholder={tr('fin', 'end')} style={numInp} />
                    <span style={{ fontSize: 11, color: 'rgba(236,233,245,0.4)' }}>{tr('secondes', 'seconds')}</span>
                  </Field>
                )}
              </div>
            )}
            <Switch on={useSpeed} onChange={setUseSpeed}
              label={tr('Micro-vitesse aléatoire', 'Random micro-speed')}
              sub={tr('Vitesse légèrement différente par vidéo', 'Slightly different speed per video')} />
            {useSpeed && (
              <div style={insetStyle}>
                <Field label={tr('Vitesse', 'Speed')}>
                  <input type="number" min={0.9} max={1.35} step={0.01} value={speedMin} onChange={e => setSpeedMin(e.target.value)} style={numInp} />
                  <span style={{ fontSize: 12.5, color: MUTED }}>→</span>
                  <input type="number" min={0.9} max={1.35} step={0.01} value={speedMax} onChange={e => setSpeedMax(e.target.value)} style={numInp} />
                  <span style={{ fontSize: 11, color: 'rgba(236,233,245,0.4)' }}>{tr('× (ex : 0,98 → 1,02)', '× (e.g. 0.98 → 1.02)')}</span>
                </Field>
              </div>
            )}
          </OptGroup>

          {/* ── Sortie ──────────────────────────────────────────────── */}
          <OptGroup title={tr('Sortie', 'Output')}>
            <Field label={tr('Nombre de vidéos', 'Number of videos')}>
              <input type="number" min={1} max={50} value={count} onChange={e => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} style={{ ...numInp, width: 84 }} />
            </Field>
          </OptGroup>

          {conns.anthropic ? null : (
            <p style={{ fontSize: 11.5, color: GOLD, margin: '14px 0 0' }}>{tr('⚠ Clé Anthropic manquante (Réglages) — les captions retomberont sur tes exemples.', '⚠ Anthropic key missing (Settings) — captions will fall back to your examples.')}</p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <BlowButton onClick={generate} style={{ opacity: canGenerate ? 1 : 0.5, pointerEvents: canGenerate ? 'auto' : 'none' }}>
              <Ico d={ICON.bolt} size={15} /> {running ? tr('Génération…', 'Generating…') : tr(`Générer ${count}`, `Generate ${count}`)}
            </BlowButton>
            <BlowButton variant="ghost" onClick={persistRecipe} style={{ opacity: name.trim() ? 1 : 0.5, pointerEvents: name.trim() ? 'auto' : 'none' }}>
              <Ico d={ICON.spark} size={14} /> {editingId ? tr('Mettre à jour la recette', 'Update recipe') : tr('Sauver la recette', 'Save recipe')}
            </BlowButton>
            {editingId && <BlowButton variant="ghost" onClick={resetForm}>{tr('Nouvelle', 'New')}</BlowButton>}
          </div>
        </BlowCard>

        {/* ── Colonne recettes + progression ─────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <BlowCard style={{ padding: 18 }}>
            <SectionLabel>{tr('Mes types', 'My types')}</SectionLabel>
            {recipes.length === 0
              ? <p style={{ fontSize: 12.5, color: MUTED, margin: '2px 0 0' }}>{tr('Sauve une recette pour la réutiliser en un clic.', 'Save a recipe to reuse it in one click.')}</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recipes.map(r => (
                    <div key={r.id} className="blow-tap" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 11, cursor: 'pointer',
                      border: `1px solid ${editingId === r.id ? 'rgba(168,85,247,0.5)' : HAIR}`, background: editingId === r.id ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.02)' }}
                      onClick={() => loadRecipe(r)}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: MUTED }}>{r.count}× · {r.captionStyle === 'snapchat' ? tr('Snapchat', 'Snapchat') : tr('Contour', 'Outline')} · {r.spice ?? 'soft'}</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); deleteRecipe(r.id) }} style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 15, padding: 4 }}>×</button>
                    </div>
                  ))}
                </div>}
          </BlowCard>

          <BlowCard style={{ padding: 18 }}>
            <SectionLabel>{tr('Progression', 'Progress')}</SectionLabel>
            {jobs.length === 0
              ? <BlowEmpty title={tr('Rien encore', 'Nothing yet')} hint={tr('Choisis tes vidéos, colle ton style, lance.', 'Pick your videos, paste your style, run.')} icon="✦" />
              : <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <BlowBadge tone="ok">{doneCount} {tr('prêtes', 'ready')}</BlowBadge>
                    {errCount > 0 && <BlowBadge tone="muted">{errCount} {tr('erreurs', 'errors')}</BlowBadge>}
                    <BlowBadge tone="accent">{jobs.length} {tr('total', 'total')}</BlowBadge>
                  </div>
                  <div className="blow-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 360, overflowY: 'auto' }}>
                    {jobs.map(j => (
                      <div key={j.i} style={{ padding: '8px 10px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: `1px solid ${HAIR}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{j.i + 1} {j.sourceTitle ? `· ${j.sourceTitle}` : ''}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: j.status === 'done' ? '#6EE7B7' : j.status === 'error' ? '#F87171' : '#D8B4FE', whiteSpace: 'nowrap' }}>
                            {tr(STATUS_LABEL[j.status][0], STATUS_LABEL[j.status][1])}
                          </span>
                        </div>
                        {j.caption && j.status === 'done' && <p style={{ margin: '5px 0 0', fontSize: 11, color: MUTED, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{j.caption}</p>}
                        {j.noCtx && j.status === 'done' && <p style={{ margin: '3px 0 0', fontSize: 10, color: GOLD }}>{tr('⚠ vidéo non analysée (ni image ni son) — caption générique', '⚠ video not analyzed (no frame/audio) — generic caption')}</p>}
                        {j.error && <p style={{ margin: '5px 0 0', fontSize: 11, color: '#F87171' }}>{j.error}</p>}
                      </div>
                    ))}
                  </div>
                  {doneCount > 0 && !running && (
                    <p style={{ fontSize: 11.5, color: MUTED, margin: '12px 0 0', lineHeight: 1.5 }}>
                      {tr('✓ Ajoutées à la banque (tag « autocontent »). Va dans Posting/Scheduler pour les publier.', '✓ Added to the bank (tag "autocontent"). Go to Posting/Scheduler to publish them.')}
                    </p>
                  )}
                </>}
          </BlowCard>
        </div>
      </div>

      {showPicker && (
        <BankPicker
          user={user}
          mode="multi"
          resolveMode="signed-url"
          onSelect={(_paths, _titles, _descs, items) => { if (items && items.length) setPickedItems(items); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showCapPicker && (
        <CaptionBankPicker user={user} currentOrg={currentOrg}
          onClose={() => setShowCapPicker(false)}
          onSelect={texts => {
            if (texts.length) setStyle(prev => {
              const existing = prev.split('\n').map(s => s.trim()).filter(Boolean)
              const merged = [...existing, ...texts.map(t => t.trim()).filter(Boolean)]
              return Array.from(new Set(merged)).join('\n')
            })
            setShowCapPicker(false)
          }} />
      )}
    </>
  )
}

// ── Picker de captions (banque caption_bank) — style Blowsome ────────────────────
function CaptionBankPicker({ user, currentOrg, onSelect, onClose }: {
  user: User; currentOrg: { id: string } | null
  onSelect: (texts: string[]) => void; onClose: () => void
}) {
  const tr = useTr()
  const [items, setItems] = useState<{ id: string; title: string; content: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setLoading(true)
    const base = supabase.from('caption_bank').select('id,title,content').order('created_at', { ascending: false })
    const q = currentOrg ? base.eq('org_id', currentOrg.id) : base.eq('user_id', user.id).is('org_id', null)
    q.then(({ data }) => { setItems((data ?? []) as any[]); setLoading(false) })
  }, [currentOrg?.id, user.id])
  const filtered = items.filter(it => {
    if (!search.trim()) return true
    const s = search.toLowerCase()
    return (it.title ?? '').toLowerCase().includes(s) || (it.content ?? '').toLowerCase().includes(s)
  })
  const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9600, background: 'rgba(6,6,8,0.92)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 80px)', background: '#120C19', border: '1px solid rgba(216,180,254,0.16)', borderRadius: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{tr('Choisir des captions', 'Pick captions')}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '12px 20px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Rechercher…', 'Search…')}
            style={{ ...inp, padding: '9px 12px' }} />
        </div>
        <div className="blow-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {loading ? <p style={{ fontSize: 12.5, color: MUTED }}>{tr('Chargement…', 'Loading…')}</p>
            : filtered.length === 0 ? <p style={{ fontSize: 12.5, color: MUTED }}>{tr('Aucune caption dans la banque.', 'No captions in the bank.')}</p>
            : filtered.map(it => {
              const on = selected.has(it.id)
              return (
                <button key={it.id} onClick={() => toggle(it.id)} className="blow-tap"
                  style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${on ? 'rgba(168,85,247,0.6)' : HAIR}`, background: on ? 'rgba(168,85,247,0.14)' : 'rgba(255,255,255,0.02)' }}>
                  {it.title && <div style={{ fontSize: 11, fontWeight: 700, color: on ? '#E9D5FF' : MUTED, marginBottom: 2 }}>{it.title}</div>}
                  <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.45 }}>{it.content}</div>
                </button>
              )
            })}
        </div>
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${HAIR}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <BlowButton variant="ghost" onClick={onClose}>{tr('Annuler', 'Cancel')}</BlowButton>
          <BlowButton onClick={() => onSelect(items.filter(it => selected.has(it.id)).map(it => it.content).filter(Boolean))}
            style={{ opacity: selected.size ? 1 : 0.5, pointerEvents: selected.size ? 'auto' : 'none' }}>
            {tr(`Ajouter ${selected.size || ''}`.trim(), `Add ${selected.size || ''}`.trim())}
          </BlowButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
// Variante MINIME d'une phrase de l'utilisateur : on garde le sens et le ton, on
// change/ajoute/enlève seulement 1 ou 2 mots. Reste très proche de l'original.
function buildVariationPrompt(baseLine: string, styleLines: string[], tr: (fr: string, en: string) => string): string {
  const examples = styleLines.slice(0, 8).map(l => `- ${l}`).join('\n')
  return [
    tr('Voici une phrase que j\'utilise comme texte sur mes vidéos :', 'Here is a line I use as on-screen text on my videos:'),
    `« ${baseLine} »`,
    tr('Réécris-la en une VARIANTE TRÈS PROCHE : garde le MÊME sens, le MÊME ton et presque les mêmes mots. Change / ajoute / enlève SEULEMENT 1 ou 2 mots (synonyme, petite reformulation). NE change PAS le sujet ni le format. Elle doit rester reconnaissable comme la même phrase.',
       'Rewrite it as a VERY CLOSE VARIANT: keep the SAME meaning, SAME tone and almost the same words. Change / add / remove ONLY 1 or 2 words (synonym, slight rephrasing). Do NOT change the subject or the format. It must stay recognizable as the same line.'),
    tr('Reste dans le style de mes phrases :', 'Stay in the style of my lines:'),
    examples,
    tr('Réponds UNIQUEMENT par la phrase, sans guillemets, sans emoji, sans hashtag.', 'Reply with ONLY the line, no quotes, no emoji, no hashtag.'),
  ].filter(Boolean).join('\n\n')
}

function buildCaptionPrompt(styleLines: string[], transcript: string, hasImages: boolean, spice: 'soft' | 'medium', _hasSpeech: boolean, angle: string, tr: (fr: string, en: string) => string): string {
  const examples = styleLines.length ? styleLines.map(l => `- ${l}`).join('\n') : tr('(aucun exemple fourni)', '(no example provided)')
  const spiceLine = spice === 'medium'
    ? tr('Touche taquine & suggestive ASSUMÉE mais IMPLICITE (double sens, sous-entendu) — jamais explicite, jamais vulgaire, aucun mot cru ni allusion au corps. Le sous-entendu vient de la vidéo, le texte reste ambigu (« elle sait ce qu\'elle fait », « zéro limite », « trop à l\'aise »).',
         'A clearly teasing & suggestive but IMPLICIT touch (double meaning) — never explicit, never vulgar, no crude words or body references. The innuendo comes from the video; the text stays ambiguous ("she knows what she\'s doing", "zero limits", "too comfortable").')
    : tr('Légère touche taquine/ambiguë, TRÈS soft. Jamais explicite, jamais vulgaire, aucun mot cru. Le sous-entendu vient de la vidéo, pas du texte.',
         'A light teasing/ambiguous touch, VERY soft. Never explicit, never vulgar, no crude words. The innuendo comes from the video, not the text.')
  return [
    tr('Tu écris UNE phrase courte à afficher SUR une vidéo (texte à l\'écran, style story/Snapchat). Réponds UNIQUEMENT par cette phrase, rien d\'autre.',
       'Write ONE short line to display ON a video (on-screen text, story/Snapchat style). Reply with ONLY that line, nothing else.'),
    // IMPORTANT : hooks VAGUES et GÉNÉRAUX (l\'IA lit mal le détail des vidéos → ne PAS
    // décrire précisément). Des réactions passe-partout qui marchent sur presque tout.
    tr('Écris une RÉACTION VAGUE et GÉNÉRALE, du genre : « Sérieux là ? », « Le truc de fou ! », « J\'y crois pas », « Nan mais allô ? », « C\'est quoi ce délire », « Trop c\'est trop ». Une phrase qui marche sur PRESQUE N\'IMPORTE QUELLE vidéo.',
       'Write a VAGUE, GENERAL reaction, like: "Are you serious?", "This is insane!", "I can\'t believe it", "No way", "What is this", "Too much". A line that works on ALMOST ANY video.'),
    tr('NE DÉCRIS PAS de détails précis (lieu, objet, action, vêtement…) : tu risques de te tromper. Reste sur l\'ÉMOTION / la vibe générale, jamais sur un fait précis.',
       'Do NOT describe specific details (place, object, action, clothing…): you might get them wrong. Stick to the EMOTION / general vibe, never a specific fact.'),
    hasImages || transcript
      ? tr('Sers-toi des images / de ce qui est dit UNIQUEMENT pour choisir la bonne émotion (surprise, amusement, choc, agacement…), pas pour décrire.',
           'Use the frames / what is said ONLY to pick the right emotion (surprise, amusement, shock, annoyance…), not to describe.')
      : '',
    tr('TON & FORMAT : reproduis le STYLE de MES exemples ci-dessous (structure, longueur, ponctuation). Reste dans leur registre.',
       'TONE & FORMAT: reproduce the STYLE of MY examples below (structure, length, punctuation). Stay in their register.'),
    examples,
    spiceLine,
    transcript ? tr('Ce qui est DIT (juste pour l\'ambiance) :', 'What is SAID (just for the mood):') + `\n"""${transcript.slice(0, 500)}"""` : '',
    tr('Contraintes : EN FRANÇAIS, UNE phrase COURTE et naturelle (≈ 2 à 7 mots), qui a du sens. Au plus 1 emoji en fin si ça colle. Jamais « hmm ». PAS de hashtags, PAS de guillemets autour.',
       'Constraints: ONE SHORT, natural line (≈ 2 to 7 words), that makes sense. At most 1 emoji at the end if it fits. Never "hmm". NO hashtags, NO quotes around it.'),
    tr(`Varie la formulation (ne recycle pas toujours la même tournure). Penche vers : ${angle}.`,
       `Vary the wording (don't always reuse the same phrasing). Lean toward: ${angle}.`),
    tr('Écris la phrase maintenant.', 'Write the line now.'),
  ].filter(Boolean).join('\n\n')
}

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '10px 12px', borderRadius: 11,
  border: `1px solid ${HAIR}`, background: 'rgba(0,0,0,0.28)', color: INK, outline: 'none',
}

// Rend la légende en PNG (canvas navigateur) — largeur 1080 fixe (= vidéo de sortie),
// pour que le serveur l'incruste tel quel avec le filtre `overlay`. Style « snapchat » :
// bande grise pleine largeur + texte blanc police normale. « outline » : texte blanc
// contour noir. Renvoie { png (base64 sans préfixe), h }.
function renderCaptionPng(text: string, style: 'outline' | 'snapchat'): { png: string; h: number } {
  const W = 1080
  const padX = Math.round(W * 0.05)                                   // marge horizontale (retour à la ligne)
  const fontSize = Math.round(W * (style === 'snapchat' ? 0.046 : 0.055))
  // Bande fine qui « épouse » le texte (comme Snapchat) — plus le pavé n'est trop haut.
  const vpad = Math.round(fontSize * (style === 'snapchat' ? 0.24 : 0.16))
  const lineH = Math.round(fontSize * (style === 'snapchat' ? 1.05 : 1.16))   // ~ line height 1x
  const weight = style === 'snapchat' ? '500' : '800'
  // Police Helvetica (fallbacks proches) + fond gris #757575 (spec utilisateur).
  const fontStack = `${weight} ${fontSize}px Helvetica, "Helvetica Neue", Arial, sans-serif`
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = fontStack
  // Découpe en lignes (≤ 90 % de la largeur).
  const maxW = W - padX * 2
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  if (lines.length === 0) lines.push(text)
  const height = lines.length * lineH + vpad * 2
  canvas.width = W; canvas.height = height
  ctx.font = fontStack
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  if (style === 'snapchat') {
    ctx.fillStyle = 'rgba(117,117,117,0.38)'; ctx.fillRect(0, 0, W, height)   // #757575 translucide
    ctx.fillStyle = '#fff'
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, vpad + i * lineH + lineH / 2))
  } else {
    lines.forEach((ln, i) => {
      const cy = vpad + i * lineH + lineH / 2
      ctx.lineWidth = Math.round(fontSize * 0.16); ctx.strokeStyle = 'rgba(0,0,0,0.92)'
      ctx.strokeText(ln, W / 2, cy)
      ctx.fillStyle = '#fff'; ctx.fillText(ln, W / 2, cy)
    })
  }
  return { png: canvas.toDataURL('image/png').split(',')[1] ?? '', h: height }
}
// Petit champ numérique compact.
const numInp: React.CSSProperties = {
  width: 68, textAlign: 'center', boxSizing: 'border-box', fontSize: 13, padding: '8px 8px', borderRadius: 10,
  border: `1px solid ${HAIR}`, background: 'rgba(0,0,0,0.28)', color: INK, outline: 'none',
}
// Contenu inséré sous un Switch, aligné sous son libellé.
const insetStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 11, marginLeft: 49, marginTop: 2 }

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED, margin: '0 0 9px', ...style }}>{children}</p>
}

const ACCENT_GRAD = 'linear-gradient(100deg,#A855F7,#6366F1)'

// Panneau de groupe d'options (titre + contenu).
function OptGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.015)', padding: 16, marginBottom: 12 }}>
      <p style={{ margin: '0 0 13px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: '#C9A9F0' }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>{children}</div>
    </div>
  )
}

// Interrupteur (pill) avec libellé + sous-texte optionnel.
function Switch({ on, onChange, label, sub, small }: { on: boolean; onChange: (v: boolean) => void; label: React.ReactNode; sub?: React.ReactNode; small?: boolean }) {
  const w = small ? 34 : 38, h = small ? 20 : 22, d = small ? 16 : 18
  return (
    <div onClick={() => onChange(!on)} className="blow-tap" style={{ display: 'flex', alignItems: 'flex-start', gap: 11, cursor: 'pointer' }}>
      <span style={{ flexShrink: 0, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', width: w, height: h, padding: 2, borderRadius: 99, background: on ? ACCENT_GRAD : 'rgba(255,255,255,0.13)', transition: 'background .15s ease' }}>
        <span style={{ width: d, height: d, borderRadius: 99, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.45)' }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: small ? 12.5 : 13, fontWeight: 600, color: INK }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{sub}</span>}
      </span>
    </div>
  )
}

// Contrôle segmenté générique.
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 10, background: 'rgba(0,0,0,0.28)', border: `1px solid ${HAIR}` }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} className="blow-tap"
          style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', border: 'none',
            background: value === o.v ? ACCENT_GRAD : 'transparent', color: value === o.v ? '#fff' : MUTED }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Ligne libellé + contrôle.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: MUTED, minWidth: 70 }}>{label}</span>
      {children}
    </div>
  )
}

export default BlowAutoContent
