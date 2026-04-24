import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2d5016", // sidebar bg
          hover: "#3a6b1e",
          deep: "#1c330d", // darker than DEFAULT, for editorial panels
          accent: "#7db542", // active marker / section headings
          light: "#c5e49a", // nav label
          pale: "#e8f5d0", // logo / active nav text
          chip: "#4a8c1c", // user-avatar bg
        },
        paper: {
          DEFAULT: "#f6f0df", // warm cream auth background
          dim: "#ebe3ca",     // slightly darker cream for subtle contrast
          edge: "#d9cfb0",    // paper-toned hairline border
        },
        ink: {
          DEFAULT: "#1b201b", // near black with green tint
          soft: "#4a544a",    // secondary ink
        },
        surface: {
          DEFAULT: "#f4f6f3", // page background
          card: "#ffffff",
          hover: "#f7fbf0", // table row hover / subtle btn hover
          thead: "#f0f7e8", // table head
          chipActive: "#eaf3de", // active filter chip
        },
        edge: {
          soft: "#dde8d0", // top bar + table border
          chip: "#c8ddb0", // input + btn border
          focus: "#4a8c1c", // focus outline
        },
        badge: {
          contract: { bg: "#e6f1fb", fg: "#185fa5" },
          invoice: { bg: "#faeeda", fg: "#854f0b" },
          report: { bg: "#eaf3de", fg: "#3b6d11" },
          letter: { bg: "#fbeaf0", fg: "#993556" },
          permit: { bg: "#eeedfe", fg: "#534ab7" },
          other: { bg: "#f1f1f1", fg: "#555555" },
        },
        dot: {
          done: "#639922",
          progress: "#ef9f27",
          pending: "#aaaaaa",
          failed: "#c94949",
        },
        primary: {
          50: "#eff6ff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
      },
      fontFamily: {
        brand: ["Calibri", "Aptos", "Segoe UI", "Arial", "sans-serif"],
        display: [
          "var(--font-display)",
          "Georgia",
          "'Iowan Old Style'",
          "serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      keyframes: {
        riseFade: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        cardFloat1: {
          "0%, 100%": { transform: "rotate(-5.5deg) translateY(0)" },
          "50%":      { transform: "rotate(-5deg) translateY(-7px)" },
        },
        cardFloat2: {
          "0%, 100%": { transform: "rotate(4deg) translateY(0)" },
          "50%":      { transform: "rotate(3.5deg) translateY(-5px)" },
        },
        stampPulse: {
          "0%, 100%": { opacity: "0.78" },
          "50%":      { opacity: "1" },
        },
      },
      animation: {
        rise: "riseFade 0.8s cubic-bezier(0.2, 0.65, 0.2, 1) both",
        float1: "cardFloat1 9s ease-in-out infinite",
        float2: "cardFloat2 11s ease-in-out infinite",
        stamp: "stampPulse 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
