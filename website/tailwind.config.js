/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#06060E',
        bg2:      '#070710',
        surface:  'rgba(255,255,255,0.04)',
        border:   'rgba(255,255,255,0.08)',
        text:     '#F2F0FF',
        text2:    'rgba(196,181,253,0.72)',
        muted:    'rgba(148,163,184,0.62)',
        violet:   '#8B5CF6',
        violet2:  '#7C3AED',
        cyan:     '#22D3EE',
        indigo:   '#818CF8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #22D3EE 0%, #818CF8 45%, #A855F7 100%)',
      },
      boxShadow: {
        'glow-violet': '0 0 40px -8px rgba(139,92,246,0.5)',
        'glow-soft':   '0 20px 60px -20px rgba(124,58,237,0.45)',
      },
      animation: {
        'float-slow': 'floatSlow 9s ease-in-out infinite',
        'pulse-dot':  'pulseDot 2.4s ease-in-out infinite',
        'shimmer':    'shimmer 2.2s linear infinite',
      },
      keyframes: {
        floatSlow: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-10px)' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%':     { opacity: '0.5', transform: 'scale(0.85)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
