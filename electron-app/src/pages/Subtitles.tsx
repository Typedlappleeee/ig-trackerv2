import { useState, useRef, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { useOrg } from '@/lib/orgContext'
import { supabase } from '@/lib/supabase'
import { uploadVideoFromBlob, getSignedUrl, deleteStorageObjects } from '@/lib/storage'
import { BankFolderSelect } from '@/components/BankFolderSelect'
import { BankPicker } from '@/pages/Bank'
import { ACCENT, ACCENT_L, TEXT_1, TEXT_2, TEXT_3, HAIR, BG_2 } from '@/lib/theme'
import { useTr } from '@/lib/i18n'

interface SubtitlesProps { user: User }

type Style    = 'box' | 'outline' | 'shadow'
type Position = 'top' | 'center' | 'bottom'
type Lang     = 'auto' | 'fr' | 'en' | 'es' | 'de' | 'ja' | 'zh' | 'pt' | 'ar'
type Phase    = 'idle' | 'fetching' | 'transcribing' | 'burning' | 'done' | 'error'

interface WordToken { word: string; start: number; end: number }
interface Segment   { text: string; start: number; end: number }

const LANG_LABELS: Record<Lang, string> = {
  auto: 'Auto-détect', fr: 'Français', en: 'English',
  es: 'Español', de: 'Deutsch', ja: '日本語',
  zh: '中文', pt: 'Português', ar: 'العربية',
}

// Gap between words that signals a new speaker or a clear phrase break.
// Whisper doesn't return speaker labels, so silence is the only proxy.
// 0.9s covers most inter-speaker pauses; 0.4s splits after reaching perGroup.
const PAUSE_SPEAKER = 0.9  // definite break — likely speaker change
const PAUSE_PHRASE  = 0.4  // soft break — only flush when current segment has ≥2 words

function groupWords(words: WordToken[], perGroup: number): Segment[] {
  const segs: Segment[] = []
  if (!words.length) return segs

  let current: WordToken[] = [words[0]]

  const flush = () => {
    segs.push({
      text:  current.map(w => w.word.trim()).join(' ').trim(),
      start: current[0].start,
      end:   current[current.length - 1].end,
    })
    current = []
  }

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end
    const hardBreak = gap >= PAUSE_SPEAKER                             // speaker change / long silence
    const softBreak = gap >= PAUSE_PHRASE && current.length >= 2      // phrase pause + enough words
    const wordLimit = current.length >= perGroup                       // hit the word-count cap

    if (hardBreak || softBreak || wordLimit) flush()
    current.push(words[i])
  }
  if (current.length) flush()

  return segs
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}

const isWeb = typeof window !== 'undefined' && !(window as any).electronAPI

