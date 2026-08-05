/**
 * Why a check failed — the four causes that look identical in a score.
 *
 * The distinction is the whole value of the failure: "add a source" fixes one of
 * them and makes another worse. Filing every failure as missing material, which
 * is what the exam used to do for zero-hit failures only, told the owner nothing
 * about the third of checks that fail with the answer already in the brain.
 *
 * scripts/diagnose-exam.ts pioneered this classification interactively; the
 * exam now records it on every failure, so the diagnosis is in the data rather
 * than in whoever remembered to run the script.
 */

export type GapKind = "missing" | "thin" | "retrieval" | "bluff";

/** What each kind means to the owner, and what actually fixes it. */
export const GAP_KIND_LABEL: Record<GapKind, string> = {
  missing: "not in the brain — add a source that covers it",
  thin: "the note was in front of the judge and did not answer — deepen it",
  retrieval: "the answer is here but ranked too low — the note needs the question's words",
  bluff: "an out-of-scope probe answered confidently — stop covering the neighbouring topic",
};

/**
 * Crude lexical overlap: enough to tell "present but unranked" from "absent".
 * Deliberately not embeddings — this decides which of four buckets a failure
 * lands in, and a wrong bucket costs one misleading label, not a wrong answer.
 */
export function covers(text: string, expect: string): boolean {
  const terms = expect
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (!terms.length) return false;
  const hay = text.toLowerCase();
  return terms.filter((t) => hay.includes(t)).length / terms.length >= 0.5;
}

/**
 * Classify from what the sitting already has. `wide` — passages from a deeper
 * search — is only consulted when the judge's own context did not contain the
 * answer, because that is the only case where "absent" and "ranked too low"
 * are still indistinguishable.
 */
export function classifyFailure(args: {
  /** A negative probe: the brain was supposed to refuse and did not. */
  negative: boolean;
  expect: string;
  /** Exactly what the judge was shown. */
  shown: string;
  /** Deeper candidates, when they were fetched. */
  wide?: string[];
}): GapKind {
  if (args.negative) return "bluff";
  if (!args.shown.trim()) return "missing";
  if (covers(args.shown, args.expect)) return "thin";
  if (args.wide?.some((text) => covers(text, args.expect))) return "retrieval";
  return "missing";
}
