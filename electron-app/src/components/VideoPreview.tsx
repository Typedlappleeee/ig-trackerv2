import { useState, useEffect, useRef } from 'react'
import { Spinner } from './ui/Spinner'

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

/**
 * Converts a local filesystem path to a safe `localfile://` URL.
 * The custom protocol is registered in electron/main.ts and proxies to file://.
 * Using a custom scheme avoids CSP issues when the renderer loads from http://localhost
 * in dev mode, and properly URL-encodes spaces/special characters.
 */
export function localFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  // Ensure path starts with / so we get localfile:///C:/... on Windows
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  // encodeURI leaves slashes and colons intact but encodes spaces → %20
  return `localfile://${encodeURI(withSlash)}`
}

interface VideoPreviewProps {
  filePath: string | null
  className?: string
}

export function VideoPreview({ filePath, className = 'w-full h-full' }: VideoPreviewProps) {
  const [ready, setReady]   = useState(false)
  const [failed, setFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    setReady(false)
    setFailed(false)
  }, [filePath])

  if (!filePath) {
    return (
      <div className={`flex items-center justify-center text-4xl bg-surface2 ${className}`}>🎬</div>
    )
  }

  const src = localFileUrl(filePath)

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
          if (videoRef.current) videoRef.current.currentTime = 1
        }}
        onSeeked={() => setReady(true)}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
