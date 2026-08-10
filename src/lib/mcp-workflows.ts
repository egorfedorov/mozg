import { query } from "@/db";
import type { TokenOwner } from "@/lib/tokens";
import type { ToolOutcome } from "@/lib/mcp";
import { findWorkflow, listWorkflows, publicWorkflows } from "@/lib/workflow-store";
import { renderWorkflow, stepReportSchema } from "@/lib/workflows";

/**
 * The workflow tools, out of lib/mcp.ts.
 *
 * That file is the one every feature touches — it was nearly two thousand
 * lines of routing, access, formatting and prompt copy, and each new tool made
 * it worse for everyone. Workflows are the cleanest seam in it: three
 * handlers, one store, nothing else in the file needs them. Split by what a
 * tool is *about* rather than by layer, so a change to routes opens one file.
 *
 * resolveBrain stays behind in mcp.ts and is passed in: it carries the access
 * rules for paid brains, teasers and families, and a second copy of those is
 * the last thing this codebase needs.
 */

/**
 * The routes, not the material.
 *
 * A shelf answers questions; a workflow is the order those answers get asked
 * in to build something. Listed together with the public ones because the
 * point of publishing a route is that somebody else's agent can run it — a
 * private-only list would make the catalogue's best workflows invisible to
 * exactly the agent that needs them.
 */
export async function workflowList(owner: TokenOwner): Promise<ToolOutcome> {
  const [mine, shared] = await Promise.all([
    listWorkflows(owner.userId),
    publicWorkflows(20),
  ]);
  const rows = [...mine, ...shared.filter((w) => w.owner_id !== owner.userId)];

  if (!rows.length) {
    return {
      text:
        "No workflows yet. A workflow is a named route through the brains — " +
        "the steps for a whole job, each naming the brain to read and the " +
        "check that ends it. Build one at mozg.sh/workflows.",
    };
  }

  return {
    text:
      "Workflows you can run — call workflow_read for the steps:\n\n" +
      rows
        .map(
          (w) =>
            `- ${w.handle ? `${w.handle}/${w.slug}` : w.slug} — ${w.title}` +
            (w.summary ? `: ${w.summary}` : "") +
            ` (${w.steps.length} steps${w.owner_id === owner.userId ? ", yours" : ""})`,
        )
        .join("\n"),
  };
}

export async function workflowRead(
  args: Record<string, unknown>,
  owner: TokenOwner,
  /** mozg's access rules live with resolveBrain; borrowed, never copied. */
  resolveBrain: (handle: string, userId: string) => Promise<{ locked?: boolean } | null>,
): Promise<ToolOutcome> {
  const name = String(args.workflow ?? "").trim();
  if (!name) {
    return { text: "workflow_read needs a workflow name. Call workflow_list.", isError: true };
  }

  const w = await findWorkflow(name, owner.userId);
  if (!w) {
    return {
      text: `No workflow "${name}" that you can read. Call workflow_list for the ones you have.`,
      isError: true,
    };
  }

  // Which of the brains this route names the caller can actually read. A
  // route is only as good as the shelf under it: running one whose material
  // is missing produces confident work built on guesses, which is the exact
  // failure the route was written to prevent. Said before the steps, so the
  // agent can stop and tell the user what to buy instead of finding out at
  // step nine.
  const wanted = [...new Set(w.steps.map((s) => s.brain).filter(Boolean))].map(String);
  const shelf: string[] = [];
  const missing: string[] = [];
  const locked: string[] = [];

  for (const handle of wanted) {
    const found = await resolveBrain(handle, owner.userId);
    if (!found) missing.push(handle);
    else if (found.locked) locked.push(handle);
    else shelf.push(handle);
  }

  const readiness =
    missing.length || locked.length
      ? "\n\n## Before you start\n\n" +
        `${shelf.length} of ${wanted.length} brains this route reads are on your shelf.\n` +
        (locked.length
          ? `\nPaid, and your free preview is used up — these answer nothing until bought:\n` +
            locked.map((h) => `- ${h} — https://mozg.sh/b/${h.replace("/", "/")}`).join("\n") +
            "\n"
          : "") +
        (missing.length
          ? `\nNot on your shelf at all:\n` +
            missing.map((h) => `- ${h} — add it with library_add, or buy it at https://mozg.sh/explore`).join("\n") +
            "\n"
          : "") +
        "\nTell the user which ones are missing and what they cost BEFORE doing any " +
        "of the work. A step whose brain is missing still runs, but it runs on your " +
        "training data — say so plainly in the report rather than passing a guess " +
        "off as this route's answer."
      : `\n\n## Before you start\n\nAll ${wanted.length} brains this route reads are on your shelf.`;

  return { text: renderWorkflow(w) + readiness, ownerId: w.owner_id };
}

/**
 * What the run was actually like.
 *
 * The only feedback a route has. A brain learns from its exam; a route learns
 * from the agent that just walked it and knows which step had nothing behind
 * it — while it is still holding the context that makes the answer specific.
 * Stored verbatim for the author; no score, because a rating tells nobody
 * which step to fix.
 */
export async function workflowReport(
  args: Record<string, unknown>,
  owner: TokenOwner,
): Promise<ToolOutcome> {
  const w = await findWorkflow(String(args.workflow ?? "").trim(), owner.userId);
  if (!w) {
    return { text: "No workflow by that name that you can read.", isError: true };
  }

  const raw = Array.isArray(args.steps) ? args.steps : [];
  const steps = raw.flatMap((item) => {
    const parsed = stepReportSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  if (!steps.length) {
    return { text: "Send at least one step entry — step number, and what happened.", isError: true };
  }

  await query(
    `insert into workflow_runs (workflow_id, runner_id, steps, summary)
     values ($1, $2, $3::jsonb, $4)`,
    [
      w.id,
      owner.userId,
      JSON.stringify(steps),
      String(args.summary ?? "").slice(0, 500) || null,
    ],
  );

  const dry = steps.filter((s) => s.found === false).length;
  const failed = steps.filter((s) => s.passed === false).length;
  return {
    text:
      `Recorded for ${w.title}: ${steps.length} step(s)` +
      (dry ? `, ${dry} with no material` : "") +
      (failed ? `, ${failed} whose check did not pass` : "") +
      ".\n\nThe author sees this on the workflow's page. If a step had no " +
      "material and you worked the answer out yourself, brain_write it into " +
      "that step's brain — the next run gets it for free.",
    ownerId: w.owner_id,
  };
}
