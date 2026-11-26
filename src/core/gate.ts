/**
 * The gate: whether an edit about to happen is put to the person first.
 *
 * This is where "the agent earns its freedom" stops being a sentence on a
 * desk. A module the person has explained is theirs, and the agent works
 * there on its own. One they have not, the first edit of a session stops and
 * asks. It asks once per module per session: the point is that nobody's agent
 * rewrites a payment flow unasked, not that a person clicks twenty times.
 *
 * The decision is pure. The hook around it (hooks/hooks.ts) does the reading,
 * and it never lets a failure stop an edit.
 */

import { resolve } from "node:path";
import { count, fill, sentences, t } from "@/lib/i18n";
import { displayPath, isWords, moduleOf } from "./change";
import { projectFor } from "./desk";
import { moduleViews } from "./ownership";
import type { Change, Explain, ModuleView, Settings } from "./types";

/**
 * Permission modes in which a prompt would reach nobody. There the gate says
 * nothing: it cannot ask, and the change is counted as having gone ahead
 * unasked, which is what happened.
 */
export const NOBODY_TO_ASK = new Set(["bypassPermissions", "dontAsk"]);

export interface GateInput {
  /** The file the tool is about to change, as the tool was given it. */
  file: string;
  cwd: string;
  session: string;
  permissionMode?: string | null;
}

/** What the gate needs to know, all of it already in the store. */
export interface GateFacts {
  changes: Change[];
  explains: Explain[];
  settings: Settings;
  /** When this session last asked about a module, if it did. */
  askedAt(session: string, module: string): string | null;
}

export type GateVerdict =
  | { kind: "pass" }
  | {
      kind: "ask";
      module: string;
      /** Why this module is not the person's. */
      why: string;
      /** What approving does, and how to make the module theirs. */
      next: string;
      /** `why` and `next` in one line: what the permission prompt shows. */
      reason: string;
    };

const PASS: GateVerdict = { kind: "pass" };

export function decideGate(input: GateInput, facts: GateFacts, now: Date): GateVerdict {
  if (!facts.settings.asks) return PASS;
  if (input.permissionMode && NOBODY_TO_ASK.has(input.permissionMode)) return PASS;

  const cwd = input.cwd.replace(/\/+$/, "");
  // The project the agent is in, as mozg names projects; if mozg has never
  // seen it, the folder itself, and every module in it is unexplained.
  const project = projectFor(cwd, facts.changes) ?? cwd;
  if (facts.settings.hidden.includes(project)) return PASS;

  const shown = displayPath(resolve(cwd || ".", input.file), project);
  // Outside the project mozg keeps no map, and so says nothing.
  if (shown.startsWith("/") || shown.startsWith("~/")) return PASS;
  // A README is not put to the person: nobody's agent rewrote a payment flow
  // in one.
  if (isWords(shown)) return PASS;
  const part = moduleOf(shown);

  const view = moduleViews(project, facts.changes, facts.explains, now).find((v) => v.module === part);
  if (view?.mode === "free") return PASS;
  // Asked once this session already: a second prompt would be nagging.
  if (facts.askedAt(input.session, part)) return PASS;
  return { kind: "ask", module: part, ...reasonFor(view, part) };
}

/** What the person reads in the permission prompt. Said once, plainly. */
function reasonFor(view: ModuleView | undefined, part: string): { why: string; next: string; reason: string } {
  // Each sentence carries its number in a slot of its own, so that a language
  // puts the number where it wants it, in its own forms. In pieces, a language
  // that writes no spaces between words came out with gaps, and one that
  // counts with a word of its own came out saying it twice.
  const why = !view
    ? fill(t("<0/> has never been changed here, and nobody has explained it."), [part])
    : view.state === "changed"
      ? fill(t("<0/> was yours, but the agent has changed <1/> there since you explained it."), [
          part,
          count(view.sinceExplained, "<0/> line", "<0/> lines"),
        ])
      : fill(t("<0/> is not explained yet: <1/> by the agent, none talked through."), [
          part,
          count(view.changes, "<0/> change", "<0/> changes"),
        ]);
  const next = t("Approve to let this one through. A one-minute explain-back makes the module yours, and mozg asks once per session.");
  return { why, next, reason: sentences(t("mozg asks before this change."), why, next) };
}
