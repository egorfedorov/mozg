/**
 * The MCP surface, as data plus handlers.
 *
 * The descriptions are prompt engineering, not documentation: each says when
 * an agent should reach for the tool, because a description that only
 * describes gets ignored. The replies are written for an agent to relay:
 * short, concrete, and ending in the call that comes next.
 */

import { buildDeskState, duration, pickNext, projectName, projectFor } from "@/core/desk";
import { indexAll } from "@/core/indexer";
import { newId, type Store } from "@/core/store";
import { hintsFor, readChangeText, renderChange } from "@/core/transcript";
import type { Change, DeskState, Explain, ModuleView, Verdict } from "@/core/types";

export interface Ctx {
  store: Store;
  now?: Date;
  /** The folder the agent is working in, when the client says. */
  cwd?: string | null;
  /** Start (or find) the local desk; wired in main so the tools stay testable. */
  desk?: (open: boolean) => Promise<string>;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>, ctx: Ctx): Promise<Outcome>;
}

export interface Outcome {
  text: string;
  isError?: boolean;
}

/** What grades an explain-back, as recorded on every verdict. */
export const EXAMINER = "mozg-examiner";

/** How long an incremental read may take before a tool answers anyway. */
export const REFRESH_MS = 1500;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const noArgs = { type: "object", properties: {}, additionalProperties: false } as const;
const list = (names: string[]) => (names.length ? names.join(", ") : "none");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const TOOLS: Tool[] = [
  {
    name: "mozg_status",
    description:
      "What the person can vouch for in the code their agent wrote today: the " +
      "ownership number, the streak, and which modules are worth explaining. " +
      "Call it when the user asks what they own or what their agent changed, " +
      "says 'status', or wraps up a working session. Cheap and local.",
    inputSchema: noArgs,
    async run(_args, ctx) {
      await refresh(ctx);
      const s = scope(ctx);
      return { text: s.hidden ? HIDDEN : statusText(s) };
    },
  },
  {
    name: "mozg_next",
    description:
      "Get the next change worth explaining: the riskiest recent agent edit in " +
      "the module with the most at stake, with its diff and where to aim the " +
      "question. Call it when the user says 'explain', has a minute between " +
      "tasks, or after a session that changed risky files. Then ask the user " +
      "ONE question about that change and WAIT for their answer. Never answer " +
      "the question for them and never hint: the point is to find out what they " +
      "understand.",
    inputSchema: noArgs,
    async run(_args, ctx) {
      await refresh(ctx);
      const s = scope(ctx);
      if (s.hidden) return { text: HIDDEN, isError: true };
      if (!s.project) {
        return { text: NO_CHANGES, isError: true };
      }
      const pick = pickNext(s.project, s.changes, s.explains, s.views, s.now);
      if (!pick) {
        return {
          text: `Nothing worth explaining right now in ${projectName(s.project)}. Every module the agent touched this week is explained and current.`,
        };
      }
      return { text: await nextText(pick.change, pick.view) };
    },
  },
  {
    name: "mozg_record",
    description:
      "Record the verdict of an explain-back: the question that was asked, what " +
      "the person answered, and what the examiner decided. Call it once per " +
      "explain-back, right after grading. Pass the examiner's verdict as given; " +
      "do not soften a 'not_yet'. If the act of explaining turned up a real " +
      "defect in the agent's change, set bug_found and say what it was.",
    inputSchema: {
      type: "object",
      properties: {
        change: { type: "string", description: "The change id from mozg_next." },
        question: { type: "string", description: "The question you asked, in one sentence." },
        answer: { type: "string", description: "What the person said, as they said it." },
        verdict: {
          type: "string",
          enum: ["explained", "partial", "not_yet"],
          description: "The examiner's verdict.",
        },
        why: { type: "string", description: "One sentence from the examiner on why." },
        evidence: { type: "string", description: "The lines of the change the verdict stands on, quoted." },
        lesson: { type: "string", description: "On a miss, the examiner's lesson: two or three plain sentences on what the answer was missing. Omit it on a pass." },
        bug_found: { type: "boolean", description: "True if explaining found a real defect." },
        bug_note: { type: "string", description: "What the defect is, in one sentence." },
      },
      required: ["change", "question", "answer", "verdict", "why"],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const change = ctx.store.changes.find((c) => c.id === str(args.change));
      const verdict = str(args.verdict) as Verdict;
      const bad = (text: string): Outcome => ({ text, isError: true });

      if (!change) return bad("No change with that id. Call mozg_next for a current one.");
      if (ctx.store.settings.hidden.includes(change.project)) return bad(HIDDEN);
      if (!VERDICTS.includes(verdict)) return bad("verdict must be explained, partial or not_yet.");
      if (!str(args.question) || !str(args.answer)) {
        return bad("A record needs the question and the person's answer, in their words.");
      }
      // An agent in a hurry will record "ok" or "yes" to be done with it. An
      // answer that short cannot have been graded against anything.
      if (str(args.answer).length < 8) {
        return bad("That answer is too short to grade. Ask the question again and record what the person actually says.");
      }

      const explain: Explain = {
        id: newId(),
        change: change.id,
        project: change.project,
        module: change.module,
        question: str(args.question).slice(0, 1000),
        answer: str(args.answer).slice(0, 4000),
        verdict,
        why: str(args.why).slice(0, 1000),
        evidence: str(args.evidence).slice(0, 2000) || null,
        lesson: verdict === "explained" ? null : str(args.lesson).slice(0, 1000) || null,
        bug: args.bug_found === true ? { found: true, note: str(args.bug_note).slice(0, 1000) } : null,
        at: (ctx.now ?? new Date()).toISOString(),
        examiner: EXAMINER,
      };
      await ctx.store.addExplain(explain);
      return { text: recordedText(explain, scope(ctx)) };
    },
  },
  {
    name: "mozg_map",
    description:
      "The ownership map: every module the agent touched, whether the person " +
      "has explained it, and whether mozg asks before an edit there or adds no " +
      "prompt of its own. Call it " +
      "when the user asks 'what don't I understand', 'where are my blind " +
      "spots', or wants the whole picture rather than one change.",
    inputSchema: noArgs,
    async run(_args, ctx) {
      await refresh(ctx);
      const s = scope(ctx);
      return { text: s.hidden ? HIDDEN : s.project ? mapText(s) : NO_CHANGES };
    },
  },
  {
    name: "mozg_desk",
    description:
      "Open the local desk: a page on this machine with the ownership score, " +
      "the map and the feed. Call it when the user wants to see mozg rather " +
      "than hear about it. Nothing leaves the machine.",
    inputSchema: {
      type: "object",
      properties: { open: { type: "boolean", description: "Also open it in the browser. Default true." } },
      additionalProperties: false,
    },
    async run(args, ctx) {
      if (!ctx.desk) return { text: "The desk is not available in this build.", isError: true };
      const url = await ctx.desk(args.open !== false);
      return { text: `The desk is running at ${url} — local only, on 127.0.0.1.` };
    },
  },
];

