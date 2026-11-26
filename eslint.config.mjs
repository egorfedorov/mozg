import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [".next/**", "dist/**", "out/**", "out-desk/**", ".i18n-parts/**", "node_modules/**", "plugin/**"],
  },
  ...coreWebVitals,
  ...typescript,
];

export default config;
