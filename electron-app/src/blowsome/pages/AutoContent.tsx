// Blowsome — Auto-contenu (VIP, desktop only).
// Pipeline mains-libres : pioche des clips de la banque (par tag) → recadre 9:16 +
// variante unique → caption IA (transcription audio Whisper + frames + TON style) →
// renvoie en banque (description = caption) → le scheduler/posting peut poster.
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, fetchAllRows, type ContentItem } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { useConnections } from '@/lib/connections'
import { useTr } from '@/lib/i18n'
import { logActivity } from '@/lib/activityLog'
import { resolveContentToLocalPath, uploadVideoFromPath, getSignedUrl, type UploadScope } from '@/lib/storage'
import { runRepurposeNative, runRepurposeViaServer, runFfmpegRepurposeBatch } from '@/lib/ffmpeg-web'
import { useBlowCSS, BlowCard, BlowButton, BlowBadge, BlowEmpty, BlowPageHeader, Ico, ICON, INK, MUTED, HAIR, GOLD } from '../ui'

type Intensity = 'subtle' | 'medium' | 'aggressive'
interface Recipe {
  id: string
  name: string
  tag: string
  count: number
  style: string          // exemples de captions (texte, une fois)
  useTranscript: boolean
  intensity: Intensity
  burnText?: boolean     // écrire la caption sur la vidéo
  textPos?: 'top' | 'middle' | 'bottom'
}
type JobStatus = 'queued' | 'clip' | 'reframe' | 'transcribe' | 'caption' | 'overlay' | 'saving' | 'done' | 'error'
interface GenJob { i: number; status: JobStatus; sourceTitle?: string; caption?: string; error?: string }

const RECIPES_KEY = 'sf-blow-autocontent-recipes'
const loadRecipes = (): Recipe[] => { try { const a = JSON.parse(localStorage.getItem(RECIPES_KEY) || '[]'); return Array.isArray(a) ? a : [] } catch { return [] } }
const saveRecipes = (r: Recipe[]) => localStorage.setItem(RECIPES_KEY, JSON.stringify(r))
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const STATUS_LABEL: Record<JobStatus, [string, string]> = {
  queued: ['En attente', 'Queued'], clip: ['Choix du clip', 'Picking clip'],
  reframe: ['Recadrage 9:16', 'Reframing 9:16'], transcribe: ['Transcription', 'Transcribing'],
  caption: ['Caption IA', 'AI caption'], overlay: ['Texte sur la vidéo', 'Text on video'], saving: ['Envoi banque', 'Saving to bank'],
  done: ['Prêt', 'Ready'], error: ['Erreur', 'Error'],
}

