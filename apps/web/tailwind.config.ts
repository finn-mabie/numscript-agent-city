import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:    "var(--ink)",
        paper:  "var(--paper)",
        dim:    "var(--dim)",
        mute:   "var(--mute)",
        gold:   "var(--gold)",
        scream: "var(--scream)",
        hustle: "var(--hustle)"
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      transitionTimingFunction: {
        panel: "cubic-bezier(0.2, 0.9, 0.3, 1)"
      }
    }
  }
} satisfies Config;

export default config;
