interface GeelarkRequestOptions {
  method: 'GET' | 'POST' | 'PUT'
  url: string
  headers?: Record<string, string>
  body?: unknown
  isText?: boolean
}

interface GeelarkRequestResult {
  ok: boolean
  status?: number
  data?: unknown
  error?: string
}

interface GroqRequestOptions {
  apiKey: string
  messages: Array<{ role: string; content: string }>
  model?: string
  maxTokens?: number
}

interface FfmpegClip { filePath: string; trimStart: number; trimEnd: number }

interface AiTextOverlay {
  text:      string
  x:         string
  y:         string
  fontSize:  number
  fontColor: string
  startTime: number
  endTime:   number
  bold?:     boolean
  shadow?:   boolean
}

interface ElectronAPI {
  platform: string
  geelarkRequest:    (opts: GeelarkRequestOptions) => Promise<GeelarkRequestResult>
  pickVideoFile:     () => Promise<string | null>
  pickOutputFile:    (opts: { defaultName: string }) => Promise<string | null>
  pickOutputFolder:  () => Promise<string | null>
  uploadVideoGeelark:(opts: { bearer: string; filePath: string }) => Promise<{ ok: boolean; token?: string; error?: string }>
  fetchImage:        (opts: { url: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>
  fetchInstagramHtml:(username: string) => Promise<{ ok: boolean; url?: string; html?: string; apiJson?: unknown; error?: string }>
  fetchInstagramBySession: (opts: { username: string; sessionid: string }) => Promise<{
    ok: boolean
    username?: string
    followers?: number
    following?: number
    posts?: number
    bio?: string
    total_views?: number
    videos?: Array<{ id: string; shortcode: string; views: number; likes: number; comments: number; thumbnail: string; video_url: string; timestamp: string }>
    error?: string
  }>
  fetchIgVideo:      (opts: { url: string }) => Promise<{ ok: boolean; path?: string; size?: number; error?: string }>
  runFfmpeg:         (opts: { clips: FfmpegClip[]; outputPath: string; preset: '9:16'|'1:1'|'16:9'; transition: 'cut'|'fade' }) => Promise<{ ok: boolean; outputPath?: string; command?: string; error?: string }>
  readLocalVideo:    (filePath: string) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>
  readFileBytes:     (filePath: string) => Promise<{ ok: boolean; bytes?: ArrayBuffer; size?: number; error?: string }>
  writeTempFile:     (opts: { name: string; bytes: ArrayBuffer }) => Promise<{ ok: boolean; path?: string; error?: string }>
  fetchIgComments:   (opts: { mediaId: string; sessionid: string; maxId?: string }) => Promise<{ ok: boolean; comments?: Array<{ pk: string; text: string; username: string; timestamp: string; likeCount: number }>; hasMore?: boolean; error?: string }>
  postIgComment:     (opts: { mediaId: string; text: string; sessionid: string }) => Promise<{ ok: boolean; error?: string; sessionExpired?: boolean }>
  groqRequest:       (opts: GroqRequestOptions) => Promise<{ ok: boolean; data?: unknown; error?: string }>
  runFfmpegRemix:    (opts: {
    originalPath:  string
    newPhase1Path: string
    splitTime:     number
    outputPath:    string
    textBlend:     number
    blendMode:     'screen' | 'multiply'
    preset:        '9:16' | '1:1' | '16:9'
  }) => Promise<{ ok: boolean; outputPath?: string; error?: string; command?: string }>
  detectSceneChange: (opts: { filePath: string; threshold?: number }) =>
    Promise<{ ok: boolean; times: number[]; splitTime?: number; duration: number; error?: string }>
  extractFrames: (opts: { filePath: string; endTime: number; fps?: number }) =>
    Promise<{ ok: boolean; frames?: Array<{ index: number; timestamp: number; data: string }>; count?: number; error?: string }>
  anthropicVisionRequest: (opts: {
    apiKey: string; model?: string; messages: unknown[]; maxTokens?: number
  }) => Promise<{ ok: boolean; data?: unknown; error?: string }>
  runFfmpegRemixAI: (opts: {
    newPhase1Path: string; originalPath: string; splitTime: number
    outputPath: string; preset: '9:16' | '1:1' | '16:9'
    textOverlays: AiTextOverlay[]
  }) => Promise<{ ok: boolean; outputPath?: string; error?: string; command?: string }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
