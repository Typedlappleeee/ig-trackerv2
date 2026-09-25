// Noms de containers Crane définis par l'utilisateur POUR CHAQUE iPhone iRemoTech.
// Persistés en localStorage, partagés entre Phone Farm et le Pilote Auto.
export function loadDevContainers(deviceId: string): string[] {
  try { const raw = localStorage.getItem(`sf-irt-containers:${deviceId}`); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : [] }
  catch { return [] }
}
export function saveDevContainers(deviceId: string, list: string[]): void {
  try { localStorage.setItem(`sf-irt-containers:${deviceId}`, JSON.stringify(list)) } catch { /* noop */ }
}
export function addDevContainer(deviceId: string, name: string): string[] {
  const clean = name.trim()
  if (!clean) return loadDevContainers(deviceId)
  const list = [...new Set([...loadDevContainers(deviceId), clean])]
  saveDevContainers(deviceId, list)
  return list
}
export function removeDevContainer(deviceId: string, name: string): string[] {
  const list = loadDevContainers(deviceId).filter(c => c !== name)
  saveDevContainers(deviceId, list)
  return list
}

// Lien CTA de la story, PAR container (mémorisé, comme les liens par compte GeeLark).
export function loadStoryLink(deviceId: string, container: string): string {
  try { return localStorage.getItem(`sf-irt-storylink:${deviceId}:${container}`) ?? '' } catch { return '' }
}
export function saveStoryLink(deviceId: string, container: string, url: string): void {
  try { if (url.trim()) localStorage.setItem(`sf-irt-storylink:${deviceId}:${container}`, url.trim()); else localStorage.removeItem(`sf-irt-storylink:${deviceId}:${container}`) } catch { /* noop */ }
}
