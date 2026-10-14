// Constructeurs PURS des filtres ffmpeg du Studio (testés dans studioFilters.test.ts) :
// Remix (vraies variations), Incrustation (position / taille / durée), Assemblage (concat),
// répartition des légendes. Aucun import : utilisable côté tests sans ffmpeg ni Supabase.

export type RemixIntensity = 'subtle' | 'normal' | 'strong'
export interface RemixToggles { color: boolean; speed: boolean; crop: boolean; mirror: boolean }
export interface RemixParams { zoom: number; brightness: number; contrast: number; saturation: number; gamma: number; hue: number; speed: number; trim: number; mirror: boolean }

const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
// Amplitudes par intensité (toutes restent discrètes : la vidéo garde son rendu).
const AMP: Record<RemixIntensity, { z: [number, number]; b: number; c: number; s: number; g: number; h: number; v: number; t: number }> = {
  subtle: { z: [1.01, 1.03], b: 0.025, c: 0.04, s: 0.07, g: 0.03, h: 3, v: 0.015, t: 0.15 },
  normal: { z: [1.02, 1.06], b: 0.05, c: 0.08, s: 0.15, g: 0.06, h: 6, v: 0.03, t: 0.3 },
  strong: { z: [1.04, 1.10], b: 0.08, c: 0.12, s: 0.25, g: 0.1, h: 10, v: 0.05, t: 0.5 },
}
// Pseudo-aléatoire déterministe dans [0,1) à partir d'une seed et d'un canal.
const rnd = (seed: number, k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }
const sym = (seed: number, k: number, a: number) => (rnd(seed, k) * 2 - 1) * a
const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Tire les variations d'une variante Remix (déterministe pour une seed donnée). */
export function remixParams(seed: number, intensity: RemixIntensity = 'normal', t: RemixToggles = { color: true, speed: true, crop: true, mirror: false }): RemixParams {
  const a = AMP[intensity]
  return {
    zoom: t.crop ? r3(a.z[0] + rnd(seed, 1) * (a.z[1] - a.z[0])) : 1,
    brightness: t.color ? r3(sym(seed, 2, a.b)) : 0,
    contrast: t.color ? r3(1 + sym(seed, 3, a.c)) : 1,
    saturation: t.color ? r3(1 + sym(seed, 4, a.s)) : 1,
    gamma: t.color ? r3(1 + sym(seed, 5, a.g)) : 1,
    hue: t.color ? Math.round(sym(seed, 6, a.h) * 10) / 10 : 0,
    speed: t.speed ? r3(1 + sym(seed, 7, a.v)) : 1,
    trim: t.speed ? Math.round(rnd(seed, 8) * a.t * 100) / 100 : 0,
    mirror: t.mirror,
  }
}

/** Chaîne vidéo (-vf) d'une variante Remix. */
export function remixFilter(p: RemixParams): string {
  const parts: string[] = []
  if (p.zoom > 1.0001) parts.push(`scale=iw*${p.zoom}:ih*${p.zoom}`, `crop=iw/${p.zoom}:ih/${p.zoom}`)
  if (p.brightness !== 0 || p.contrast !== 1 || p.saturation !== 1 || p.gamma !== 1) parts.push(`eq=brightness=${p.brightness}:contrast=${p.contrast}:saturation=${p.saturation}:gamma=${p.gamma}`)
  if (p.hue !== 0) parts.push(`hue=h=${p.hue}`)
  if (p.mirror) parts.push('hflip')
  if (Math.abs(p.speed - 1) > 1e-3) parts.push(`setpts=PTS/${p.speed}`)
  parts.push(EVEN)
  return parts.join(',')
}
/** Filtre audio (-af) d'une variante Remix (vitesse synchro), ou null. */
export function remixAudioFilter(p: RemixParams): string | null {
  return Math.abs(p.speed - 1) > 1e-3 ? `atempo=${p.speed}` : null
}

// ── Incrustation : position (centre en % de l'image), taille (% largeur), durée ──
export interface OverlayOpts { x: number; y: number; sizePct: number; from: number; to: number | null; base?: number }
export function overlayFilter(o: OverlayOpts): string {
  const base = o.base ?? 1080
  const w = Math.max(16, Math.round((base * Math.min(100, Math.max(5, o.sizePct))) / 100 / 2) * 2)
  const x = Math.min(100, Math.max(0, o.x)) / 100, y = Math.min(100, Math.max(0, o.y)) / 100
  const enable = o.to != null && o.to > o.from ? `:enable='between(t,${o.from},${o.to})'` : o.from > 0 ? `:enable='gte(t,${o.from})'` : ''
  return `[0:v]scale=${base}:-2,setsar=1[b];[1:v]scale=${w}:-1[ov];[b][ov]overlay=x=(W*${x.toFixed(4)})-(w/2):y=(H*${y.toFixed(4)})-(h/2)${enable},${EVEN}[v]`
}

// ── Assemblage : clips mis au même format (1080×1920 par défaut) puis concaténés ──
export function concatFilter(n: number, withAudio: boolean, w = 1080, h = 1920): string {
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    parts.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v${i}]`)
    if (withAudio) parts.push(`[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`)
  }
  const ins = Array.from({ length: n }, (_, i) => withAudio ? `[v${i}][a${i}]` : `[v${i}]`).join('')
  parts.push(`${ins}concat=n=${n}:v=1:a=${withAudio ? 1 : 0}${withAudio ? '[v][a]' : '[v]'}`)
  return parts.join(';')
}

// ── Légendes : une par ligne, réparties une par vidéo (en boucle) ─────────────
export function captionLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean)
}
export function captionFor(lines: string[], i: number, mode: 'seq' | 'random' = 'seq', rand = Math.random): string {
  if (!lines.length) return ''
  return mode === 'random' ? lines[Math.floor(rand() * lines.length)] : lines[i % lines.length]
}
