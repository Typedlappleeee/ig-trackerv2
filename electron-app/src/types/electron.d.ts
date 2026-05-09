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

interface ElectronAPI {
  platform: string
  geelarkRequest:    (opts: GeelarkRequestOptions) => Promise<GeelarkRequestResult>
  pickVideoFile:     () => Promise<string | null>
  uploadVideoGeelark:(opts: { bearer: string; filePath: string }) => Promise<{ ok: boolean; token?: string; error?: string }>
  groqRequest:       (opts: GroqRequestOptions) => Promise<{ ok: boolean; data?: unknown; error?: string }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
