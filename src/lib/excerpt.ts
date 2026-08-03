/**
 * brain_search returns excerpts, not documents.
 *
 * The excerpt used to be the whole chunk (~400 tokens), so a 25-hit search
 * could pour ~10K tokens into the agent's context before it had decided which
 * note it even wanted. Progressive disclosure instead: the search result only
 * needs to be long enough to judge relevance (~150 tokens), and brain_read
 * already serves the full text of the one note the agent picks.
 */
export const EXCERPT_CHARS = 600;

export function clipExcerpt(
  text: string,
  max = EXCERPT_CHARS,
): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };

  const window = text.slice(0, max);
  // Prefer a sentence end over a mid-word cut. A boundary in the first half
  // of the window means one very long opening sentence — hard-cut that rather
  // than returning an excerpt too short to judge anything by.
  const boundary = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf(".\n"),
    window.lastIndexOf("\n"),
  );
  const cut = boundary > max / 2 ? boundary + 1 : max;
  return { text: text.slice(0, cut).trimEnd() + " …", clipped: true };
}
