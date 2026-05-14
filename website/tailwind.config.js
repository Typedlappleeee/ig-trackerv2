/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#030307',
        surface:  '#0a0613',
        surface2: '#11091f',
        border:   'rgba(139,92,246,0.20)',
        text:     '#e9e7f5',
        text2:    '#a89bd4',
        muted:    '#6b5fa0',
        accent:   '#8b5cf6',
        accent2:  '#ec4899',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(130deg,#7c3aed,#ec4899)',
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        glow:  'glow 4s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-12px)' },
        },
        glow: {
          '0%,100%': { opacity: '0.4' },
          '50%':     { opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
}
