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
    <div className="grid grid-cols-[140px_1fr_1fr] gap-2 text-[11px] py-1.5 border-b border-border/40">
      <span className="font-mono font-bold truncate text-accent/50">{field}</span>
      <span className="truncate font-mono" style={{ color: before ? 'rgba(251,191,36,0.8)' : 'rgba(255,255,255,0.2)' }}>
        {before || '—'}
      </span>
      <span className="truncate font-mono flex items-center gap-1.5"
        style={{ color: after ? (changed ? '#34d399' : 'rgba(255,255,255,0.3)') : 'rgba(52,211,153,0.4)' }}>
        {changed && before && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
        {after || <span style={{ color: 'rgba(52,211,153,0.5)' }}>removed</span>}
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
    if (!r.ok) { setPhase('error'); setError(r.error ?? 'Unable to read'); playError(); return }
    setBeforeMeta(r.metadata ?? {})
    setDuration(r.duration)
    setPhase('ready')
  }

  function buildNewMetadata(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const field of TRACKED_FIELDS) {
      result[field] = ''
    }
    result['creation_time'] = randomDate()
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
      setPhase('error'); setError(r.error ?? 'FFmpeg error'); setCommand(r.command ?? null)
      playError(); return
    }

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

    const outName = fileName(videoPath).replace(/\.[^.]+$/, '') + '_meta.mp4'
    const tmpResult = await window.electronAPI!.writeTempFile!({ name: outName, bytes: new ArrayBuffer(0) })
    if (!tmpResult.ok || !tmpResult.path) { setPhase('error'); setError('Temp file error'); return }

    const newMeta = buildNewMetadata()
    const r = await window.electronAPI!.runFfmpegMetadata!({
      inputPath: videoPath, outputPath: tmpResult.path, metadata: newMeta,
    })

    if (!r.ok) {
      setPhase('error'); setError(r.error ?? 'FFmpeg error'); setCommand(r.command ?? null)
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

      if (deleteOriginal && bankItemId && bankStoragePath) {
        await supabase.from('content_bank').delete().eq('id', bankItemId)
        const { deleteStorageObjects } = await import('@/lib/storage')
        deleteStorageObjects([bankStoragePath])
      }

      setUploadDone(true)
      playSuccess()
    } catch (err) {
      setError(String(err)); playError()
    } finally { setUploading(false) }
  }

  const allFields = Array.from(new Set([...TRACKED_FIELDS, ...Object.keys(beforeMeta)]))
    .filter(f => beforeMeta[f] || afterMeta[f])

  return (
    <>
      {showBank && (
        <BankPicker user={user} mode="single"
          onSelect={async (paths) => {
            setShowBank(false)
            if (!paths[0]) return
            setVideoPath(paths[0]); playWhoosh()
            await readMeta(paths[0])
          }}
          onClose={() => setShowBank(false)} />
      )}

      <div className="h-full flex flex-col overflow-y-auto anim-page">
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-8 pt-7 pb-5 flex items-center gap-4 border-b border-border">
          <button
            onClick={onBack}
            className="sf-btn sf-btn-ghost cursor-pointer flex items-center gap-1.5 text-[13px] sf-anim-slide-up sf-d50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Retour
          </button>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-center gap-3 sf-anim-slide-up sf-d100">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(6,182,212,0.1))', border: '1px solid rgba(139,92,246,0.25)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] font-black text-text leading-none">Changeur de Métadonnées</h1>
              <p className="text-[13px] text-text2 mt-0.5">
                Supprime toutes les métadonnées · Nouveau timestamp aléatoire · Copie sans ré-encodage
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-8 pb-10">
          <div className="space-y-5 max-w-3xl mx-auto pt-6 anim-stagger">

            {/* Video selection */}
            <div className="sf-card sf-spotlight p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 10 5 5-5 5"/><rect x="2" y="7" width="13" height="10" rx="2"/>
                </svg>
                <p className="text-[14px] font-bold text-text">Vidéo source</p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => { setShowBank(true); playWhoosh() }}
                  className="sf-btn sf-btn-primary cursor-pointer inline-flex items-center gap-2"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 8h20M4 8V6a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8M10 12h4"/></svg>
                  Depuis la banque
                </button>
                <button
                  onClick={pickFromPC}
                  className="sf-btn sf-btn-secondary cursor-pointer inline-flex items-center gap-2"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01"/></svg>
                  Depuis le PC
                </button>
                {videoPath && (
                  <button
                    onClick={() => { setVideoPath(null); setPhase('idle') }}
                    className="sf-btn sf-btn-ghost cursor-pointer"
                    aria-label="Effacer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
              {videoPath && (
                <div className="rounded-xl px-4 py-3 text-[13px] font-mono truncate flex items-center gap-2 bg-surface2 border border-border text-text">
                  {phase === 'reading' && <Spinner size="sm" />}
                  {fileName(videoPath)}
                  {duration && (
                    <span className="ml-auto flex-shrink-0 text-text2">
                      {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Metadata table */}
            {(phase === 'ready' || phase === 'done') && (
              <div className="sf-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <div className="grid grid-cols-[140px_1fr_1fr] gap-2 text-[9px] uppercase tracking-wider font-black text-text2">
                    <span>Champ</span>
                    <span style={{ color: 'rgba(251,191,36,0.6)' }}>Avant</span>
                    <span className="text-ok/60">Après</span>
                  </div>
                </div>
                <div className="px-5 pb-3">
                  {allFields.length === 0 ? (
                    <p className="py-4 text-xs text-center text-text2">
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
                    <div className="mt-3 pt-3 text-xs space-y-1.5 border-t border-border text-text2">
                      <p className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-ok flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                        Tous les champs ci-dessus seront <strong className="text-text">supprimés</strong>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-ok flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                        Nouveau <code>creation_time</code> aléatoire sera ajouté
                      </p>
                      <p className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-ok flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                        Vidéo copiée sans ré-encodage (qualité identique, rapide)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {phase === 'error' && error && (
              <div className="sf-card p-5 space-y-3 border-danger/25 bg-danger/5">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p className="text-sm font-bold text-danger">{error}</p>
                </div>
                {command && (
                  <>
                    <button
                      onClick={() => setShowCmd(v => !v)}
                      className="text-[10px] text-accent hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {showCmd ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                      </svg>
                      Commande FFmpeg
                    </button>
                    {showCmd && <p className="text-[9px] font-mono break-all text-text2">{command}</p>}
                  </>
                )}
                <Button variant="secondary" onClick={() => { setPhase('ready'); setError(null) }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mr-1.5">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
                  </svg>
                  Réessayer
                </Button>
              </div>
            )}

            {/* Processing */}
            {phase === 'processing' && (
              <div className="sf-card p-10 text-center space-y-4">
                <div className="relative mx-auto w-16 h-16">
                  <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }} />
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
                    <Spinner size="lg" />
                  </div>
                </div>
                <p className="text-sm font-bold text-text">Réécriture des métadonnées…</p>
                <p className="text-xs text-text2">Copie en cours, qualité inchangée</p>
              </div>
            )}

            {/* Action buttons */}
            {phase === 'ready' && videoPath && (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={process}
                  className="sf-card sf-card-lift p-5 flex flex-col items-center gap-3 text-[13px] font-semibold text-text hover:border-border transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface2 group-hover:bg-accent/10 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-text2 group-hover:text-accent transition-colors">
                      <path d="M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01"/>
                    </svg>
                  </div>
                  Sauver sur le PC
                </button>
                <button
                  onClick={processToBank}
                  className="sf-btn sf-btn-primary cursor-pointer flex flex-col items-center gap-3 p-5 h-auto rounded-xl"
                  style={{ background: 'linear-gradient(130deg,#7c3aed,#ec4899)' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 13v8m-4-4l4 4 4-4M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
                  </svg>
                  Traiter et exporter banque
                </button>
              </div>
            )}

            {/* Done */}
            {phase === 'done' && outputPath && (
              <div className="space-y-4">
                <div className="sf-card p-6 space-y-4 border-ok/20 bg-ok/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ok/10 border border-ok/20 sf-anim-scale-spring">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-black text-text">Métadonnées nettoyées !</p>
                      <p className="text-xs mt-0.5 text-ok">
                        {allFields.filter(f => beforeMeta[f]).length} champ(s) supprimé(s) · nouveau timestamp injecté
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg px-3 py-2 text-[10px] font-mono break-all bg-surface2 text-text2">
                    {outputPath}
                  </div>
                  {command && (
                    <>
                      <button
                        onClick={() => setShowCmd(v => !v)}
                        className="text-[10px] text-accent hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          {showCmd ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                        </svg>
                        Commande FFmpeg
                      </button>
                      {showCmd && <p className="text-[9px] font-mono break-all mt-1 text-text2">{command}</p>}
                    </>
                  )}
                </div>

                {/* Bank export */}
                {!uploadDone ? (
                  <div className="sf-card p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 13v8m-4-4l4 4 4-4M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/>
                      </svg>
                      <p className="text-[14px] font-bold text-text">Ajouter à la banque</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => uploadToBank(false)}
                        disabled={uploading}
                        className="sf-btn sf-btn-primary cursor-pointer flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {uploading ? <><Spinner size="sm" /> Upload…</> : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 13v8m-4-4l4 4 4-4M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>
                            Ajouter à la banque
                          </>
                        )}
                      </button>
                      {bankItemId && (
                        <button
                          onClick={() => uploadToBank(true)}
                          disabled={uploading}
                          className="sf-btn sf-btn-danger cursor-pointer flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {uploading ? <><Spinner size="sm" /> Upload…</> : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                              Remplacer dans la banque
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="sf-card p-4 flex items-center justify-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <p className="text-[13px] font-semibold text-ok">Ajouté à la banque !</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => {
                    setPhase('idle'); setVideoPath(null); setBeforeMeta({}); setAfterMeta({})
                    setOutputPath(null); setError(null); setBankItemId(null); setUploadDone(false)
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mr-1.5">
                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
                    </svg>
                    Nouvelle vidéo
                  </Button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {phase === 'idle' && (
              <div className="sf-empty flex-col gap-4 py-16">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center sf-anim-scale-spring" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-text mb-2">Sélectionne une vidéo</p>
                  <p className="text-[13px] text-text2 max-w-sm">
                    L’outil lira ses métadonnées actuelles, les supprimera toutes et injectera un nouveau timestamp aléatoire — sans ré-encoder, en une seconde.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
