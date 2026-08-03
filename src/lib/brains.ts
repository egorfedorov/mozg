import { query } from "@/db";
import type { Brain } from "@/db/types";

/** One exam category, as the readout strip and scorecard render it. */
export interface CategoryScore {
  category: string;
  passed: number;
  total: number;
  state: "pass" | "partial" | "fail" | "empty";
  /** What to upload to close the gap — the whole point of the exam. */
  gap: string | null;
}

export interface BrainWithScore extends Brain {
  categories: CategoryScore[];
}

const TINTS = ["blue", "red", "green", "violet", "orange", "yellow"] as const;

/** Stable colour per brain, so a card keeps its identity across sessions. */
export function tintFor(brain: Pick<Brain, "id" | "color">): string {
  if ((TINTS as readonly string[]).includes(brain.color)) return brain.color;
  let hash = 0;
  for (const ch of brain.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export async function listBrains(ownerId: string): Promise<BrainWithScore[]> {
  const brains = await query<Brain>(
    `select * from brains where owner_id = $1 order by updated_at desc`,
    [ownerId],
  );
  if (!brains.length) return [];

  const scores = await categoryScores(brains.map((b) => b.id));
  return brains.map((b) => ({ ...b, categories: scores.get(b.id) ?? [] }));
}

/**
 * Latest exam result per brain, grouped by category. Brains with checks but no
 * run yet come back as `empty` cells rather than disappearing — an unexamined
 * category is information too.
 */
export async function categoryScores(
  brainIds: string[],
): Promise<Map<string, CategoryScore[]>> {
  if (!brainIds.length) return new Map();

  const rows = await query<{
    brain_id: string;
    category: string;
    total: number;
    passed: number | null;
    sources_for_category: number;
  }>(
    `with latest as (
       select distinct on (brain_id) id, brain_id
         from check_runs
        where brain_id = any($1::uuid[]) and status = 'done'
        order by brain_id, started_at desc
     )
     select c.brain_id,
            c.category,
            count(*)::int as total,
            count(r.passed) filter (where r.passed)::int as passed,
            (select count(*)::int from notes n
              where n.brain_id = c.brain_id
                and n.category = c.category
                and n.status = 'active') as sources_for_category
       from checks c
       left join latest l on l.brain_id = c.brain_id
       left join check_results r on r.check_id = c.id and r.run_id = l.id
      where c.brain_id = any($1::uuid[]) and c.enabled
      group by c.brain_id, c.category
      order by c.brain_id, 4 desc nulls last, c.category`,
    [brainIds],
  );

  const map = new Map<string, CategoryScore[]>();
  for (const row of rows) {
    const passed = row.passed ?? 0;
    const state: CategoryScore["state"] =
      row.passed === null
        ? "empty"
        : passed === row.total
          ? "pass"
          : passed === 0
            ? "fail"
            : "partial";

    const gap =
      state === "fail" && row.sources_for_category === 0
        ? "no source covers this"
        : state === "fail" || state === "partial"
          ? "not enough material"
          : null;

    const list = map.get(row.brain_id) ?? [];
    list.push({ category: row.category, passed, total: row.total, state, gap });
    map.set(row.brain_id, list);
  }
  return map;
}

/** Slugify a title into a brain handle, matching the DB check constraint. */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };

  const latin = [...input.toLowerCase()]
    .map((ch) => map[ch] ?? ch)
    .join("");

  return (
    latin
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 39) || "brain"
  );
}
