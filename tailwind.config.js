/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bunker: {
          950: '#070a09',
          900: '#0d1311',
          800: '#141e1a',
          700: '#1e2d27',
          600: '#2b4038',
          500: '#3d5a4f',
        },
        terminal: {
          amber: '#f59e0b',
          green: '#10b981',
          red: '#ef4444',
          cyan: '#06b6d4',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(245, 158, 11, 0.3)' },
          '100%': { boxShadow: '0 0 18px rgba(245, 158, 11, 0.75)' },
        }
      }
    },
  },
  plugins: [],
}

