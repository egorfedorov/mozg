import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

/**
 * The shapes this product repeats. Every one of these existed three or four
 * times as inline styles that had drifted apart; adding a page should not mean
 * inventing the spacing again.
 */

export function Section({
  id,
  title,
  aside,
  children,
}: {
  id?: string;
  title: string;
  /** Right-hand note in the heading row: a count, a link, a caveat. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="section">
      <div className="section-head">
        <h2 className="h2">{title}</h2>
        {aside && <span className="eyebrow">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="stats">{children}</div>;
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <span className="stat-value num">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

export function Row({
  title,
  sub,
  meta,
  side,
  state,
  href,
}: {
  title: ReactNode;
  /** Second line, in body text: the explanation. */
  sub?: ReactNode;
  /** Third line, monospaced: dates, counts, ids. */
  meta?: ReactNode;
  side?: ReactNode;
  state?: "unexplained" | "explained" | "changed" | "due" | "bug";
  href?: string;
}) {
  const inner = (
    <>
      <span style={{ minWidth: 0 }}>
        <strong>{title}</strong>
        {sub && <span className="row-sub">{sub}</span>}
        {meta && <span className="row-meta">{meta}</span>}
      </span>
      {side !== undefined && <span className="row-side">{side}</span>}
    </>
  );
  return href ? (
    <Link className="row" href={href} data-state={state}>
      {inner}
    </Link>
  ) : (
    <div className="row" data-state={state}>
      {inner}
    </div>
  );
}

/** A printed label for a fact: "local", "sample", "yours". */
export function Pill({ children, state, live }: { children: ReactNode; state?: string; live?: boolean }) {
  return (
    <span className="pill" data-live={live || undefined}>
      {state && <span className="dot" data-state={state} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** A sentence with its slot filled, for the small places JSX cannot reach. */
export function sentence(text: string, ...slots: (string | number)[]): string {
  return t(text).replace(/<(\d+)\/>/g, (_, i: string) => String(slots[Number(i)] ?? ""));
}
