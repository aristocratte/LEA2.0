/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#F5F5F5',
        foreground: '#000000',
        card: '#FFFFFF',
        border: '#E5E5E5',
        'text-primary': '#000000',
        'text-secondary': '#666666',
        'text-muted': '#999999',
        accent: {
          orange: '#F5A623',
          green: '#4CAF50',
          blue: '#3B82F6',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          elevated: '#FFFFFF',
          hover: 'rgba(0, 0, 0, 0.04)',
        },
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
    },
  },
  plugins: [],
}
