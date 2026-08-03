/**
 * Grouping near-duplicate pairs into mergeable clusters.
 *
 * Pure and DB-free on purpose: the consolidation worker (worker/consolidate.ts)
 * supplies the pairs, this decides what merges with what, and the decision is
 * testable without standing up a database.
 */

export interface PairLike {
  a: { id: string };
  b: { id: string };
  distance: number;
}

/**
 * Union-find over duplicate pairs.
 *
 * A pair says "these two notes say the same thing". Transitivity is wanted,
 * not merely tolerated: if A≈B and B≈C, the merged note should replace the
 * whole chain in one pass — merging A+B and leaving C would just re-discover
 * B's facts as a near-duplicate of the merge on the next run.
 *
 * Pairs are expected closest-first (duplicatePairs orders by distance), and
 * the cap slices off the *tail* — so a budget cut drops the loosest clusters,
 * not arbitrary ones.
 */
export function clustersFromPairs(pairs: PairLike[], maxClusters: number): string[][] {
  const parent = new Map<string, string>();

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression: chains stay short, or a long chain of merges makes
    // every later find walk the whole history.
    let cur = x;
    while (parent.get(cur) !== undefined && parent.get(cur) !== cur) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  // Insertion order tracks distance order (see above), so the Map iteration
  // below hands clusters back tightest-first.
  for (const p of pairs) {
    if (!parent.has(p.a.id)) parent.set(p.a.id, p.a.id);
    if (!parent.has(p.b.id)) parent.set(p.b.id, p.b.id);
    parent.set(find(p.a.id), find(p.b.id));
  }

  const byRoot = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    byRoot.set(root, [...(byRoot.get(root) ?? []), id]);
  }

  return [...byRoot.values()].filter((c) => c.length >= 2).slice(0, maxClusters);
}
