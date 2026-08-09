import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

/**
 * The learn service's chrome: its own masthead (green full stop — a sibling
 * of the mozg wordmark, not a clone) over the same paper, rules and footer
 * as the rest of the product. One style, two services.
 */
export default async function LearnShell({ children }: { children: React.ReactNode }) {
  const t = await translator();

  return (
    <>
      <header style={{ borderBottom: "1.5px solid var(--ink)", background: "var(--paper)" }}>
        <div className="shell" style={{ display: "flex", alignItems: "baseline", gap: "1rem", paddingBlock: ".9rem" }}>
          <Link href="https://learn.mozg.sh" className="wordmark" style={{ marginRight: 0, color: "var(--ink)" }}>
            {markup(t("learn<0>.</0>"), [
            <span style={{ color: "var(--color-riso-green)" }} key="s0" />,
          ])}</Link>
          <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
            {t("a mozg service")}</span>
          <Link className="mono" href="https://mozg.sh/explore" style={{ marginLeft: "auto", fontSize: ".8125rem" }}>
            {t("catalogue")}</Link>
          <Link className="mono" href="https://mozg.sh" style={{ fontSize: ".8125rem" }}>
            {t("mozg.sh →")}</Link>
        </div>
      </header>
      {children}
      <SiteFooter />
    </>
  );
}
