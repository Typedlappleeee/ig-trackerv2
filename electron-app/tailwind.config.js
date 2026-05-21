/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#07070B',
        surface:  '#0E0E16',
        surface2: '#131320',
        surface3: '#181828',
        border:   '#1C1C2E',
        card:     '#0E0E16',
        hl:       '#1A1A30',
        accent:   '#8B5CF6',
        accent2:  '#7C3AED',
        glow:     '#A855F7',
        danger:   '#EF4444',
        ok:       '#22C55E',
        warn:     '#F59E0B',
        text:     '#FFFFFF',
        text2:    '#A1A1AA',
        muted:    '#1A1A2E',
        // Sidebar
        'sb-bg':       '#07070B',
        'sb-active':   '#1A1035',
        'sb-hover':    '#0E0E1A',
        'sb-text':     '#6B6B7A',
        'sb-text-act': '#F0EEFF',
        'sb-icon':     '#4D3D6E',
        'sb-section':  '#3D2F5A',
        'sb-card':     '#0E0E16',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease-out',
        'slide-up':  'slideUp 0.2s ease-out',
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
