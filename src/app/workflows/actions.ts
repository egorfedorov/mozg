"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { one, query } from "@/db";
import { currentUser } from "@/lib/session";
import { slugify } from "@/lib/brains";
import { cleanSteps, MAX_STEPS, type WorkflowStep } from "@/lib/workflows";

/**
 * The canvas posts its nodes as one JSON field.
 *
 * Never trusted: it arrives from a browser like any other field, so it is
 * parsed and put through the same step schema the MCP side reads — a route
 * with a 40 KB "rule" pasted into it is somebody's mistake, not our storage
 * problem. cleanSteps drops what does not survive.
 */
function stepsFrom(formData: FormData): WorkflowStep[] {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("steps") ?? "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  // An empty node is a slot the author added and did not fill, not a step.
  return cleanSteps(raw);
}

export async function createWorkflow(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/workflows");

  const parsed = z
    .object({
      title: z.string().trim().min(1, "A workflow needs a name").max(80),
      summary: z.string().trim().max(200).optional(),
    })
    .safeParse({
      title: formData.get("title"),
      summary: formData.get("summary") ?? undefined,
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const slug = slugify(parsed.data.title);
  if (!slug) return { error: "That name has no letters or numbers in it." };

  const taken = await query(
    `select 1 from workflows where owner_id = $1 and slug = $2`,
    [user.id, slug],
  );
  if (taken.length) return { error: "You already have a workflow with that name." };

  await one(
    `insert into workflows (owner_id, slug, title, summary)
     values ($1, $2, $3, $4) returning id`,
    [user.id, slug, parsed.data.title, parsed.data.summary || null],
  );

  redirect(`/workflows/${slug}`);
}

export async function saveWorkflow(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/workflows");

  const slug = String(formData.get("slug") ?? "");
  const parsed = z
    .object({
      title: z.string().trim().min(1, "A workflow needs a name").max(80),
      summary: z.string().trim().max(200).optional(),
      visibility: z.enum(["private", "public"]),
    })
    .safeParse({
      title: formData.get("title"),
      summary: formData.get("summary") ?? undefined,
      visibility: formData.get("visibility") === "public" ? "public" : "private",
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const steps = stepsFrom(formData);
  // Only reachable by a hand-posted form — the canvas stops at MAX_STEPS. Say
  // no rather than store the first twelve of thirteen: a route missing its
  // last step still runs, to the wrong finish, looking complete.
  if (steps.length > MAX_STEPS) {
    return { error: `A route holds at most ${MAX_STEPS} steps.` };
  }
  // Publishing a route with no steps sells an empty box. Private drafts are
  // allowed to be empty — that is what a draft is.
  if (parsed.data.visibility === "public" && !steps.length) {
    return { error: "A published workflow needs at least one step." };
  }

  const rows = await query(
    `update workflows
        set title = $3, summary = $4, visibility = $5, steps = $6::jsonb,
            updated_at = now()
      where owner_id = $1 and slug = $2
      returning id`,
    [
      user.id,
      slug,
      parsed.data.title,
      parsed.data.summary || null,
      parsed.data.visibility,
      JSON.stringify(steps),
    ],
  );
  if (!rows.length) return { error: "That workflow is not yours." };

  revalidatePath(`/workflows/${slug}`);
  revalidatePath("/workflows");
  return { ok: true as const, steps: steps.length };
}

export async function deleteWorkflow(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/workflows");

  await query(`delete from workflows where owner_id = $1 and slug = $2`, [
    user.id,
    String(formData.get("slug") ?? ""),
  ]);
  redirect("/workflows");
}
