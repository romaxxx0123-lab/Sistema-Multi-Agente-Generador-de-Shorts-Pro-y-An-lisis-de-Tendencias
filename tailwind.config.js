/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        duo: {
          green: '#58cc02',
          'green-dark': '#46a302',
          blue: '#1cb0f6',
          'blue-dark': '#1899d6',
          yellow: '#ffc800',
          'yellow-dark': '#e5b300',
          orange: '#ff9600',
          'orange-dark': '#e68700',
          red: '#ff4b4b',
          'red-dark': '#e54343',
          purple: '#ce82ff',
          'purple-dark': '#b975e6',
          gray: '#afafaf',
          'gray-light': '#e5e5e5',
          'gray-dark': '#777777',
        }
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
      borderWidth: {
        '3': '3px',
      }
    },
  },
  plugins: [],
}
