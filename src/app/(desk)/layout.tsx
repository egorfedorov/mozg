import ReactDOM from "react-dom";
import "../fonts.css";
import "../globals.css";

/**
 * The root of the local desk. Its own, and apart from the site's: the desk has
 * no site header or footer, and is never offered in a search index.
 */
export default function DeskRoot({ children }: { children: React.ReactNode }) {
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
