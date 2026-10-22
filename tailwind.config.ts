import type { Config } from "tailwindcss";

// Design tokens. Status colours are always paired with an icon or text label (never colour alone).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#0B1730", 900: "#12234A", 800: "#1A3166", 700: "#24407F", 100: "#E7ECF6", 50: "#F3F6FB" },
        paper: "#F6F5F1",
        ink: "#1B2333",
        muted: "#5E6676",
        line: "#E3E0D7",
        danger: { DEFAULT: "#B42318", soft: "#FEF0EE", line: "#F6C9C3" },
        warn: { DEFAULT: "#9A4A06", soft: "#FFF5E3", line: "#F5D9A8" },
        ok: { DEFAULT: "#067647", soft: "#EBF8F1", line: "#B5E3CB" },
        neutral: { DEFAULT: "#475467", soft: "#F2F4F7", line: "#D9DEE5" },
        demo: { DEFAULT: "#6B3FA0", soft: "#F4EFFB", line: "#DCCDF0" },
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
