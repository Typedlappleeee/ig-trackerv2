/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── ScaleFlow Premium Design System ─────────────────────────────────
        bg:       '#07070B',   // ultra-dark background
        surface:  '#0E0E16',   // card base
        surface2: '#12121E',   // elevated cards
        surface3: '#181828',   // highest elevation
        border:   '#1A1A2E',   // subtle border
        card:     '#0E0E16',   // alias
        hl:       '#16162A',   // highlight
        accent:   '#8B5CF6',   // violet primary
        accent2:  '#7C3AED',   // violet darker
        'accent-glow': '#A855F7', // violet glow
        danger:   '#EF4444',
        'danger-muted': '#1C0A0A',
        ok:       '#22C55E',
        'ok-muted': '#0A1C0F',
        warn:     '#F59E0B',
        'warn-muted': '#1C1209',
        text:     '#FFFFFF',
        text2:    '#A1A1AA',
        text3:    '#52525B',
        muted:    '#111118',
        // ── Sidebar ─────────────────────────────────────────────────────────
        'sb-bg':       '#07070B',
        'sb-active':   '#16103A',
        'sb-hover':    '#0F0F1A',
        'sb-text':     '#71717A',
        'sb-text-act': '#F4F0FF',
        'sb-icon':     '#52458A',
        'sb-section':  '#3A3356',
        'sb-card':     '#0E0E18',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-sm':  '0 0 12px -3px rgba(139,92,246,0.4)',
        'glow':     '0 0 24px -4px rgba(139,92,246,0.5)',
        'glow-lg':  '0 0 48px -8px rgba(139,92,246,0.6)',
        'glow-ok':  '0 0 16px -4px rgba(34,197,94,0.5)',
        'glow-danger': '0 0 16px -4px rgba(239,68,68,0.5)',
        'card':     '0 4px 24px -4px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.4)',
        'card-hover': '0 8px 32px -4px rgba(0,0,0,0.7), 0 0 24px -8px rgba(139,92,246,0.2)',
        'premium':  '0 0 0 1px rgba(139,92,246,0.2), 0 8px 32px -4px rgba(0,0,0,0.6)',
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.2s ease-out',
        'spin-slow':  'spin 2s linear infinite',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'count-up':   'countUp 0.4s cubic-bezier(.22,1,.36,1) both',
      },
      keyframes: {
        fadeIn:    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:   { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(139,92,246,0)' },
          '50%':     { boxShadow: '0 0 20px 4px rgba(139,92,246,0.2)' },
        },
        countUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
