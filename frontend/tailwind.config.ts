import type { Config } from "tailwindcss";

const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", "[data-theme='dark']"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: rgb("--brand"),
          hover: rgb("--brand-hover"),
          deep: rgb("--brand-deep"),
          accent: rgb("--brand-accent"),
          light: rgb("--brand-light"),
          pale: rgb("--brand-pale"),
          chip: rgb("--brand-chip"),
        },
        paper: {
          DEFAULT: rgb("--paper"),
          dim: rgb("--paper-dim"),
          edge: rgb("--paper-edge"),
        },
        ink: {
          DEFAULT: rgb("--ink"),
          soft: rgb("--ink-soft"),
        },
        surface: {
          DEFAULT: rgb("--surface"),
          card: rgb("--surface-card"),
          hover: rgb("--surface-hover"),
          thead: rgb("--surface-thead"),
          chipActive: rgb("--surface-chip-active"),
        },
        edge: {
          soft: rgb("--edge-soft"),
          chip: rgb("--edge-chip"),
          focus: rgb("--edge-focus"),
        },
        badge: {
          contract: { bg: rgb("--badge-contract-bg"), fg: rgb("--badge-contract-fg") },
          invoice: { bg: rgb("--badge-invoice-bg"), fg: rgb("--badge-invoice-fg") },
          report: { bg: rgb("--badge-report-bg"), fg: rgb("--badge-report-fg") },
          letter: { bg: rgb("--badge-letter-bg"), fg: rgb("--badge-letter-fg") },
          permit: { bg: rgb("--badge-permit-bg"), fg: rgb("--badge-permit-fg") },
          other: { bg: rgb("--badge-other-bg"), fg: rgb("--badge-other-fg") },
        },
        approval: {
          pending: {
            bg: rgb("--approval-pending-bg"),
            fg: rgb("--approval-pending-fg"),
            edge: rgb("--approval-pending-edge"),
          },
          approved: {
            bg: rgb("--approval-approved-bg"),
            fg: rgb("--approval-approved-fg"),
            edge: rgb("--approval-approved-edge"),
          },
          rejected: {
            bg: rgb("--approval-rejected-bg"),
            fg: rgb("--approval-rejected-fg"),
            edge: rgb("--approval-rejected-edge"),
          },
          revision: {
            bg: rgb("--approval-revision-bg"),
            fg: rgb("--approval-revision-fg"),
            edge: rgb("--approval-revision-edge"),
          },
        },
        danger: {
          bg: rgb("--danger-bg"),
          fg: rgb("--danger-fg"),
          edge: rgb("--danger-edge"),
        },
        dot: {
          done: rgb("--dot-done"),
          progress: rgb("--dot-progress"),
          pending: rgb("--dot-pending"),
          failed: rgb("--dot-failed"),
        },
        mention: {
          row: rgb("--mention-row-bg"),
        },
        sidebar: {
          DEFAULT: rgb("--sidebar-bg"),
          fg: rgb("--sidebar-fg"),
          fgSoft: rgb("--sidebar-fg-soft"),
          chip: rgb("--sidebar-chip"),
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
