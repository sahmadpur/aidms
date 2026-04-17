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
          accent: "#7db542", // active marker / section headings
          light: "#c5e49a", // nav label
          pale: "#e8f5d0", // logo / active nav text
          chip: "#4a8c1c", // user-avatar bg
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
      },
    },
  },
  plugins: [],
};
export default config;
