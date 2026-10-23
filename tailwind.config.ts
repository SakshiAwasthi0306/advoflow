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
        accent: { DEFAULT: v("accent"), soft: v("accent-soft"), line: v("accent-line") },
        ai: { DEFAULT: v("ai"), soft: v("ai-soft"), line: v("ai-line") },
      },
      // Fonts are self-hosted by next/font (src/app/layout.tsx); Indian-script text falls back to system Noto fonts.
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Noto Sans", "Noto Sans Kannada", "Noto Sans Devanagari", "Noto Sans Tamil", "sans-serif"],
        serif: ["var(--font-display)", "Georgia", "Cambria", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(40 34 20 / .04)",
        lift: "0 1px 2px rgb(40 34 20 / .05), 0 8px 24px -12px rgb(40 34 20 / .18)",
      },
      borderRadius: { xl: "12px" },
    },
  },
  plugins: [],
};
export default config;
