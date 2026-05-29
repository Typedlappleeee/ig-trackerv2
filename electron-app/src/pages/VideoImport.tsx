import { useState, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabase'
import { uploadVideoFromBlob, type UploadScope } from '@/lib/storage'
import { useOrg } from '@/lib/orgContext'
import { pushNotification } from '@/lib/notificationStore'

interface ImportedVideo { title: string; thumbnailUrl: string | null }

// cobalt.tools — open-source social media downloader with a public API
const COBALT_API = 'https://api.cobalt.tools/'

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
    setStatus('🔗 Analyse du lien…')

    try {
      // 1. Ask cobalt for a download URL
      const cobaltRes = await fetch(COBALT_API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({ url: trimmed }),
      })
      if (!cobaltRes.ok) throw new Error(`Service indisponible (HTTP ${cobaltRes.status})`)

      const cobalt = await cobaltRes.json()

      if (cobalt.status === 'error') {
        const code = cobalt.error?.code ?? cobalt.text ?? 'lien invalide'
        throw new Error(`Impossible de télécharger : ${code}`)
      }

      // Handles tunnel / redirect / picker responses
      const downloadUrl: string | null =
        cobalt.url ??
        cobalt.picker?.find((p: any) => p.type === 'video')?.url ??
        cobalt.picker?.[0]?.url ??
        null

      if (!downloadUrl) throw new Error('Aucun lien de téléchargement trouvé')

      // 2. Fetch the actual video
      setStatus('⬇️ Téléchargement de la vidéo…')
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
          if (phase === 'thumbnail')       setStatus('🖼 Génération miniature…')
          if (phase === 'uploading-video') setStatus('☁️ Upload vidéo…')
          if (phase === 'uploading-thumb') setStatus('☁️ Upload miniature…')
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
      pushNotification({ title: 'Vidéo importée ✅', body: `"${title}" ajoutée à la banque.`, level: 'ok' })

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 680, margin: '0 auto' }} className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text">Importer depuis les réseaux</h1>
        <p className="text-sm text-text2 mt-1">
          Colle un lien Instagram ou TikTok — la vidéo est téléchargée et ajoutée directement à ta banque.
        </p>
      </div>

      {/* URL input */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
          placeholder="https://www.instagram.com/reel/…  ou  https://www.tiktok.com/@…"
          disabled={loading}
          className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:border-accent focus:outline-none placeholder:opacity-30"
        />
        <Button onClick={handleImport} disabled={!url.trim() || loading} style={{ minWidth: 100 }}>
          {loading ? <Spinner size="sm" /> : 'Importer'}
        </Button>
      </div>

      {/* Status */}
      {status && (
        <p className="text-sm text-text2 animate-pulse">{status}</p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>
          ❌ {error}
        </div>
      )}

      {/* Recent imports */}
      {imported.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-text2">Importées cette session</p>
          <div className="space-y-2">
            {imported.map((v, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl p-3"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                {v.thumbnailUrl
                  ? <img src={v.thumbnailUrl} className="w-14 h-10 rounded-lg object-cover flex-shrink-0" />
                  : <div className="w-14 h-10 rounded-lg flex-shrink-0" style={{ background: 'rgba(139,92,246,0.12)' }} />
                }
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{v.title}</p>
                  <p className="text-xs text-text2">✅ Ajoutée à la banque</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="rounded-xl p-4 space-y-1.5 text-xs"
        style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)', color: 'rgba(148,163,184,0.6)' }}>
        <p className="font-semibold" style={{ color: 'rgba(148,163,184,0.85)' }}>Plateformes supportées</p>
        <p>📸 Instagram — Reels, posts, stories (publics)</p>
        <p>🎵 TikTok — vidéos publiques</p>
        <p className="pt-1" style={{ color: 'rgba(148,163,184,0.35)' }}>
          Fonctionne uniquement sur les contenus publics. Utilise cette fonctionnalité dans le respect des CGU des plateformes.
        </p>
      </div>

    </div>
  )
}
