import { query, maybeOne } from "@/db";
import { ROLES, SYMBOL_LADDER, type AssetRole } from "@/lib/slotgen";

/**
 * A project: the folder a studio keeps one game's art in, and the plan inside
 * it.
 *
 * gen.mozg.sh had one verb — describe a game, get thirteen assets — and one
 * action that wrote the brief and every generation in a single call. That is a
 * vending machine. A studio decides what the set is, argues about the wild,
 * redoes the K three times and adds a scatter next week, and none of that fits
 * through a single form submit.
 *
 * So the plan exists before the money. An item can be written, re-specified and
 * thrown away while it costs nothing; generating it is a separate act against a
 * row that already says exactly what it is. That separation is the whole point
 * of this file — everything else here is bookkeeping around it.
 *
 * What this does NOT touch is `generations`. That table debits inside the
 * transaction, refunds a failure, pays the artist and records what the call
 * cost us, and it has been right since it was written. A new flow above it is
 * not a reason to rewrite the one part that already works.
 */

export interface GenProject {
  id: string;
  owner_id: string;
  title: string;
  kind: "slot" | "other";
  style: string | null;
  palette: string | null;
  style_brain_id: string | null;
  reference_key: string | null;
  anchor_key: string | null;
  created_at: Date;
}

export interface GenItem {
  id: string;
  project_id: string;
  role: AssetRole;
  label: string;
  spec: string | null;
  status: "planned" | "generating" | "done" | "failed";
  generation_id: string | null;
  sort: number;
}

/** Titles and labels are shown back and exported as filenames. */
function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function createProject(
  ownerId: string,
  opts: { title: string; kind?: "slot" | "other"; style?: string; palette?: string; styleBrainId?: string | null },
): Promise<GenProject> {
  const title = clean(opts.title, 80);
  if (!title) throw new Error("a project needs a name — the game's, usually");

  const [row] = await query<GenProject>(
    `insert into gen_projects (owner_id, title, kind, style, palette, style_brain_id)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [
      ownerId,
      title,
      opts.kind ?? "slot",
      clean(opts.style, 4000) || null,
      clean(opts.palette, 300) || null,
      opts.styleBrainId ?? null,
    ],
  );
  return row;
}

/**
 * The set to put in front of somebody who has not decided yet.
 *
 * Proposed, not imposed — every item is editable and removable before a penny
 * moves, which is the difference between an interview and a form. The briefs
 * come from SYMBOL_LADDER because the hard-won part of this product is knowing
 * that a model asked for "a humble trinket" returns a jewelled amulet and
 * inverts the paytable. A fresh list of labels would throw that away and ask
 * the studio to rediscover it.
 */
export function proposedItems(kind: "slot" | "other" = "slot"): Omit<GenItem, "id" | "project_id" | "status" | "generation_id">[] {
  if (kind !== "slot") return [];

  const symbols = SYMBOL_LADDER.map((s, i) => ({
    role: "symbol" as AssetRole,
    label: s.label,
    spec: s.brief,
    sort: i,
  }));

  const scene: { role: AssetRole; label: string; spec: string; sort: number }[] = [
    { role: "background", label: "bg", spec: "the game's reel background", sort: 100 },
    { role: "frame", label: "frame", spec: "the reel frame and UI panel", sort: 101 },
    { role: "tile", label: "tile", spec: "lobby key art for the game", sort: 102 },
  ];

  return [...symbols, ...scene];
}

export async function addItems(
  projectId: string,
  items: { role: string; label: string; spec?: string | null; sort?: number }[],
): Promise<GenItem[]> {
  const out: GenItem[] = [];
  for (const [i, item] of items.entries()) {
    const label = clean(item.label, 40);
    if (!label) continue;
    if (!(item.role in ROLES)) {
      throw new Error(`unknown role ${item.role} — one of ${Object.keys(ROLES).join(", ")}`);
    }
    // on conflict do nothing: re-running the interview must not fail on the
    // symbols already agreed, and a duplicate label was never intended anyway.
    const row = await maybeOne<GenItem>(
      `insert into gen_items (project_id, role, label, spec, sort)
       values ($1, $2, $3, $4, $5)
       on conflict do nothing returning *`,
      [projectId, item.role, label, clean(item.spec, 2000) || null, item.sort ?? i],
    );
    if (row) out.push(row);
  }
  return out;
}

/** Re-specify one asset. The common edit, and it must stay free. */
export async function setItemSpec(
  projectId: string,
  label: string,
  spec: string | null,
): Promise<boolean> {
  const rows = await query(
    `update gen_items set spec = $3
      where project_id = $1 and lower(label) = lower($2) and status = 'planned'
      returning id`,
    [projectId, clean(label, 40), spec === null ? null : clean(spec, 2000) || null],
  );
  return rows.length > 0;
}

export async function removeItem(projectId: string, label: string): Promise<boolean> {
  const rows = await query(
    `delete from gen_items
      where project_id = $1 and lower(label) = lower($2) and status = 'planned'
      returning id`,
    [projectId, clean(label, 40)],
  );
  return rows.length > 0;
}

export async function readProject(
  id: string,
  ownerId: string,
): Promise<{ project: GenProject; items: GenItem[] } | null> {
  const project = await maybeOne<GenProject>(
    `select * from gen_projects where id = $1 and owner_id = $2`,
    [id, ownerId],
  );
  if (!project) return null;
  const items = await query<GenItem>(
    `select * from gen_items where project_id = $1 order by sort, created_at`,
    [id],
  );
  return { project, items };
}

export async function listProjects(ownerId: string, limit = 30): Promise<
  (GenProject & { planned: number; done: number })[]
> {
  return query(
    `select p.*,
            count(i.*) filter (where i.status = 'planned')::int as planned,
            count(i.*) filter (where i.status = 'done')::int as done
       from gen_projects p
       left join gen_items i on i.project_id = p.id
      where p.owner_id = $1
      group by p.id
      order by p.created_at desc
      limit $2`,
    [ownerId, limit],
  );
}

/**
 * What one asset is actually asked for.
 *
 * The project's style is the shared half of every prompt and the item's spec is
 * the rest — so leaving a spec empty is a real choice ("draw it from the world
 * you already described"), not an unfinished field. Assembled here rather than
 * at each call site so the web wizard and the MCP tool cannot drift into asking
 * for two different pictures from the same row.
 */
export function promptFor(project: GenProject, item: GenItem): string {
  return [
    project.style,
    project.palette ? `Palette: ${project.palette}.` : "",
    item.spec ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
