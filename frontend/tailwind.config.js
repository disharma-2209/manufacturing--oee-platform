/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {

        // ── Enphase Neutrals ─────────────────────────────────────────────────
        'enph-black':      '#000000',
        'enph-gray-01':    '#3C3C3C',
        'enph-gray-02':    '#7D7D7D',
        'enph-gray-03':    '#DCDCD6',
        'enph-gray-04':    '#F4F3F0',
        'enph-warm-white': '#FAF6EF',
        'enph-white':      '#FFFFFF',

        // ── Brand colors — Light theme ────────────────────────────────────────
        'enph-orange-02':  '#EA6100',
        'enph-coral':      '#F45270',
        'enph-green-02':   '#439E58',
        'enph-yellow':     '#FFD02C',
        'enph-indigo':     '#2C436F',
        'enph-teal-02':    '#3B999E',
        'enph-red-02':     '#DE2100',

        // ── Brand colors — Dark theme ─────────────────────────────────────────
        'enph-orange-01':  '#FF8B49',
        'enph-green-01':   '#61C06A',
        'enph-pink':       '#FFB6B6',
        'enph-light-blue': '#C8DEFF',
        'enph-teal-01':    '#5BBBC1',
        'enph-red-01':     '#FD3826',

        // ── Semantic roles ────────────────────────────────────────────────────
        'bg-base':    '#FAF6EF',
        'bg-surface': '#FFFFFF',
        'bg-muted':   '#F4F3F0',
        'bg-elevated':'#FFFFFF',

        'border-col': '#DCDCD6',

        'text-primary':   '#3C3C3C',
        'text-secondary': '#7D7D7D',
        'text-muted':     '#7D7D7D',
        'text-disabled':  '#DCDCD6',

        // ── Brand primary → Enphase Orange ───────────────────────────────────
        primary: {
          DEFAULT:    '#EA6100',
          50:         '#FFF4EC',
          100:        '#FFE4CC',
          200:        '#FFC99A',
          600:        '#EA6100',
          700:        '#C75400',
          dark:       '#FF8B49',
          light:      '#FFF4EC',
          foreground: '#FFFFFF',
        },

        // ── Sidebar — Enphase black ───────────────────────────────────────────
        sidebar: {
          bg:            '#000000',
          surface:       '#1A1A1A',
          hover:         '#2A2A2A',
          active:        '#3C3C3C',
          border:        '#2A2A2A',
          text:          '#DCDCD6',
          'text-active': '#FFFFFF',
          accent:        '#FF8B49',
          'accent-muted':'rgba(255,139,73,0.15)',
        },

        // ── Semantic status ───────────────────────────────────────────────────
        success: { DEFAULT: '#439E58', light: 'rgba(67,158,88,0.10)',   text: '#439E58' },
        warning: { DEFAULT: '#FFD02C', light: 'rgba(255,208,44,0.18)',  text: '#3C3C3C' },
        danger:  { DEFAULT: '#DE2100', light: 'rgba(222,33,0,0.08)',    text: '#DE2100' },
        info:    { DEFAULT: '#2C436F', light: 'rgba(44,67,111,0.10)',   text: '#2C436F' },
        // keep purple alias for any legacy references
        purple:  { DEFAULT: '#2C436F', light: 'rgba(44,67,111,0.10)',   text: '#2C436F' },

        // ── Recharts palette — warm Enphase tones ────────────────────────────
        chart: {
          orange: '#EA6100',
          green:  '#439E58',
          teal:   '#3B999E',
          yellow: '#FFD02C',
          coral:  '#F45270',
          indigo: '#2C436F',
          red:    '#DE2100',
          pink:   '#FFB6B6',
          // legacy aliases used by existing chart code
          blue:   '#2C436F',
          amber:  '#FFD02C',
          purple: '#2C436F',
          cyan:   '#3B999E',
        },

        // ── Radix UI compat aliases ───────────────────────────────────────────
        border:      '#DCDCD6',
        input:       '#DCDCD6',
        ring:        '#EA6100',
        background:  '#FAF6EF',
        foreground:  '#3C3C3C',
        card:        { DEFAULT: '#FFFFFF', foreground: '#3C3C3C' },
        popover:     { DEFAULT: '#FFFFFF', foreground: '#3C3C3C' },
        muted:       { DEFAULT: '#F4F3F0', foreground: '#7D7D7D' },
        accent:      { DEFAULT: '#FFF4EC', foreground: '#EA6100' },
        destructive: { DEFAULT: '#DE2100', foreground: '#FFFFFF' },
        secondary:   { DEFAULT: '#F4F3F0', foreground: '#3C3C3C' },
      },

      fontFamily: {
        sans:      ['Enphase Visuelt', 'Visuelt Pro', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        mono:      ['DM Mono', 'T-Star Pro', 'IBM Plex Mono', 'monospace'],
        technical: ['DM Mono', 'T-Star Pro', 'IBM Plex Mono', 'monospace'],
      },

      fontSize: {
        'hero':    ['84px', { lineHeight: '1.0',  letterSpacing: '-0.025em' }],
        'display': ['60px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'h1':      ['48px', { lineHeight: '1.1',  letterSpacing: '-0.015em' }],
        'h2':      ['32px', { lineHeight: '1.2',  letterSpacing: '-0.01em' }],
        'h3':      ['24px', { lineHeight: '1.2',  letterSpacing: '-0.005em' }],
        'h4':      ['20px', { lineHeight: '1.25', letterSpacing: '-0.005em' }],
        'body-lg': ['18px', { lineHeight: '1.5' }],
        'body':    ['16px', { lineHeight: '1.5' }],
        'body-sm': ['14px', { lineHeight: '1.45' }],
        'tstar':   ['12px', { lineHeight: '1.5',  letterSpacing: '0.15em' }],
        'tstar-sm':['10px', { lineHeight: '1.5',  letterSpacing: '0.15em' }],
      },

      borderRadius: {
        'pill': '9999px',
        'xl':   '48px',
        'lg':   '24px',
        'md':   '16px',
        'sm':   '10px',
        'xs':   '8px',
      },

      boxShadow: {
        'card':       '0 1px 3px rgba(60,60,60,0.06), 0 1px 2px rgba(60,60,60,0.04)',
        'card-md':    '0 4px 12px rgba(60,60,60,0.08), 0 2px 4px rgba(60,60,60,0.05)',
        'card-lg':    '0 12px 32px rgba(60,60,60,0.10), 0 4px 8px rgba(60,60,60,0.06)',
        'card-hover': '0 8px 24px rgba(60,60,60,0.12)',
        'glow-orange':'0 0 0 3px rgba(234,97,0,0.18)',
        'glow-dark':  '0 0 0 3px rgba(60,60,60,0.15)',
        // legacy alias
        'glow':       '0 0 0 3px rgba(234,97,0,0.18)',
      },

      backgroundImage: {
        'grad-brand':       'linear-gradient(180deg, #FCB571 0%, #F497B3 33%, #F7D9A9 66%, #81C6B9 100%)',
        'grad-sunrise':     'linear-gradient(180deg, #FCB571 0%, #F49787 50%, #C8DEFF 100%)',
        'grad-sunset':      'linear-gradient(180deg, #FFB6B6 0%, #F49787 50%, #2C436F 100%)',
        'grad-spot-orange': 'linear-gradient(180deg, #FF8B49 0%, #F7D9A9 100%)',
        'grad-spot-green':  'linear-gradient(180deg, #81C6B9 0%, #E0E1A4 100%)',
        'grad-spot-blue':   'linear-gradient(180deg, #7BB9E8 0%, #D6E6FF 100%)',
      },

      keyframes: {
        'fade-in':        { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-in-left':  { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'scale-in':       { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'skeleton':       { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.45' } },
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up':   { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'fade-in':        'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
        'slide-in-left':  'slide-in-left 0.25s ease-out',
        'scale-in':       'scale-in 0.15s ease-out',
        'skeleton':       'skeleton 1.6s ease-in-out infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