export function BlowAutoContent({ user }: { user: User }) {
  useBlowCSS()
  const tr = useTr()
  const { currentOrg } = useOrg()
  const conns = useConnections(user)

  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [recipes, setRecipes] = useState<Recipe[]>(() => loadRecipes())
  const [editingId, setEditingId] = useState<string | null>(null)

  // Formulaire (recette en cours d'édition ou nouvelle)
  const [name, setName] = useState('')
  const [sourceMode, setSourceMode] = useState<'bank' | 'upload'>('bank')
  const [uploads, setUploads] = useState<File[]>([])
  const [tag, setTag] = useState('')
  const [count, setCount] = useState(10)
  const [style, setStyle] = useState('')
  const [useTranscript, setUseTranscript] = useState(true)
  const [intensity, setIntensity] = useState<Intensity>('medium')
  const [burnText, setBurnText] = useState(true)
  const [textPos, setTextPos] = useState<'top' | 'middle' | 'bottom'>('middle')

  const [jobs, setJobs] = useState<GenJob[]>([])
  const [running, setRunning] = useState(false)

  const isWeb = typeof window !== 'undefined' && (window as unknown as { __IS_WEB?: boolean }).__IS_WEB === true
  const hasNative = !isWeb && !!window.electronAPI?.runFfmpegRepurpose

  // ── Charge la banque (scopée org/perso) ────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const rows = await fetchAllRows<ContentItem>((from, to) => {
          let q = supabase.from('content_bank').select('*').order('created_at', { ascending: false }).range(from, to)
          q = currentOrg ? q.eq('org_id', currentOrg.id) : q.eq('user_id', user.id).is('org_id', null)
          return q
        })
        setItems(rows.filter(i => i.notes !== '__sf_folder__' && (i.storage_path || i.file_url)))
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [currentOrg, user.id])

  const allTags = useMemo(() => Array.from(new Set(items.flatMap(i => i.tags ?? []).filter(Boolean))).sort(), [items])
  const poolFor = (t: string) => items.filter(i => (i.tags ?? []).includes(t))

  function resetForm() { setEditingId(null); setName(''); setTag(''); setCount(10); setStyle(''); setUseTranscript(true); setIntensity('medium'); setBurnText(true); setTextPos('middle') }
  function loadRecipe(r: Recipe) {
    setEditingId(r.id); setName(r.name); setTag(r.tag); setCount(r.count); setStyle(r.style)
    setUseTranscript(r.useTranscript); setIntensity(r.intensity); setBurnText(r.burnText ?? true); setTextPos(r.textPos ?? 'middle')
  }
  function persistRecipe() {
    if (!name.trim() || !tag) return
    const r: Recipe = { id: editingId ?? newId(), name: name.trim(), tag, count, style, useTranscript, intensity, burnText, textPos }
    const next = editingId ? recipes.map(x => x.id === editingId ? r : x) : [...recipes, r]
    setRecipes(next); saveRecipes(next); setEditingId(r.id)
  }
  function deleteRecipe(id: string) {
    const next = recipes.filter(r => r.id !== id); setRecipes(next); saveRecipes(next)
    if (editingId === id) resetForm()
  }

  const setJob = (i: number, patch: Partial<GenJob>) => setJobs(prev => prev.map(j => j.i === i ? { ...j, ...patch } : j))

  // Résout une source (item banque OU fichier uploadé) en { nativePath, url }.
  async function resolveSource(src: { item?: ContentItem; file?: File }): Promise<{ nativePath: string | null; url: string; revoke?: () => void }> {
    if (src.file) {
      const nativePath = hasNative ? ((src.file as unknown as { path?: string }).path ?? null) : null
      const url = URL.createObjectURL(src.file)
      return { nativePath, url, revoke: () => URL.revokeObjectURL(url) }
    }
    const it = src.item!
    const nativePath = hasNative ? await resolveContentToLocalPath(it) : null
    const url = it.storage_path ? await getSignedUrl(it.storage_path) : (it.file_url ?? '')
    return { nativePath, url }
  }

  // ── Génération ─────────────────────────────────────────────────────────────
  async function generate() {
    if (running) return
    const srcList: Array<{ title: string; item?: ContentItem; file?: File }> =
      sourceMode === 'upload'
        ? uploads.map(f => ({ title: f.name, file: f }))
        : [...poolFor(tag)].sort(() => Math.random() - 0.5).map(it => ({ title: it.title, item: it }))
    if (srcList.length === 0) return
    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }
    const styleLines = style.split('\n').map(s => s.trim()).filter(Boolean)

    setRunning(true)
    setJobs(Array.from({ length: count }, (_, i) => ({ i, status: 'queued' as JobStatus })))

    for (let i = 0; i < count; i++) {
      const src = srcList[i % srcList.length]
      let revoke: (() => void) | undefined
      try {
        setJob(i, { status: 'clip', sourceTitle: src.title })
        const resolved = await resolveSource(src)
        revoke = resolved.revoke
        const { nativePath, url } = resolved

        // 1) Recadrage 9:16 + variante unique (natif desktop, sinon serveur → WASM web)
        setJob(i, { status: 'reframe' })
        const seed = Math.floor(Math.random() * 1_000_000) + i
        let variants
        if (hasNative && nativePath) {
          variants = await runRepurposeNative({ sourcePath: nativePath, seeds: [seed], intensity, format: '9:16' })
        } else {
          try { variants = await runRepurposeViaServer({ sourceUrl: url, userId: user.id, seeds: [seed], intensity, format: '9:16' }) }
          catch { variants = await runFfmpegRepurposeBatch({ inputPath: url, seeds: [seed], intensity, format: '9:16' }) }
        }
        const out = variants[0]
        if (!out?.ok) throw new Error(tr('Recadrage échoué', 'Reframe failed'))
        // Référence média FIABLE pour frames / transcription / upload :
        // desktop → chemin local ; web serveur → URL signée du storagePath (≠ l'URL
        // publique qui 403) ; fallback WASM → blob. C'est cette réf qu'on ré-uploade
        // dans l'emplacement permanent de la banque (repurpose-results est transitoire).
        const mediaRef = (hasNative && out.localPath)
          ? out.localPath
          : out.storagePath ? await getSignedUrl(out.storagePath) : (out.outputPath ?? '')
        if (!mediaRef) throw new Error(tr('Sortie introuvable', 'Missing output'))

        // 2) Transcription audio (best-effort) — « ce qui est dit »
        let transcript = ''
        if (useTranscript && conns.groq && window.electronAPI?.groqTranscription) {
          setJob(i, { status: 'transcribe' })
          try {
            if (hasNative && nativePath && window.electronAPI.readFileBytes) {
              const b = await window.electronAPI.readFileBytes(nativePath)
              if (b?.ok && b.bytes) {
                const buf = b.bytes instanceof Uint8Array ? b.bytes.buffer : b.bytes
                const tRes = await window.electronAPI.groqTranscription({ apiKey: conns.groq, audioBytes: buf as ArrayBuffer, filename: 'clip.mp4' }) as { ok?: boolean; data?: { text?: string } }
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

        // 3) Caption IA — frames SI dispo + transcript + style. On n'évoque les
        // images dans le prompt QUE si on en a (sinon l'IA répond « je ne vois pas »).
        setJob(i, { status: 'caption' })
        let caption = ''
        if (conns.anthropic && window.electronAPI?.anthropicVisionRequest) {
          try {
            let images: Array<{ type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }> = []
            if (window.electronAPI.extractFrames) {
              const fr = await window.electronAPI.extractFrames({ filePath: mediaRef, endTime: 5, fps: 0.5 })
              const frames = (fr?.ok && fr.frames) ? fr.frames.slice(0, 4) : []
              images = frames.map(f => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.data } }))
            }
            const prompt = buildCaptionPrompt(styleLines, transcript, images.length > 0, tr)
            const content: unknown[] = images.length > 0 ? [...images, { type: 'text', text: prompt }] : [{ type: 'text', text: prompt }]
            const vRes = await window.electronAPI.anthropicVisionRequest({ apiKey: conns.anthropic, model: 'claude-haiku-4-5-20251001', maxTokens: 200, messages: [{ role: 'user', content }] })
            if (vRes?.ok) {
              const data = vRes.data as { content?: Array<{ type: string; text?: string }> }
              const t = (data?.content?.find(b => b.type === 'text')?.text ?? '').trim().replace(/^["'«»\s]+|["'«»\s]+$/g, '')
              // Rejette les réponses « méta » (refus faute d'images/contexte).
              if (t && !/ne vois pas|n'ai pas accès|pas d'accès|peux-tu (partager|me décrire|m'envoyer)|don'?t see|no access|can you (share|describe)|unable to (see|access)|share the (video|image)/i.test(t)) caption = t
            }
          } catch { /* caption best-effort */ }
        }
        if (!caption) caption = styleLines[Math.floor(Math.random() * styleLines.length)] ?? src.title

        // Hook COURT garanti (le texte à l'écran doit rester lisible) : on retire les
        // hashtags/guillemets et on plafonne à ~10 mots / 1 phrase, quoi que sorte l'IA.
        caption = caption.replace(/#[^\s#]+/g, '').replace(/["'«»]/g, '').split(/[\n]/)[0].replace(/\s+/g, ' ').trim()
        { const w = caption.split(' ').filter(Boolean); if (w.length > 10) caption = w.slice(0, 10).join(' ') }

        // 3b) Incruste la caption SUR la vidéo (hook POV à l'écran). Bloquant si activé :
        // en cas d'échec on remonte l'erreur au lieu de sauver une vidéo sans texte.
        let finalRef = mediaRef
        if (burnText && caption) {
          setJob(i, { status: 'overlay' })
          if (!window.electronAPI?.runFfmpegMixOverlay) throw new Error(tr('Incrustation indisponible (rebuild desktop ?)', 'Overlay unavailable (rebuild desktop?)'))
          const ov = await window.electronAPI.runFfmpegMixOverlay({ sourcePath: mediaRef, caption, position: textPos, fontSize: 54, fontColor: '#FFFFFF' })
          if (!ov?.ok || !ov.outputPath) throw new Error(`${tr('Incrustation échouée', 'Overlay failed')} : ${ov?.error ?? '?'}`)
          finalRef = ov.storagePath ? await getSignedUrl(ov.storagePath) : ov.outputPath
        }

        // 4) Envoi en banque : ré-upload dans l'emplacement permanent (vignette + accès OK)
        setJob(i, { status: 'saving', caption })
        const up = await uploadVideoFromPath(finalRef, scope)
        const storagePath = up.storagePath
        const thumbnailPath = up.thumbnailPath
        const baseTag = sourceMode === 'bank' ? tag : (name.trim() || 'autocontent')
        const title = `${src.title || baseTag} · auto ${i + 1}`
        const { error } = await supabase.from('content_bank').insert({
          user_id: user.id, org_id: currentOrg?.id ?? null,
          title, file_url: null, storage_path: storagePath, thumbnail_path: thumbnailPath,
          tags: Array.from(new Set([baseTag, 'autocontent'].filter(Boolean))), notes: caption, description: caption,
        })
        if (error) throw new Error(error.message)
        logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_add', details: { title, source: 'autocontent' } })

        setJob(i, { status: 'done', caption })
      } catch (e) {
        setJob(i, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      } finally {
        revoke?.()
      }
    }
    setRunning(false)
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  const doneCount = jobs.filter(j => j.status === 'done').length
  const errCount = jobs.filter(j => j.status === 'error').length
  const canGenerate = !running && count > 0 && (sourceMode === 'bank' ? (!!tag && poolFor(tag).length > 0) : uploads.length > 0)

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
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['bank', 'upload'] as const).map(m => (
              <button key={m} onClick={() => setSourceMode(m)} className="blow-tap"
                style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 9, cursor: 'pointer',
                  border: `1px solid ${sourceMode === m ? 'rgba(168,85,247,0.6)' : HAIR}`, background: sourceMode === m ? 'rgba(168,85,247,0.18)' : 'transparent', color: sourceMode === m ? '#E9D5FF' : MUTED }}>
                {m === 'bank' ? tr('Depuis la banque', 'From bank') : tr('Mes vidéos (upload)', 'My videos (upload)')}
              </button>
            ))}
          </div>
          {sourceMode === 'bank' ? (
            allTags.length === 0
              ? <p style={{ fontSize: 12.5, color: MUTED, margin: '2px 0 0' }}>{tr('Aucun tag dans la banque. Tague tes clips, ou passe en « Mes vidéos ».', 'No tags in the bank. Tag your clips, or switch to "My videos".')}</p>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allTags.map(t => {
                    const on = tag === t
                    return (
                      <button key={t} onClick={() => setTag(t)} className="blow-tap"
                        style={{ fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                          border: `1px solid ${on ? 'rgba(168,85,247,0.6)' : HAIR}`, background: on ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.03)', color: on ? '#E9D5FF' : MUTED }}>
                        #{t} <span style={{ opacity: 0.6 }}>· {poolFor(t).length}</span>
                      </button>
                    )
                  })}
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

          <SectionLabel style={{ marginTop: 18 }}>{tr('3 · Ton style de caption (colle 5-10 exemples qui ont marché — texte, une fois)', '3 · Your caption style (paste 5-10 winning examples — text, once)')}</SectionLabel>
          <textarea value={style} onChange={e => setStyle(e.target.value)} rows={6}
            placeholder={tr('Une caption par ligne…\nPOV: tu réalises que…\nPersonne te le dira mais…', 'One caption per line…\nPOV: you realize that…\nNobody will tell you but…')}
            style={{ ...inp, resize: 'vertical', minHeight: 120, fontFamily: 'inherit', lineHeight: 1.6 }} />

          <SectionLabel style={{ marginTop: 18 }}>{tr('4 · Options', '4 · Options')}</SectionLabel>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', marginBottom: 12 }}>
            <input type="checkbox" checked={useTranscript} onChange={e => setUseTranscript(e.target.checked)} style={{ accentColor: '#A855F7', width: 16, height: 16 }} />
            <span style={{ fontSize: 13, color: INK }}>{tr('Transcrire l\'audio (Whisper) pour une caption fidèle à ce qui est dit', 'Transcribe audio (Whisper) for a caption true to what\'s said')}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', marginBottom: 10 }}>
            <input type="checkbox" checked={burnText} onChange={e => setBurnText(e.target.checked)} style={{ accentColor: '#A855F7', width: 16, height: 16 }} />
            <span style={{ fontSize: 13, color: INK }}>{tr('Écrire la caption SUR la vidéo (hook POV à l\'écran)', 'Write the caption ON the video (POV hook on screen)')}</span>
          </label>
          {burnText && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingLeft: 25 }}>
              <span style={{ fontSize: 12.5, color: MUTED }}>{tr('Position', 'Position')}</span>
              {(['top', 'middle', 'bottom'] as const).map(p => (
                <button key={p} onClick={() => setTextPos(p)} className="blow-tap"
                  style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${textPos === p ? 'rgba(168,85,247,0.6)' : HAIR}`, background: textPos === p ? 'rgba(168,85,247,0.18)' : 'transparent', color: textPos === p ? '#E9D5FF' : MUTED }}>
                  {p === 'top' ? tr('Haut', 'Top') : p === 'middle' ? tr('Milieu', 'Middle') : tr('Bas', 'Bottom')}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: MUTED }}>{tr('Unicité', 'Uniqueness')}</span>
              {(['subtle', 'medium', 'aggressive'] as Intensity[]).map(v => (
                <button key={v} onClick={() => setIntensity(v)} className="blow-tap"
                  style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${intensity === v ? 'rgba(168,85,247,0.6)' : HAIR}`, background: intensity === v ? 'rgba(168,85,247,0.18)' : 'transparent', color: intensity === v ? '#E9D5FF' : MUTED }}>
                  {v === 'subtle' ? tr('Légère', 'Subtle') : v === 'medium' ? tr('Moyenne', 'Medium') : tr('Forte', 'Strong')}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: MUTED }}>{tr('Nombre', 'Count')}</span>
              <input type="number" min={1} max={50} value={count} onChange={e => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} style={{ ...inp, width: 76, textAlign: 'center' }} />
            </div>
          </div>

          {conns.anthropic ? null : (
            <p style={{ fontSize: 11.5, color: GOLD, margin: '14px 0 0' }}>{tr('⚠ Clé Anthropic manquante (Réglages) — les captions retomberont sur tes exemples.', '⚠ Anthropic key missing (Settings) — captions will fall back to your examples.')}</p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <BlowButton onClick={generate} style={{ opacity: canGenerate ? 1 : 0.5, pointerEvents: canGenerate ? 'auto' : 'none' }}>
              <Ico d={ICON.bolt} size={15} /> {running ? tr('Génération…', 'Generating…') : tr(`Générer ${count}`, `Generate ${count}`)}
            </BlowButton>
            <BlowButton variant="ghost" onClick={persistRecipe} style={{ opacity: name.trim() && tag ? 1 : 0.5, pointerEvents: name.trim() && tag ? 'auto' : 'none' }}>
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
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: MUTED }}>#{r.tag} · {r.count}× · {r.intensity}</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); deleteRecipe(r.id) }} style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 15, padding: 4 }}>×</button>
                    </div>
                  ))}
                </div>}
          </BlowCard>

          <BlowCard style={{ padding: 18 }}>
            <SectionLabel>{tr('Progression', 'Progress')}</SectionLabel>
            {jobs.length === 0
              ? <BlowEmpty title={tr('Rien encore', 'Nothing yet')} hint={tr('Choisis un tag, colle ton style, lance.', 'Pick a tag, paste your style, run.')} icon="✦" />
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
    </>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildCaptionPrompt(styleLines: string[], transcript: string, hasImages: boolean, tr: (fr: string, en: string) => string): string {
  const examples = styleLines.length ? styleLines.map(l => `- ${l}`).join('\n') : tr('(aucun exemple fourni)', '(no example provided)')
  const closing = hasImages
    ? tr('Regarde les images fournies (ce que la vidéo MONTRE) et écris le hook adapté à CETTE vidéo.', 'Look at the provided images (what the video SHOWS) and write the hook for THIS video.')
    : transcript
      ? tr('Base-toi sur la transcription ci-dessus pour écrire le hook adapté à cette vidéo.', 'Base the hook on the transcript above, tailored to this video.')
      : tr('Écris un hook dans ce style (pas d\'autre info sur la vidéo).', 'Write a hook in this style (no other info about the video).')
  return [
    tr('Tu écris UN hook POV COURT à afficher SUR une vidéo (texte à l\'écran). Réponds UNIQUEMENT par le hook, rien d\'autre.', 'Write ONE SHORT POV hook to display ON a video (on-screen text). Reply with ONLY the hook, nothing else.'),
    tr('Règles : très court (≈ 4 à 10 mots, une seule phrase), percutant, PAS de hashtags, PAS de guillemets, peu ou pas d\'emoji.', 'Rules: very short (≈ 4 to 10 words, a single sentence), punchy, NO hashtags, NO quotes, little or no emoji.'),
    tr('Imite le TON de ces hooks qui ont marché :', 'Match the TONE of these winning hooks:'),
    examples,
    transcript ? tr('Ce qui est DIT dans la vidéo :', 'What is SAID in the video:') + `\n"""${transcript.slice(0, 800)}"""` : '',
    closing,
  ].filter(Boolean).join('\n\n')
}

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '10px 12px', borderRadius: 11,
  border: `1px solid ${HAIR}`, background: 'rgba(0,0,0,0.28)', color: INK, outline: 'none',
}
function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED, margin: '0 0 9px', ...style }}>{children}</p>
}

export default BlowAutoContent
