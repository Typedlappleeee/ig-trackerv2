import { useState, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { BankPicker } from './Bank'
import { playSuccess, playError } from '@/lib/sounds'
import { supabase } from '@/lib/supabase'
import { uploadVideoFromPath, type UploadScope } from '@/lib/storage'
import { useOrg } from '@/lib/orgContext'

interface MassRemixProps { user: User }

type Preset = '9:16' | '1:1' | '16:9'
type ExportMode = 'bank' | 'folder'

interface MassJob {
  id:           number
  originalPath: string
  secondaryPath: string
  status: 'pending' | 'detecting' | 'analyzing' | 'generating' | 'uploading' | 'done' | 'error'
  splitTime?:   number
  error?:       string
  outputPath?:  string
}

const STATUS_LABEL: Record<MassJob['status'], string> = {
  pending:    '⏳ En attente',
  detecting:  '🔍 Détection…',
  analyzing:  '✨ IA texte…',
  generating: '⚙ FFmpeg…',
  uploading:  '☁ Upload…',
  done:       '✅ Terminé',
  error:      '❌ Erreur',
}

function fileName(p: string) { return p.replace(/\\/g, '/').split('/').pop() ?? p }

function xAlignToExpr(align: string): string {
  if (align === 'right') return 'w*0.96-text_w'
  if (align === 'left')  return 'w*0.04'
  return '(w-text_w)/2'
}

function VideoListPanel({
  label, paths, accent, onAddBank, onAddPC, onRemove,
}: {
  label: string; paths: string[]; accent: string
  onAddBank: () => void; onAddPC: () => void; onRemove: (i: number) => void
}) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-white">{label}</p>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${accent}22`, color: accent }}>{paths.length}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={onAddBank}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>
          🗂 Banque
        </button>
        <button onClick={onAddPC}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(196,181,253,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
          💾 PC
        </button>
      </div>
      <div className="flex-1 overflow-auto space-y-1.5 min-h-[120px] max-h-80">
        {paths.length === 0 ? (
          <div className="rounded-xl p-4 text-center text-xs" style={{ border: `1px dashed ${accent}25`, color: 'rgba(196,181,253,0.3)' }}>
            Aucune vidéo — ajoute depuis la banque ou le PC
          </div>
        ) : paths.map((p, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ background: `${accent}08`, border: `1px solid ${accent}18` }}>
            <span className="text-[10px] font-bold w-5 text-center flex-shrink-0"
              style={{ color: accent }}>{i + 1}</span>
            <span className="text-xs font-mono truncate flex-1 text-white/70">{fileName(p)}</span>
            <button onClick={() => onRemove(i)}
              className="text-[11px] flex-shrink-0"
              style={{ color: 'rgba(239,68,68,0.5)' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MassRemix({ user }: MassRemixProps) {
  const { currentOrg } = useOrg()

  const [originals,   setOriginals]   = useState<string[]>([])
  const [secondaries, setSecondaries] = useState<string[]>([])
  const [preset,      setPreset]      = useState<Preset>('9:16')
  const [aiEnabled,   setAiEnabled]   = useState(false)
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem('sf_anthropic_key') ?? '')
  const [exportMode,  setExportMode]  = useState<ExportMode>('bank')
  const [outputFolder, setOutputFolder] = useState<string | null>(null)

  const [showBankOrig, setShowBankOrig] = useState(false)
  const [showBankSec,  setShowBankSec]  = useState(false)

  const [jobs,    setJobs]    = useState<MassJob[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef(false)

  function updateJob(id: number, patch: Partial<MassJob>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }

  async function pickPC(multi: boolean): Promise<string[]> {
    const p = await window.electronAPI?.pickVideoFile?.()
    return p ? [p] : []
  }

  async function launch() {
    if (!originals.length || !secondaries.length) return
    if (exportMode === 'folder' && !outputFolder) {
      const f = await window.electronAPI?.pickOutputFolder?.()
      if (!f) return
      setOutputFolder(f)
    }

    const folder = exportMode === 'folder' ? outputFolder : null
    const pairs: MassJob[] = originals.map((orig, i) => ({
      id: i,
      originalPath:  orig,
      secondaryPath: secondaries[i % secondaries.length],
      status: 'pending',
    }))
    setJobs(pairs)
    setRunning(true)
    abortRef.current = false

    const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }

    for (const job of pairs) {
      if (abortRef.current) break

      // 1. Detect split
      updateJob(job.id, { status: 'detecting' })
      const det = await window.electronAPI!.detectSceneChange!({ filePath: job.originalPath })
      const splitTime = det.ok && det.splitTime != null
        ? Math.min((det.duration ?? 60) - 0.1, Math.round((det.splitTime + 0.5) * 10) / 10)
        : Math.round((det.duration ?? 60) * 0.5 * 10) / 10
      updateJob(job.id, { splitTime })

      // 2. AI text detection (optional)
      type Overlay = { text: string; x: string; y: string; fontSize: number; fontColor: string; bold: boolean; shadow: boolean; startTime: number; endTime: number }
      let textOverlays: Overlay[] = []

      if (aiEnabled && anthropicKey.trim()) {
        updateJob(job.id, { status: 'analyzing' })
        try {
          const fr = await window.electronAPI!.extractFrames!({ filePath: job.originalPath, endTime: splitTime })
          if (fr.ok && fr.frames?.length) {
            const interval = splitTime / fr.frames.length
            const imageBlocks = fr.frames.flatMap((f, fi) => [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } },
              { type: 'text', text: `[Frame ${fi} — t=${f.timestamp}s]` },
            ])
            const prompt = `These are ${fr.frames.length} frames from a ${splitTime.toFixed(1)}s video clip (vertical 9:16).
Identify ALL burned-in text overlays. For each return:
{"text":"exact string","xAlign":"left"|"center"|"right","yPercent":0-100,"fontSizePx":number,"fontColor":"css-color","bold":false,"startFrame":0,"endFrame":5}
Return ONLY a JSON array. If none, return [].`
            const res = await window.electronAPI!.anthropicVisionRequest!({
              apiKey: anthropicKey.trim(), model: 'claude-haiku-4-5-20251001',
              messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
              maxTokens: 2000,
            })
            if (res.ok) {
              const txt = (res.data as { content: Array<{ type: string; text: string }> })?.content?.[0]?.text ?? '[]'
              try {
                const m = txt.match(/\[[\s\S]*\]/)
                if (m) {
                  const parsed = JSON.parse(m[0]) as Array<{ text: string; xAlign: string; yPercent: number; fontSizePx: number; fontColor: string; bold?: boolean; startFrame: number; endFrame: number }>
                  textOverlays = parsed.map(item => ({
                    text: item.text,
                    x: xAlignToExpr(item.xAlign ?? 'center'),
                    y: `h*${Math.max(0.01, Math.min(0.97, (item.yPercent ?? 85) / 100)).toFixed(3)}`,
                    fontSize: Math.round(Math.max(16, Math.min(200, item.fontSizePx ?? 42))),
                    fontColor: item.fontColor ?? 'white',
                    bold: item.bold ?? false,
                    shadow: true,
                    startTime: Math.round((item.startFrame ?? 0) * interval * 10) / 10,
                    endTime: Math.min(splitTime, Math.round(((item.endFrame ?? fr.frames!.length - 1) + 1) * interval * 10) / 10),
                  }))
                }
              } catch { /* ignore parse errors */ }
            }
          }
        } catch { /* continue without overlays */ }
      }

      // 3. Generate
      updateJob(job.id, { status: 'generating' })
      const outName = `remix_${String(job.id + 1).padStart(3, '0')}.mp4`
      let outputPath: string
      if (folder) {
        outputPath = folder.replace(/\\/g, '/') + '/' + outName
      } else {
        // temp path for bank export
        const tmp = await window.electronAPI!.writeTempFile!({ name: outName, bytes: new ArrayBuffer(0) })
        if (!tmp.ok || !tmp.path) { updateJob(job.id, { status: 'error', error: 'Impossible de créer le fichier temp' }); continue }
        outputPath = tmp.path
      }

      const gen = await window.electronAPI!.runFfmpegRemixAI!({
        newPhase1Path: job.secondaryPath,
        originalPath:  job.originalPath,
        splitTime, outputPath, preset,
        textOverlays,
      })

      if (!gen.ok) { updateJob(job.id, { status: 'error', error: gen.error ?? 'Erreur FFmpeg', outputPath }); playError(); continue }
      updateJob(job.id, { outputPath: gen.outputPath ?? outputPath })

      // 4. Upload to bank if needed
      if (exportMode === 'bank') {
        updateJob(job.id, { status: 'uploading' })
        try {
          const up = await uploadVideoFromPath(gen.outputPath ?? outputPath, scope)
          await supabase.from('content_bank').insert({
            user_id: user.id, org_id: currentOrg?.id ?? null,
            title: `Remix ${String(job.id + 1).padStart(3, '0')} — ${fileName(job.originalPath)}`,
            file_url: null, storage_path: up.storagePath, thumbnail_path: up.thumbnailPath,
            tags: [], notes: '',
          })
        } catch (err) {
          updateJob(job.id, { status: 'error', error: String(err) }); playError(); continue
        }
      }

      updateJob(job.id, { status: 'done' })
      playSuccess()
    }

    setRunning(false)
  }

  const doneCount  = jobs.filter(j => j.status === 'done').length
  const errorCount = jobs.filter(j => j.status === 'error').length
  const canLaunch  = originals.length > 0 && secondaries.length > 0 && !running

  return (
    <>
      {showBankOrig && (
        <BankPicker user={user} mode="multi"
          onSelect={paths => { setShowBankOrig(false); setOriginals(prev => [...prev, ...paths]) }}
          onClose={() => setShowBankOrig(false)} />
      )}
      {showBankSec && (
        <BankPicker user={user} mode="multi"
          onSelect={paths => { setShowBankSec(false); setSecondaries(prev => [...prev, ...paths]) }}
          onClose={() => setShowBankSec(false)} />
      )}

      <div className="flex flex-col h-full overflow-auto p-6 gap-6" style={{ background: '#06040f' }}>

        {/* Video pickers */}
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
            <VideoListPanel
              label="Vidéos originales"
              paths={originals}
              accent="#8b5cf6"
              onAddBank={() => setShowBankOrig(true)}
              onAddPC={async () => { const p = await pickPC(false); setOriginals(prev => [...prev, ...p]) }}
              onRemove={i => setOriginals(prev => prev.filter((_, j) => j !== i))}
            />
          </div>
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(236,72,153,0.15)' }}>
            <VideoListPanel
              label="Nouvelles Phase 1"
              paths={secondaries}
              accent="#ec4899"
              onAddBank={() => setShowBankSec(true)}
              onAddPC={async () => { const p = await pickPC(false); setSecondaries(prev => [...prev, ...p]) }}
              onRemove={i => setSecondaries(prev => prev.filter((_, j) => j !== i))}
            />
          </div>
        </div>

        {/* Pairing info */}
        {originals.length > 0 && secondaries.length > 0 && (
          <div className="rounded-xl px-4 py-2.5 text-xs flex items-center gap-2"
            style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', color: 'rgba(196,181,253,0.6)' }}>
            <span>🔀</span>
            <span>
              <strong className="text-white">{originals.length}</strong> originale(s) ×{' '}
              <strong className="text-white">{secondaries.length}</strong> secondaire(s) ={' '}
              <strong className="text-white">{originals.length}</strong> remix
              {secondaries.length < originals.length && ' (secondaires en boucle)'}
            </span>
          </div>
        )}

        {/* Settings */}
        <div className="rounded-2xl p-4 space-y-4" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'rgba(196,181,253,0.4)' }}>Paramètres</p>

          <div className="grid grid-cols-2 gap-4">
            {/* Preset */}
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'rgba(196,181,253,0.4)' }}>Format</p>
              <div className="flex gap-2">
                {(['9:16', '1:1', '16:9'] as Preset[]).map(p => (
                  <button key={p} onClick={() => setPreset(p)} className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                    style={preset === p
                      ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                      : { background: 'rgba(139,92,246,0.06)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.12)' }
                    }>{p}</button>
                ))}
              </div>
            </div>

            {/* Export mode */}
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'rgba(196,181,253,0.4)' }}>Export</p>
              <div className="flex gap-2">
                {(['bank', 'folder'] as ExportMode[]).map(m => (
                  <button key={m} onClick={() => setExportMode(m)} className="flex-1 py-1.5 rounded-lg text-xs font-bold"
                    style={exportMode === m
                      ? { background: 'linear-gradient(130deg,#7c3aed,#ec4899)', color: '#fff' }
                      : { background: 'rgba(139,92,246,0.06)', color: 'rgba(196,181,253,0.5)', border: '1px solid rgba(139,92,246,0.12)' }
                    }>
                    {m === 'bank' ? '☁ Banque' : '💾 Dossier'}
                  </button>
                ))}
              </div>
              {exportMode === 'folder' && (
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={async () => { const f = await window.electronAPI?.pickOutputFolder?.(); if (f) setOutputFolder(f) }}
                    className="text-xs px-3 py-1 rounded-lg"
                    style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                    📁 Choisir…
                  </button>
                  {outputFolder && <span className="text-[10px] font-mono truncate" style={{ color: 'rgba(196,181,253,0.5)' }}>{outputFolder}</span>}
                </div>
              )}
            </div>
          </div>

          {/* AI text toggle */}
          <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' }}>
            <button onClick={() => setAiEnabled(v => !v)}
              className="flex-shrink-0 w-10 h-5 rounded-full transition-all relative"
              style={{ background: aiEnabled ? 'linear-gradient(130deg,#7c3aed,#ec4899)' : 'rgba(139,92,246,0.15)' }}>
              <div className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                style={{ left: aiEnabled ? 'calc(100% - 18px)' : '2px' }} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">✨ Détection texte IA (Claude Vision)</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(196,181,253,0.4)' }}>
                Analyse chaque vidéo originale et recopie le texte. Plus lent mais plus précis.
              </p>
              {aiEnabled && (
                <input
                  type="password" placeholder="sk-ant-…"
                  value={anthropicKey}
                  onChange={e => { setAnthropicKey(e.target.value); localStorage.setItem('sf_anthropic_key', e.target.value) }}
                  className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-mono outline-none"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', color: '#c4b5fd' }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Launch */}
        <div className="flex items-center gap-4">
          <Button
            onClick={launch}
            disabled={!canLaunch}
            size="lg"
          >
            {running ? <><Spinner size="sm" /> Génération…</> : `⚡ Lancer ${originals.length || ''} remix`}
          </Button>
          {running && (
            <button onClick={() => { abortRef.current = true }}
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              ✕ Annuler
            </button>
          )}
          {!running && jobs.length > 0 && (
            <p className="text-sm" style={{ color: doneCount === jobs.length ? '#34d399' : errorCount > 0 ? '#f87171' : 'rgba(196,181,253,0.5)' }}>
              {doneCount}/{jobs.length} terminé(s){errorCount > 0 ? ` · ${errorCount} erreur(s)` : ''}
            </p>
          )}
        </div>

        {/* Job list */}
        {jobs.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(196,181,253,0.3)' }}>File de génération</p>
            {jobs.map(job => (
              <div key={job.id} className="rounded-xl px-4 py-2.5 flex items-center gap-3"
                style={{
                  background: job.status === 'done' ? 'rgba(52,211,153,0.06)'
                    : job.status === 'error' ? 'rgba(239,68,68,0.06)'
                    : job.status === 'pending' ? 'rgba(8,5,20,0.5)'
                    : 'rgba(139,92,246,0.06)',
                  border: job.status === 'done' ? '1px solid rgba(52,211,153,0.2)'
                    : job.status === 'error' ? '1px solid rgba(239,68,68,0.2)'
                    : job.status === 'pending' ? '1px solid rgba(255,255,255,0.05)'
                    : '1px solid rgba(139,92,246,0.2)',
                }}>
                <span className="text-[10px] font-black w-7 text-center flex-shrink-0"
                  style={{ color: 'rgba(196,181,253,0.4)' }}>#{job.id + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono truncate text-white/70">{fileName(job.originalPath)}</p>
                  <p className="text-[9px] truncate" style={{ color: 'rgba(196,181,253,0.4)' }}>
                    → {fileName(job.secondaryPath)}
                    {job.splitTime != null && ` · cut ${job.splitTime}s`}
                  </p>
                  {job.error && <p className="text-[9px] mt-0.5" style={{ color: '#f87171' }}>{job.error}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {(job.status === 'detecting' || job.status === 'analyzing' || job.status === 'generating' || job.status === 'uploading') && <Spinner size="sm" />}
                  <span className="text-[10px] font-semibold"
                    style={{ color: job.status === 'done' ? '#34d399' : job.status === 'error' ? '#f87171' : 'rgba(196,181,253,0.6)' }}>
                    {STATUS_LABEL[job.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
