import { useState, useRef, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'

interface SubtitlesProps { user: User }

type Style    = 'box' | 'outline' | 'shadow'
type Position = 'top' | 'center' | 'bottom'
type Lang     = 'auto' | 'fr' | 'en' | 'es' | 'de' | 'ja' | 'zh' | 'pt' | 'ar'
type Phase    = 'idle' | 'transcribing' | 'burning' | 'done' | 'error'

interface WordToken { word: string; start: number; end: number }
interface Segment   { text: string; start: number; end: number }

const LANG_LABELS: Record<Lang, string> = {
  auto: 'Auto-détect', fr: 'Français', en: 'English',
  es: 'Español', de: 'Deutsch', ja: '日本語',
  zh: '中文', pt: 'Português', ar: 'العربية',
}

function groupWords(words: WordToken[], perGroup: number): Segment[] {
  const segs: Segment[] = []
  for (let i = 0; i < words.length; i += perGroup) {
    const chunk = words.slice(i, i + perGroup)
    segs.push({
      text:  chunk.map(w => w.word).join(' ').trim(),
      start: chunk[0].start,
      end:   chunk[chunk.length - 1].end,
    })
  }
  return segs
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}

export function Subtitles({ user: _user }: SubtitlesProps) {
  const conns = useConnections(_user)
  const groqKey = conns.groq

  const [videoPath, setVideoPath]       = useState<string | null>(null)
  const [videoName, setVideoName]       = useState('')
  const [videoUrl,  setVideoUrl]        = useState<string | null>(null)
  const [dragging,  setDragging]        = useState(false)

  // options
  const [lang,       setLang]       = useState<Lang>('auto')
  const [perGroup,   setPerGroup]   = useState(3)
  const [fontSize,   setFontSize]   = useState(72)
  const [fontColor,  setFontColor]  = useState('#ffffff')
  const [style,      setStyle]      = useState<Style>('box')
  const [position,   setPosition]   = useState<Position>('bottom')
  const [preset,     setPreset]     = useState<'9:16' | '1:1' | '16:9' | 'keep'>('keep')

  const [phase,       setPhase]       = useState<Phase>('idle')
  const [status,      setStatus]      = useState('')
  const [segments,    setSegments]    = useState<Segment[]>([])
  const [outputPath,  setOutputPath]  = useState<string | null>(null)
  const [outputUrl,   setOutputUrl]   = useState<string | null>(null)
  const [error,       setError]       = useState('')

  const abortRef = useRef(false)

  // Clean up blob URLs on unmount
  useEffect(() => () => {
    if (videoUrl?.startsWith('blob:')) URL.revokeObjectURL(videoUrl)
    if (outputUrl?.startsWith('blob:')) URL.revokeObjectURL(outputUrl)
  }, [])

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('video/')) return
    loadFile(file)
  }, [])

  function loadFile(file: File) {
    if (videoUrl?.startsWith('blob:')) URL.revokeObjectURL(videoUrl)
    if (outputUrl?.startsWith('blob:')) URL.revokeObjectURL(outputUrl)
    setVideoName(file.name)
    setVideoUrl(URL.createObjectURL(file))
    setVideoPath(null) // web drop — no local path; we'll read bytes via file ref
    setFileRef(file)
    reset()
  }

  const fileRefRef = useRef<File | null>(null)
  function setFileRef(f: File | null) { fileRefRef.current = f }

  async function pickFile() {
    if (window.electronAPI) {
      const p = await window.electronAPI.pickVideoFile()
      if (!p) return
      if (videoUrl?.startsWith('blob:')) URL.revokeObjectURL(videoUrl)
      setVideoPath(p)
      setVideoName(p.split(/[\\/]/).pop() ?? p)
      // Show preview via readLocalVideo
      const r = await window.electronAPI.readLocalVideo(p)
      if (r.ok && r.dataUrl) setVideoUrl(r.dataUrl)
      setFileRef(null)
      reset()
    } else {
      fileInputRef.current?.click()
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
    e.target.value = ''
  }

  function reset() {
    setPhase('idle'); setStatus(''); setSegments([]); setError('')
    if (outputUrl?.startsWith('blob:')) URL.revokeObjectURL(outputUrl)
    setOutputPath(null); setOutputUrl(null)
  }

  // ── Main generation ───────────────────────────────────────────────────────────
  async function generate() {
    if (phase === 'transcribing' || phase === 'burning') return
    if (!groqKey) { setError('Clé API Groq manquante — configure-la dans Paramètres'); return }
    if (!videoPath && !fileRefRef.current) { setError('Sélectionne une vidéo'); return }

    abortRef.current = false
    setPhase('transcribing')
    setStatus('Transcription de l\'audio en cours…')
    setError('')
    setSegments([])

    try {
      // ── Step 1: get audio bytes ──────────────────────────────────────────────
      let audioBlob: Blob
      if (videoPath && window.electronAPI) {
        const { ok, bytes, error: re } = await window.electronAPI.readFileBytes(videoPath)
        if (!ok || !bytes) throw new Error(re ?? 'Lecture fichier échouée')
        audioBlob = new Blob([bytes], { type: 'video/mp4' })
      } else if (fileRefRef.current) {
        audioBlob = fileRefRef.current
      } else {
        throw new Error('Aucun fichier source')
      }

      // ── Step 2: Groq Whisper transcription (via main process, no CORS) ────────
      if (!window.electronAPI?.groqTranscription) {
        throw new Error('groqTranscription IPC non disponible')
      }
      const audioBytes = await audioBlob.arrayBuffer()
      const transcriptRes = await window.electronAPI.groqTranscription({
        apiKey: groqKey,
        audioBytes,
        filename: videoName || 'video.mp4',
        language: lang !== 'auto' ? lang : undefined,
      })
      if (!transcriptRes.ok || !transcriptRes.data) throw new Error(transcriptRes.error ?? 'Transcription échouée')
      const data = transcriptRes.data as { words?: WordToken[]; text?: string }
      if (!data.words || data.words.length === 0) {
        throw new Error('Aucun mot détecté dans la vidéo')
      }

      const segs = groupWords(data.words, perGroup)
      setSegments(segs)

      if (abortRef.current) return

      // ── Step 3: burn subtitles via native FFmpeg ─────────────────────────────
      setPhase('burning')
      setStatus(`Incrustation des ${segs.length} segments…`)

      if (!window.electronAPI?.runFfmpegSubtitles) {
        throw new Error('FFmpeg natif non disponible (web non supporté)')
      }

      const src = videoPath!
      const ffRes = await window.electronAPI.runFfmpegSubtitles({
        sourcePath: src,
        segments:   segs,
        fontSize, fontColor, position, style, preset,
      })
      if (!ffRes.ok || !ffRes.outputPath) throw new Error(ffRes.error ?? 'FFmpeg échoué')

      // Load output as blob for preview
      const { ok: rok, dataUrl } = await window.electronAPI.readLocalVideo(ffRes.outputPath)
      setOutputPath(ffRes.outputPath)
      if (rok && dataUrl) setOutputUrl(dataUrl)
      setPhase('done')
      setStatus(`Terminé — ${segs.length} sous-titres incrustés`)

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  async function downloadResult() {
    if (!outputPath || !window.electronAPI) return
    await window.electronAPI.saveFileAs({
      sourcePath:  outputPath,
      defaultName: videoName.replace(/\.[^.]+$/, '') + '_sous-titres.mp4',
    })
  }

  const canGenerate = (!!videoPath || !!fileRefRef.current) && !!groqKey
    && phase !== 'transcribing' && phase !== 'burning'

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ padding: '28px 32px', gap: 24 }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Sous-titres Auto</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(148,163,184,0.55)' }}>
            Whisper transcrit, FFmpeg incruste
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
          </svg>
          Powered by Groq Whisper
        </div>
      </div>

      {/* ── No Groq key warning ── */}
      {!groqKey && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-3"
          style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#fbbf24' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Clé Groq manquante — ajoute-la dans <strong className="mx-1">Paramètres → API</strong>
        </div>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* ── Left: source + drop zone ── */}
        <div className="flex flex-col gap-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={pickFile}
            className="cursor-pointer rounded-2xl flex flex-col items-center justify-center transition-all"
            style={{
              minHeight: 220,
              border: dragging ? '2px solid #6366F1' : '2px dashed rgba(99,102,241,0.25)',
              background: dragging
                ? 'rgba(99,102,241,0.07)'
                : videoUrl
                  ? 'transparent'
                  : 'rgba(15,23,42,0.6)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {videoUrl ? (
              <video
                src={videoUrl}
                style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 16 }}
                controls
                muted
              />
            ) : (
              <div className="flex flex-col items-center gap-3 p-8 select-none">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.8">
                    <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Dépose ta vidéo ici</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>ou clique pour choisir</p>
                </div>
              </div>
            )}
          </div>
          {videoName && (
            <p className="text-xs text-center truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>{videoName}</p>
          )}
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={onFileInput} />
        </div>

        {/* ── Right: options ── */}
        <div className="flex flex-col gap-4">
          <SectionCard title="Paramètres">
            {/* Language */}
            <Row label="Langue">
              <select
                value={lang}
                onChange={e => setLang(e.target.value as Lang)}
                className="sf-input text-sm"
                style={{ flex: 1 }}
              >
                {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
                  <option key={l} value={l}>{LANG_LABELS[l]}</option>
                ))}
              </select>
            </Row>

            {/* Words per segment */}
            <Row label="Mots / segment">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setPerGroup(n)}
                    className="w-9 h-9 rounded-lg text-sm font-bold transition-all cursor-pointer"
                    style={perGroup === n
                      ? { background: '#6366F1', color: '#fff' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.08)' }
                    }
                  >{n}</button>
                ))}
              </div>
            </Row>

            {/* Style */}
            <Row label="Style">
              <div className="flex gap-2">
                {(['box', 'outline', 'shadow'] as Style[]).map(s => {
                  const labels = { box: 'Fond noir', outline: 'Contour', shadow: 'Ombre' }
                  return (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      style={style === s
                        ? { background: '#6366F1', color: '#fff' }
                        : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.08)' }
                      }
                    >{labels[s]}</button>
                  )
                })}
              </div>
            </Row>

            {/* Position */}
            <Row label="Position">
              <div className="flex gap-2">
                {(['top', 'center', 'bottom'] as Position[]).map(p => {
                  const labels = { top: 'Haut', center: 'Centre', bottom: 'Bas' }
                  return (
                    <button
                      key={p}
                      onClick={() => setPosition(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      style={position === p
                        ? { background: '#6366F1', color: '#fff' }
                        : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.08)' }
                      }
                    >{labels[p]}</button>
                  )
                })}
              </div>
            </Row>

            {/* Font size */}
            <Row label={`Taille: ${fontSize}px`}>
              <input
                type="range" min={36} max={120} step={4}
                value={fontSize}
                onChange={e => setFontSize(+e.target.value)}
                className="w-full accent-indigo-500"
              />
            </Row>

            {/* Color */}
            <Row label="Couleur">
              <div className="flex gap-2">
                {['#ffffff', '#ffff00', '#00ff88', '#ff6b6b'].map(c => (
                  <button
                    key={c}
                    onClick={() => setFontColor(c)}
                    className="w-8 h-8 rounded-full transition-all cursor-pointer"
                    style={{
                      background: c,
                      boxShadow: fontColor === c ? `0 0 0 3px rgba(99,102,241,0.8)` : 'none',
                      transform: fontColor === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={fontColor}
                  onChange={e => setFontColor(e.target.value)}
                  className="w-8 h-8 rounded-full cursor-pointer border-0"
                  title="Couleur personnalisée"
                  style={{ padding: 0, background: 'none' }}
                />
              </div>
            </Row>

            {/* Format */}
            <Row label="Format sortie">
              <div className="flex gap-1.5">
                {(['keep', '9:16', '1:1', '16:9'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPreset(p)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    style={preset === p
                      ? { background: '#6366F1', color: '#fff' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(255,255,255,0.08)' }
                    }
                  >{p === 'keep' ? 'Original' : p}</button>
                ))}
              </div>
            </Row>
          </SectionCard>
        </div>
      </div>

      {/* ── Generate button ── */}
      <button
        onClick={generate}
        disabled={!canGenerate}
        className="w-full py-3.5 rounded-xl font-black text-sm tracking-wide transition-all cursor-pointer"
        style={canGenerate
          ? { background: 'linear-gradient(130deg,#6366F1,#818CF8)', color: '#fff', boxShadow: '0 8px 24px rgba(99,102,241,0.35)' }
          : { background: 'rgba(99,102,241,0.15)', color: 'rgba(148,163,184,0.4)', cursor: 'not-allowed' }
        }
      >
        {phase === 'transcribing' ? 'Transcription…' :
         phase === 'burning'      ? 'Incrustation FFmpeg…' :
         'Générer les sous-titres →'}
      </button>

      {/* ── Status / progress ── */}
      {(phase === 'transcribing' || phase === 'burning') && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <SpinnerIcon />
          <span className="text-sm text-white">{status}</span>
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* ── Result ── */}
      {phase === 'done' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-4 py-2 rounded-xl"
            style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <span className="text-sm font-semibold" style={{ color: '#4ade80' }}>{status}</span>
            <button
              onClick={downloadResult}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer"
              style={{ background: '#22c55e', color: '#fff', boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Télécharger
            </button>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: outputUrl ? '1fr 1fr' : '1fr' }}>
            {outputUrl && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.15)' }}>
                <p className="text-xs font-semibold px-3 pt-3 pb-2" style={{ color: 'rgba(148,163,184,0.5)' }}>APERÇU</p>
                <video
                  src={outputUrl}
                  controls
                  style={{ width: '100%', maxHeight: 320, objectFit: 'contain', background: '#000' }}
                />
              </div>
            )}

            {segments.length > 0 && (
              <div className="rounded-2xl p-4 flex flex-col gap-1.5 overflow-y-auto"
                style={{ maxHeight: 320, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(148,163,184,0.5)' }}>TRANSCRIPTION ({segments.length} segments)</p>
                {segments.map((seg, i) => (
                  <div key={i} className="flex gap-3 items-baseline">
                    <span className="text-xs tabular-nums flex-shrink-0" style={{ color: '#6366F1' }}>
                      {formatTime(seg.start)}
                    </span>
                    <span className="text-sm text-white">{seg.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Small reusable sub-components ────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: 'rgba(148,163,184,0.4)' }}>{title}</p>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" style={{ color: 'rgba(148,163,184,0.55)' }}>{label}</label>
      {children}
    </div>
  )
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  )
}

export default Subtitles
