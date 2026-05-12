import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { BankPicker } from './Bank'
import { playSuccess, playError, playWhoosh } from '@/lib/sounds'
import { supabase } from '@/lib/supabase'
import { uploadVideoFromPath, type UploadScope } from '@/lib/storage'
import { useOrg } from '@/lib/orgContext'
import { logActivity } from '@/lib/activityLog'

interface MetadataChangerProps { user: User; onBack: () => void }

// Metadata fields we strip/randomize
const TRACKED_FIELDS = [
  'title', 'artist', 'album', 'comment', 'description',
  'date', 'year', 'creation_time', 'encoder', 'copyright',
  'major_brand', 'minor_version', 'compatible_brands', 'handler_name',
  'vendor_id', 'language',
]

function randomDate(): string {
  const now = Date.now()
  const past = now - Math.random() * 365 * 24 * 3600 * 1000 * 2
  return new Date(past).toISOString().replace('T', 'T').slice(0, 19) + '.000000Z'
}

function randomEncoder(): string {
  const versions = ['58.76.100', '59.18.100', '60.31.102', '61.1.100']
  return `Lavf${versions[Math.floor(Math.random() * versions.length)]}`
}

function fileName(p: string) {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function MetaRow({ field, before, after }: { field: string; before?: string; after?: string }) {
  const changed = before !== after
  return (
    <div className="grid grid-cols-[140px_1fr_1fr] gap-2 text-[11px] py-1.5"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="font-mono font-bold truncate" style={{ color: 'rgba(196,181,253,0.5)' }}>{field}</span>
      <span className="truncate font-mono" style={{ color: before ? 'rgba(251,191,36,0.8)' : 'rgba(255,255,255,0.2)' }}>
        {before || '—'}
      </span>
      <span className="truncate font-mono flex items-center gap-1.5"
        style={{ color: after ? (changed ? '#34d399' : 'rgba(255,255,255,0.3)') : 'rgba(52,211,153,0.4)' }}>
        {changed && before && <span style={{ color: '#34d399' }}>✓</span>}
        {after || <span style={{ color: 'rgba(52,211,153,0.5)' }}>supprimé</span>}
      </span>
    </div>
  )
}

export function MetadataChanger({ user, onBack }: MetadataChangerProps) {
  const { currentOrg } = useOrg()

  type Phase = 'idle' | 'reading' | 'ready' | 'processing' | 'done' | 'error'
  const [phase,       setPhase]       = useState<Phase>('idle')
  const [videoPath,   setVideoPath]   = useState<string | null>(null)
  const [bankItemId,  setBankItemId]  = useState<string | null>(null)
  const [bankStoragePath, setBankStoragePath] = useState<string | null>(null)
  const [showBank,    setShowBank]    = useState(false)

  const [beforeMeta,  setBeforeMeta]  = useState<Record<string, string>>({})
  const [afterMeta,   setAfterMeta]   = useState<Record<string, string>>({})
  const [duration,    setDuration]    = useState<number | undefined>()

  const [outputPath,  setOutputPath]  = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [command,     setCommand]     = useState<string | null>(null)
  const [showCmd,     setShowCmd]     = useState(false)

  const [uploading,   setUploading]   = useState(false)
  const [uploadDone,  setUploadDone]  = useState(false)

  async function pickFromPC() {
    const p = await window.electronAPI?.pickVideoFile?.()
    if (!p) return
    setVideoPath(p); setBankItemId(null); setBankStoragePath(null)
    playWhoosh()
    await readMeta(p)
  }

  async function readMeta(path: string) {
    setPhase('reading'); setError(null); setBeforeMeta({}); setAfterMeta({})
    const r = await window.electronAPI!.readVideoMetadata!({ filePath: path })
    if (!r.ok) { setPhase('error'); setError(r.error ?? 'Lecture impossible'); playError(); return }
    setBeforeMeta(r.metadata ?? {})
    setDuration(r.duration)
    setPhase('ready')
  }

  function buildNewMetadata(): Record<string, string> {
    // Strip all tracked fields, keep creation_time as a new random date
    const result: Record<string, string> = {}
    for (const field of TRACKED_FIELDS) {
      result[field] = ''  // empty = strip
    }
    // Add a randomised creation_time so the file has a "legit" timestamp
    result['creation_time'] = randomDate()
    // Set encoder to a plausible value
    result['encoder'] = randomEncoder()
    return result
  }

  async function process() {
    if (!videoPath) return
    setPhase('processing'); setError(null)

    const outName = fileName(videoPath).replace(/\.[^.]+$/, '') + '_meta.mp4'
    const outPath = await window.electronAPI?.pickOutputFile?.({ defaultName: outName })
    if (!outPath) { setPhase('ready'); return }

    const newMeta = buildNewMetadata()
    const r = await window.electronAPI!.runFfmpegMetadata!({
      inputPath: videoPath, outputPath: outPath, metadata: newMeta,
    })

    if (!r.ok) {
      setPhase('error'); setError(r.error ?? 'Erreur FFmpeg'); setCommand(r.command ?? null)
      playError(); return
    }

    // Read the output metadata to show the "after" state
    const after = await window.electronAPI!.readVideoMetadata!({ filePath: outPath })
    setAfterMeta(after.metadata ?? {})
    setOutputPath(outPath)
    setCommand(r.command ?? null)
    setPhase('done')
    playSuccess()
  }

  async function processToBank() {
    if (!videoPath) return
    setPhase('processing'); setError(null)

    // Write to a temp file
    const outName = fileName(videoPath).replace(/\.[^.]+$/, '') + '_meta.mp4'
    const tmpResult = await window.electronAPI!.writeTempFile!({ name: outName, bytes: new ArrayBuffer(0) })
    if (!tmpResult.ok || !tmpResult.path) { setPhase('error'); setError('Temp file error'); return }

    const newMeta = buildNewMetadata()
    const r = await window.electronAPI!.runFfmpegMetadata!({
      inputPath: videoPath, outputPath: tmpResult.path, metadata: newMeta,
    })

    if (!r.ok) {
      setPhase('error'); setError(r.error ?? 'Erreur FFmpeg'); setCommand(r.command ?? null)
      playError(); return
    }

    const after = await window.electronAPI!.readVideoMetadata!({ filePath: tmpResult.path })
    setAfterMeta(after.metadata ?? {})
    setOutputPath(tmpResult.path)
    setCommand(r.command ?? null)
    setPhase('done')
    playSuccess()
  }

  async function uploadToBank(deleteOriginal: boolean) {
    if (!outputPath) return
    setUploading(true)
    try {
      const scope: UploadScope = currentOrg ? { mode: 'org', id: currentOrg.id } : { mode: 'user', id: user.id }
      const { storagePath, thumbnailPath } = await uploadVideoFromPath(outputPath, scope)

      const title = fileName(outputPath).replace(/_meta\.mp4$/, '').replace(/\.[^.]+$/, '') + ' (meta nettoyé)'
      await supabase.from('content_bank').insert({
        user_id: user.id, org_id: currentOrg?.id ?? null,
        title, file_url: null, storage_path: storagePath, thumbnail_path: thumbnailPath,
        tags: [], notes: '',
      })
      logActivity({ orgId: currentOrg?.id ?? null, userId: user.id, userEmail: user.email ?? '', action: 'bank_add', details: { title, source: 'metadata_changer' } })

      // Delete original from bank if requested
      if (deleteOriginal && bankItemId && bankStoragePath) {
        await supabase.from('content_bank').delete().eq('id', bankItemId)
        // Also delete from storage
        const { deleteStorageObjects } = await import('@/lib/storage')
        deleteStorageObjects([bankStoragePath])
      }

      setUploadDone(true)
      playSuccess()
    } catch (err) {
      setError(String(err)); playError()
    } finally { setUploading(false) }
  }

  // All tracked fields — union of before and after keys
  const allFields = Array.from(new Set([...TRACKED_FIELDS, ...Object.keys(beforeMeta)]))
    .filter(f => beforeMeta[f] || afterMeta[f])

  return (
    <>
      {showBank && (
        <BankPicker user={user} mode="single"
          onSelect={async (paths) => {
            setShowBank(false)
            if (!paths[0]) return
            // paths[0] is a local resolved path; we also need the bank item ID
            // BankPicker returns resolved local paths — we pass the path directly
            setVideoPath(paths[0]); playWhoosh()
            await readMeta(paths[0])
          }}
          onClose={() => setShowBank(false)} />
      )}

      <div className="flex flex-col h-full overflow-auto" style={{ background: '#06040f' }}>
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 flex items-center gap-3"
          style={{ borderBottom: '1px solid rgba(139,92,246,0.12)', background: 'rgba(8,5,20,0.6)' }}>
          <button onClick={onBack} className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
            ← Retour
          </button>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg,#7c3aed22,#ec489922)', border: '1px solid rgba(139,92,246,0.25)' }}>🏷</div>
          <div>
            <p className="text-sm font-black text-white">Changeur de Métadonnées</p>
            <p className="text-[10px]" style={{ color: 'rgba(196,181,253,0.4)' }}>
              Supprime toutes les métadonnées · Nouveau timestamp aléatoire · Copie sans ré-encodage
            </p>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 max-w-3xl mx-auto w-full">

          {/* Video selection */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'rgba(196,181,253,0.4)' }}>Vidéo source</p>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => { setShowBank(true); playWhoosh() }}>🗂 Depuis la banque</Button>
              <Button variant="secondary" onClick={pickFromPC}>💾 Depuis le PC</Button>
              {videoPath && <Button variant="secondary" onClick={() => { setVideoPath(null); setPhase('idle') }}>✕</Button>}
            </div>
            {videoPath && (
              <div className="rounded-lg px-3 py-2 text-xs font-mono truncate flex items-center gap-2"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                {phase === 'reading' && <Spinner size="sm" />}
                {fileName(videoPath)}
                {duration && <span className="ml-auto flex-shrink-0" style={{ color: 'rgba(196,181,253,0.4)' }}>
                  {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
                </span>}
              </div>
            )}
          </div>

          {/* Metadata table */}
          {(phase === 'ready' || phase === 'done') && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="grid grid-cols-[140px_1fr_1fr] gap-2 text-[9px] uppercase tracking-wider font-black"
                  style={{ color: 'rgba(196,181,253,0.35)' }}>
                  <span>Champ</span>
                  <span style={{ color: 'rgba(251,191,36,0.5)' }}>Avant</span>
                  <span style={{ color: 'rgba(52,211,153,0.5)' }}>Après</span>
                </div>
              </div>
              <div className="px-4 pb-3">
                {allFields.length === 0 ? (
                  <p className="py-4 text-xs text-center" style={{ color: 'rgba(196,181,253,0.35)' }}>
                    Aucune métadonnée détectée dans ce fichier
                  </p>
                ) : (
                  allFields.map(f => (
                    <MetaRow key={f} field={f}
                      before={beforeMeta[f]}
                      after={phase === 'done' ? afterMeta[f] : undefined} />
                  ))
                )}
                {phase === 'ready' && (
                  <div className="mt-3 pt-3 text-xs space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(196,181,253,0.45)' }}>
                    <p>✓ Tous les champs ci-dessus seront <strong className="text-white">supprimés</strong></p>
                    <p>✓ Nouveau <code>creation_time</code> aléatoire sera ajouté</p>
                    <p>✓ Vidéo copiée sans ré-encodage (qualité identique, rapide)</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && error && (
            <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-sm font-bold" style={{ color: '#f87171' }}>❌ {error}</p>
              {command && (
                <>
                  <button onClick={() => setShowCmd(v => !v)} className="text-[10px]" style={{ color: 'rgba(139,92,246,0.7)' }}>
                    {showCmd ? '▼' : '▶'} Commande FFmpeg
                  </button>
                  {showCmd && <p className="text-[9px] font-mono break-all" style={{ color: 'rgba(196,181,253,0.5)' }}>{command}</p>}
                </>
              )}
              <Button variant="secondary" onClick={() => { setPhase('ready'); setError(null) }}>↺ Réessayer</Button>
            </div>
          )}

          {/* Processing */}
          {phase === 'processing' && (
            <div className="rounded-2xl p-8 text-center space-y-4" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <Spinner size="lg" />
                </div>
              </div>
              <p className="text-sm font-bold text-white">Réécriture des métadonnées…</p>
              <p className="text-xs" style={{ color: 'rgba(196,181,253,0.45)' }}>Copie en cours, qualité inchangée</p>
            </div>
          )}

          {/* Action buttons */}
          {phase === 'ready' && videoPath && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={process}
                className="rounded-xl py-3 flex flex-col items-center gap-1.5 text-sm font-semibold transition-all"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
                <span className="text-xl">💾</span>
                Sauver sur le PC
              </button>
              <button onClick={processToBank}
                className="rounded-xl py-3 flex flex-col items-center gap-1.5 text-sm font-semibold transition-all"
                style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(236,72,153,0.08))', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }}>
                <span className="text-xl">☁</span>
                Traiter et exporter banque
              </button>
            </div>
          )}

          {/* Done */}
          {phase === 'done' && outputPath && (
            <div className="space-y-4">
              <div className="rounded-2xl p-5 space-y-3"
                style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✅</span>
                  <div>
                    <p className="text-sm font-black text-white">Métadonnées nettoyées !</p>
                    <p className="text-xs mt-0.5" style={{ color: '#34d399' }}>
                      {allFields.filter(f => beforeMeta[f]).length} champ(s) supprimé(s) · nouveau timestamp injecté
                    </p>
                  </div>
                </div>
                <div className="rounded-lg px-3 py-2 text-[10px] font-mono break-all"
                  style={{ background: 'rgba(0,0,0,0.3)', color: 'rgba(196,181,253,0.5)' }}>
                  {outputPath}
                </div>
                {command && (
                  <>
                    <button onClick={() => setShowCmd(v => !v)} className="text-[10px]" style={{ color: 'rgba(139,92,246,0.7)' }}>
                      {showCmd ? '▼' : '▶'} Commande FFmpeg
                    </button>
                    {showCmd && <p className="text-[9px] font-mono break-all mt-1" style={{ color: 'rgba(196,181,253,0.4)' }}>{command}</p>}
                  </>
                )}
              </div>

              {/* Bank export */}
              {!uploadDone ? (
                <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(8,5,20,0.7)', border: '1px solid rgba(139,92,246,0.18)' }}>
                  <p className="text-xs font-black uppercase tracking-wider" style={{ color: 'rgba(196,181,253,0.4)' }}>Ajouter à la banque</p>
                  <div className="flex gap-3">
                    <button onClick={() => uploadToBank(false)} disabled={uploading}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd' }}>
                      {uploading ? <><Spinner size="sm" /> Upload…</> : '☁ Ajouter à la banque'}
                    </button>
                    {bankItemId && (
                      <button onClick={() => uploadToBank(true)} disabled={uploading}
                        className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                        {uploading ? <><Spinner size="sm" /> Upload…</> : '🗑 Remplacer dans la banque'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm font-semibold text-center" style={{ color: '#34d399' }}>✓ Ajouté à la banque !</p>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => {
                  setPhase('idle'); setVideoPath(null); setBeforeMeta({}); setAfterMeta({})
                  setOutputPath(null); setError(null); setBankItemId(null); setUploadDone(false)
                }}>
                  ↺ Nouvelle vidéo
                </Button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {phase === 'idle' && (
            <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(139,92,246,0.04)', border: '1px dashed rgba(139,92,246,0.2)' }}>
              <p className="text-4xl mb-3 opacity-40">🏷</p>
              <p className="text-sm font-semibold text-white mb-1">Sélectionne une vidéo</p>
              <p className="text-xs" style={{ color: 'rgba(196,181,253,0.4)' }}>
                L'outil lira ses métadonnées actuelles, les supprimera toutes et injectera un nouveau timestamp aléatoire — sans ré-encoder, en une seconde.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
