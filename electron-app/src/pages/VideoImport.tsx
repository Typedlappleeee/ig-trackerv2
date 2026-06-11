import { useState, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'
import { uploadVideoFromBlob, type UploadScope } from '@/lib/storage'
import { useOrg } from '@/lib/orgContext'
import { pushNotification } from '@/lib/notificationStore'

interface ImportedVideo { title: string; thumbnailUrl: string | null }

// Routed through /api/cobalt to avoid CORS restrictions in the browser
const COBALT_API = '/api/cobalt'

function extractTitle(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const host  = u.hostname.replace('www.', '').split('.')[0]
    const code  = parts[parts.length - 1] || parts[parts.length - 2] || 'import'
    return `${host}_${code}`.slice(0, 60)
  } catch {
    return 'video_import'
  }
}

export function VideoImport({ user }: { user: User }) {
  const { currentOrg } = useOrg()
  const [url, setUrl]         = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState('')
  const [error, setError]     = useState<string | null>(null)
  const [imported, setImported] = useState<ImportedVideo[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const scope: UploadScope = currentOrg
    ? { mode: 'org',  id: currentOrg.id }
    : { mode: 'user', id: user.id }

  async function handleImport() {
    const trimmed = url.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setError(null)
    setStatus('Analyse du lien…')

    try {
      // 1. Get download URL via our server-side proxy
      const cobaltRes = await fetch(COBALT_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({ url: trimmed }),
      })

      // Always try to parse JSON even on non-200 (proxy puts error details there)
      const cobalt = await cobaltRes.json().catch(() => null)
      if (!cobaltRes.ok || cobalt?.status === 'error') {
        const code = cobalt?.error?.code ?? cobalt?.error ?? `HTTP ${cobaltRes.status}`
        const msg =
          code === 'instagram_not_supported'   ? 'Instagram bloque les téléchargements depuis nos serveurs — essaie avec un lien TikTok, ou télécharge la vidéo manuellement puis importe-la'
          : code === 'instagram_video_not_found' ? 'Vidéo Instagram introuvable — le compte est peut-être privé'
          : code === 'tiktok_video_not_found'  ? 'Vidéo TikTok introuvable — vérifie que le lien est correct et que le compte est public'
          : code === 'unsupported_platform'    ? 'Plateforme non supportée (Instagram et TikTok uniquement)'
          : `Impossible de télécharger : ${code}`
        throw new Error(msg)
      }

      const downloadUrl: string | null =
        cobalt.url ??
        cobalt.picker?.find((p: any) => p.type === 'video')?.url ??
        cobalt.picker?.[0]?.url ??
        null

      if (!downloadUrl) throw new Error('Aucun lien de téléchargement trouvé')

      // 2. Fetch the actual video
      setStatus('Téléchargement de la vidéo…')
      const videoRes = await fetch(downloadUrl)
      if (!videoRes.ok) throw new Error(`Téléchargement échoué (HTTP ${videoRes.status})`)
      const videoBlob = await videoRes.blob()
      if (videoBlob.size < 5000) throw new Error('Fichier reçu trop petit — lien invalide ou expiré')

      // 3. Upload to Supabase Storage
      const title = extractTitle(trimmed)
      const { storagePath, thumbnailPath } = await uploadVideoFromBlob(
        videoBlob,
        title + '.mp4',
        scope,
        phase => {
          if (phase === 'thumbnail')       setStatus('Génération miniature…')
          if (phase === 'uploading-video') setStatus('Upload vidéo…')
          if (phase === 'uploading-thumb') setStatus('Upload miniature…')
        },
      )

      // 4. Create content_bank row
      const row = {
        user_id: user.id, org_id: currentOrg?.id ?? null, title,
        file_url: null, storage_path: storagePath, thumbnail_path: thumbnailPath,
        duration: null, tags: [], notes: '', folder: null,
      }
      const { error: dbErr } = await supabase.from('content_bank').insert(row)
      if (dbErr) throw new Error('Erreur base de données : ' + dbErr.message)

      // 5. Get signed URL for preview
      let thumbUrl: string | null = null
      if (thumbnailPath) {
        const { data } = await supabase.storage.from('content').createSignedUrl(thumbnailPath, 3600)
        thumbUrl = data?.signedUrl ?? null
      }

      setImported(prev => [{ title, thumbnailUrl: thumbUrl }, ...prev])
      setUrl('')
      setStatus('')
      pushNotification({ title: 'Vidéo importée', body: `"${title}" ajoutée à la banque.`, level: 'ok' })

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden anim-page">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-8 pt-7 pb-5 flex items-center gap-3 border-b border-border">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, rgba(201,181,132,0.25), rgba(243,241,236,0.15))', border: '1px solid rgba(201,181,132,0.25)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C9B584" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div>
          <h1 className="text-[20px] font-black text-text leading-none">Importer depuis les réseaux</h1>
          <p className="text-[13px] text-text2 mt-0.5">Colle un lien Instagram ou TikTok — la vidéo est téléchargée et ajoutée à ta banque.</p>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 pb-10">
        <div className="max-w-2xl mx-auto space-y-5 pt-6">

          {/* URL input card */}
          <div className="sf-card p-5 space-y-4">
            <p className="text-[13px] font-semibold text-text2 uppercase tracking-wider">Lien à importer</p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={e => { setUrl(e.target.value); setError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
                placeholder="https://www.instagram.com/reel/…  ou  https://www.tiktok.com/@…"
                disabled={loading}
                className="sf-input flex-1"
              />
              <button
                onClick={handleImport}
                disabled={!url.trim() || loading}
                className="sf-btn sf-btn-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                style={{ minWidth: 100 }}
              >
                {loading ? <Spinner size="sm" /> : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Importer
                  </>
                )}
              </button>
            </div>

            {/* Status */}
            {status && (
              <div className="flex items-center gap-2.5 py-1">
                <Spinner size="sm" />
                <p className="text-sm text-text2 animate-pulse">{status}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-3 flex items-start gap-3 bg-danger/5 border border-danger/20">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}
          </div>

          {/* Supported platforms info */}
          <div className="sf-card p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C9B584" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <p className="text-[12px] font-semibold text-text2 uppercase tracking-wider">Plateformes supportées</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  name: 'Instagram',
                  desc: 'Reels, posts, stories (publics)',
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                    </svg>
                  ),
                },
                {
                  name: 'TikTok',
                  desc: 'Vidéos publiques',
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>
                    </svg>
                  ),
                },
              ].map(p => (
                <div key={p.name} className="flex items-center gap-3 rounded-xl px-4 py-3 border border-accent/10 bg-accent/[0.03]">
                  <span className="text-accent">{p.icon}</span>
                  <div>
                    <p className="text-[13px] font-semibold text-text">{p.name}</p>
                    <p className="text-[11px] text-text3">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-text3 pt-1">
              Fonctionne uniquement sur les contenus publics. Utilise cette fonctionnalité dans le respect des CGU des plateformes.
            </p>
          </div>

          {/* Recent imports */}
          {imported.length > 0 && (
            <div className="sf-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-text2">Importées cette session</p>
                <span className="sf-badge sf-badge-ok">{imported.length}</span>
              </div>
              <div className="space-y-2">
                {imported.map((v, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl p-3 bg-ok/5 border border-ok/12">
                    {v.thumbnailUrl
                      ? <img src={v.thumbnailUrl} alt={v.title} className="w-14 h-10 rounded-lg object-cover flex-shrink-0" />
                      : (
                        <div className="w-14 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-accent/10">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9B584" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="2" y="2" width="20" height="20" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                          </svg>
                        </div>
                      )
                    }
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text truncate">{v.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <p className="text-xs text-ok">Ajoutée à la banque</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