export function Subtitles({ user }: SubtitlesProps) {
  const tr      = useTr()
  const conns   = useConnections(user)
  const groqKey = conns.groq
  const { currentOrg } = useOrg()

  // Save-to-bank
  const [saveFolder,  setSaveFolder]  = useState<string | null>(null)
  const [savedToBank, setSavedToBank] = useState(false)
  const [saving,      setSaving]      = useState(false)

  // Video source
  const [videoSrc,    setVideoSrc]    = useState<string | null>(null)  // path or URL
  const [isBankUrl,   setIsBankUrl]   = useState(false)  // true = from bank, skip client fetch
  const [videoName,   setVideoName]   = useState('')
  const [previewUrl,  setPreviewUrl]  = useState<string | null>(null)
  const [dragging,    setDragging]    = useState(false)
  const [showBankPicker, setShowBankPicker] = useState(false)

  // Dropped file ref (web only — keep the File object to avoid re-fetching)
  const fileRef = useRef<File | null>(null)

  // Options
  const [lang,      setLang]      = useState<Lang>('auto')
  const [perGroup,  setPerGroup]  = useState(3)
  const [fontSize,  setFontSize]  = useState(72)
  const [fontColor, setFontColor] = useState('#ffffff')
  const [style,     setStyle]     = useState<Style>('box')
  const [position,  setPosition]  = useState<Position>('bottom')
  const [preset,    setPreset]    = useState<'9:16' | '1:1' | '16:9' | 'keep'>('keep')

  const [phase,      setPhase]      = useState<Phase>('idle')
  const [status,     setStatus]     = useState('')
  const [segments,   setSegments]   = useState<Segment[]>([])
  const [outputUrl,  setOutputUrl]  = useState<string | null>(null)
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [error,      setError]      = useState('')
  const cancelRef                   = useRef(false)   // « Annuler » : stoppe le traitement en cours
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    if (outputUrl?.startsWith('blob:'))  URL.revokeObjectURL(outputUrl)
  }, [])

  function reset() {
    setPhase('idle'); setStatus(''); setSegments([]); setError('')
    if (outputUrl?.startsWith('blob:')) URL.revokeObjectURL(outputUrl)
    setOutputUrl(null); setOutputPath(null); setSavedToBank(false)
  }

  function loadFile(file: File) {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    fileRef.current = file
    const url = URL.createObjectURL(file)
    setVideoSrc(url); setPreviewUrl(url); setVideoName(file.name)
    setIsBankUrl(false); reset()
  }

  function loadUrl(url: string, name: string, fromBank = false) {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    fileRef.current = null
    setVideoSrc(url); setPreviewUrl(url); setVideoName(name)
    setIsBankUrl(fromBank); reset()
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('video/')) loadFile(file)
  }, [])

  // ── File picker ─────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function pickFile() {
    if (window.electronAPI && !isWeb) {
      const p = await window.electronAPI.pickVideoFile()
      if (!p) return
      setVideoSrc(p)
      setVideoName(p.split(/[\\/]/).pop() ?? p)
      fileRef.current = null
      const r = await window.electronAPI.readLocalVideo(p)
      if (r.ok && (r as any).dataUrl) setPreviewUrl((r as any).dataUrl)
      reset()
    } else {
      fileInputRef.current?.click()
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
    e.target.value = ''
  }

  // ── BankPicker callback ──────────────────────────────────────────────────────
  function onBankPick(paths: string[], titles?: string[]) {
    setShowBankPicker(false)
    if (!paths.length) return
    loadUrl(paths[0], titles?.[0] || paths[0].split('/').pop()?.split('?')[0] || 'video.mp4', true)
  }

  // ── Main generation ──────────────────────────────────────────────────────────
  async function generate() {
    if (!['idle', 'error', 'done'].includes(phase)) return
    if (!groqKey) { setError(tr('Clé API Groq manquante — configure-la dans Paramètres', 'Groq API key missing — set it up in Settings')); return }
    if (!videoSrc) { setError(tr('Sélectionne une vidéo', 'Select a video')); return }

    cancelRef.current = false; setCancelling(false)
    setPhase('transcribing')
    setStatus(tr('Préparation…', 'Preparing…'))
    setError('')
    setSegments([])

    // Temp Storage object uploaded only to feed the transcription proxy (web local
    // files). Cleaned up once transcription is done — it's not the bank copy.
    const tempPaths: (string | null)[] = []

    try {
      // ── Step 1 + 2: transcription ────────────────────────────────────────────
      // Bank URL → pass URL to server proxy (no bytes sent from client)
      // Local file → read bytes here and send as base64 through proxy
      setPhase('transcribing')
      setStatus(tr('Transcription de l\'audio…', 'Transcribing audio…'))

      const filename = videoName || 'video.mp4'
      let transcriptRes: { ok: boolean; data?: unknown; error?: string }

      // ── Diagnostic logs (remove once 413 is resolved) ───────────────────────
      console.log('[Subtitles] generate() —', {
        isBankUrl,
        videoSrc: videoSrc?.slice(0, 120),
        fileRef: fileRef.current ? `File(${fileRef.current.name}, ${(fileRef.current.size / 1024 / 1024).toFixed(1)}MB)` : null,
        isWeb,
        hasElectronAPI: !!window.electronAPI,
      })

      if (isBankUrl && videoSrc) {
        // Bank URL (web or Electron): let the proxy/IPC download it server-side.
        // Avoids sending large video bytes over the network from the client.
        console.log('[Subtitles] → chemin videoUrl (bank URL, aucun octet envoyé côté client)')
        setStatus(tr('Transcription de l\'audio…', 'Transcribing audio…'))
        transcriptRes = await (window.electronAPI as any).groqTranscription({
          apiKey:   groqKey,
          videoUrl: videoSrc,
          filename,
          language: lang !== 'auto' ? lang : undefined,
        })
      } else if (isWeb) {
        // Web + local file: Vercel rejects request bodies > 4.5 MB, so base64 over
        // /api/groq returns 413. Instead, upload the file to Storage and hand the
        // proxy a signed URL it can fetch server-side (no body size limit).
        console.log('[Subtitles] → chemin upload+URL (web, fichier local)')
        setStatus(tr('Envoi de la vidéo…', 'Uploading video…'))
        let blob: Blob
        if (fileRef.current) blob = fileRef.current
        else if (videoSrc) {
          const r = await fetch(videoSrc)
          if (!r.ok) throw new Error(tr('Téléchargement de la vidéo échoué', 'Video download failed'))
          blob = await r.blob()
        } else throw new Error(tr('Aucune source vidéo', 'No video source'))

        const scope = currentOrg?.id
          ? { mode: 'org' as const, id: currentOrg.id }
          : { mode: 'user' as const, id: user.id }
        const { storagePath, thumbnailPath } = await uploadVideoFromBlob(blob, filename, scope)
        tempPaths.push(storagePath, thumbnailPath)
        const signed = await getSignedUrl(storagePath)
        if (!signed) throw new Error(tr('Préparation de la vidéo impossible', 'Could not prepare the video'))
        setStatus(tr('Transcription de l\'audio…', 'Transcribing audio…'))
        transcriptRes = await (window.electronAPI as any).groqTranscription({
          apiKey:   groqKey,
          videoUrl: signed,
          filename,
          language: lang !== 'auto' ? lang : undefined,
        })
      } else {
        // Electron + local file: read bytes then send over IPC (no HTTP body limit)
        console.log('[Subtitles] → chemin audioBytes (Electron, fichier local)')
        let audioBytes: ArrayBuffer
        if (fileRef.current) {
          audioBytes = await fileRef.current.arrayBuffer()
          console.log('[Subtitles] audioBytes depuis fileRef.current:', (audioBytes.byteLength / 1024 / 1024).toFixed(1), 'MB')
        } else if (videoSrc) {
          setStatus(tr('Lecture de la vidéo…', 'Reading video…'))
          // readFileBytes only works for local paths, not for URLs
          if (window.electronAPI && !videoSrc.startsWith('http')) {
            const r = await window.electronAPI.readFileBytes(videoSrc)
            if (!r.ok || !r.bytes) throw new Error((r as any).error ?? tr('Lecture échouée', 'Read failed'))
            audioBytes = r.bytes as ArrayBuffer
          } else {
            const r = await fetch(videoSrc)
            if (!r.ok) throw new Error(tr('Téléchargement de la vidéo échoué', 'Video download failed'))
            audioBytes = await r.arrayBuffer()
          }
          setStatus(tr('Transcription de l\'audio…', 'Transcribing audio…'))
        } else {
          throw new Error(tr('Aucune source vidéo', 'No video source'))
        }
        transcriptRes = await window.electronAPI!.groqTranscription({
          apiKey: groqKey, audioBytes, filename,
          language: lang !== 'auto' ? lang : undefined,
        })
      }
      if (!transcriptRes.ok || !transcriptRes.data) {
        throw new Error(transcriptRes.error ?? tr('Transcription échouée', 'Transcription failed'))
      }
      const words = ((transcriptRes.data as Record<string, unknown>).words as WordToken[] | undefined) ?? []
      if (words.length === 0) throw new Error(tr('Aucun mot détecté dans la vidéo', 'No words detected in the video'))

      const segs = groupWords(words, perGroup)
      setSegments(segs)

      if (cancelRef.current) { setStatus(''); setPhase('idle'); return }

      // ── Step 3: burn subtitles via FFmpeg ────────────────────────────────────
      setPhase('burning')
      setStatus(tr(`Incrustation de ${segs.length} segments…`, `Burning ${segs.length} segments…`))

      const ffRes = await window.electronAPI!.runFfmpegSubtitles({
        sourcePath: videoSrc,
        segments:   segs,
        fontSize, fontColor, position, style, preset,
      })
      if (!ffRes.ok || !ffRes.outputPath) throw new Error(ffRes.error ?? tr('L\'incrustation des sous-titres a échoué', 'Subtitle burn-in failed'))

      if (cancelRef.current) { setStatus(''); setPhase('idle'); return }

      // Load result for preview
      if (!isWeb && window.electronAPI?.readLocalVideo) {
        const { ok, dataUrl } = await window.electronAPI.readLocalVideo(ffRes.outputPath) as any
        if (ok && dataUrl) setOutputUrl(dataUrl)
      } else {
        setOutputUrl(ffRes.outputPath)
      }
      setOutputPath(ffRes.outputPath)
      setPhase('done')
      setStatus(tr(`Terminé — ${segs.length} sous-titres incrustés`, `Done — ${segs.length} subtitles burned in`))

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    } finally {
      setCancelling(false)
      if (tempPaths.length) deleteStorageObjects(tempPaths).catch(() => {})
    }
  }

  // Annule la génération en cours (stoppe avant l'enregistrement du résultat).
  function cancelGenerate() { cancelRef.current = true; setCancelling(true) }

  async function download() {
    // Web: outputUrl is a blob/data/http URL → trigger a browser download.
    if (isWeb || !window.electronAPI?.saveFileAs) {
      const src = outputUrl ?? outputPath
      if (!src) return
      const a = document.createElement('a')
      a.href = src
      a.download = videoName.replace(/\.[^.]+$/, '') + '_sous-titres.mp4'
      a.click()
      return
    }
    if (!outputPath) return
    await window.electronAPI.saveFileAs({
      sourcePath:  outputPath,
      defaultName: videoName.replace(/\.[^.]+$/, '') + '_sous-titres.mp4',
    })
  }

  async function saveToBank() {
    const src = outputUrl ?? outputPath
    if (!src || saving || savedToBank) return
    setSaving(true)
    try {
      const resp = await fetch(src)
      if (!resp.ok) throw new Error(tr('Lecture de la vidéo générée impossible', 'Could not read the generated video'))
      const blob = await resp.blob()
      const title = videoName.replace(/\.[^.]+$/, '') + '_sous-titres'
      const scope = currentOrg?.id
        ? { mode: 'org' as const, id: currentOrg.id }
        : { mode: 'user' as const, id: user.id }
      const { storagePath, thumbnailPath } = await uploadVideoFromBlob(blob, `${title}.mov`, scope)
      const { error } = await supabase.from('content_bank').insert({
        user_id: user.id, org_id: currentOrg?.id ?? null,
        title: `Sous-titres — ${title}`,
        file_url: null,
        storage_path: storagePath,
        thumbnail_path: thumbnailPath,
        folder: saveFolder, tags: ['sous-titres'], notes: '',
      })
      if (error) throw new Error(error.message)
      setSavedToBank(true)
    } catch (err) {
      setError(tr('Enregistrement dans la banque : ', 'Saving to bank: ') + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  const canGenerate = !!videoSrc && !!groqKey && ['idle', 'error', 'done'].includes(phase)
  const isRunning   = phase === 'fetching' || phase === 'transcribing' || phase === 'burning'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-y-auto sf-anim-slide-up" style={{ padding: 24, gap: 20, maxWidth: 1100, margin: '0 auto', width: '100%' }}>

      {/* Header */}
      <div className="sf-page-header" style={{ ['--icon-grad' as any]: 'linear-gradient(135deg,#F59E0B,#FBBF24)' }}>
        <div className="sf-cluster" style={{ gap: 14, minWidth: 0 }}>
          <div className="sf-page-icon sf-anim-scale-spring" style={{ boxShadow: '0 10px 24px -8px rgba(251,191,36,0.5), inset 0 1px 0 0 rgba(255,255,255,0.35)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="3"/><path d="M6 14h4"/><path d="M13 14h5"/><path d="M6 17h2"/><path d="M11 17h7"/>
            </svg>
          </div>
          <div className="sf-anim-slide-up sf-d50" style={{ minWidth: 0 }}>
            <h1 className="sf-page-title sf-title-grad">{tr('Sous-titres Auto', 'Auto Subtitles')}</h1>
            <p className="sf-page-sub">
              {tr('Groq Whisper transcrit · FFmpeg incruste', 'Groq Whisper transcribes · FFmpeg burns in')}
            </p>
          </div>
        </div>
        <div className="sf-page-header-actions sf-anim-slide-up sf-d100">
          {isRunning
            ? <span className="sf-status-chip is-live"><span className="sf-status-dot" />{tr('En cours', 'Running')}</span>
            : phase === 'done'
              ? <span className="sf-status-chip is-live">{tr('Terminé', 'Done')}</span>
              : <span className="sf-status-chip is-idle">{tr('Prêt', 'Ready')}</span>}
          <span className="sf-badge sf-badge-accent">Powered by Groq Whisper</span>
        </div>
      </div>

      {/* Groq key warning */}
      {!groqKey && (
        <div className="sf-banner is-warn sf-anim-slide-up">
          <WarningIcon />
          <span>{tr('Clé Groq manquante — ajoute-la dans', 'Groq key missing — add it in')} <strong style={{ margin: '0 4px' }}>{tr('Paramètres → API', 'Settings → API')}</strong></span>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── Left: drop zone ── */}
        <div className="flex flex-col" style={{ gap: 12 }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={pickFile}
            className="cursor-pointer sf-press"
            style={{
              minHeight: 200,
              borderRadius: 'var(--r-lg)',
              border: dragging ? `2px solid ${ACCENT}` : `2px dashed var(--border-accent)`,
              background: dragging ? 'rgba(99,102,241,0.07)' : previewUrl ? 'transparent' : 'rgba(255,255,255,0.02)',
              boxShadow: dragging ? 'var(--glow-accent)' : 'none',
              transition: 'border-color var(--t-base), background var(--t-fast), box-shadow var(--t-base)',
              overflow: 'hidden',
            }}
          >
            {previewUrl ? (
              <video
                key={previewUrl}
                src={previewUrl}
                style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 'var(--r-lg)' }}
                controls muted
              />
            ) : (
              <div className="sf-empty flex flex-col items-center justify-center h-full select-none" style={{ gap: 12, padding: '48px 0' }}>
                <div className="sf-empty-icon flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 'var(--r-md)', background: 'linear-gradient(135deg, rgba(129,140,248,0.16), rgba(139,92,246,0.08))', border: `1px solid rgba(139,92,246,0.25)`, boxShadow: '0 12px 30px -12px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                  <VideoIcon />
                </div>
                <div className="text-center">
                  <p className="sf-empty-title" style={{ fontSize: 14, fontWeight: 700, color: TEXT_1 }}>{tr('Dépose ta vidéo ici', 'Drop your video here')}</p>
                  <p className="sf-empty-desc" style={{ fontSize: 12.5, color: TEXT_3, marginTop: 2 }}>{tr('ou clique pour choisir', 'or click to choose')}</p>
                </div>
              </div>
            )}
          </div>

          {/* Bank picker button */}
          <button
            onClick={() => setShowBankPicker(true)}
            className="sf-btn sf-btn-secondary"
            style={{ width: '100%' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
            {tr('Depuis la banque', 'From the bank')}
          </button>

          {videoName && (
            <p className="text-center truncate" style={{ fontSize: 12, color: TEXT_3 }}>{videoName}</p>
          )}
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={onFileInput} />
        </div>

        {/* ── Right: options ── */}
        <div className="flex flex-col" style={{ gap: 16 }}>
          <SectionCard title={tr('Paramètres', 'Settings')}>

            <Row label={tr('Langue', 'Language')}>
              <select value={lang} onChange={e => setLang(e.target.value as Lang)} className="sf-input text-sm" style={{ flex: 1 }}>
                {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
                  <option key={l} value={l}>{l === 'auto' ? tr('Auto-détect', 'Auto-detect') : LANG_LABELS[l]}</option>
                ))}
              </select>
            </Row>

            <Row label={tr('Mots / segment', 'Words / segment')}>
              <div className="sf-segment" role="group">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setPerGroup(n)}
                    className={`sf-segment-item sf-tabular${perGroup === n ? ' is-active' : ''}`}
                    style={{ padding: '0 14px' }}>{n}</button>
                ))}
              </div>
            </Row>

            <Row label={tr('Style', 'Style')}>
              <div className="sf-segment" role="group">
                {(['box', 'outline', 'shadow'] as Style[]).map(s => {
                  const labels = { box: tr('Fond noir', 'Black box'), outline: tr('Contour', 'Outline'), shadow: tr('Ombre', 'Shadow') }
                  return (
                    <button key={s} onClick={() => setStyle(s)}
                      className={`sf-segment-item${style === s ? ' is-active' : ''}`}>{labels[s]}</button>
                  )
                })}
              </div>
            </Row>

            <Row label={tr('Position', 'Position')}>
              <div className="sf-segment" role="group">
                {(['top', 'center', 'bottom'] as Position[]).map(p => {
                  const labels = { top: tr('Haut', 'Top'), center: tr('Centre', 'Center'), bottom: tr('Bas', 'Bottom') }
                  return (
                    <button key={p} onClick={() => setPosition(p)}
                      className={`sf-segment-item${position === p ? ' is-active' : ''}`}>{labels[p]}</button>
                  )
                })}
              </div>
            </Row>

            <Row label={tr(`Taille: ${fontSize}px`, `Size: ${fontSize}px`)}>
              <input type="range" min={36} max={120} step={4} value={fontSize}
                onChange={e => setFontSize(+e.target.value)} className="w-full accent-indigo-500" />
            </Row>

            <Row label={tr('Couleur', 'Color')}>
              <div className="flex gap-2 items-center">
                {['#ffffff', '#ffff00', '#00ff88', '#ff6b6b'].map(c => (
                  <button key={c} onClick={() => setFontColor(c)} className="w-7 h-7 rounded-full transition-all cursor-pointer flex-shrink-0"
                    style={{ background: c, boxShadow: fontColor === c ? `0 0 0 3px ${ACCENT}` : 'none', transform: fontColor === c ? 'scale(1.2)' : 'scale(1)' }} />
                ))}
                <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer border-0 flex-shrink-0" style={{ padding: 0 }} />
              </div>
            </Row>

            <Row label={tr('Format', 'Format')}>
              <div className="sf-segment" role="group">
                {(['keep', '9:16', '1:1', '16:9'] as const).map(p => (
                  <button key={p} onClick={() => setPreset(p)}
                    className={`sf-segment-item sf-tabular${preset === p ? ' is-active' : ''}`}>{p === 'keep' ? tr('Original', 'Original') : p}</button>
                ))}
              </div>
            </Row>

            <div style={{ marginTop: 4, paddingTop: 16, borderTop: `1px solid ${HAIR}` }}>
              <BankFolderSelect value={saveFolder} onChange={setSaveFolder} userId={user.id} orgId={currentOrg?.id} label={tr('Dossier de destination', 'Destination folder')} />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Generate button */}
      <button onClick={generate} disabled={!canGenerate}
        className="sf-btn sf-btn-primary sf-btn-lg"
        style={{ width: '100%' }}
      >
        {phase === 'fetching'      ? tr('Lecture vidéo…', 'Reading video…') :
         phase === 'transcribing'  ? tr('Transcription Whisper…', 'Whisper transcription…') :
         phase === 'burning'       ? tr('Incrustation FFmpeg…', 'FFmpeg burn-in…') :
         tr('Générer les sous-titres →', 'Generate subtitles →')}
      </button>

      {/* Cancel */}
      {isRunning && (
        <button onClick={cancelGenerate} disabled={cancelling}
          className="sf-btn sf-btn-lg"
          style={{ width: '100%', background: 'rgba(248,113,113,0.14)', border: '1px solid rgba(248,113,113,0.4)', color: '#F87171', fontWeight: 700 }}>
          {cancelling ? tr('Annulation…', 'Cancelling…') : tr('Annuler', 'Cancel')}
        </button>
      )}

      {/* Status */}
      {isRunning && (
        <div className="sf-banner is-accent sf-anim-slide-up">
          <SpinnerIcon />
          <span>{status}</span>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && error && (
        <div className="sf-banner is-danger sf-anim-slide-up">
          <WarningIcon />
          <span>{error}</span>
        </div>
      )}

      {/* Result */}
      {phase === 'done' && (
        <div className="flex flex-col sf-anim-slide-up" style={{ gap: 16 }}>
          <div className="sf-banner is-accent" style={{ background: 'var(--ok-dim)', borderColor: 'rgba(34,197,94,0.22)', color: 'var(--ok)' }}>
            <CheckIcon />
            <span style={{ fontWeight: 600 }}>{status}</span>
            <button onClick={download} className="sf-btn sf-btn-primary sf-btn-sm sf-banner-action">
              <DownloadIcon /> {tr('Télécharger', 'Download')}
            </button>
          </div>

          {/* Save to bank */}
          <div className="flex items-center flex-wrap sf-card" style={{ gap: 12, padding: 16 }}>
            <div style={{ flex: 1, fontSize: 12.5, color: TEXT_2 }}>
              <span style={{ color: TEXT_3 }}>{tr('Dossier : ', 'Folder: ')}</span>
              <span style={{ color: ACCENT_L, fontWeight: 600 }}>{saveFolder ?? tr('Racine', 'Root')}</span>
            </div>
            {savedToBank ? (
              <span className="sf-badge sf-badge-ok" style={{ height: 28 }}>
                <CheckIcon /> {tr('Enregistré dans la banque', 'Saved to bank')}
              </span>
            ) : (
              <button onClick={saveToBank} disabled={saving} className="sf-btn sf-btn-secondary sf-btn-sm">
                {saving
                  ? <><span style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid rgba(129,140,248,0.3)`, borderTopColor: ACCENT_L, animation: 'spin 0.9s linear infinite', display: 'inline-block' }} /> {tr('Enregistrement…', 'Saving…')}</>
                  : <><SaveIcon /> {tr('Enregistrer dans la banque', 'Save to bank')}</>
                }
              </button>
            )}
          </div>

          <div className="grid" style={{ gridTemplateColumns: outputUrl ? '1fr 1fr' : '1fr', gap: 16 }}>
            {outputUrl && (
              <div className="overflow-hidden" style={{ borderRadius: 'var(--r-lg)', border: `1px solid ${HAIR}`, background: BG_2 }}>
                <p className="sf-section-label" style={{ padding: '14px 14px 8px' }}>{tr('Aperçu', 'Preview')}</p>
                <video src={outputUrl} controls style={{ width: '100%', maxHeight: 300, objectFit: 'contain', background: '#000' }} />
              </div>
            )}
            {segments.length > 0 && (
              <div className="flex flex-col overflow-y-auto sf-card" style={{ gap: 6, padding: 16, maxHeight: 300 }}>
                <p className="sf-section-label" style={{ marginBottom: 8 }}>
                  {tr('Transcription', 'Transcript')} · <span className="sf-tabular">{segments.length}</span> {tr('segments', 'segments')}
                </p>
                {segments.map((seg, i) => (
                  <div key={i} className="flex items-baseline" style={{ gap: 12 }}>
                    <span className="flex-shrink-0" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: ACCENT }}>
                      {formatTime(seg.start)}
                    </span>
                    <span style={{ fontSize: 13, color: TEXT_1 }}>{seg.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BankPicker overlay */}
      {showBankPicker && (
        <BankPicker
          user={user}
          mode="single"
          onSelect={onBankPick}
          onClose={() => setShowBankPicker(false)}
          resolveMode="signed-url"
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sf-card flex flex-col" style={{ gap: 16, padding: 20 }}>
      <p className="sf-section-label">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: TEXT_2 }}>{label}</label>
      {children}
    </div>
  )
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin flex-shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.7">
      <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/>
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7,10 12,15 17,10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
  )
}

function SaveIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  )
}

export default Subtitles
