import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// `npm run lint` failed with "couldn't find eslint.config" since the repo moved
// to ESLint 9 — the dependency was installed and never wired up. Next's flat
// configs are the ones eslint-config-next already ships, so this is the whole
// config: the rules Next recommends, plus the paths that are not source.
const config = [
  {
    ignores: [
      ".next/**",
      "dist/**",
      ".storage/**",
      "services/embed/**",
      "plugin/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // The render service is a standalone CommonJS Node script, not part of the
    // Next bundle — `require` is the module system it actually runs under.
    files: ["services/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
