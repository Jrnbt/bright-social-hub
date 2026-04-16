import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        rose: {
          DEFAULT: "#FF0749",
          light: "#FF074920",
          hover: "#E0063F",
        },
        marine: {
          DEFAULT: "#0F0135",
          light: "#0F013510",
        },
        border: "#E2E4EA",
        background: "#F5F6FA",
        foreground: "#1A1A2E",
        card: "#FFFFFF",
        muted: "#6B7280",
        success: { DEFAULT: "#10B981", light: "#10B98120" },
        warning: { DEFAULT: "#F59E0B", light: "#F59E0B20" },
        danger: { DEFAULT: "#EF4444", light: "#EF444420" },
        info: { DEFAULT: "#3B82F6", light: "#3B82F620" },
      },
      fontFamily: {
        nunito: ["Nunito", "sans-serif"],
      },
      borderRadius: {
        lg: "12px",
        md: "8px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
