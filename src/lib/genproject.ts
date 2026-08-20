import { query, maybeOne } from "@/db";
import { ROLES, SETS, type AssetRole } from "@/lib/slotgen";
import type { Brain } from "@/db/types";

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
export function proposedItems(
  set: string = "full",
): Omit<GenItem, "id" | "project_id" | "status" | "generation_id">[] {
  // Straight from the sets the service already knows how to price and prompt.
  // Reading them here rather than keeping a second list is what stops the
  // interview proposing a set the generator has never heard of.
  const specs = (SETS[set] ?? SETS.full)();
  return specs.map((s, i) => ({
    role: s.role as AssetRole,
    label: s.label,
    spec: s.brief,
    sort: i,
  }));
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
): Promise<{ project: GenProject; items: (GenItem & { storage_key: string | null; error: string | null })[] } | null> {
  const project = await maybeOne<GenProject>(
    `select * from gen_projects where id = $1 and owner_id = $2`,
    [id, ownerId],
  );
  if (!project) return null;
  // The generation carries the picture and the failure reason; the item
  // carries the plan. Joined here so a page showing thirteen assets does not
  // read thirteen generations one at a time.
  const items = await query<GenItem & { storage_key: string | null; error: string | null }>(
    `select i.*, g.storage_key, g.error
       from gen_items i
       left join generations g on g.id = i.generation_id
      where i.project_id = $1
      order by i.sort, i.created_at`,
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
 * What one asset is asked for, as a person reads it.
 *
 * A preview, and only that. The prompt that actually reaches the model is
 * composed by assetpacks.startPack, which wraps this in the technical rules
 * for the role — chroma key, margins, what may not touch the background — and
 * those rules are the difference between a symbol and a picture. Two composers
 * would be two sources of truth; this one exists so the cabinet can show a
 * studio what it is about to buy.
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


/**
 * Generate the planned assets of a project.
 *
 * One run is one pack. That is not a compromise to reuse code — it is what a
 * run is: a batch a studio decided on and paid for at a moment in time. The
 * project is the folder those batches accumulate in, so redoing the premium
 * next week is a second pack in the same project rather than an edit to a
 * receipt.
 *
 * Every rule about money therefore stays where it already was. startPack
 * debits inside the transaction, refuses an unaffordable set before creating
 * anything, picks the anchor the others are drawn against, pays the artist and
 * records what each call cost us. Nothing here re-implements any of it.
 */
export async function runProject(
  projectId: string,
  ownerId: string,
  labels?: string[],
): Promise<{ ok: true; packId: string; ids: string[] } | { ok: false; reason: string }> {
  const read = await readProject(projectId, ownerId);
  if (!read) return { ok: false, reason: "No such project." };
  const { project } = read;

  const wanted = labels?.map((l) => l.toLowerCase());
  const planned = read.items.filter(
    (i) => i.status === "planned" && (!wanted || wanted.includes(i.label.toLowerCase())),
  );
  if (!planned.length) {
    return {
      ok: false,
      reason: labels?.length
        ? "Nothing planned under those labels — already generated, or never added."
        : "Everything in this project has been generated. Add an asset, or re-plan one.",
    };
  }
  if (!project.style || project.style.length < 10) {
    return { ok: false, reason: "Describe the game first — the style is the shared half of every prompt." };
  }

  const { startPack } = await import("@/lib/assetpacks");

  const style = project.style_brain_id
    ? await maybeOne<Brain>(`select * from brains where id = $1`, [project.style_brain_id])
    : null;

  const started = await startPack({
    ownerId,
    title: project.title,
    brief: project.style,
    palette: project.palette,
    style,
    // An item with no spec of its own is drawn from the project's style alone,
    // which startPack already receives as the brief — so an empty string here
    // is the correct instruction rather than a missing one.
    specs: planned.map((i) => ({ role: i.role, label: i.label, brief: i.spec ?? "" })),
  });
  if (!started.ok) return { ok: false, reason: started.reason };

  // Link each planned row to the generation that will fill it.
  //
  // Matched by label, read back from the pack, rather than by the order the
  // specs went in. startPack returns the pack, not its rows, and an index that
  // happens to line up today is a silent mis-attribution the first time that
  // function reorders anything — which it already does, since it moves the
  // anchor to the front.
  const made = await query<{ id: string; label: string }>(
    `select id, label from generations where pack_id = $1`,
    [started.id],
  );
  const byLabel = new Map(made.map((g) => [g.label.toLowerCase(), g.id]));

  for (const item of planned) {
    const generationId = byLabel.get(item.label.toLowerCase());
    if (!generationId) continue;
    await query(
      `update gen_items set status = 'generating', generation_id = $2 where id = $1`,
      [item.id, generationId],
    );
  }
  await query(`update gen_projects set updated_at = now() where id = $1`, [projectId]);

  return { ok: true, packId: started.id, ids: made.map((g) => g.id) };
}

/**
 * Bring a project's items in step with the generations behind them.
 *
 * The worker settles a generation; nothing tells the item. Rather than have the
 * worker know about projects — a dependency pointing the wrong way — the item
 * reads its own generation whenever the project is opened.
 */
export async function syncItems(projectId: string): Promise<void> {
  await query(
    `update gen_items i
        set status = case g.status
                       when 'done' then 'done'
                       when 'failed' then 'failed'
                       else i.status end
       from generations g
      where g.id = i.generation_id
        and i.project_id = $1
        and i.status = 'generating'
        and g.status in ('done', 'failed')`,
    [projectId],
  );
}
