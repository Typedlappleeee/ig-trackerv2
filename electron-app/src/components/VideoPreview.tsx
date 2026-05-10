import { useState, useEffect, useRef } from 'react'
import { Spinner } from './ui/Spinner'

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

/**
 * Build a `localvideo://` URL that points at a local video file.
 * The protocol is registered in main.ts as a privileged streaming scheme — this
 * gives <video> elements proper byte-range support so they can seek and preview.
 *
 * Windows path:  C:/Users/My Videos/clip.mp4 → localvideo:///C:/Users/My%20Videos/clip.mp4
 * Unix path:     /home/user/clip.mp4         → localvideo:///home/user/clip.mp4
 */
export function localFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `localvideo://${encodeURI(withSlash)}`
}

interface VideoPreviewProps {
  filePath: string | null
  className?: string
}

export function VideoPreview({ filePath, className = 'w-full h-full' }: VideoPreviewProps) {
  const [ready, setReady]     = useState(false)
  const [failed, setFailed]   = useState(false)
  const [fallback, setFallback] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const triedFallback = useRef(false)

  useEffect(() => {
    setReady(false)
    setFailed(false)
    setFallback(null)
    triedFallback.current = false
  }, [filePath])

  if (!filePath) {
    return (
      <div className={`flex items-center justify-center text-4xl bg-surface2 ${className}`}>🎬</div>
    )
  }

  // Try IPC fallback (read file as base64 data URL) when the localvideo:// protocol fails.
  // This guarantees we get SOMETHING shown even if the protocol/webSecurity setup is broken.
  async function tryIpcFallback() {
    if (triedFallback.current || !filePath) return
    triedFallback.current = true
    if (!window.electronAPI?.readLocalVideo) {
      setFailed(true)
      return
    }
    const res = await window.electronAPI.readLocalVideo(filePath)
    if (res.ok && res.dataUrl) {
      setFallback(res.dataUrl)
      setFailed(false)
    } else {
      setFailed(true)
    }
  }

  const src = fallback ?? localFileUrl(filePath)

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-surface2 flex-col gap-1 ${className}`}>
        <span className="text-3xl">🎬</span>
        <span className="text-[10px] text-text2 px-2 text-center truncate max-w-full">{basename(filePath)}</span>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface2 z-10">
          <Spinner size="sm" />
        </div>
      )}
      <video
        ref={videoRef}
        src={src}
        className={`w-full h-full object-cover transition-opacity ${ready ? 'opacity-100' : 'opacity-0'}`}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={() => {
          if (videoRef.current) videoRef.current.currentTime = 0.5
        }}
        onSeeked={() => setReady(true)}
        onError={tryIpcFallback}
      />
    </div>
  )
}
