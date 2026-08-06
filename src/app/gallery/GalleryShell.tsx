import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

/**
 * The gallery's own chrome, the same way learn has its own.
 *
 * A red full stop rather than learn's green — a sibling of the mozg wordmark,
 * not a clone of either. The product's TopBar and contents strip are wrong
 * here for the reason learn dropped them too: the person arriving is not a
 * developer looking for docs, and a nav full of "Connect a client" and "The
 * long guide" tells them they are in the wrong shop.
 *
 * The footer stays. One product, and the person who wants the licence terms or
 * the manifesto should find them where they always are.
 */
export default function GalleryShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header style={{ borderBottom: "1.5px solid var(--ink)", background: "var(--paper)" }}>
        <div
          className="shell"
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "1rem",
            paddingBlock: ".9rem",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="https://gallery.mozg.sh"
            className="wordmark"
            style={{ marginRight: 0, color: "var(--ink)" }}
          >
            gallery<span style={{ color: "var(--color-riso-red)" }}>.</span>
          </Link>
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
            a mozg service
          </span>
          <Link
            className="mono"
            href="https://mozg.sh/styles"
            style={{ marginLeft: "auto", fontSize: ".8125rem" }}
          >
            sell your style
          </Link>
          <Link className="mono" href="https://mozg.sh" style={{ fontSize: ".8125rem" }}>
            mozg.sh →
          </Link>
        </div>
      </header>
      {children}
      <SiteFooter />
    </>
  );
}
