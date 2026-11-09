// Type d'un média de la Banque, déduit de son extension. SOURCE UNIQUE : avant, chaque page
// avait sa liste d'extensions image et considérait « tout le reste = vidéo » → un son (.mp3)
// importé dans la Banque aurait été proposé comme vidéo au posting Reels. Ici un fichier
// inconnu n'est JAMAIS une vidéo par défaut sauf s'il n'a pas d'extension lisible (anciens
// médias sans extension = vidéos, comme avant).
export type MediaKind = 'video' | 'image' | 'audio'

export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp', 'gif']
export const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba']
export const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp']

export const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm',
}

/** Extension (minuscule, sans « ? » ni chemin) d'un chemin, d'une URL ou d'un nom de fichier. */
export function extOfPath(p: string | null | undefined): string {
  const base = (p ?? '').split('?')[0].split('#')[0].split('/').pop() ?? ''
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(i + 1).toLowerCase() : ''
}

export function kindOfExt(ext: string): MediaKind {
  const e = ext.toLowerCase()
  if (IMAGE_EXT.includes(e)) return 'image'
  if (AUDIO_EXT.includes(e)) return 'audio'
  return 'video'
}

/** Type d'une ligne content_bank (storage_path, sinon file_url). */
export function mediaKindOf(m: { storage_path?: string | null; file_url?: string | null }): MediaKind {
  return kindOfExt(extOfPath(m.storage_path ?? m.file_url ?? ''))
}

/** Type d'un fichier choisi sur le PC (type MIME d'abord, extension ensuite). */
export function kindOfFile(f: { name: string; type?: string }): MediaKind | null {
  const t = f.type ?? ''
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('audio/')) return 'audio'
  if (t.startsWith('video/')) return 'video'
  const e = extOfPath(f.name)
  if (IMAGE_EXT.includes(e)) return 'image'
  if (AUDIO_EXT.includes(e)) return 'audio'
  if (VIDEO_EXT.includes(e)) return 'video'
  return null
}

export const isVideoRow = (m: { storage_path?: string | null; file_url?: string | null }) => mediaKindOf(m) === 'video'
export const isImageRow = (m: { storage_path?: string | null; file_url?: string | null }) => mediaKindOf(m) === 'image'
export const isAudioRow = (m: { storage_path?: string | null; file_url?: string | null }) => mediaKindOf(m) === 'audio'

// Favoris : un média (ou la ligne sentinelle d'un dossier) porte le tag « fav ». Partagé par
// toute l'organisation (c'est une colonne de la base, pas une préférence de ce PC).
export const FAV_TAG = 'fav'
export const isFav = (m: { tags?: string[] | null }) => (m.tags ?? []).includes(FAV_TAG)
export const withFav = (tags: string[] | null | undefined, on: boolean): string[] => {
  const t = (tags ?? []).filter(x => x !== FAV_TAG)
  return on ? [...t, FAV_TAG] : t
}
