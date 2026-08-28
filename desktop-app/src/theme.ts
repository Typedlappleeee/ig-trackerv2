// Design system v10 — dense / neutre.
// Le violet ne décore pas : il SIGNIFIE (sélection, actif, action primaire, focus).

export const C = {
  appBg: '#0B0B0F',
  panel: '#101015',
  panel2: '#16161C',
  raise: '#1B1B22',
  // Texte
  t1: '#F4F4F6',
  t2: '#A1A1AA',
  t3: '#71717A',
  t4: '#52525B',
  // Bordures
  b1: 'rgba(255,255,255,0.06)',
  b2: 'rgba(255,255,255,0.10)',
  b3: 'rgba(255,255,255,0.18)',
  // Accent (violet) — usage sémantique uniquement
  accent: '#8B5CF6',
  accentLt: '#A78BFA',
  accentDim: 'rgba(139,92,246,0.14)',
  accentBorder: 'rgba(139,92,246,0.45)',
  // États
  ok: '#34D399',
  warn: '#FBBF24',
  bad: '#F87171',
  info: '#38BDF8',
  cyan: '#22D3EE',
} as const

export const F = {
  sans: "'Manrope', system-ui, -apple-system, sans-serif",
  display: "'Space Grotesk', 'Manrope', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const

export const R = { badge: 6, btn: 8, panel: 10, lg: 12 } as const

// Lueur réservée au bouton primaire.
export const GLOW_PRIMARY = '0 0 24px -8px rgba(139,92,246,0.7)'
