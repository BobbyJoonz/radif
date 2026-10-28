/**
 * Tailwind v4 through PostCSS.
 *
 * The create-next-app template wires Tailwind with a Turbopack `*.css` rule.
 * That rule also intercepts `*.module.css`, so every CSS module in this project
 * rendered unstyled. PostCSS is the documented Tailwind v4 path and keeps CSS
 * modules working, which is what the screens depend on.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
