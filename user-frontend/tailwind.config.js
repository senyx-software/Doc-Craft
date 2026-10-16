/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', '-apple-system', 'sans-serif'],
        base: ['Poppins', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        // System font stack, not a redistributed font file — resolves to
        // real SF Pro on Apple devices via -apple-system/BlinkMacSystemFont,
        // with sane fallbacks elsewhere. Scoped to the landing page only
        // (font-apple class), the rest of the app keeps Poppins.
        apple: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        appBg: 'var(--background)',
        appSurface: 'var(--surface)',
        appBorder: 'var(--border)',
        appPrimary: 'var(--color-primary)',
        appSuccess: 'var(--color-success)',
        appWarning: 'var(--color-warning)',
        appError: 'var(--color-error)',
        appTextPrimary: 'var(--text-primary)',
        appTextSecondary: 'var(--text-secondary)',
        appDocSurface: 'var(--document-surface)',
        // Brand scale = Figma "violet" accent (Colour System > Accents Overview).
        // Only 6 shades exist in the source file (100 lightest -> 600 most saturated).
        brand: {
          100: 'rgb(var(--accent-violet-100) / <alpha-value>)',
          200: 'rgb(var(--accent-violet-200) / <alpha-value>)',
          300: 'rgb(var(--accent-violet-300) / <alpha-value>)',
          400: 'rgb(var(--accent-violet-400) / <alpha-value>)',
          500: 'rgb(var(--accent-violet-500) / <alpha-value>)',
          600: 'rgb(var(--accent-violet-600) / <alpha-value>)',
        },
        // Surface scale = Figma neutral "fill-contrast" (dark UI chrome). 100 lightest-dark -> 600 darkest.
        surface: {
          100: 'rgb(var(--neutral-fill-contrast-100) / <alpha-value>)',
          200: 'rgb(var(--neutral-fill-contrast-200) / <alpha-value>)',
          300: 'rgb(var(--neutral-fill-contrast-300) / <alpha-value>)',
          400: 'rgb(var(--neutral-fill-contrast-400) / <alpha-value>)',
          500: 'rgb(var(--neutral-fill-contrast-500) / <alpha-value>)',
          600: 'rgb(var(--neutral-fill-contrast-600) / <alpha-value>)',
        },
        // Light-mode neutral scale = Figma "fill-base".
        'surface-light': {
          100: 'rgb(var(--neutral-fill-base-100) / <alpha-value>)',
          200: 'rgb(var(--neutral-fill-base-200) / <alpha-value>)',
          300: 'rgb(var(--neutral-fill-base-300) / <alpha-value>)',
          400: 'rgb(var(--neutral-fill-base-400) / <alpha-value>)',
          500: 'rgb(var(--neutral-fill-base-500) / <alpha-value>)',
          600: 'rgb(var(--neutral-fill-base-600) / <alpha-value>)',
        },
        // Full 10-family accent palette (Colour System > Accents Overview).
        accent: {
          red: { 100: 'rgb(var(--accent-red-100) / <alpha-value>)', 200: 'rgb(var(--accent-red-200) / <alpha-value>)', 300: 'rgb(var(--accent-red-300) / <alpha-value>)', 400: 'rgb(var(--accent-red-400) / <alpha-value>)', 500: 'rgb(var(--accent-red-500) / <alpha-value>)', 600: 'rgb(var(--accent-red-600) / <alpha-value>)' },
          amber: { 100: 'rgb(var(--accent-amber-100) / <alpha-value>)', 200: 'rgb(var(--accent-amber-200) / <alpha-value>)', 300: 'rgb(var(--accent-amber-300) / <alpha-value>)', 400: 'rgb(var(--accent-amber-400) / <alpha-value>)', 500: 'rgb(var(--accent-amber-500) / <alpha-value>)', 600: 'rgb(var(--accent-amber-600) / <alpha-value>)' },
          brown: { 100: 'rgb(var(--accent-brown-100) / <alpha-value>)', 200: 'rgb(var(--accent-brown-200) / <alpha-value>)', 300: 'rgb(var(--accent-brown-300) / <alpha-value>)', 400: 'rgb(var(--accent-brown-400) / <alpha-value>)', 500: 'rgb(var(--accent-brown-500) / <alpha-value>)', 600: 'rgb(var(--accent-brown-600) / <alpha-value>)' },
          green: { 100: 'rgb(var(--accent-green-100) / <alpha-value>)', 200: 'rgb(var(--accent-green-200) / <alpha-value>)', 300: 'rgb(var(--accent-green-300) / <alpha-value>)', 400: 'rgb(var(--accent-green-400) / <alpha-value>)', 500: 'rgb(var(--accent-green-500) / <alpha-value>)', 600: 'rgb(var(--accent-green-600) / <alpha-value>)' },
          teal: { 100: 'rgb(var(--accent-teal-100) / <alpha-value>)', 200: 'rgb(var(--accent-teal-200) / <alpha-value>)', 300: 'rgb(var(--accent-teal-300) / <alpha-value>)', 400: 'rgb(var(--accent-teal-400) / <alpha-value>)', 500: 'rgb(var(--accent-teal-500) / <alpha-value>)', 600: 'rgb(var(--accent-teal-600) / <alpha-value>)' },
          blue: { 100: 'rgb(var(--accent-blue-100) / <alpha-value>)', 200: 'rgb(var(--accent-blue-200) / <alpha-value>)', 300: 'rgb(var(--accent-blue-300) / <alpha-value>)', 400: 'rgb(var(--accent-blue-400) / <alpha-value>)', 500: 'rgb(var(--accent-blue-500) / <alpha-value>)', 600: 'rgb(var(--accent-blue-600) / <alpha-value>)' },
          indigo: { 100: 'rgb(var(--accent-indigo-100) / <alpha-value>)', 200: 'rgb(var(--accent-indigo-200) / <alpha-value>)', 300: 'rgb(var(--accent-indigo-300) / <alpha-value>)', 400: 'rgb(var(--accent-indigo-400) / <alpha-value>)', 500: 'rgb(var(--accent-indigo-500) / <alpha-value>)', 600: 'rgb(var(--accent-indigo-600) / <alpha-value>)' },
          violet: { 100: 'rgb(var(--accent-violet-100) / <alpha-value>)', 200: 'rgb(var(--accent-violet-200) / <alpha-value>)', 300: 'rgb(var(--accent-violet-300) / <alpha-value>)', 400: 'rgb(var(--accent-violet-400) / <alpha-value>)', 500: 'rgb(var(--accent-violet-500) / <alpha-value>)', 600: 'rgb(var(--accent-violet-600) / <alpha-value>)' },
          purple: { 100: 'rgb(var(--accent-purple-100) / <alpha-value>)', 200: 'rgb(var(--accent-purple-200) / <alpha-value>)', 300: 'rgb(var(--accent-purple-300) / <alpha-value>)', 400: 'rgb(var(--accent-purple-400) / <alpha-value>)', 500: 'rgb(var(--accent-purple-500) / <alpha-value>)', 600: 'rgb(var(--accent-purple-600) / <alpha-value>)' },
          pink: { 100: 'rgb(var(--accent-pink-100) / <alpha-value>)', 200: 'rgb(var(--accent-pink-200) / <alpha-value>)', 300: 'rgb(var(--accent-pink-300) / <alpha-value>)', 400: 'rgb(var(--accent-pink-400) / <alpha-value>)', 500: 'rgb(var(--accent-pink-500) / <alpha-value>)', 600: 'rgb(var(--accent-pink-600) / <alpha-value>)' },
        },
        success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
        warning: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
        danger: 'rgb(var(--color-error-rgb) / <alpha-value>)',
        error: 'rgb(var(--color-error-rgb) / <alpha-value>)',
        info: 'rgb(var(--color-info-rgb) / <alpha-value>)',
      },
      fontSize: {
        // [fontSize, { lineHeight }] — Foundation > typography, in px, Poppins.
        'display-d1': ['67px', { lineHeight: '78px' }],
        'display-d2': ['56px', { lineHeight: '60px' }],
        'display-d3': ['47px', { lineHeight: '52px' }],
        'display-d4': ['39px', { lineHeight: '44px' }],
        'heading-h1': ['32px', { lineHeight: '40px' }],
        'heading-h2': ['27px', { lineHeight: '32px' }],
        'heading-h3': ['22px', { lineHeight: '28px' }],
        'heading-h4': ['19px', { lineHeight: '24px' }],
        'heading-h5': ['16px', { lineHeight: '20px' }],
        'heading-h6': ['13px', { lineHeight: '16px' }],
        'body-lg': ['19px', { lineHeight: '24px' }],
        'body-md': ['16px', { lineHeight: '20px' }],
        'body-base': ['13px', { lineHeight: '16px' }],
        'body-sm': ['12px', { lineHeight: '14px' }],
        'body-xs': ['11px', { lineHeight: '12px' }],
        'paragraph-lg': ['19px', { lineHeight: '28px' }],
        'paragraph-md': ['16px', { lineHeight: '24px' }],
        'paragraph-base': ['13px', { lineHeight: '20px' }],
        'paragraph-sm': ['12px', { lineHeight: '16px' }],
        'paragraph-xs': ['11px', { lineHeight: '14px' }],
      },
      spacing: {
        // Foundation > spacing (px). xl and 2xl share the same Figma value (32px).
        '4xs': 'var(--space-4xs)',
        '3xs': 'var(--space-3xs)',
        '2xs': 'var(--space-2xs)',
        xs: 'var(--space-xs)',
        sm: 'var(--space-sm)',
        base: 'var(--space-base)',
        md: 'var(--space-md)',
        lg: 'var(--space-lg)',
        xl: 'var(--space-xl)',
        '2xl': 'var(--space-2xl)',
        '3xl': 'var(--space-3xl)',
        '4xl': 'var(--space-4xl)',
        '5xl': 'var(--space-5xl)',
      },
      borderRadius: {
        none: 'var(--radius-none)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-base)',
        base: 'var(--radius-base)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(99, 102, 241, 0.3)',
        'glow-lg': '0 0 40px rgba(99, 102, 241, 0.4)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.12)',
        // Foundation > shadows: elevate/layer-1..6, /500 opacity tier.
        '1': 'var(--shadow-1)',
        '2': 'var(--shadow-2)',
        '3': 'var(--shadow-3)',
        '4': 'var(--shadow-4)',
        '5': 'var(--shadow-5)',
        '6': 'var(--shadow-6)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-out-right': 'slideOutRight 0.3s ease-in',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'typing': 'typing 1.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideOutRight: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        typing: {
          '0%': { opacity: '0.3' },
          '50%': { opacity: '1' },
          '100%': { opacity: '0.3' },
        },
      },
    },
  },
  plugins: [],
}