import type { Metadata } from "next";
import ReactDOM from "react-dom";
import { INSTALL } from "@/lib/install";
import { LANG_TAG, type Lang } from "@/lib/i18n";
import "@/i18n";
import "@/app/fonts.css";
import "@/app/globals.css";

export const metadata: Metadata = { metadataBase: new URL(INSTALL.site) };

/**
 * The root of every language but English: `/de/`, `/zh-tw/`.
 *
 * The page says which language it is in, for a search engine and for a screen
 * reader, and from here down the whole process speaks it. English has its own
 * root, at the top of the site.
 */
export default function LocaleRoot({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  // Cyrillic only for Russian. The languages that write in Chinese characters
  // or Hangul are set by the system's own faces, which need no downloading.
  if (lang === "ru") {
    ReactDOM.preload("/fonts/unbounded-cyrillic.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
    ReactDOM.preload("/fonts/golos-text-cyrillic.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  } else {
    // The two Latin faces are preloaded because they are vendored; without it the
    // display face arrives a beat after the paper and the headline jumps.
    ReactDOM.preload("/fonts/unbounded-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
    ReactDOM.preload("/fonts/golos-text-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
  return (
    <html lang={LANG_TAG[lang]}>
      <body>{children}</body>
    </html>
  );
}
