// Petits utilitaires de graphiques SVG (tableau de bord).

/** Pur : courbe lissée (Catmull-Rom → Bézier) qui passe par tous les points, sans descendre sous `floor`. */
export function smoothPath(pts: [number, number][], floor = Infinity): string {
  if (!pts.length) return ''
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const c1y = Math.min(floor, p1[1] + (p2[1] - p0[1]) / 6), c2y = Math.min(floor, p2[1] - (p3[1] - p1[1]) / 6)
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${c1y.toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}
