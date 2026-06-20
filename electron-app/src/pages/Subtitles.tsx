import { useState, useRef, useCallback, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { useConnections } from '@/lib/connections'
import { BankPicker } from '@/pages/Bank'

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

function groupWords(words: WordToken[], perGroup: number): Segment[] {
  const segs: Segment[] = []
  for (let i = 0; i < words.length; i += perGroup) {
    const chunk = words.slice(i, i + perGroup)
    segs.push({
      text:  chunk.map(w => w.word.trim()).join(' ').trim(),
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

const isWeb = typeof window !== 'undefined' && !(window as any).electronAPI

export function Subtitles({ user }: SubtitlesProps) {
  const conns   = useConnections(user)
  const groqKey = conns.groq

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

  useEffect(() => () => {
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    if (outputUrl?.startsWith('blob:'))  URL.revokeObjectURL(outputUrl)
  }, [])

  function reset() {
    setPhase('idle'); setStatus(''); setSegments([]); setError('')
    if (outputUrl?.startsWith('blob:')) URL.revokeObjectURL(outputUrl)
    setOutputUrl(null); setOutputPath(null)
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
    if (!groqKey) { setError('Clé API Groq manquante — configure-la dans Paramètres'); return }
    if (!videoSrc) { setError('Sélectionne une vidéo'); return }

    setPhase('transcribing')
    setStatus('Préparation…')
    setError('')
    setSegments([])

    try {
      // ── Step 1 + 2: transcription ────────────────────────────────────────────
      // Bank URL → pass URL to server proxy (no bytes sent from client)
      // Local file → read bytes here and send as base64 through proxy
      setPhase('transcribing')
      setStatus('Transcription de l\'audio…')

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
        setStatus('Transcription via URL banque…')
        transcriptRes = await (window.electronAPI as any).groqTranscription({
          apiKey:   groqKey,
          videoUrl: videoSrc,
          filename,
          language: lang !== 'auto' ? lang : undefined,
        })
      } else {
        // Local file: read bytes then send
        console.log('[Subtitles] → chemin audioBytes (fichier local ou blob URL)')
        let audioBytes: ArrayBuffer
        if (fileRef.current) {
          audioBytes = await fileRef.current.arrayBuffer()
          console.log('[Subtitles] audioBytes depuis fileRef.current:', (audioBytes.byteLength / 1024 / 1024).toFixed(1), 'MB')
        } else if (videoSrc) {
          setStatus('Lecture de la vidéo…')
          // readFileBytes only works for local paths, not for URLs
          if (window.electronAPI && !isWeb && !videoSrc.startsWith('http')) {
            const r = await window.electronAPI.readFileBytes(videoSrc)
            if (!r.ok || !r.bytes) throw new Error((r as any).error ?? 'Lecture échouée')
            audioBytes = r.bytes as ArrayBuffer
          } else {
            const r = await fetch(videoSrc)
            if (!r.ok) throw new Error(`Téléchargement échoué (${r.status})`)
            audioBytes = await r.arrayBuffer()
          }
          setStatus('Transcription de l\'audio…')
        } else {
          throw new Error('Aucune source vidéo')
        }
        transcriptRes = await window.electronAPI!.groqTranscription({
          apiKey: groqKey, audioBytes, filename,
          language: lang !== 'auto' ? lang : undefined,
        })
      }
      if (!transcriptRes.ok || !transcriptRes.data) {
        throw new Error(transcriptRes.error ?? 'Transcription échouée')
      }
      const words = ((transcriptRes.data as Record<string, unknown>).words as WordToken[] | undefined) ?? []
      if (words.length === 0) throw new Error('Aucun mot détecté dans la vidéo')

      const segs = groupWords(words, perGroup)
      setSegments(segs)

      // ── Step 3: burn subtitles via FFmpeg ────────────────────────────────────
      setPhase('burning')
      setStatus(`Incrustation de ${segs.length} segments…`)

      const ffRes = await window.electronAPI!.runFfmpegSubtitles({
        sourcePath: videoSrc,
        segments:   segs,
        fontSize, fontColor, position, style, preset,
      })
      if (!ffRes.ok || !ffRes.outputPath) throw new Error(ffRes.error ?? 'FFmpeg échoué')

      // Load result for preview
      if (!isWeb && window.electronAPI?.readLocalVideo) {
        const { ok, dataUrl } = await window.electronAPI.readLocalVideo(ffRes.outputPath) as any
        if (ok && dataUrl) setOutputUrl(dataUrl)
      } else {
        setOutputUrl(ffRes.outputPath)
      }
      setOutputPath(ffRes.outputPath)
      setPhase('done')
      setStatus(`Terminé — ${segs.length} sous-titres incrustés`)

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('error')
    }
  }

  async function download() {
    if (!outputPath) return
    await window.electronAPI?.saveFileAs?.({
      sourcePath:  outputPath,
      defaultName: videoName.replace(/\.[^.]+$/, '') + '_sous-titres.mp4',
    })
  }

  const canGenerate = !!videoSrc && !!groqKey && ['idle', 'error', 'done'].includes(phase)
  const isRunning   = phase === 'fetching' || phase === 'transcribing' || phase === 'burning'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ padding: '28px 32px', gap: 24 }}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Sous-titres Auto</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(148,163,184,0.5)' }}>
            Groq Whisper transcrit · FFmpeg incruste
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
          Powered by Groq Whisper
        </div>
      </div>

      {/* Groq key warning */}
      {!groqKey && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-3"
          style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', color: '#fbbf24' }}>
          <WarningIcon />
          Clé Groq manquante — ajoute-la dans <strong className="mx-1">Paramètres → API</strong>
        </div>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* ── Left: drop zone ── */}
        <div className="flex flex-col gap-3">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={pickFile}
            className="cursor-pointer rounded-2xl transition-all"
            style={{
              minHeight: 200,
              border: dragging ? '2px solid #6366F1' : '2px dashed rgba(99,102,241,0.22)',
              background: dragging ? 'rgba(99,102,241,0.07)' : previewUrl ? 'transparent' : 'rgba(15,23,42,0.5)',
              overflow: 'hidden',
            }}
          >
            {previewUrl ? (
              <video
                key={previewUrl}
                src={previewUrl}
                style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 14 }}
                controls muted
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 h-full py-12 select-none">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <VideoIcon />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Dépose ta vidéo ici</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.4)' }}>ou clique pour choisir</p>
                </div>
              </div>
            )}
          </div>

          {/* Bank picker button */}
          <button
            onClick={() => setShowBankPicker(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
            Depuis la banque
          </button>

          {videoName && (
            <p className="text-xs text-center truncate" style={{ color: 'rgba(148,163,184,0.4)' }}>{videoName}</p>
          )}
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={onFileInput} />
        </div>

        {/* ── Right: options ── */}
        <div className="flex flex-col gap-4">
          <SectionCard title="Paramètres">

            <Row label="Langue">
              <select value={lang} onChange={e => setLang(e.target.value as Lang)} className="sf-input text-sm" style={{ flex: 1 }}>
                {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
                  <option key={l} value={l}>{LANG_LABELS[l]}</option>
                ))}
              </select>
            </Row>

            <Row label="Mots / segment">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setPerGroup(n)} className="w-9 h-9 rounded-lg text-sm font-bold transition-all cursor-pointer"
                    style={perGroup === n
                      ? { background: '#6366F1', color: '#fff' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.6)', border: '1px solid rgba(255,255,255,0.08)' }
                    }>{n}</button>
                ))}
              </div>
            </Row>

            <Row label="Style">
              <div className="flex gap-2">
                {(['box', 'outline', 'shadow'] as Style[]).map(s => {
                  const labels = { box: 'Fond noir', outline: 'Contour', shadow: 'Ombre' }
                  return (
                    <button key={s} onClick={() => setStyle(s)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      style={style === s
                        ? { background: '#6366F1', color: '#fff' }
                        : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.6)', border: '1px solid rgba(255,255,255,0.08)' }
                      }>{labels[s]}</button>
                  )
                })}
              </div>
            </Row>

            <Row label="Position">
              <div className="flex gap-2">
                {(['top', 'center', 'bottom'] as Position[]).map(p => {
                  const labels = { top: 'Haut', center: 'Centre', bottom: 'Bas' }
                  return (
                    <button key={p} onClick={() => setPosition(p)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                      style={position === p
                        ? { background: '#6366F1', color: '#fff' }
                        : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.6)', border: '1px solid rgba(255,255,255,0.08)' }
                      }>{labels[p]}</button>
                  )
                })}
              </div>
            </Row>

            <Row label={`Taille: ${fontSize}px`}>
              <input type="range" min={36} max={120} step={4} value={fontSize}
                onChange={e => setFontSize(+e.target.value)} className="w-full accent-indigo-500" />
            </Row>

            <Row label="Couleur">
              <div className="flex gap-2 items-center">
                {['#ffffff', '#ffff00', '#00ff88', '#ff6b6b'].map(c => (
                  <button key={c} onClick={() => setFontColor(c)} className="w-7 h-7 rounded-full transition-all cursor-pointer flex-shrink-0"
                    style={{ background: c, boxShadow: fontColor === c ? '0 0 0 3px #6366F1' : 'none', transform: fontColor === c ? 'scale(1.2)' : 'scale(1)' }} />
                ))}
                <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                  className="w-7 h-7 rounded-full cursor-pointer border-0 flex-shrink-0" style={{ padding: 0 }} />
              </div>
            </Row>

            <Row label="Format">
              <div className="flex gap-1.5 flex-wrap">
                {(['keep', '9:16', '1:1', '16:9'] as const).map(p => (
                  <button key={p} onClick={() => setPreset(p)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    style={preset === p
                      ? { background: '#6366F1', color: '#fff' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(148,163,184,0.6)', border: '1px solid rgba(255,255,255,0.08)' }
                    }>{p === 'keep' ? 'Original' : p}</button>
                ))}
              </div>
            </Row>
          </SectionCard>
        </div>
      </div>

      {/* Generate button */}
      <button onClick={generate} disabled={!canGenerate}
        className="w-full py-3.5 rounded-xl font-black text-sm tracking-wide transition-all cursor-pointer"
        style={canGenerate
          ? { background: 'linear-gradient(130deg,#6366F1,#818CF8)', color: '#fff', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }
          : { background: 'rgba(99,102,241,0.1)', color: 'rgba(148,163,184,0.3)', cursor: 'not-allowed' }
        }
      >
        {phase === 'fetching'      ? 'Lecture vidéo…' :
         phase === 'transcribing'  ? 'Transcription Whisper…' :
         phase === 'burning'       ? 'Incrustation FFmpeg…' :
         'Générer les sous-titres →'}
      </button>

      {/* Status */}
      {isRunning && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <SpinnerIcon />
          <span className="text-sm text-white">{status}</span>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Result */}
      {phase === 'done' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl"
            style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <span className="text-sm font-semibold" style={{ color: '#4ade80' }}>{status}</span>
            <button onClick={download}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer transition-all"
              style={{ background: '#22c55e', color: '#fff', boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}>
              <DownloadIcon /> Télécharger
            </button>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: outputUrl ? '1fr 1fr' : '1fr' }}>
            {outputUrl && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.15)' }}>
                <p className="text-xs font-semibold px-3 pt-3 pb-2" style={{ color: 'rgba(148,163,184,0.4)' }}>APERÇU</p>
                <video src={outputUrl} controls style={{ width: '100%', maxHeight: 300, objectFit: 'contain', background: '#000' }} />
              </div>
            )}
            {segments.length > 0 && (
              <div className="rounded-2xl p-4 flex flex-col gap-1.5 overflow-y-auto"
                style={{ maxHeight: 300, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(148,163,184,0.4)' }}>
                  TRANSCRIPTION ({segments.length} segments)
                </p>
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
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.35)' }}>{title}</p>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" style={{ color: 'rgba(148,163,184,0.5)' }}>{label}</label>
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

export default Subtitles
