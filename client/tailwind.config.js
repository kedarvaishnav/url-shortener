/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        glass: '0 24px 80px -24px rgba(0, 0, 0, 0.55)',
        glow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 0 80px rgba(45,212,191,0.14)',
      },
    },
  },
  plugins: [],
};
