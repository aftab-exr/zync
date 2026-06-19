/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        raised: "var(--bg-raised)",
        border: {
          DEFAULT: "var(--border)",
          active: "var(--border-active)",
        },
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
        },
        secondary: "var(--color-secondary)",
        accent: "var(--color-accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
      },
      textColor: {
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        inverse: "var(--text-inverse)",
      },
      fontFamily: {
        body: ["var(--font-body)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      boxShadow: {
        brutal: '4px 4px 0px var(--border)',
        'brutal-sm': '2px 2px 0px var(--border)',
        'brutal-lg': '8px 8px 0px var(--border)',
      },
      borderWidth: {
        3: '3px',
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        md: '8px',
        full: '9999px',
      }
    },
  },
  plugins: [],
}