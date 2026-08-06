import type { NoteKind } from "@/db/types";

/**
 * What makes an agent-written note worth keeping, checked cheaply.
 *
 * The anti-Goodhart move. "Notes written" is the number that goes up on its
 * own, and a brain optimising for it fills with prose that says nothing —
 * which is worse than an empty brain, because an empty brain does not answer
 * confidently.
 *
 * Every rule here produces a WARNING and never a rejection, deliberately.
 * Two reasons. A regex reading prose is wrong often enough that refusing on
 * one would throw away good notes — "as shown above" can legitimately point at
 * something inside the same note. And since contributions shipped, every write
 * from a non-owner already waits for a human; the useful job is to tell that
 * human where to look, not to pre-empt them. The two hard gates that DO reject
 * — a credential, an instruction aimed at the reader's model — live in
 * agent-write.ts, where the cost of a false negative is a leak rather than a
 * dull sentence.
 *
 * Pure and dependency-free so both ends can use it: the write path reports the
 * warnings back to the agent that can still fix them, and the review screen
 * recomputes them at render time. Recomputed rather than stored, on purpose —
 * a column would freeze today's rules onto yesterday's rows and drift from
 * whatever this function says next month.
 */

export interface NoteWarning {
  /** Stable id, so a caller can suppress or count one kind. */
  rule: string;
  /** Said to whoever can still act — an agent, or the person reviewing. */
  says: string;
}

/** Something that survives being read alone: a number, a path, a symbol. */
const CONCRETE = [
  /\d/, // a number, a version, a count
  /[\w-]+\.[a-z]{1,5}\b/i, // file.ts, package.json, api.example.com
  /\//, // a path or a URL
  /[a-z][A-Z]/, // camelCase
  /\w_\w/, // snake_case
  /`[^`]+`/, // fenced identifier
];

/** A claim with a reason attached is a rule; without one it is folklore. */
const BECAUSE =
  /\b(because|since|so that|otherwise|which is why|the reason|leads to|results in|потому что|поэтому|иначе|так как|из-за)\b/i;

/**
 * Points outside itself, at something the reader cannot see.
 *
 * No leading \b, and that is not an oversight: JavaScript's \b is defined over
 * [A-Za-z0-9_], so there is no boundary between the start of a string and a
 * Cyrillic letter — "См. выше" silently never matched while the English half
 * of the same alternation worked. These are all multi-word phrases, so a
 * mid-word false positive is not a real risk anyway.
 */
const DANGLING =
  /(as (shown|described|mentioned|noted|explained) above|see above|as discussed (above|earlier)|the (previous|preceding|above|earlier) (note|section|example|snippet|point)|как показано выше|см\.? выше|как сказано выше|в предыдущ)/i;

export function noteWarnings(
  title: string,
  body: string,
  kind: NoteKind | string = "fact",
): NoteWarning[] {
  const out: NoteWarning[] = [];
  const t = title.trim();
  const b = body.trim();

  // The one that matters most. A note is read alone, months later, by an agent
  // that has none of the conversation it was written in — a pointer at "above"
  // resolves to nothing and the note becomes an assertion with no content.
  if (DANGLING.test(b)) {
    out.push({
      rule: "dangling-reference",
      says:
        "refers to something above or earlier — a note is read on its own, so " +
        "whatever it points at has to be inside it",
    });
  }

  if ((kind === "fact" || kind === "rule") && !CONCRETE.some((re) => re.test(b))) {
    out.push({
      rule: "no-specifics",
      says:
        "no number, path, symbol or version anywhere — true but unactionable is " +
        "the shape most agent notes fail in",
    });
  }

  // Title plus a restatement of the title is a note with one sentence of
  // content, and search will return it looking twice as substantial as it is.
  if (t.length >= 15 && b.toLowerCase().startsWith(t.toLowerCase().slice(0, 30))) {
    out.push({
      rule: "body-repeats-title",
      says: "the body opens by restating the title — start with what the title does not say",
    });
  }

  if ((kind === "rule" || kind === "pitfall") && !BECAUSE.test(b)) {
    out.push({
      rule: "no-reason",
      says:
        `a ${kind} without a reason cannot be applied to a case it does not ` +
        "literally name — say why, not only what",
    });
  }

  return out;
}
