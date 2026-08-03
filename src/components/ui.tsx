import Link from "next/link";

/**
 * The shapes this product repeats. Every one of these existed three or four
 * times as inline styles that had drifted apart — a row was .7rem tall on one
 * page and .9rem on the next. Adding a page should not mean inventing the
 * spacing again.
 */

export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  /** Right-hand note in the heading row: a count, a link, a caveat. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="section-head">
        <h2 className="h2">{title}</h2>
        {aside && <span className="eyebrow">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Stats({ children }: { children: React.ReactNode }) {
  return <div className="stats">{children}</div>;
}

export function Stat({
  label,
  value,
  note,
  href,
  big,
  dot,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
  big?: boolean;
  /** Health state, when the number is really a status. */
  dot?: "ok" | "down" | "idle";
}) {
  const body = (
    <>
      <span className="eyebrow">{label}</span>
      <span className="stat-value" data-big={big || undefined}>
        {dot && <span className="dot" data-state={dot} />}
        {value}
      </span>
      {note && <span className="stat-note">{note}</span>}
    </>
  );

  return href ? (
    <Link className="stat" href={href}>
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}

export function Rows({
  children,
  empty,
}: {
  children?: React.ReactNode;
  /** Shown instead of the rows when there are none. Always say what would
      put something here — an empty list is a prompt, not a dead end. */
  empty?: React.ReactNode;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);
  return (
    <div className="rows">
      {isEmpty ? <p className="row-empty">{empty}</p> : children}
    </div>
  );
}

export function Row({
  title,
  sub,
  meta,
  side,
  sign,
  tint,
  href,
}: {
  title: React.ReactNode;
  /** Second line, in body text — the explanation. */
  sub?: React.ReactNode;
  /** Third line, monospaced — dates, counts, ids. */
  meta?: React.ReactNode;
  side?: React.ReactNode;
  sign?: "up";
  tint?: "red" | "blue" | "green" | "violet" | "orange";
  href?: string;
}) {
  const inner = (
    <>
      <span style={{ minWidth: 0 }}>
        <strong>{title}</strong>
        {sub && <span className="row-sub">{sub}</span>}
        {meta && <span className="row-meta">{meta}</span>}
      </span>
      {side !== undefined && (
        <span className="row-side" data-sign={sign}>
          {side}
        </span>
      )}
    </>
  );

  return href ? (
    <Link className="row" href={href} data-tint={tint}>
      {inner}
    </Link>
  ) : (
    <div className="row" data-tint={tint}>
      {inner}
    </div>
  );
}

/** A filter as a link — a filtered view should be a URL you can send someone. */
export function Chip({
  href,
  on,
  count,
  title,
  children,
}: {
  href: string;
  on?: boolean;
  count?: number;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link className="chip" href={href} data-on={on} title={title}>
      {children}
      {count !== undefined && count > 0 && <span className="chip-count"> {count}</span>}
    </Link>
  );
}
