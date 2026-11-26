import { msg, t } from "@/lib/i18n";

/**
 * The parts of the desk, in the order a person comes to them: what today
 * looks like, what is theirs module by module, what happened, what was
 * explained, and how it is set up.
 *
 * A part is named in the address (`#modules`), so it can be kept, sent and
 * come back to. The landing shows the same five on a sample session.
 */
export const VIEWS = [
  { id: "today", label: msg("Today") },
  { id: "modules", label: msg("Modules") },
  { id: "activity", label: msg("Activity") },
  { id: "history", label: msg("History") },
  { id: "settings", label: msg("Settings") },
] as const;

export type View = (typeof VIEWS)[number]["id"];

/** The part the address names, and today's when it names none that there is. */
export function viewOf(hash: string): View {
  const id = hash.replace(/^#/, "");
  return VIEWS.find((item) => item.id === id)?.id ?? "today";
}

/**
 * The way from one part of the desk to another.
 *
 * On the desk each is a link to its part. On the landing they are the same
 * five, standing still: a picture of a desk, not a way around the site.
 */
export function DeskNav({
  view,
  counts,
  standing = false,
  className = "",
}: {
  view: View;
  /** What is waiting in a part, where a number says it better than a mark. */
  counts?: Partial<Record<View, number>>;
  /** The landing's picture: the parts are named, and go nowhere. */
  standing?: boolean;
  className?: string;
}) {
  return (
    <nav className={`desk-nav ${className}`.trim()} aria-label={t("Your desk")} aria-hidden={standing || undefined}>
      <ul>
        {VIEWS.map((item) => {
          const count = counts?.[item.id] ?? 0;
          const on = view === item.id;
          const label = t(item.label);
          return (
            <li key={item.id}>
              {standing ? (
                <span className="nav-part" data-on={on || undefined}>
                  {label}
                  {count > 0 && <span className="nav-count">{count}</span>}
                </span>
              ) : (
                <a className="nav-part" href={`#${item.id}`} aria-current={on ? "page" : undefined}>
                  {label}
                  {count > 0 && (
                    <span className="nav-count" data-attention={item.id === "modules" ? "true" : undefined}>
                      {count}
                    </span>
                  )}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
