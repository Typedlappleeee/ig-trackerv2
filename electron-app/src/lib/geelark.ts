const BASE = 'https://openapi.geelark.com/open/v1'

// Raw phone shape returned by GéeLark API
export interface GeelarkPhone {
  id:          string
  serialNo?:   string | null
  serialName?: string | null  // display name in GéeLark UI
  name?:       string | null
  group?:      { name?: string } | null
  groupName?:  string | null
  status:      number  // 0=stopped/offline, 1=running/online
  remark?:     string | null
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

// Fetch all phones (paginates automatically).
// Throws a descriptive error if the API rejects the token.
export async function fetchAllPhones(bearer: string): Promise<GeelarkPhone[]> {
  const items: GeelarkPhone[] = []
  let page = 1
  while (true) {
    const d = await geelarkFetch('POST', '/phone/list', { page, pageSize: 50 }, bearer)
    if (d['code'] !== 0) {
      const msg = d['msg'] ?? d['message'] ?? `code ${d['code']}`
      throw new Error(`GéeLark API: ${msg}`)
    }
    const batch = ((d['data'] as Record<string, unknown>)?.['items'] ?? []) as GeelarkPhone[]
    const total = ((d['data'] as Record<string, unknown>)?.['total'] ?? 0) as number
    items.push(...batch)
    if (items.length >= total || batch.length === 0) break
    page++
  }
  return items
}

// GéeLark: 0 = stopped, anything else (1=running, 2=starting, 3=stopping…) = online
export function geelarkStatusLabel(status: number): string {
  return status !== 0 ? 'online' : 'offline'
}

// Lightweight: fetch only the status of all phones (same endpoint, minimal processing)
export async function fetchPhoneStatuses(bearer: string): Promise<Map<string, string>> {
  const phones = await fetchAllPhones(bearer)
  return new Map(phones.map(p => [p.id, geelarkStatusLabel(p.status)]))
}