const VERDICTS: Verdict[] = ["explained", "partial", "not_yet"];
const NO_CHANGES =
  "mozg has not seen any agent changes on this machine yet. It reads Claude Code " +
  "session logs locally; after one session that edits files there will be numbers here.";
const HIDDEN =
  "This project is hidden on the mozg desk, so mozg has nothing to say about it. " +
  "Show it again under Connection and settings on the desk to pick it back up.";

export function toolByName(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** What the tools see of the store, scoped to the project the agent is in. */
interface Scope {
  now: Date;
  /** The agent is in a project the person took off the desk. */
  hidden: boolean;
  /** Whether the person has the asking on: off, and no module is asked about, whatever its state. */
  asks: boolean;
  project: string | null;
  changes: Change[];
  explains: Explain[];
  views: ModuleView[];
  state: DeskState;
}

function scope(ctx: Ctx): Scope {
  const now = ctx.now ?? new Date();
  const all = ctx.store.changes;
  const hidden = ctx.store.settings.hidden;
  const holding = projectFor(ctx.cwd ?? null, all);

  // A project the person took off the desk is not spoken about: neither its
  // numbers nor another project's in its place.
  if (holding && hidden.includes(holding)) {
    return { now, hidden: true, asks: true, project: null, changes: [], explains: [], views: [], state: buildDeskState({ changes: [], explains: [], now }) };
  }

  const explains = ctx.store.explains;
  const state = buildDeskState({ changes: all, explains, now, project: holding, hidden });
  const changes = state.project ? all.filter((c) => c.project === state.project) : [];
  return { now, hidden: false, asks: ctx.store.settings.asks, project: state.project, changes, explains, views: state.modules, state };
}

/** A short incremental read, so the answer includes the session that just ran. */
async function refresh(ctx: Ctx): Promise<void> {
  if (!ctx.store.dir) return;
  await indexAll(ctx.store, { budgetMs: REFRESH_MS });
}

// ─── the replies ────────────────────────────────────────────────────────────

function statusText(s: Scope): string {
  if (!s.project) return NO_CHANGES;
  const t = s.state.today;
  const lines = [
    `mozg · ${projectName(s.project)}`,
    t.ownership === null
      ? "Ownership today: nothing to own yet. The agent has not changed a file today."
      : `Ownership today: ${t.ownership}%. ${t.modulesOwned} of the ${t.modulesTouched} modules the agent touched are yours.`,
    t.changes
      ? `Agent changes today: ${plural(t.changes, "change")} (${t.lines} lines)${t.words ? `, ${plural(t.words, "of them in words only")} and not counted` : ""}. ${t.unattended} went ahead with nobody asked; ${t.approved} a person approved.`
      : "Agent changes today: none.",
    `Streak: ${plural(s.state.streak.days, "day")} with an explain-back, best ${s.state.streak.best}. Bugs found by explaining: ${s.state.streak.bugsFound}.`,
  ];
  if (s.state.week.free || s.state.week.guarded) {
    lines.push(
      `This week: ${plural(s.state.week.free, "agent edit")} in modules that are yours, and you were asked for none of them` +
        (s.state.week.guarded ? `; ${plural(s.state.week.guarded, "edit")} in modules to explain.` : "."),
    );
  }
  const worth = s.views.filter((v) => v.state === "unexplained" || v.state === "changed" || v.state === "due").map((v) => v.module);
  lines.push(worth.length ? `Worth explaining (${worth.length}): ${list(worth.slice(0, 8))}.` : "Nothing is waiting on an explain-back.");
  if (s.state.brain.length) {
    lines.push("The brain says:");
    for (const b of s.state.brain) lines.push(`  ${b.tone === "warn" ? "!" : "✓"} ${b.text}`);
  }
  lines.push(
    worth.length
      ? "When the user says 'explain' or has a minute, call mozg_next and ask the question it gives you."
      : "Nothing to do for now. Call mozg_status again after the agent changes something.",
  );
  return lines.join("\n");
}

async function nextText(change: Change, view: ModuleView): Promise<string> {
  const how =
    change.approvedBy === "auto"
      ? "it went ahead with nobody asked"
      : change.approvedBy === "user"
        ? `the person approved it in ${duration(change.goAheadMs)}`
        : `it went ahead in ${duration(change.goAheadMs)}`;
  const stood =
    view.state === "due"
      ? "explained before; due for a re-check"
      : view.state === "changed"
        ? "was explained once; the agent has rewritten it since"
        : "never explained";

  let rendered = "";
  let lost = false;
  try {
    const text = await readChangeText(change);
    rendered = text ? renderChange(text) : "";
    lost = !text;
  } catch {
    lost = true;
  }

  return [
    `Explain-back · change ${change.id}`,
    `File: ${change.file} (module ${change.module}) · ${change.added + change.removed} lines · ${how}`,
    // Always a reason, or the agent is asked to find one: the risks, or, for a change
    // that carries none, the fact that it is what is left.
    `Worth a question because: ${change.risks.length ? change.risks.join(", ") : "it is the largest change left in a module you have not explained"}`,
    `This module: ${stood}.`,
    lost ? "The log line holding this change's text is gone, so the diff cannot be shown. Ask from the path and the size." : null,
    rendered ? `<change>\n${rendered}\n</change>` : null,
    "Ask the user ONE question about this change, in your own words, and wait for the answer. " +
      "Do not answer it, do not hint, and do not explain the code first. Aim it at: " +
      hintsFor(change, rendered).join("; ") +
      `. When they answer, hand the change, the question and the answer to the ${EXAMINER} subagent, ` +
      "and record its verdict with mozg_record.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");
}

/**
 * The score after a record, and, when a pass did not move it, why. The score
 * is today's: a change explained from an earlier day makes its module the
 * person's, and counts from the agent's next edit there. Said plainly, or the
 * number reads as if the pass was for nothing.
 */
function scoreLine(explain: Explain, s: Scope): string {
  const today = s.state.today;
  if (today.ownership === null) return "Ownership today: nothing to own yet. The agent has not changed a file today.";
  const view = s.views.find((v) => v.module === explain.module);
  if (explain.verdict !== "explained" || view?.todayLines) return `Ownership today: ${today.ownership}%.`;
  const free = s.state.week.free;
  return (
    `Ownership today: ${today.ownership}%. None of today's changes are in ${explain.module}, so the number does not move yet: it counts from the agent's next edit there.` +
    (free ? `\nThis week: ${plural(free, "agent edit")} in modules that are yours, and the person was asked for none of them.` : "")
  );
}

function recordedText(explain: Explain, s: Scope): string {
  const pass = explain.verdict === "explained";
  const lines = [`Recorded: ${explain.verdict}.`];
  if (pass) lines.push(`${explain.module} is yours now.`);
  else {
    // A miss is taught once: the same question, one more answer. A second miss
    // on the same change ends the round, because teaching twice is a lecture.
    const taughtBefore = s.explains.some((e) => e.change === explain.change && e.id !== explain.id && e.verdict !== "explained");
    if (!taughtBefore) {
      lines.push(
        explain.verdict === "partial"
          ? "Close: a load-bearing part is missing. Nothing is lost."
          : "Not yet. Nothing is lost: the module stays on the list.",
      );
      lines.push(
        "Now teach, once. Tell the user what the answer was missing in two or three plain sentences, in your own words" +
          (explain.lesson ? " (the examiner's lesson is on record)" : "") +
          ", without judging them. Then ask the SAME question again, and record the new answer and verdict with mozg_record.",
      );
      lines.push(scoreLine(explain, s));
      if (explain.bug?.found) lines.push(`Bug recorded: ${explain.bug.note}`);
      return lines.join("\n");
    }
    lines.push("Still not there. That is enough on this one for today: the module stays on the list, and it will be offered again.");
  }
  lines.push(scoreLine(explain, s));
  if (explain.bug?.found) lines.push(`Bug recorded: ${explain.bug.note}`);

  const pick = s.project ? pickNext(s.project, s.changes, s.explains, s.views, s.now) : null;
  const rest = s.views.filter((v) => v.state === "unexplained" || v.state === "changed" || v.state === "due").map((v) => v.module);
  lines.push(pick ? `Still worth explaining: ${list(rest.slice(0, 6))}. Call mozg_next for the next one.` : "Nothing else is waiting on an explain-back.");
  return lines.join("\n");
}

function mapText(s: Scope): string {
  const pad = (text: string, width: number) => text.padEnd(width);
  // The asking is the desk's setting as well as the module's state: switched
  // off, no row says "asks", or the agent would tell the person to expect
  // a prompt that never comes.
  const asksAbout = (v: ModuleView): boolean => s.asks && v.mode === "ask";
  const rows = s.views.map((v) => {
    const when = v.lastExplainedAt
      ? `explained ${daysAgo(v.lastExplainedAt, s.now)}`
      : "never explained";
    return `${pad(v.module, 28)} ${pad(v.state, 12)} ${asksAbout(v) ? "asks     " : "runs free"} ${plural(v.lines, "line")}, ${when}`;
  });
  const asking = s.views.filter(asksAbout).map((v) => v.module);
  return [
    `Ownership map · ${projectName(s.project ?? "")}`,
    ...rows,
    "",
    // Said exactly: mozg asks, through Claude Code's own permission prompt, and
    // where it does not, the session's permission settings still apply.
    "Where it asks, the agent's first edit of a session there is put to the person first, through Claude Code's own permission prompt. Where it runs free, mozg adds no prompt of its own, and the session's permission settings apply.",
    !s.asks
      ? "Asking is switched off on the desk, so it runs free everywhere. The person can switch it on under Connection and settings."
      : asking.length
        ? `Asks in: ${list(asking)}.`
        : "It asks nowhere: every touched module is explained.",
  ].join("\n");
}

function daysAgo(iso: string, now: Date): string {
  const days = Math.round((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  return `${plural(days, "day")} ago`;
}
