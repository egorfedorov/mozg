/**
 * The three hooks: session start, session end, and the gate before an edit.
 *
 * All must be fast and must never break a session. Everything here is wrapped
 * by the caller so that a failure exits 0 and says nothing.
 *
 * The gate is where the agent earns its freedom: an edit in a module the
 * person has not explained is put to them first, by Claude Code's own
 * permission prompt. The decision itself is core/gate.ts.
 *
 * Session end is where the loop closes: the session's own log is read from
 * where it was left off, and if it left changes in modules the person has not
 * explained, the person is told. It fires at the end of every turn, not only
 * when the session ends, so it keeps quiet unless there is a real backlog and
 * at most once in a while per session.
 */

import { stat } from "node:fs/promises";
// By their own names: the language check finds the sentences it has to lay out
// for a translation by them.
import { count, fill, sentences, t } from "@/lib/i18n";
import { buildDeskState, projectFor } from "@/core/desk";
import { decideGate } from "@/core/gate";
import { indexAll, indexFile } from "@/core/indexer";
import { moduleViews } from "@/core/ownership";
import type { Store } from "@/core/store";
import type { ModuleView } from "@/core/types";

export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  /** True when the session is already continuing because a stop hook asked. */
  stop_hook_active?: boolean;
  source?: string;
  /** Of a PreToolUse hook: the tool and what it was given. */
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  permission_mode?: string;
}

export interface HookDeps {
  store: Store;
  now?: Date;
  /** Read every older log in the background; the hook itself stays quick. */
  indexInBackground?: () => void;
}

/**
 * A turn that touched one unexplained module is already worth a sentence; the
 * limit on noise is how often a session is told, not how much has piled up.
 */
export const NUDGE_MIN_CHANGES = 1;
/** A session is nudged at most this often. */
export const NUDGE_EVERY_MS = 20 * 60_000;
/** A full read is started in the background at most this often. */
const BACKGROUND_EVERY_MS = 30 * 60_000;
/** The gate runs before every edit, so it reads at most this much of the session's own new lines. */
const GATE_READ_MAX = 8 * 1024 * 1024;
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);
/** The hook's own read is capped so the session start is never delayed. */
const QUICK_MS = 700;

/** What a hook prints: one JSON object, or nothing. */
export type HookOutput = Record<string, unknown>;

/**
 * A line for the agent at the start of a session: what is worth explaining in
 * this project, so it knows mozg exists and what to do when the user asks.
 */
export async function onSessionStart(input: HookInput, deps: HookDeps): Promise<HookOutput | null> {
  const now = deps.now ?? new Date();
  if (deps.store.dir) {
    const last = deps.store.lastIndexedAt ? Date.parse(deps.store.lastIndexedAt) : 0;
    // The first ever start, or a long gap: the past is read elsewhere.
    if (!deps.store.changes.length || now.getTime() - last > BACKGROUND_EVERY_MS) {
      deps.indexInBackground?.();
    }
    await indexAll(deps.store, { budgetMs: QUICK_MS });
  }

  // Speak only for the project the agent is in. A folder mozg has nothing on
  // does not get another project's numbers in its place, and a project the
  // person took off the desk is not brought up at all.
  const project = projectFor(input.cwd ?? null, deps.store.changes);
  if (deps.store.changes.length && (!project || deps.store.settings.hidden.includes(project))) return null;

  const state = buildDeskState({
    changes: deps.store.changes,
    explains: deps.store.explains,
    now,
    project,
    hidden: deps.store.settings.hidden,
  });
  let context: string;
  if (!state.project) {
    context =
      "[mozg] Installed and watching Claude Code session logs locally. Nothing recorded yet; " +
      "call mozg_status after the agent has edited files.";
  } else {
    const worth = state.modules
      .filter((m) => m.state === "unexplained" || m.state === "changed" || m.state === "due")
      .map((m) => m.module);
    const owned = state.today.ownership === null ? "nothing to own yet today" : `ownership today ${state.today.ownership}%`;
    context =
      `[mozg] ${owned}; streak ${state.streak.days} day${state.streak.days === 1 ? "" : "s"}. ` +
      (worth.length
        ? `Worth explaining: ${worth.slice(0, 5).join(", ")}. `
        : "Nothing is waiting on an explain-back. ") +
      "If the user asks what they own or says 'explain', call mozg_status or mozg_next. " +
      "Do not bring it up unprompted.";
  }
  return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } };
}

