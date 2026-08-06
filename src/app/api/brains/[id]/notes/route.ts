import { NextResponse } from "next/server";
import { query } from "@/db";
import type { Plan } from "@/db/types";
import { accessFor, canWrite } from "@/lib/access";
import {
  writeAgentNote,
  writeNeedsReview,
  MAX_BATCH_NOTES,
  PROPOSALS_PER_HOUR,
  proposalAllowed,
  type AgentNoteInput,
  type WriteNoteResult,
} from "@/lib/agent-write";
import { limitsFor } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { verifyToken, quotaRemaining, burstExceeded } from "@/lib/tokens";

/**
 * The HTTP door for agents that do not speak MCP: the same write pipeline as
 * brain_write / brain_write_batch, one note or `{ notes: [...] }` (25 cap).
 *
 * Two auth doors, same as /mcp: a `Bearer mzg_...` token (verifyToken stamps
 * last_used_at itself) or the session cookie. Quotas read the same calls
 * table MCP meters into, so an agent split across both doors draws from one
 * allowance — and this route meters into it too, or the numbers would lie.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let userId: string;
  let plan: Plan;
  const token = await verifyToken(req.headers.get("authorization"));
  if (token) {
    userId = token.userId;
    plan = token.plan;
  } else {
    let user;
    try {
      user = await requireUser(req);
    } catch {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    userId = user.id;
    plan = user.plan;
  }

  const { id } = await ctx.params;
  const resolved = await accessFor(id, userId);
  if (!resolved?.access) {
    return NextResponse.json({ error: "Brain not found." }, { status: 404 });
  }
  // The third door onto the same pipeline, and it gets the same answer as the
  // MCP ones: a reader proposes rather than being turned away. Proposals land
  // pending and attributed, so nothing here can change what the brain says.
  const proposing = !canWrite(resolved.access);
  if (proposing && !resolved.brain.contributions) {
    return NextResponse.json(
      { error: "This brain is not accepting notes from readers." },
      { status: 403 },
    );
  }
  if (!limitsFor(plan).write) {
    return NextResponse.json(
      { error: `Writing back is not enabled on the ${plan} plan.` },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON body expected." }, { status: 400 });
  }
  const notes: AgentNoteInput[] = Array.isArray(body?.notes)
    ? (body.notes as AgentNoteInput[])
    : [body];
  if (!notes.length || notes.length > MAX_BATCH_NOTES) {
    return NextResponse.json(
      { error: `Pass one note, or notes with 1-${MAX_BATCH_NOTES} entries.` },
      { status: 400 },
    );
  }

  if (await burstExceeded(userId)) {
    return NextResponse.json(
      { error: "Rate limited: more than 60 calls in the last minute." },
      { status: 429 },
    );
  }
  if ((await quotaRemaining(userId, plan)) <= 0) {
    return NextResponse.json(
      { error: `Monthly call quota reached on the ${plan} plan.` },
      { status: 429 },
    );
  }

  const started = Date.now();
  const pending = writeNeedsReview(resolved.brain, resolved.access);
  const results: Record<string, unknown>[] = [];
  let saved = 0;

  for (const raw of notes) {
    const input = raw ?? {};
    // Same throttle as the MCP door and charged the same way — per note. The
    // burst limit and the monthly quota protect our bill; neither protects the
    // owner's review queue from one looping client.
    if (proposing && !(await proposalAllowed(userId, resolved.brain.id))) {
      results.push({
        title: String(input.title ?? "").trim().slice(0, 200),
        status: "rejected",
        reason: `At most ${PROPOSALS_PER_HOUR} proposals per hour to one brain.`,
      });
      continue;
    }
    let r: WriteNoteResult;
    try {
      r = await writeAgentNote(
        resolved.brain,
        { pending, agentClient: "http", proposedBy: proposing ? userId : null },
        input,
      );
    } catch (err) {
      // err.message can carry pg details — logged, not returned. One bad
      // note must not fail the rest of the batch.
      console.error(`[notes] write failed for ${userId}:`, err);
      results.push({
        title: String(input.title ?? "").trim().slice(0, 200),
        status: "failed",
        reason: "Internal error — the details are logged; retry this note.",
      });
      continue;
    }
    if (r.status === "saved") {
      saved++;
      results.push({
        title: r.title,
        status: "saved",
        pending: r.pending,
        ...(r.lookalike ? { lookalike: r.lookalike } : {}),
      });
    } else if (r.status === "duplicate") {
      results.push({ title: r.title, status: "duplicate", existing: r.existing });
    } else {
      results.push({ title: r.title, status: "rejected", reason: r.reason });
    }
  }

  // Metered like an MCP tools/call: same table, same tool names, so the
  // monthly quota and the burst ceiling see this traffic too.
  await query(
    `insert into calls
       (brain_id, caller_id, owner_id, tool, query, results, top_score, latency_ms, ok)
     values ($1, $2, $3, $4, null, $5, null, $6, $7)`,
    [
      resolved.brain.id,
      userId,
      resolved.brain.owner_id,
      notes.length > 1 ? "brain_write_batch" : "brain_write",
      saved,
      Date.now() - started,
      saved > 0,
    ],
  ).catch(() => {});

  return NextResponse.json({ saved, results });
}
