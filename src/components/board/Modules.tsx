import type { ReactNode } from "react";
import type { ModuleView } from "@/core/types";
import { breakable } from "@/lib/text";
import { count, fill, msg, t } from "@/lib/i18n";

/** What a module is to the person, in a word or two. */
export const MODULE_STATE: Record<ModuleView["state"], string> = {
  idle: msg("Not touched"),
  unexplained: msg("Not explained"),
  explained: msg("Yours"),
  due: msg("Re-check due"),
  changed: msg("Changed since"),
};

export type ModuleFilter = "all" | "explain" | "yours" | "due";

/** The few ways of looking at the list. Each says how many it holds. */
export const MODULE_FILTERS: { id: ModuleFilter; label: string; takes: (m: ModuleView) => boolean }[] = [
  { id: "all", label: msg("All"), takes: (m) => m.state !== "idle" },
  { id: "explain", label: msg("To explain"), takes: (m) => m.state === "unexplained" || m.state === "changed" },
  { id: "yours", label: msg("Yours"), takes: (m) => m.state === "explained" },
  { id: "due", label: msg("Re-check due"), takes: (m) => m.state === "due" },
];

/** What the list says when a way of looking at it holds nothing. */
export const NOTHING: Record<ModuleFilter, string> = {
  all: msg("Nothing to rule on yet."),
  explain: msg("Everything the agent touched today is yours."),
  yours: msg("None yet. Say 'explain' to your agent in Claude Code: one question, about a minute."),
  due: msg("Nothing left to explain."),
};

/** Who let today's changes through, as far as the log says. */
function whoLet(m: ModuleView): string {
  if (m.todayUnattended && !m.todayApproved) return fill(t("Nobody was asked, <0/>."), [count(m.todayUnattended, "once", "<0/> times")]);
  if (m.todayApproved) return t("You approved <0/> of them.").replace("<0/>", String(m.todayApproved));
  return t("The log does not say how these went ahead.");
}

/**
 * The modules, one row each: what it is to the person, how much the agent
 * changed there and who let it through, what the agent does there now, and
 * the way to make it yours.
 *
 * The map, the rules and "what is not yours" were three lists of the same
 * modules. This is the one list, and it says why each row is as it is.
 */
/**
 * `asks` is the desk's setting. Off, and no row says "ask first": the rule
 * follows from the state, and the setting is what switches it off.
 */
export function ModuleRows({ modules, empty, renderAction, asks = true }: { modules: ModuleView[]; empty: string; renderAction: (m: ModuleView) => ReactNode; asks?: boolean }) {
  return (
    <div className="rows mod-rows">
      {modules.map((m) => (
        <div key={m.module} className="row mod-row" data-state={m.state}>
          <span className="mod-main">
            <strong className="mod-name">{breakable(m.module)}</strong>
            <span className="row-sub">
              {m.todayLines
                ? `${count(m.todayLines, "<0/> line today.", "<0/> lines today.")} ${whoLet(m)}`
                : count(m.lines, "<0/> line in all", "<0/> lines in all")}
            </span>
          </span>
          <span className="mod-side">
            <span className="tag">{t(MODULE_STATE[m.state])}</span>
            {/* A rule, not a switch: it follows from the state, and the desk's setting changes it. */}
            <span className="tag tag-rule">{t(asks && m.mode === "ask" ? msg("Ask first") : msg("Runs free"))}</span>
          </span>
          {renderAction(m)}
        </div>
      ))}
      {!modules.length && <p className="row-empty row-empty-in">{empty}</p>}
    </div>
  );
}
