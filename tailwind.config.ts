import type { Config } from "tailwindcss";
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sporthouse brand colors
        'sh-black': '#000000',
        'sh-grey':  '#D9D9D6',
        'sh-green': '#3A913F',

        // Lifted zinc palette — readable on dark backgrounds
        zinc: {
          950: '#0a0a0a',   // Body background — slightly off-black
          900: '#141414',   // Sidebar / card bg — clearly distinct
          800: '#202020',   // Borders — visible without screaming
          700: '#2e2e2e',   // Hover borders / dividers
          600: '#585855',   // Muted text — was #3f3f3c (unreadable)
          500: '#878784',   // Secondary text — was #666663 (too dark)
          400: '#ababA8',   // Medium text
          300: '#c6c6c3',   // Light text
          200: '#D9D9D6',   // Primary text / sh-grey
          100: '#ebebea',
          50:  '#f5f5f3',
        },
      },
      fontFamily: {
        sans:    ['var(--font-satoshi)', 'system-ui', 'sans-serif'],
        display: ['var(--font-kurdis)',  'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [typography],
};

export default config;
