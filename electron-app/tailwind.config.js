/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Aligned exactly with Python app.py palette (lines 41-56) "Bleu" theme
        bg:       '#080b14',
        surface:  '#0c0f1c',
        surface2: '#111528',
        surface3: '#171c30',
        border:   '#1a2035',
        card:     '#0d1120',
        hl:       '#141a2c',  // hover/highlight
        accent:   '#4f8ef7',  // primary blue
        accent2:  '#3d7ae5',  // hover blue
        danger:   '#f03d55',
        ok:       '#00ccaa',
        warn:     '#ffaa2a',
        text:     '#d4dcf0',
        text2:    '#5a6882',
        muted:    '#1e2640',
        // Sidebar palette (matches Python `SB_BG`, `ACT`)
        'sb-bg':       '#0b0e18',
        'sb-active':   '#162040',
        'sb-hover':    '#0f1728',
        'sb-text':     '#6e80a2',
        'sb-text-act': '#e8eaf0',
        'sb-icon':     '#4d5e80',
        'sb-section':  '#3d5070',
        'sb-card':     '#0e1424',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
