/**
 * The one way to build a cover URL.
 *
 * The route caches immutably, which is only correct because this appends a
 * version derived from the storage key. Anyone hand-writing the path would get
 * a card that keeps showing last month's cover for a year — so there is one
 * function and every caller uses it.
 *
 * Pure, so both server components and the gallery can call it.
 */
export function coverUrl(brain: { id: string; cover_key: string | null }): string | null {
  if (!brain.cover_key) return null;
  // A storage key is content-addressed already (hash + name); the tail of it is
  // plenty to distinguish one cover from the next, and short enough to read in
  // a URL bar.
  const v = brain.cover_key.slice(-12).replace(/[^a-zA-Z0-9]/g, "");
  return `/api/brains/${brain.id}/cover?v=${v}`;
}
