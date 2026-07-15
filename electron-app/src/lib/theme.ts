// Tokens de design ScaleFlow CRM — source unique de vérité.
// Pour rebrander l'app, modifier uniquement ce fichier (+ les variables CSS
// correspondantes dans src/index.css).

export const ACCENT   = '#6366F1'              // indigo principal
export const ACCENT_L = '#818CF8'              // indigo clair (hover, texte accentué)
export const ACCENT_D = '#4F46E5'              // indigo foncé (active, pressed)

export const TEXT_1 = '#E9EAF0'                // texte principal
export const TEXT_2 = 'rgba(233,234,240,0.42)' // texte secondaire
export const TEXT_3 = 'rgba(233,234,240,0.22)' // texte discret
export const HAIR   = 'rgba(233,234,240,0.08)' // bordure hairline

export const BG_0 = '#0A0B0E'                  // fond app
export const BG_1 = '#0F1014'                  // fond panneau
export const BG_2 = '#13141A'                  // fond carte / modal

export const OK    = '#34D399'
export const WARN  = '#FBBF24'
export const ERR   = '#F87171'

export const SANS = "'Inter', system-ui, sans-serif"

// ─────────────────────────────────────────────────────────────────────────────
// TOKENS v2 (additifs) — miroir JS des variables CSS introduites dans index.css.
// Aucun export existant ci-dessus n'est modifié (ACCENT, BG_*, TEXT_*, OK/WARN/
// ERR, SANS restent la source de vérité et sont utilisés partout). Ces tokens
// nomment l'implicite (nombres magiques d'espacement/rayon/ombre) pour l'usage
// inline en TSX sans réécrire les valeurs à la main.
// ─────────────────────────────────────────────────────────────────────────────

// Accent — états (hover / pressed) déjà exposés via ACCENT_L / ACCENT_D ; alias
// sémantiques pour lisibilité côté appelant.
export const ACCENT_HOVER   = ACCENT_L         // #818CF8
export const ACCENT_PRESSED = ACCENT_D         // #4F46E5

// Fonds — alias sémantiques (surface → surface-2 → surface-3).
export const SURFACE   = BG_2                  // carte
export const SURFACE_2 = BG_1                  // panneau
export const SURFACE_3 = BG_0                  // app / fond profond

// Échelle d'espacement canonique (px). Remplace les nombres magiques inline.
export const SP_1 = 4
export const SP_2 = 8
export const SP_3 = 12
export const SP_4 = 16
export const SP_5 = 20
export const SP_6 = 24
export const SP_7 = 32
export const SP_8 = 40

export const SPACE = {
  1: SP_1, 2: SP_2, 3: SP_3, 4: SP_4,
  5: SP_5, 6: SP_6, 7: SP_7, 8: SP_8,
} as const

// Rayons (px) — échelle --r-xs..--r-2xl.
export const R_XS  = 5
export const R_SM  = 8
export const R_MD  = 11
export const R_LG  = 15
export const R_XL  = 20
export const R_2XL = 28

export const RADIUS = {
  xs: R_XS, sm: R_SM, md: R_MD, lg: R_LG, xl: R_XL, '2xl': R_2XL,
} as const

// Élévation — 3 niveaux nommés (repos / hover / flottant), miroir de --elev-*.
export const ELEV_1 =
  '0 1px 2px rgba(0,0,0,.3), 0 6px 18px -10px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04)'
export const ELEV_2 =
  '0 2px 6px rgba(0,0,0,.32), 0 12px 34px -12px rgba(0,0,0,.62), 0 0 26px -10px rgba(99,102,241,.30), inset 0 1px 0 rgba(255,255,255,.05)'
export const ELEV_3 =
  '0 24px 80px -16px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.04), 0 0 80px -24px rgba(99,102,241,.4), inset 0 1px 0 rgba(255,255,255,.05)'
export const GLOW_ACCENT = '0 0 28px -6px rgba(99,102,241,.45)'

export const ELEVATION = { 1: ELEV_1, 2: ELEV_2, 3: ELEV_3 } as const

// Bordures.
export const BORDER              = 'rgba(233,234,240,0.055)'
export const BORDER_MD           = 'rgba(233,234,240,0.09)'
export const BORDER_STRONG       = 'rgba(233,234,240,0.14)'
export const BORDER_ACCENT       = 'rgba(99,102,241,0.22)'
export const BORDER_ACCENT_STRONG = 'rgba(99,102,241,0.28)'

// Verre / blur — les 3 intensités canoniques.
export const BLUR_SM = 'blur(12px)'
export const BLUR_MD = 'blur(20px) saturate(1.2)'
export const BLUR_LG = 'blur(28px) saturate(1.2)'

// Couleurs d'état — tokens sémantiques (miroir des var CSS ; OK/WARN/ERR
// ci-dessus restent les alias legacy déjà consommés).
export const OK_TOKEN     = '#22C55E'
export const WARN_TOKEN   = '#F59E0B'
export const DANGER_TOKEN = '#EF4444'
export const INFO_TOKEN   = '#38BDF8'

// Motion — courbes & durées par intention (miroir des --t-*).
export const EASE_STANDARD = 'cubic-bezier(.22,1,.36,1)'
export const EASE_SPRING   = 'cubic-bezier(.34,1.56,.64,1)'
export const DUR_FAST   = '150ms'   // survol couleur/fond
export const DUR_BASE   = '220ms'   // layout / bordure / ombre
export const DUR_SMOOTH = '300ms'   // lift de carte
export const DUR_MODAL  = '360ms'   // entrée modal / dropdown

