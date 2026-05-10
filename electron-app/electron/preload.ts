import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Proxy HTTP (bypass renderer CORS) — GéeLark + Instagram
  geelarkRequest: (opts: {
    method: 'GET' | 'POST' | 'PUT'
    url: string
    headers?: Record<string, string>
    body?: unknown
    isText?: boolean
  }) => ipcRenderer.invoke('geelark-request', opts),

  // Open native video file picker → returns file path or null
  pickVideoFile: () => ipcRenderer.invoke('pick-video-file'),

  // Upload a local video file to GéeLark and return its token
  uploadVideoGeelark: (opts: { bearer: string; filePath: string }) =>
    ipcRenderer.invoke('upload-video-geelark', opts),

  // Fetch an image as base64 data URL (proxy to bypass CORS/hotlink protection)
  fetchImage: (opts: { url: string; headers?: Record<string, string> }) =>
    ipcRenderer.invoke('fetch-image', opts),

  // Run FFmpeg to export montage
  runFfmpeg: (opts: {
    clips:      Array<{ filePath: string; trimStart: number; trimEnd: number }>
    outputPath: string
    preset:     '9:16' | '1:1' | '16:9'
    transition: 'cut' | 'fade'
  }) => ipcRenderer.invoke('run-ffmpeg', opts),

  // Open native save-file dialog
  pickOutputFile: (opts: { defaultName: string }) =>
    ipcRenderer.invoke('pick-output-file', opts),

  // Fetch Instagram profile page via hidden browser (most reliable, bypasses API blocks)
  fetchInstagramHtml: (username: string) => ipcRenderer.invoke('fetch-instagram-html', username),

  // Fetch Instagram data using a session ID (private API — no rate limit)
  fetchInstagramBySession: (opts: { username: string; sessionid: string }) =>
    ipcRenderer.invoke('fetch-instagram-by-session', opts),

  // Read a local video file as a data URL (fallback when localvideo:// fails)
  readLocalVideo: (filePath: string) => ipcRenderer.invoke('read-local-video', filePath),

  // Read full file bytes (used to upload to Supabase Storage)
  readFileBytes: (filePath: string) => ipcRenderer.invoke('read-file-bytes', filePath),

  // Download an Instagram video CDN URL to temp dir with proper Referer headers
  fetchIgVideo: (opts: { url: string }) => ipcRenderer.invoke('fetch-ig-video', opts),

  // Materialise bytes (e.g. a downloaded cloud video) to a temp file, return its path
  writeTempFile: (opts: { name: string; bytes: ArrayBuffer }) =>
    ipcRenderer.invoke('write-temp-file', opts),

  // Fetch Instagram comments for a media post
  fetchIgComments: (opts: { mediaId: string; sessionid: string; maxId?: string }) =>
    ipcRenderer.invoke('fetch-ig-comments', opts),

  // Post a comment reply on an Instagram media
  postIgComment: (opts: { mediaId: string; text: string; sessionid: string }) =>
    ipcRenderer.invoke('post-ig-comment', opts),

  // Groq AI API call (returns chat completion)
  groqRequest: (opts: {
    apiKey: string
    messages: Array<{ role: string; content: string }>
    model?: string
    maxTokens?: number
  }) => ipcRenderer.invoke('groq-request', opts),
})
