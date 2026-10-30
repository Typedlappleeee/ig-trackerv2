// Comptes Higgsfield connectés EN LOCAL (appli PC) : une session Chromium par compte, ouverte dans
// une vraie fenêtre Higgsfield (email, mot de passe, code 2FA tapés dedans). La liste des comptes
// est gardée sur ce PC ; les sessions aussi (electron/higgsfield.cjs). Rien ne passe par le serveur.
export interface HfLocalStatus { loggedIn: boolean; email?: string | null; name?: string | null; error?: string; recordFile?: string | null; recorded?: number }
interface HfBridge {
  login(id: string, opts?: { record?: boolean }): Promise<HfLocalStatus>
  status(id: string): Promise<HfLocalStatus>
  logout(id: string): Promise<boolean>
  fetch(id: string, url: string, init?: RequestInit): Promise<{ status: number; contentType: string; body: string }>
}
export const hfBridge = (): HfBridge | null =>
  typeof window !== 'undefined' ? ((window as unknown as { sfDesktop?: { hf?: HfBridge } }).sfDesktop?.hf ?? null) : null

export interface HfLocalAccount { id: string; name: string; email: string | null; loggedIn: boolean | null; checkedAt: number | null }
const KEY = 'sf-hf-local'
export function listLocal(): HfLocalAccount[] {
  try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l : [] } catch { return [] }
}
function saveLocal(l: HfLocalAccount[]): HfLocalAccount[] {
  try { localStorage.setItem(KEY, JSON.stringify(l)) } catch { /* bloqué */ }
  return l
}
const apply = (l: HfLocalAccount[], id: string, st: HfLocalStatus) => saveLocal(l.map(a => a.id === id
  ? { ...a, loggedIn: st.loggedIn, email: st.email ?? a.email, checkedAt: Date.now() } : a))

// Nouveau compte : la fenêtre Higgsfield s'ouvre ; il est gardé seulement s'il est bien connecté.
export async function addLocal(name: string): Promise<{ list: HfLocalAccount[]; status: HfLocalStatus }> {
  const b = hfBridge()
  if (!b) throw new Error('Disponible dans l’appli PC ScaleFlow seulement')
  const id = crypto.randomUUID().slice(0, 12)
  const status = await b.login(id)
  if (!status.loggedIn) { await b.logout(id).catch(() => undefined); return { list: listLocal(), status } }
  const list = saveLocal([...listLocal(), { id, name: name.trim() || status.email || 'Compte', email: status.email ?? null, loggedIn: true, checkedAt: Date.now() }])
  return { list, status }
}
export async function reconnectLocal(id: string, record = false): Promise<{ list: HfLocalAccount[]; status: HfLocalStatus }> {
  const b = hfBridge()
  if (!b) throw new Error('Disponible dans l’appli PC ScaleFlow seulement')
  const status = await b.login(id, { record })
  return { list: apply(listLocal(), id, status), status }
}
export async function checkLocal(id: string): Promise<HfLocalAccount[]> {
  const b = hfBridge()
  if (!b) return listLocal()
  try { return apply(listLocal(), id, await b.status(id)) } catch { return listLocal() }
}
export async function removeLocal(id: string): Promise<HfLocalAccount[]> {
  await hfBridge()?.logout(id).catch(() => undefined)
  return saveLocal(listLocal().filter(a => a.id !== id))
}
