/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces — elevation comes from background level, not borders.
        canvas: '#0B0B0D',
        surface: {
          DEFAULT: '#131316', // cards
          raised: '#17171B',  // panels/tiles nested inside a card
          overlay: '#1C1C21', // modals, popovers, dropdowns
          hover: '#202026',
        },
        // Borders — white-alpha so they sit on any surface level.
        line: {
          subtle: 'rgba(255,255,255,0.04)',
          DEFAULT: 'rgba(255,255,255,0.07)',
          strong: 'rgba(255,255,255,0.14)',
        },
        // Text — all three clear 4.5:1 against canvas.
        content: {
          primary: '#F5F5F7',
          secondary: '#A1A1AA',
          muted: '#8A8A93',
        },
        // One brand accent for everything interactive.
        brand: {
          DEFAULT: '#3B82F6',
          hover: '#60A5FA',
          muted: 'rgba(59,130,246,0.14)',
          ring: 'rgba(59,130,246,0.45)',
        },
        // Semantic — green/red are reserved for P&L direction only.
        profit: {
          DEFAULT: '#34D399',
          soft: 'rgba(52,211,153,0.12)',
        },
        loss: {
          DEFAULT: '#F87171',
          soft: 'rgba(248,113,113,0.12)',
        },
        warn: {
          DEFAULT: '#FBBF24',
          soft: 'rgba(251,191,36,0.12)',
        },
        // The step between warn and loss. Grade scales (A–F) and severity
        // ladders need five distinct rungs, so this stays in the palette even
        // though nothing interactive is allowed to use it.
        caution: {
          DEFAULT: '#FB923C',
          soft: 'rgba(251,146,60,0.12)',
        },
      },
      borderRadius: {
        card: '16px',
        control: '10px',
        chip: '8px',
      },
      boxShadow: {
        'elev-1': '0 1px 2px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
        'elev-2': '0 4px 12px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.3)',
        'elev-3': '0 16px 40px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.4)',
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      transitionDuration: {
        DEFAULT: '160ms',
      },
    },
  },
  plugins: [],
}
