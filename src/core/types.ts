/** The shapes everything else passes around. Pure data: no Node, no React. */

export type Risk =
  | "migration"
  | "schema"
  | "auth"
  | "payments"
  | "config"
  | "tests"
  | "size"
  /** Only words: a README, a licence, a changelog. Noted, and counted for nothing. */
  | "docs";

/**
 * The ladder of a module.
 *
 *   idle         the agent has not touched it
 *   unexplained  it has been touched and never explained
 *   explained    explained, and the agent has not been back since
 *   due          explained, and the re-check is due
 *   changed      explained once, and the agent has rewritten enough since
 */
export type ModuleState = "idle" | "unexplained" | "explained" | "due" | "changed";

export type Verdict = "explained" | "partial" | "not_yet";

import type { Lang } from "@/lib/i18n";

/** What the agent is allowed to do in a module. */
export type AgentMode = "ask" | "free";

export type FeedState =
  | "unexplained"
  | "explained"
  | "changed"
  | "due"
  | "bug"
  | "info";

/** One file-changing call a coding agent made, and what it did. */
export interface Change {
  /** Stable across re-reads: a hash of the session and the tool call. */
  id: string;
  /** The tool call's own id, to find it again in the log. */
  toolUseId: string;
  session: string;
  /** Absolute working directory the agent ran in. */
  project: string;
  /** Relative to the project when the file is inside it. */
  file: string;
  /** The unit a person explains once: a folder, roughly. */
  module: string;
  tool: "edit" | "multiedit" | "write" | "notebook";
  /** When the agent made the call. */
  at: string;
  added: number;
  removed: number;
  /** Risk multiplier on the size, never below 0.5. */
  weight: number;
  risks: Risk[];
  /**
   * How long the change took to go ahead, when the log shows the result, and
   * null when it does not. An edit that was never applied (the tool errored)
   * is not a change and is not stored.
   */
  goAheadMs: number | null;
  /**
   * Who let it through, as the log recorded the decision.
   *
   *   user     a person was asked and said yes
   *   auto     the configuration did: a rule, the permission mode, a classifier
   *   unknown  the log does not say
   */
  approvedBy: "user" | "auto" | "unknown";
  /** Where the change text lives, so the store never holds source code. */
  source: { path: string; offset: number; length: number };
}

export interface Explain {
  id: string;
  change: string;
  project: string;
  module: string;
  question: string;
  answer: string;
  verdict: Verdict;
  /** Why the examiner decided as it did, in a sentence. */
  why: string;
  /** The part of the change the verdict stands on, quoted. */
  evidence: string | null;
  /** On a miss, what the examiner says the answer was missing, in a few plain sentences. */
  lesson?: string | null;
  bug: { found: boolean; note: string } | null;
  at: string;
  /** What graded it, for the record. */
  examiner: string;
}

export interface Settings {
  /** What the end-of-session nudge does. */
  nudge: "gentle" | "firm" | "off";
  /**
   * The language mozg speaks to the person in: the desk, the gate's reason,
   * the nudge. "system" follows the machine. What the agent is told stays
   * English, and the agent says it to the person in the person's language.
   */
  language: Lang | "system";
  /**
   * Whether an edit in a module that is not the person's is put to them
   * first (see gate.ts). On unless they switch it off.
   */
  asks: boolean;
  /**
   * Projects the person took off the desk. Their logs are still read and their
   * explain-backs still count for nothing anywhere; "hidden" means not shown,
   * and the desk says so.
   */
  hidden: string[];
}

/**
 * How the desk is attached to the agent, as far as the desk can actually tell.
 * Nothing here is probed or assumed: each line is something a process wrote
 * down at the moment it happened, or it is null.
 */
export interface Connection {
  version: string;
  /** The installed plugin the server runs from, when it runs from one. */
  plugin: { name: string; version: string } | null;
  logsDir: string;
  storeDir: string;
  /** The person's home folder, so the two above can be written with a tilde. */
  home: string;
  /** Session logs read, at least in part. */
  logs: number;
  /** Sessions in which the agent changed a file. */
  sessions: number;
  /** Everything in the store, hidden projects included. */
  changes: number;
  explains: number;
  /** Every project in the store, hidden ones included, newest first. */
  projects: { project: string; name: string }[];
  indexedAt: string | null;
  /** False while older logs are still waiting to be read. */
  indexComplete: boolean;
  /** When this desk process started. */
  startedAt: string;
  /** When each part of the plugin last proved it was attached. */
  pulses: Record<Pulse, string | null>;
}

/** The parts of the plugin that can show, by their last action, that they work. */
export type Pulse = "mcpStarted" | "mcpCalled" | "sessionStart";

/** One card of the feed: a verdict and one action. */
export interface FeedCard {
  id: string;
  state: FeedState;
  title: string;
  text: string;
  action: { label: string; hint: string } | null;
  /** The change to explain, when the action is an explain-back. */
  change: string | null;
  /** The module the card is about, so nobody has to take it out of the title. */
  module: string | null;
}

export interface ModuleView {
  module: string;
  state: ModuleState;
  mode: AgentMode;
  /** Everything the agent changed here, in lines. */
  lines: number;
  weighted: number;
  changes: number;
  todayLines: number;
  /** Of today's changes: how many nobody was asked for, how many a person approved. */
  todayUnattended: number;
  todayApproved: number;
  lastChangeAt: string | null;
  lastExplainedAt: string | null;
  dueAt: string | null;
  /** Lines the agent changed since the last pass. */
  sinceExplained: number;
}

export interface DayView {
  /** A local calendar day, YYYY-MM-DD. */
  day: string;
  /** Null when the agent changed nothing that day. */
  ownership: number | null;
  changes: number;
  lines: number;
  explained: number;
}

/** What the desk and the sample board render. */
export interface DeskState {
  generatedAt: string;
  projects: { project: string; name: string; lastChangeAt: string }[];
  project: string | null;
  today: {
    ownership: number | null;
    changes: number;
    lines: number;
    /** Of today's changes: the ones that are only words. Noted, and not counted. */
    words: number;
    modulesTouched: number;
    modulesOwned: number;
    /** Changes the configuration let through: nobody was asked. */
    unattended: number;
    /** Changes a person was asked about and approved. */
    approved: number;
  };
  streak: { days: number; best: number; explainedTotal: number; bugsFound: number };
  /**
   * The last seven days, in agent edits. `free` landed in modules that are the
   * person's and that the log says nobody was asked for: what explaining
   * bought. `guarded` landed in modules that are not theirs, where the first
   * edit of a session is put to them. An edit a person approved in a module
   * that is theirs now is in neither.
   */
  week: { free: number; guarded: number };
  feed: FeedCard[];
  modules: ModuleView[];
  days: DayView[];
  explains: Explain[];
  /** The brain's lines, first person, every one computed from the above. */
  brain: { text: string; tone: "plain" | "warn" | "good" }[];
  /** Changes waiting for an explain-back, across the last seven days. */
  pending: number;
  /** Built on the sample session rather than on anybody's logs. */
  sample?: boolean;
  /** Added by the local server: how it is attached to the agent. */
  connection?: Connection;
  /** Added by the local server: the settings in force. */
  settings?: Settings;
}
