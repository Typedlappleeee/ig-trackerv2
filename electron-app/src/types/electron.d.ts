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

interface ElectronAPI {
  platform: string
  geelarkRequest:    (opts: GeelarkRequestOptions) => Promise<GeelarkRequestResult>
  pickVideoFile:     () => Promise<string | null>
  pickOutputFile:    (opts: { defaultName: string }) => Promise<string | null>
  uploadVideoGeelark:(opts: { bearer: string; filePath: string }) => Promise<{ ok: boolean; token?: string; error?: string }>
  fetchImage:        (opts: { url: string; headers?: Record<string, string> }) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>
  runFfmpeg:         (opts: { clips: FfmpegClip[]; outputPath: string; preset: '9:16'|'1:1'|'16:9'; transition: 'cut'|'fade' }) => Promise<{ ok: boolean; outputPath?: string; command?: string; error?: string }>
  groqRequest:       (opts: GroqRequestOptions) => Promise<{ ok: boolean; data?: unknown; error?: string }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
