/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Aligned exactly with Python app.py palette (lines 41-56) "Bleu" theme
        bg:       '#06040f',
        surface:  '#0a0816',
        surface2: '#100d1f',
        surface3: '#161228',
        border:   '#1e1830',
        card:     '#0c0a1a',
        hl:       '#13102a',
        accent:   '#8b5cf6',  // violet
        accent2:  '#7c3aed',  // violet hover
        danger:   '#f03d55',
        ok:       '#00ccaa',
        warn:     '#ffaa2a',
        text:     '#e2d9f3',
        text2:    '#5a4e7a',
        muted:    '#1a1430',
        // Sidebar
        'sb-bg':       '#080614',
        'sb-active':   '#1a1035',
        'sb-hover':    '#0e0b20',
        'sb-text':     '#6b5e8a',
        'sb-text-act': '#ede8ff',
        'sb-icon':     '#4d3d6e',
        'sb-section':  '#3d2f5a',
        'sb-card':     '#0c0a1c',
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
