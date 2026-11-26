import type { Metadata } from "next";
import ReactDOM from "react-dom";
import { INSTALL } from "@/lib/install";
import "../fonts.css";
import "../globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(INSTALL.site),
  title: { default: "mozg — own what your AI writes", template: "%s — mozg" },
  description:
    "mozg reads what your coding agent changed and offers a one-minute explain-back for the parts you cannot yet vouch for. Local only: no keys, no accounts.",
  applicationName: "mozg",
};

/**
 * The root of the English pages: the landing, the changelog and the
 * documentation. English lives at the root of the site; every other language
 * has its own root, made by scripts/i18n-routes.mts under (locale).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The two Latin faces are preloaded because they are vendored; without it the
  // display face arrives a beat after the paper and the headline jumps.
  ReactDOM.preload("/fonts/unbounded-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  ReactDOM.preload("/fonts/golos-text-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
