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
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          dim: "var(--accent-dim)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
      },
      textColor: {
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        disabled: "var(--text-disabled)",
      },
      fontFamily: {
        body: ["var(--font-body)"],
        display: ["var(--font-display)"],
      }
    },
  },
  plugins: [],
}