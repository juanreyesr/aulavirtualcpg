import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cpgBlue: "#0b3b73",
        cpgTeal: "#00a0c6",
        cpgGold: "#f2b538",
        netflixBlack: "#0b0b0f"
      },
      boxShadow: {
        lift: "0 12px 40px rgba(0,0,0,0.55)"
      }
    },
  },
  plugins: [],
} satisfies Config;
