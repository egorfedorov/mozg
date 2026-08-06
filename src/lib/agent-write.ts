import { query, one, tx, toVector } from "@/db";
import type { Brain } from "@/db/types";
import type { Access } from "@/lib/access";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { embedPassages } from "@/lib/embed";
import { findDuplicateNote, type DuplicateMatch } from "@/lib/dedup";
import { rateLimited } from "@/lib/rate-limit";
import { scanInjection, scanSecrets } from "@/lib/scan";
import { enqueueExam } from "@/worker/queue";
import { normalizeCategory } from "@/lib/category";
import { noteWarnings, type NoteWarning } from "@/lib/note-quality";

/**
 * The agent-note write pipeline, shared by every path an agent can teach
 * through: the MCP tools (brain_write, brain_write_batch) and the HTTP
 * endpoint (POST /api/brains/[id]/notes). Three doors, one pipeline — a gate
 * enforced in one path and not the next is how a secret scan gets skipped.
 */

/** Notes per batch call. Matches the url cap on brain_add_source. */
export const MAX_BATCH_NOTES = 25;

/**
 * Proposals per hour, per reader, per brain — enforced at every door.
 *
 * A review queue is a person, and a person who opens theirs to two hundred
 * machine-written notes closes it for good. The other limits in front of these
 * endpoints protect the platform's bill; this one protects the owner's
 * attention, which is the scarcer resource.
 */
export const PROPOSALS_PER_HOUR = 20;

/**
 * Take one unit of that budget, or report it spent.
 *
 * Counted per note rather than per call, deliberately: a batch holds
 * twenty-five, so charging the batch once would have let one reader put five
 * hundred notes an hour in front of an owner while staying inside a limit
 * named "twenty".
 */
export async function proposalAllowed(userId: string, brainId: string): Promise<boolean> {
  return !(await rateLimited(userId, `propose:${brainId}`, PROPOSALS_PER_HOUR));
}

export interface AgentNoteInput {
  title?: unknown;
  body?: unknown;
  kind?: unknown;
  category?: unknown;
}

export type WriteNoteResult =
  | {
      status: "saved";
      title: string;
      pending: boolean;
      /** Set when the note went to review and resembles an existing one. */
      lookalike: DuplicateMatch | null;
      /** Quality hints — never a reason it was refused. See lib/note-quality.ts. */
      warnings: NoteWarning[];
    }
  | { status: "duplicate"; title: string; existing: DuplicateMatch }
  | { status: "rejected"; title: string; reason: string };

/**
 * review_required is the owner's protection against outside writers. The
 * owner teaching their own brain through their own token needs no review —
 * their notes activate inline regardless of the flag. Grantees still pend.
 */
export function writeNeedsReview(brain: Brain, access: Access): boolean {
  return brain.review_required && access !== "owner";
}

/**
 * Save one agent-authored note. Access and plan checks belong to the caller —
 * they differ per door (MCP resolves by handle, HTTP by id); everything from
 * validation down to activation is identical and lives here.
 *
 * Throws only where the old inline handler threw: an embed failure on the
 * activate-now path. Batch callers must catch per note.
 */
