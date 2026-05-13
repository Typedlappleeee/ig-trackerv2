import { supabase, type ContentItem } from './supabase'

const BUCKET = 'content'
const SIGNED_URL_TTL = 3600  // 1h

export interface UploadScope {
  mode: 'user' | 'org'
  id:   string                 // user_id or org_id
}

export interface UploadResult {
  storagePath:   string
  thumbnailPath: string | null
}

function extOf(filePath: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(filePath)
  return m ? m[1].toLowerCase() : 'mp4'
}

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'mp4':  return 'video/mp4'
    case 'mov':  return 'video/quicktime'
    case 'webm': return 'video/webm'
    case 'mkv':  return 'video/x-matroska'
    case 'avi':  return 'video/x-msvideo'
    default:     return 'application/octet-stream'
  }
}

function scopeFolder(scope: UploadScope): string {
  return scope.mode === 'user' ? `users/${scope.id}` : `orgs/${scope.id}`
}

// Generate a thumbnail JPEG from a video Blob using a hidden <video> + canvas.
// Returns null if extraction fails (e.g. unsupported codec) or times out.
// Hard timeout = 8s so a hung decoder doesn't block the upload pipeline forever.
export async function generateThumbnail(videoBlob: Blob, atSeconds = 0.5): Promise<Blob | null> {
  return new Promise(resolve => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    // 'auto' is needed: 'metadata' is too lazy and seek often never resolves
    // for short videos. We compensate elsewhere (sequential uploads + timeout).
    v.preload = 'auto'
    const url = URL.createObjectURL(videoBlob)
    v.src = url

    let done = false
    const cleanup = () => {
      try { v.removeAttribute('src'); v.load() } catch { /* noop */ }
      URL.revokeObjectURL(url)
    }
    const finish = (out: Blob | null) => {
      if (done) return
      done = true
      clearTimeout(timeoutId)
      cleanup()
      resolve(out)
    }
    const timeoutId = setTimeout(() => finish(null), 8000)

    v.onloadedmetadata = () => { v.currentTime = Math.min(atSeconds, Math.max(0, (v.duration || 1) - 0.1)) }
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas')
        const w = v.videoWidth || 720
        const h = v.videoHeight || 1280
        // Smaller target = less RAM and faster encode
        const maxSide = 480
        const ratio = Math.min(1, maxSide / Math.max(w, h))
        c.width  = Math.round(w * ratio)
        c.height = Math.round(h * ratio)
        const ctx = c.getContext('2d')
        if (!ctx) return finish(null)
        ctx.drawImage(v, 0, 0, c.width, c.height)
        c.toBlob(b => finish(b), 'image/jpeg', 0.78)
      } catch {
        finish(null)
      }
    }
    v.onerror = () => finish(null)
  })
}

type UploadPhase = 'reading' | 'uploading-video' | 'thumbnail' | 'uploading-thumb'

// Core upload: takes a Blob/File already in memory + a name (for ext detection).
// Skips the Electron IPC roundtrip — used when we have the File object directly
// (drag-drop). This is significantly faster for large files (no extra copies).
export async function uploadVideoFromBlob(
  blob: Blob,
  name: string,
  scope: UploadScope,
  onProgress?: (phase: UploadPhase) => void,
): Promise<UploadResult> {
  const ext  = extOf(name)
  const mime = blob.type || mimeFor(ext)
  const id   = crypto.randomUUID()
  const folder = scopeFolder(scope)
  const storagePath = `videos/${folder}/${id}.${ext}`

  // Generate thumbnail FIRST while the blob is still fresh in renderer memory.
  // (Some decoders behave poorly on a blob that's been consumed by an upload stream.)
  onProgress?.('thumbnail')
  const thumb = await generateThumbnail(blob).catch(err => {
    console.warn('[storage] thumbnail generation failed:', err)
    return null
  })

  onProgress?.('uploading-video')
  const upRes = await supabase.storage.from(BUCKET).upload(storagePath, blob, {
    contentType: mime, upsert: false,
  })
  if (upRes.error) throw new Error('Upload vidéo : ' + upRes.error.message)

  let thumbnailPath: string | null = null
  if (thumb) {
    const tPath = `thumbs/${folder}/${id}.jpg`
    onProgress?.('uploading-thumb')
    const tRes = await supabase.storage.from(BUCKET).upload(tPath, thumb, {
      contentType: 'image/jpeg', upsert: false,
    })
    if (tRes.error) console.warn('[storage] thumbnail upload failed:', tRes.error.message)
    else thumbnailPath = tPath
  } else {
    console.warn('[storage] no thumbnail generated for', name)
  }

  return { storagePath, thumbnailPath }
}

// Upload a local video by absolute path (for the file picker / re-upload flows).
// Reads the bytes via Electron IPC, then delegates to uploadVideoFromBlob.
export async function uploadVideoFromPath(
  filePath: string,
  scope: UploadScope,
  onProgress?: (phase: UploadPhase) => void,
): Promise<UploadResult> {
  if (!window.electronAPI?.readFileBytes) throw new Error('IPC indisponible')

  onProgress?.('reading')
  const r = await window.electronAPI.readFileBytes(filePath)
  if (!r.ok || !r.bytes) throw new Error(r.error || 'Lecture du fichier échouée')

  const blob = new Blob([r.bytes], { type: mimeFor(extOf(filePath)) })
  return uploadVideoFromBlob(blob, filePath, scope, onProgress)
}

// Generate a short-lived signed URL for a Storage path. Returns null on failure.
export async function getSignedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data) {
    console.warn('[storage] getSignedUrl failed for', path, error?.message)
    return null
  }
  return data.signedUrl
}

// Cache to avoid re-downloading the same cloud video twice within a session
const tempPathCache = new Map<string, string>()

// Download a Storage path to a local temp file. Returns the local absolute path.
export async function downloadToTemp(path: string): Promise<string> {
  const cached = tempPathCache.get(path)
  if (cached) return cached
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error('Téléchargement : ' + (error?.message ?? 'inconnu'))
  const bytes = await data.arrayBuffer()
  if (!window.electronAPI?.writeTempFile) throw new Error('IPC indisponible')
  const name = path.split('/').pop() ?? 'video.mp4'
  const r = await window.electronAPI.writeTempFile({ name, bytes })
  if (!r.ok || !r.path) throw new Error(r.error || 'Écriture temp échouée')
  tempPathCache.set(path, r.path)
  return r.path
}

// Resolve a content_bank item to a playable URL.
// On web: returns a signed Supabase URL directly (avoids full download).
// On Electron: downloads to a local temp file and returns the path.
export async function resolveContentToLocalPath(item: Pick<ContentItem, 'storage_path' | 'file_url'>): Promise<string> {
  if (item.storage_path) {
    if ((window as any).__IS_WEB) {
      const url = await getSignedUrl(item.storage_path)
      if (!url) throw new Error('URL signée indisponible')
      return url
    }
    return downloadToTemp(item.storage_path)
  }
  if (item.file_url) return item.file_url
  throw new Error('Aucune source vidéo disponible')
}

// Delete a Storage object (best-effort; errors are ignored beyond logging).
export async function deleteStorageObjects(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p)
  if (list.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove(list)
  if (error) console.warn('[storage] delete failed:', error.message)
}
