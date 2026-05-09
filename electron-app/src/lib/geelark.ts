const BASE = 'https://openapi.geelark.com/open/v1'

// Raw phone shape returned by GéeLark API
export interface GeelarkPhone {
  id:         string
  serialNo:   string
  name:       string
  groupName?: string
  status:     number  // 0=offline, 1=online, 2=error
  remark?:    string
}

function authHeaders(bearer: string) {
  return { Authorization: `Bearer ${bearer}` }
}

// Call GéeLark through the Electron main-process proxy to bypass CORS.
async function geelarkFetch(method: 'GET' | 'POST', path: string, body?: unknown, bearer?: string) {
  if (!window.electronAPI?.geelarkRequest) {
    throw new Error('electronAPI not available')
  }
  const result = await window.electronAPI.geelarkRequest({
    method,
    url: `${BASE}${path}`,
    headers: bearer ? authHeaders(bearer) : undefined,
    body,
  })
  if (!result.ok) throw new Error(result.error ?? 'Network error')
  return result.data as Record<string, unknown>
}

// Fetch all phones (paginates automatically)
export async function fetchAllPhones(bearer: string): Promise<GeelarkPhone[]> {
  const items: GeelarkPhone[] = []
  let page = 1
  while (true) {
    const d = await geelarkFetch('POST', '/phone/list', { page, pageSize: 50 }, bearer)
    if (d['code'] !== 0) break
    const batch = ((d['data'] as Record<string, unknown>)?.['items'] ?? []) as GeelarkPhone[]
    const total = ((d['data'] as Record<string, unknown>)?.['total'] ?? 0) as number
    items.push(...batch)
    if (items.length >= total || batch.length === 0) break
    page++
  }
  return items
}

export function geelarkStatusLabel(status: number): string {
  return status === 1 ? 'online' : status === 2 ? 'error' : 'offline'
}
