/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          void: '#000000',
          primary: '#0a0a0b',
          secondary: '#141416',
          elevated: '#1c1c1f',
          surface: '#242428',
          hover: '#2a2a2e',
          active: '#323236',
        },
        text: {
          primary: '#ffffff',
          secondary: '#a0a0a8',
          tertiary: '#6b6b73',
          muted: '#48484f',
        },
        accent: {
          purple: '#8b5cf6',
          cyan: '#00d4ff',
          green: '#00ff9f',
          red: '#ff4757',
          yellow: '#ffd93d',
          blue: '#3b82f6',
          orange: '#ff9f43',
        },
        severity: {
          critical: '#ff4757',
          high: '#ff9f43',
          medium: '#ffd93d',
          low: '#00ff9f',
          info: '#3b82f6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '14px',
        'xl': '20px',
        '2xl': '28px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}
