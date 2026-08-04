import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

/**
 * The learn service's chrome: its own masthead (green full stop — a sibling
 * of the mozg wordmark, not a clone) over the same paper, rules and footer
 * as the rest of the product. One style, two services.
 */
export default function LearnShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header style={{ borderBottom: "1.5px solid var(--ink)", background: "var(--paper)" }}>
        <div className="shell" style={{ display: "flex", alignItems: "baseline", gap: "1rem", paddingBlock: ".9rem" }}>
          <Link href="/learn" style={{ fontWeight: 800, fontSize: "1.25rem", letterSpacing: "-0.02em", color: "var(--ink)" }}>
            learn<span style={{ color: "var(--color-riso-green)" }}>.</span>
          </Link>
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
            a mozg service
          </span>
          <Link className="mono" href="/explore" style={{ marginLeft: "auto", fontSize: ".8125rem" }}>
            catalogue
          </Link>
          <Link className="mono" href="/" style={{ fontSize: ".8125rem" }}>
            mozg.sh →
          </Link>
        </div>
      </header>
      {children}
      <SiteFooter />
    </>
  );
}
