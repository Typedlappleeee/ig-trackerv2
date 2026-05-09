/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#080b14',
        surface:  '#0c0f1c',
        surface2: '#111528',
        surface3: '#171c30',
        border:   '#1a2035',
        card:     '#0d1120',
        accent:   '#4f9eff',
        accent2:  '#2070dd',
        danger:   '#f03d55',
        ok:       '#00ccaa',
        warn:     '#ffaa2a',
        text:     '#d4dcf0',
        text2:    '#5a6882',
        muted:    '#1e2640',
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
