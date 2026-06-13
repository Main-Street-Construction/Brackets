import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#000000",
        surface: {
          DEFAULT: "#1c1c1e",
          raised: "#2c2c2e",
          overlay: "#3a3a3c"
        },
        ink: {
          DEFAULT: "#ffffff",
          secondary: "rgba(255,255,255,0.62)",
          muted: "rgba(255,255,255,0.38)"
        },
        live: "#ff453a",
        win: "#30d158",
        tie: "#ffd60a",
        accent: "#0a84ff"
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Segoe UI",
          "system-ui",
          "sans-serif"
        ],
        score: [
          "SF Pro Display",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif"
        ]
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 32px rgba(0,0,0,0.45)",
        feed: "0 12px 40px rgba(0,0,0,0.55)"
      },
      borderRadius: {
        card: "1.125rem"
      },
      animation: {
        "live-pulse": "live-pulse 1.6s ease-in-out infinite",
        "fade-up": "fade-up 0.35s ease-out both"
      },
      keyframes: {
        "live-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.88)" }
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: []
} satisfies Config;
