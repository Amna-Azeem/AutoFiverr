/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Base "ops-room" palette — a deep plum-charcoal ground rather than
        // the generic near-black, with a warm amber accent (agent activity)
        // and a cool violet secondary (system/structure).
        ink: {
          950: "#141019",
          900: "#1A1523",
          800: "#241D30",
          700: "#332941",
          600: "#473A57",
        },
        paper: "#F3EFE8",
        amber: {
          400: "#F0A868",
          500: "#E2905A",
        },
        violet: {
          400: "#8B7FD6",
          500: "#7368C4",
        },
        line: "#3A2F49",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
