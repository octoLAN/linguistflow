/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // ── 3-Color System ─────────────────────────────────────
                // 1. Neutral (backgrounds, surfaces, borders)
                // 2. Blue accent (#2563eb) — interactive only
                // 3. White (text, contrast)

                base: {
                    light: '#f7f7f8',   // Very light warm white
                    dark: '#141414',   // User-specified dark bg
                },
                surface: {
                    light: '#ffffff',
                    dark: '#1c1c1c',   // Card surface in dark (~8% lift)
                },
                'surface-2': {
                    light: '#f0f0f2',
                    dark: '#222222',   // Input/nested in dark
                },
                border: {
                    light: 'rgba(0,0,0,0.07)',
                    dark: 'rgba(255,255,255,0.07)',
                },
                ink: {
                    light: '#0a0a0a',
                    dark: '#f0f0f0',
                    muted: '#888888',
                },

                // Sidebar stays navy — not part of the 3-color rule
                sidebar: '#0d1526',

                // ── Accent (ONE color) ─────────────────────────────────
                primary: {
                    DEFAULT: '#2563eb',
                    hover: '#1d4ed8',
                    light: 'rgba(37,99,235,0.1)',
                },

                // ── Semantic (tiny dots/indicators only) ──────────────
                success: '#22c55e',
                warning: '#f59e0b',
                danger: '#ef4444',
            },

            borderRadius: {
                '2xl': '1rem',
                '3xl': '1.5rem',
                '4xl': '2rem',
            },

            boxShadow: {
                card: '0 1px 3px rgba(0,0,0,0.06)',
                float: '0 24px 64px rgba(0,0,0,0.2)',
            },

            fontFamily: {
                sans: ["'Inter'", '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            },

            keyframes: {
                shimmer: {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(200%)' },
                },
                'fade-up': {
                    '0%': { opacity: '0', transform: 'translateY(8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                pulse: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.4' },
                },
            },
            animation: {
                shimmer: 'shimmer 1.6s ease-in-out infinite',
                'fade-up': 'fade-up 0.3s cubic-bezier(0.16,1,0.3,1) both',
                'fade-in': 'fade-in 0.2s ease both',
                pulse: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
            },
        },
    },
    plugins: [],
}
