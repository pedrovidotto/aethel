import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0a0b0e',
          800: '#12141a',
          700: '#1b1e27',
          600: '#262b38'
        }
      }
    }
  },
  plugins: []
};

export default config;
