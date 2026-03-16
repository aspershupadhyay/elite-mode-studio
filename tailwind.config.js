/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        elite: {
          900: '#0A0A0A',
          800: '#111111',
          700: '#1A1A1A',
          600: '#222222',
          500: '#333333',
          850: '#0D0D0D',
        },
        accent: {
          DEFAULT: '#0BDA76',
          light:   '#3DE89A',
          dark:    '#09B862',
        },
        warm: {
          DEFAULT: '#EAEAEA',
          muted:   '#888888',
          faint:   '#555555',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
