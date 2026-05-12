import { useState, useEffect, useRef } from 'react'
import { Spinner } from './ui/Spinner'

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

interface VideoPreviewProps {
  filePath: string | null
  className?: string
}

export function VideoPreview({ filePath, className = 'w-full h-full' }: VideoPreviewProps) {
  const [src, setSrc]       = useState<string | null>(null)
  const [ready, setReady]   = useState(false)
  const [failed, setFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    setSrc(null)
    setReady(false)
    setFailed(false)

    if (!filePath) return

    // Directly use IPC to read the file as a base64 data URL.
    // This bypasses all protocol/CORS/webSecurity issues and works reliably.
    if (!window.electronAPI?.readLocalVideo) {
      setFailed(true)
      return
    }

    let cancelled = false
    window.electronAPI.readLocalVideo(filePath).then(res => {
      if (cancelled) return
      if (res.ok && res.dataUrl) {
        setSrc(res.dataUrl)
      } else {
        setFailed(true)
      }
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })

    return () => { cancelled = true }
  }, [filePath])

  if (!filePath) {
    return (
      <div className={`flex items-center justify-center text-4xl bg-surface2 ${className}`}>🎬</div>
    )
  }

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-surface2 flex-col gap-1 ${className}`}>
        <span className="text-3xl">🎬</span>
        <span className="text-[10px] text-text2 px-2 text-center truncate max-w-full">{basename(filePath)}</span>
      </div>
    )
  }

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-surface2 ${className}`}>
        <Spinner size="sm" />
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
        onError={() => setFailed(true)}
      />
    </div>
  )
}
