/** Local paths. One place, so a test can point all of them elsewhere. */

import { homedir } from "node:os";
import { join } from "node:path";

/** Where mozg keeps its own files. Set MOZG_HOME to put them elsewhere. */
export function mozgHome(): string {
  return process.env.MOZG_HOME || join(homedir(), ".mozg");
}

/** Where Claude Code writes session logs. */
export function claudeProjectsDir(): string {
  return process.env.MOZG_CLAUDE_PROJECTS || join(homedir(), ".claude", "projects");
}

/** The first port the local desk tries; it moves up if this one is taken. */
export const DESK_PORT = 4317;
