/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#06060E',
        bg2:     '#08081A',
        text:    '#F2F0FF',
        text2:   'rgba(196,181,253,0.72)',
        muted:   'rgba(148,163,184,0.55)',
        violet:  '#8B5CF6',
        violet2: '#7C3AED',
        cyan:    '#22D3EE',
        indigo:  '#818CF8',
        pink:    '#EC4899',
        emerald: '#34D399',
        border:  'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #22D3EE 0%, #818CF8 50%, #A855F7 100%)',
        'hero-gradient':  'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,58,237,0.25) 0%, transparent 80%)',
      },
      boxShadow: {
        'glow-violet': '0 0 60px -10px rgba(139,92,246,0.6)',
        'glow-cyan':   '0 0 60px -10px rgba(34,211,238,0.4)',
        'glow-soft':   '0 30px 80px -20px rgba(124,58,237,0.5)',
        'card':        '0 4px 24px -4px rgba(0,0,0,0.4)',
        'card-hover':  '0 12px 40px -8px rgba(124,58,237,0.35)',
      },
      animation: {
        'float-slow':   'floatSlow 9s ease-in-out infinite',
        'float-slow2':  'floatSlow 12s ease-in-out infinite reverse',
        'pulse-dot':    'pulseDot 2.4s ease-in-out infinite',
        'shimmer':      'shimmer 2.5s linear infinite',
        'fade-up':      'fadeUp 0.6s ease both',
        'fade-in':      'fadeIn 0.5s ease both',
        'slide-right':  'slideRight 0.5s ease both',
        'ticker':       'ticker 30s linear infinite',
        'border-spin':  'borderSpin 4s linear infinite',
        'count-up':     'countUp 1s ease both',
        'glow-pulse':   'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        floatSlow: {
          '0%,100%': { transform: 'translateY(0) scale(1)' },
          '50%':     { transform: 'translateY(-18px) scale(1.02)' },
        },
        pulseDot: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%':     { opacity: '0.4', transform: 'scale(0.8)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideRight: {
          from: { opacity: '0', transform: 'translateX(-20px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        borderSpin: {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        glowPulse: {
          '0%,100%': { opacity: '0.6' },
          '50%':     { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