/**
 * The nudge at the end of a turn, when the session left changes nobody can
 * vouch for.
 *
 *   gentle  a message to the person
 *   firm    the same, and the agent is asked to offer the explain-back before
 *           it stops; once per turn, never when it is already continuing
 *   off     nothing
 */
export async function onStop(input: HookInput, deps: HookDeps): Promise<HookOutput | null> {
  const now = deps.now ?? new Date();
  const store = deps.store;
  const nudge = store.settings.nudge;
  if (nudge === "off" || !store.dir || !input.transcript_path) return null;

  try {
    await indexFile(store, input.transcript_path);
  } catch {
    return null;
  }

  const session = input.session_id ?? "";
  // Words are nobody's to explain: a README the agent rewrote is not a change to mention.
  const mine = store.changes.filter((c) => c.weight > 0 && (!session || c.session === session));
  const project = mine[0]?.project ?? input.cwd ?? null;
  // A project the person took off the desk is not nudged about either.
  if (!project || store.settings.hidden.includes(project)) return null;

  const views = moduleViews(project, store.changes, store.explains, now);
  const waiting = new Map<string, ModuleView>();
  for (const change of mine) {
    const view = views.find((v) => v.module === change.module);
    if (view && (view.state === "unexplained" || view.state === "changed" || view.state === "due")) {
      waiting.set(change.module, view);
    }
  }
  // Only what the session did since the module was last explained. A change
  // the person already talked through is theirs, and counting it would tell
  // them they have work they have already done.
  const left = mine.filter((c) => {
    const view = waiting.get(c.module);
    return view && (!view.lastExplainedAt || c.at > view.lastExplainedAt);
  }).length;
  if (!left) return null;

  const last = store.nudgeAt(session);
  if (last && now.getTime() - Date.parse(last) < NUDGE_EVERY_MS) return null;

  await store.markNudged(session, now.toISOString());
  // The module the session changed most comes first: beyond three, only the
  // first three are named.
  const since = (module: string): number => mine.filter((c) => c.module === module && c.at > (waiting.get(module)?.lastExplainedAt ?? "")).length;
  const modules = [...waiting.keys()].sort((a, b) => since(b) - since(a));
  const shown = modules.slice(0, 3).join(", ") + (modules.length > 3 ? `, +${modules.length - 3} more` : "");
  // Read by the person, at the end of their own turn: in their language. The
  // number picks its sentence, and the module names go where it leaves room.
  const message = sentences(
    `mozg: ${fill(
      count(left, "<0/> change in <1/> went into modules you have not explained.", "<0/> changes in <1/> went into modules you have not explained."),
      [String(left), shown],
    )}`,
    t("A one-minute explain-back makes them yours."),
  );

  if (nudge === "firm" && !input.stop_hook_active) {
    return {
      decision: "block",
      reason:
        "Before you stop: the session left changes in modules the user has not explained. " +
        "Offer a 60-second explain-back in one sentence (call mozg_next, ask the single question it gives you, " +
        "wait for the answer). If the user declines or has no time, stop without asking again.",
      systemMessage: message,
    };
  }
  return { systemMessage: sentences(message, t("Say 'explain' when you have a minute.")) };
}

/**
 * Before the agent changes a file: is this module the person's? If not, the
 * edit is put to them. Nothing is returned when it is, or when there is nobody
 * to ask, so an explained module costs no prompt at all.
 */
export async function onBeforeEdit(input: HookInput, deps: HookDeps): Promise<HookOutput | null> {
  const store = deps.store;
  if (!input.tool_name || !EDIT_TOOLS.has(input.tool_name) || !store.dir) return null;
  const given = input.tool_input ?? {};
  const file = typeof given.file_path === "string" ? given.file_path : typeof given.notebook_path === "string" ? given.notebook_path : "";
  const session = input.session_id ?? "";
  if (!file || !input.cwd || !session) return null;
  const now = deps.now ?? new Date();

  try {
    // The session's own earlier edits are part of whether a module is still
    // explained, and nobody has read them into the store yet at this moment.
    if (input.transcript_path) {
      const size = (await stat(input.transcript_path).catch(() => null))?.size ?? 0;
      if (size - (store.mark(input.transcript_path)?.offset ?? 0) <= GATE_READ_MAX) await indexFile(store, input.transcript_path);
    }
    const verdict = decideGate({ file, cwd: input.cwd, session, permissionMode: input.permission_mode }, store, now);
    if (verdict.kind !== "ask") return null;
    await store.markAsked(session, verdict.module, now.toISOString());
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: verdict.reason,
      },
    };
  } catch {
    // Whatever went wrong, the edit is not mozg's to stop.
    return null;
  }
}
