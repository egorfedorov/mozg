/**
 * One canonical form for `notes.category`.
 *
 * Extraction invents the label, so the same idea arrives as "Type scale",
 * "type scale" and "type  scale" — three rows in every GROUP BY, and a
 * category filter that misses two of them. Every write path runs the value
 * through this first, and the search filter normalises its parameter the same
 * way, so casing and spacing stop being meaningful.
 *
 * The canonical form is lowercase rather than "first form wins": a lookup at
 * write time would race (two ingests inserting "Type scale" and "type scale"
 * concurrently both see nothing and keep their own spelling), while lowercase
 * is computable from the value alone and every path agrees on it without
 * talking to the database.
 */
export function normalizeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/\s+/g, " ") // collapse runs of whitespace
    .replace(/\s*\/\s*/g, "/") // "typography / scale" -> "typography/scale"
    .replace(/\/{2,}/g, "/") // "a//b" -> "a/b"
    .replace(/^\/+|\/+$/g, "") // stray leading/trailing slashes
    .toLowerCase();
  if (!cleaned) return null;
  // Matches the 80-char ceiling the extraction schema already enforces.
  return cleaned.slice(0, 80);
}

/** The first path segment — what brain_brief groups subcategories under. */
export function topLevelCategory(category: string): string {
  const slash = category.indexOf("/");
  return slash === -1 ? category : category.slice(0, slash);
}
