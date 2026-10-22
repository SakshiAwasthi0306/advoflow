import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

// Design tokens. Status colours are always paired with an icon or text label (never colour alone).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Colours are CSS variables (src/app/globals.css) so the whole app follows the system light/dark setting.
      colors: {
        navy: { 950: v("navy-950"), 900: v("navy-900"), 800: v("navy-800"), 700: v("navy-700"), 100: v("navy-100"), 50: v("navy-50") },
        paper: v("paper"),
        surface: v("surface"),
        sidebar: v("sidebar"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        danger: { DEFAULT: v("danger"), soft: v("danger-soft"), line: v("danger-line") },
        warn: { DEFAULT: v("warn"), soft: v("warn-soft"), line: v("warn-line") },
        ok: { DEFAULT: v("ok"), soft: v("ok-soft"), line: v("ok-line") },
        neutral: { DEFAULT: v("neutral"), soft: v("neutral-soft"), line: v("neutral-line") },
        demo: { DEFAULT: v("demo"), soft: v("demo-soft"), line: v("demo-line") },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Noto Sans", "Noto Sans Kannada", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)" },
      borderRadius: { xl: "12px" },
    },
  },
  plugins: [],
};
export default config;
