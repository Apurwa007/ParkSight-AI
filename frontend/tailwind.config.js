/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0F172A',
        panel: '#1E293B',
        primary: '#3B82F6',
        critical: '#EF4444',
        warning: '#F59E0B',
        monitor: '#EAB308',
        safe: '#10B981',
      },
    },
  },
  plugins: [],
}
