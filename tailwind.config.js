/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: '#F3E9DD',
        primary: {
          DEFAULT: '#006766',
          dark: '#004D40',
        },
        secondary: '#607C7B',
        tertiary: '#894C2D',
        success: '#2E7D32',
        warning: '#F59E0B',
        error: '#D32F2F',
        shadow: {
          light: '#FFFFFF',
          dark: '#D1C4B2',
          darker: '#E2D9CD'
        }
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
      },
      borderRadius: {
        input: '8px',
        card: '16px',
        btn: '24px',
      },
      boxShadow: {
        'neo-raised': '6px 6px 12px #D1C4B2, -6px -6px 12px #FFFFFF',
        'neo-hover': '8px 8px 16px #D1C4B2, -8px -8px 16px #FFFFFF',
        'neo-pressed': 'inset 4px 4px 8px #D1C4B2, inset -4px -4px 8px #FFFFFF',
        'neo-inset': 'inset 4px 4px 8px #d1c4b2, inset -4px -4px 8px #ffffff',
        'neo-surface': '2px 2px 5px #D1C4B2, -2px -2px 5px #FFFFFF',
      }
    },
  },
  plugins: [],
}
