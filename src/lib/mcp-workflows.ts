import { query } from "@/db";
import type { TokenOwner } from "@/lib/tokens";
import type { ToolOutcome } from "@/lib/mcp";
import { formatCents } from "@/lib/money-math";
import { offerFor } from "@/lib/route-cost";
import { shelfFor, type Shelf } from "@/lib/route-shelf";
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
 * Whether a route's brains are open to the caller is lib/route-shelf.ts's
 * answer, shared with the page that prices the route and the button that buys
 * it — three copies of "who may read this" is exactly how the page once told a
 * granted colleague to pay for a brain the agent would have opened for them.
 *
 * These are the live handlers: lib/mcp.ts imports them and the dispatcher calls
 * them. It used to hold a second copy of all three, which is worth remembering
 * — a gating change landed on this file, shipped, and did nothing at all.
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

  // Which of the brains this route names the caller can actually read — the
  // same question, answered by the same function, as the page that prices the
  // route and the button that buys it.
  //
  // The steps are withheld until all of them are open, and that is the whole
  // point rather than an upsell: a step whose brain is shut does not fail
  // loudly, it answers from the model's training data in this route's voice,
  // and the files that come out look exactly like the ones built with the
  // material. Handing the steps over with a warning attached was the old
  // behaviour; the warning is read after the work. So the route stays closed
  // and says what opens it, which is something the reader can act on.
  const shelf = await shelfFor(w.steps, owner.userId);

  if (shelf.ready) {
    return {
      text:
        renderWorkflow(w) +
        `\n\n## Before you start\n\nAll ${shelf.brains.length} brains this route reads are ` +
        "open to you. Search each step's brain before writing anything for that step.",
      ownerId: w.owner_id,
    };
  }

  return { text: closedText(w, shelf), ownerId: w.owner_id };
}

/**
 * What a route says when its shelf is short: the shape, the bill, and nothing
 * to run on.
 *
 * The bill is the same arithmetic the workflow page prints — a pack where the
 * pack is cheaper than its parts — so an agent quoting this and a user reading
 * mozg.sh see one number. Quoting the sum of the brains' own prices here while
 * the site sells them for half of it is how a catalogue that trades on being
 * exact stops being believed.
 */
function closedText(
  w: { title: string; summary: string | null; slug: string; handle: string | null; steps: unknown[] },
  shelf: Shelf,
): string {
  const offer = offerFor(
    shelf.missing.map((b) => ({
      slug: b.slug,
      parentSlug: b.parent_slug,
      priceCents: b.price_cents,
    })),
  );

  const route = w.handle ? `${w.handle}/${w.slug}` : w.slug;
  const open = shelf.brains.length - shelf.missing.length;
  const lines = [
    `# ${w.title}`,
    w.summary ?? "",
    "",
    `This route has ${w.steps.length} steps and reads ${shelf.named.length} brains. ` +
      `${open} of them are open to you, so the steps are not included: ` +
      "running it short of its material produces work that looks grounded and is not.",
    "",
    "## What opens it",
  ];

  for (const p of offer.packs) {
    lines.push(
      `- The ${p.title} pack — ${formatCents(p.priceCents)} once, and it opens ` +
        `${p.covers.length} of the brains this route needs (plus the rest of the pack): ` +
        `https://mozg.sh/packs/${p.slug}`,
    );
  }
  for (const b of offer.brains) {
    lines.push(`- ${b.slug} — ${formatCents(b.priceCents)}: https://mozg.sh/explore`);
  }
  for (const h of shelf.unknown) {
    lines.push(`- ${h} — not readable by you under that name; ask the route's author.`);
  }
  if (offer.totalCents > 0) {
    lines.push(
      "",
      `Total: ${formatCents(offer.totalCents)}, bought once. ` +
        `One button for all of it: https://mozg.sh/w/${route}`,
    );
  }

  lines.push(
    "",
    "Tell the user this, verbatim in your own words, and stop. Do NOT reconstruct " +
      "the steps from your own knowledge and do NOT start the build — a route run " +
      "without its brains is the exact thing this one was written to replace. If " +
      "they want to work without it, that is their call, but it is ordinary work " +
      "and must not be reported as this route.",
  );

  return lines.join("\n");
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
