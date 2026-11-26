import ReactDOM from "react-dom";
import "../fonts.css";
import "../globals.css";

/**
 * The root of the operator's panel. Its own, and apart from the site's: no
 * site header or footer, nothing of the chat, and never in a search index.
 */
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  ReactDOM.preload("/fonts/unbounded-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  ReactDOM.preload("/fonts/golos-text-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  // The panel speaks English and Russian: Cyrillic is loaded before the first Russian word.
  ReactDOM.preload("/fonts/unbounded-cyrillic.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  ReactDOM.preload("/fonts/golos-text-cyrillic.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
