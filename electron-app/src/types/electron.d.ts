// Type declarations for the Electron contextBridge API exposed in preload.ts

interface GeelarkRequestOptions {
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  body?: unknown
}

interface GeelarkRequestResult {
  ok: boolean
  status?: number
  data?: unknown
  error?: string
}

interface ElectronAPI {
  platform: string
  geelarkRequest: (opts: GeelarkRequestOptions) => Promise<GeelarkRequestResult>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
