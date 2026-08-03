/**
 * Note -> chunks. Notes are usually short enough to be one chunk; this exists
 * for the long ones (pasted docs, transcribed pages).
 */

const TARGET_TOKENS = 400;
const OVERLAP_TOKENS = 60;
const MIN_TOKENS = 40;

/**
 * Rough token count. Mixed ru/en runs ~3.3 chars per token; exact counting
 * would mean a tokenizer round-trip per chunk for no decision it would change.
 * lazy: swap for messages.count_tokens if chunk sizes ever start mattering.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.3);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  // Keeps the terminator with the sentence; good enough for ru/en prose.
  return text.match(/[^.!?\n]+[.!?]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

export function chunkText(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (estimateTokens(clean) <= TARGET_TOKENS) return [clean];

  // Paragraphs first; oversized paragraphs fall back to sentences.
  const units: string[] = [];
  for (const para of splitParagraphs(clean)) {
    if (estimateTokens(para) <= TARGET_TOKENS) units.push(para);
    else units.push(...splitSentences(para));
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const unit of units) {
    const tokens = estimateTokens(unit);

    if (currentTokens + tokens > TARGET_TOKENS && current.length) {
      chunks.push(current.join("\n\n"));

      // Carry the tail forward so a fact split across a boundary stays findable.
      const overlap: string[] = [];
      let overlapTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const t = estimateTokens(current[i]);
        if (overlapTokens + t > OVERLAP_TOKENS) break;
        overlap.unshift(current[i]);
        overlapTokens += t;
      }
      current = overlap;
      currentTokens = overlapTokens;
    }

    current.push(unit);
    currentTokens += tokens;
  }

  if (current.length) chunks.push(current.join("\n\n"));

  // A trailing sliver is worse than a slightly long chunk — fold it back.
  if (chunks.length > 1 && estimateTokens(chunks[chunks.length - 1]) < MIN_TOKENS) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1] += `\n\n${tail}`;
  }

  return chunks;
}

/** What actually gets embedded: the title gives the body searchable context. */
export function chunksForNote(title: string, body: string): string[] {
  return chunkText(body).map((c) => `${title}\n\n${c}`);
}
