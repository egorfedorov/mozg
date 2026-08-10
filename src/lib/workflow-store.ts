import { maybeOne, query } from "@/db";
import type { Workflow, WorkflowStep } from "@/lib/workflows";

/**
 * Reading workflows out of the database.
 *
 * Split from lib/workflows.ts because the editor is a client component and
 * imports the step shape from there: one `import { query }` in that file
 * dragged the whole pg driver into the browser bundle. The shape is shared;
 * the queries are not.
 */

/** A workflow as it is listed, with the owner's handle for its public URL. */
export interface WorkflowRow extends Workflow {
  handle: string | null;
}

const SELECT = `select w.*, u.handle
                  from workflows w join "user" u on u.id = w.owner_id`;

export async function listWorkflows(ownerId: string): Promise<WorkflowRow[]> {
  return query<WorkflowRow>(
    `${SELECT} where w.owner_id = $1 order by w.updated_at desc`,
    [ownerId],
  );
}

export async function publicWorkflows(limit = 50): Promise<WorkflowRow[]> {
  return query<WorkflowRow>(
    `${SELECT} where w.visibility = 'public' order by w.updated_at desc limit $1`,
    [limit],
  );
}

/**
 * Find one by "handle/slug" or by bare slug.
 *
 * A viewer sees their own workflows whatever the visibility, and everyone
 * else's only when they are public — the same rule the brains use, so there is
 * one answer to "who can see this" rather than two that drift.
 */
export async function findWorkflow(
  name: string,
  viewerId: string | null,
): Promise<WorkflowRow | null> {
  const [a, b] = name.split("/");
  const handle = b ? a : null;
  const slug = (b ?? a ?? "").trim().toLowerCase();
  if (!slug) return null;

  return maybeOne<WorkflowRow>(
    `${SELECT}
      where w.slug = $1
        and ($2::text is null or u.handle = $2)
        and (w.visibility = 'public' or w.owner_id = $3)
      order by (w.owner_id = $3) desc
      limit 1`,
    [slug, handle, viewerId],
  );
}

export type { WorkflowStep };
