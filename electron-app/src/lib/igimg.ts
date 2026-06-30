// Affichage des images Instagram (pp, miniatures). Le CDN IG bloque les <img>
// directs depuis le navigateur → sur le web on passe par le proxy /api/img.
// En Electron, l'URL directe marche (pas de CORS).
const _isWeb = typeof window !== 'undefined' && !(window as unknown as { electronAPI?: unknown }).electronAPI

export function igImg(u?: string | null): string | undefined {
  if (!u) return undefined
  if (!_isWeb || !/^https?:\/\//i.test(u)) return u   // data: / electron → direct
  return `/api/img?url=${encodeURIComponent(u)}`
}

// Temps relatif court : "2 h", "3 j", "à l'instant".
export function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const d = Date.now() - new Date(iso).getTime()
  if (d < 0) return ''
  const m = Math.floor(d / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h`
  const j = Math.floor(h / 24)
  if (j < 30) return `${j} j`
  return `${Math.floor(j / 30)} mois`
}