export async function writeAgentNote(
  brain: Brain,
  opts: {
    pending: boolean;
    agentClient: string;
    /**
     * Set when the writer is a reader rather than an owner or contributor —
     * the note is a proposal. Recorded on the row so the review screen can
     * show whose it is and how their earlier ones turned out.
     */
    proposedBy?: string | null;
  },
  input: AgentNoteInput,
): Promise<WriteNoteResult> {
  // Capped like brain_create does (80/4000), only looser — a note is longer
  // than a goal, but an agent pasting a whole log file should be stopped
  // somewhere. 200/20000 matches what a human would ever write by hand.
  const title = String(input.title ?? "").trim().slice(0, 200);
  const body = String(input.body ?? "").trim().slice(0, 20000);
  if (!title || !body) {
    return { status: "rejected", title, reason: "Both title and body are required." };
  }

  // Same gate as ingest. An agent paraphrasing a token into a "lesson" is a
  // real failure mode, and this is the path with no human in the loop.
  const findings = scanSecrets(`${title}\n${body}`);
  if (findings.length) {
    return {
      status: "rejected",
      title,
      reason:
        "Rejected: this looks like it contains a credential " +
        `(${findings.map((f) => f.label).join(", ")}). Rewrite it without the secret.`,
    };
  }

  // A proposal is text a stranger is putting in front of somebody else's
  // agents. "Ignore your previous instructions" in a note is not a bad note,
  // it is an attack on every reader of the brain — and the owner reviewing it
  // is reading with human eyes, which is precisely the wrong detector for a
  // string aimed at a model. Publication already runs this scan; the door a
  // stranger writes through needs it more.
  if (opts.proposedBy) {
    const steering = scanInjection(`${title}\n${body}`);
    if (steering.length) {
      return {
        status: "rejected",
        title,
        reason:
          "Rejected: this reads as an instruction to whoever's model loads it " +
          `(${[...new Set(steering.map((s) => s.label))].join(", ")}), not as a fact ` +
          "about the subject. Write what is true, not what the reader should do.",
      };
    }
  }

  // Pending by construction, not by the caller remembering to ask for it. The
  // gate that must never be bypassed belongs next to the insert it protects,
  // not in each of the three doors that reach it.
  const pending = opts.pending || Boolean(opts.proposedBy);
  const texts = chunksForNote(title, body);

  // The duplicate check needs the note's vector, so the embed moved ahead of
  // the insert: a failed embed now leaves nothing behind at all, where it used
  // to strand a pending row (the ghost note review.approve's comment warns
  // about).
  //
  // On the review path the embed only feeds the duplicate check — the note
  // itself is embedded on approval, and failing the whole write because a
  // local check could not run would be the tail wagging the dog. The reviewer
  // is the dedup backstop there.
  let vectors: number[][] | null = null;
  try {
    vectors = await embedPassages(texts);
  } catch (err) {
    if (!pending) throw err;
  }

  // Same threshold as ingest (lib/dedup.ts): an agent re-writing a fact the
  // brain already holds is the most common duplicate there is.
  const duplicate = vectors?.length ? await findDuplicateNote(brain.id, vectors[0]) : null;

  // Without review, refuse outright — the caller says what the brain already
  // has, so the agent can read the existing note and write again with the
  // specific difference stated: an update, not a copy.
  if (duplicate && !pending) {
    return { status: "duplicate", title, existing: duplicate };
  }

  // With review, save anyway and flag the look-alike in the result: pending
  // is the human's territory, and silently refusing could swallow a deliberate
  // correction to the note it resembles. The reviewer sees both and decides.
  const note = await one<{ id: string }>(
    `insert into notes
       (brain_id, title, body, category, kind, author, agent_client, status,
        confidence, proposed_by)
     values ($1, $2, $3, $4, $5, 'agent', $6, 'pending', 0.7, $7)
     returning id`,
    [
      brain.id,
      title,
      body,
      // Same canonicalisation ingest applies — an agent writing "Type Scale"
      // must land in the same category as extraction's "type scale".
      normalizeCategory(typeof input.category === "string" ? input.category : null),
      typeof input.kind === "string" ? input.kind : "fact",
      opts.agentClient,
      opts.proposedBy ?? null,
    ],
  );

  // Pending notes stay unindexed until approved — otherwise "review required"
  // would be theatre and unapproved notes would already be answering queries.
  if (!pending) {
    await tx(async (client) => {
      for (let i = 0; i < texts.length; i++) {
        await client.query(
          `insert into chunks (brain_id, note_id, content, token_count, embedding)
           values ($1, $2, $3, $4, $5::halfvec)`,
          [brain.id, note.id, texts[i], estimateTokens(texts[i]), toVector(vectors![i])],
        );
      }
      // Flipped active in the same transaction as the chunks that make it
      // searchable — an "active" note with no chunks is invisible to search,
      // which looks like the write silently did nothing.
      await client.query(`update notes set status = 'active' where id = $1`, [note.id]);
    });

    await query(`update brains set content_changed_at = now() where id = $1`, [brain.id]);

    // And ask for a re-sit. content_changed_at alone only reaches the exam on
    // the six-hourly maintenance pass, so a teaching session used to end with
    // the score still describing the brain from before it — which reads as
    // "nothing happened" to whoever just spent an hour teaching.
    //
    // A full sitting, deliberately, not the mini probe: a probe stamps score_at
    // without moving score, which would make examStaleBrains consider the brain
    // freshly examined and stop queueing the sitting that actually rescores it.
    // Cost is bounded twice over — enqueueExam deduplicates per brain for a
    // minute, so a batch asks once rather than twenty-five times, and runExam
    // refuses a second full sitting inside its own cooldown window.
    //
    // Fire-and-forget: a queue that cannot take the job must not lose a note
    // that is already written.
    void enqueueExam(brain.id).catch(() => {});
  }

  return {
    status: "saved",
    title,
    pending,
    lookalike: pending ? duplicate : null,
    // Computed after the note is safely stored, never before: a quality hint
    // must not be able to cost somebody the note it was hinting about.
    warnings: noteWarnings(title, body, typeof input.kind === "string" ? input.kind : "fact"),
  };
}
