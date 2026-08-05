"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";

/**
 * Posting and retiring announcements.
 *
 * Deliberately thin: an announcement is a sentence with a window, and every
 * field the form does not have is a field nobody has to think about while the
 * queue is down. Retiring unpublishes rather than deletes — what we told people,
 * and when, is worth keeping.
 */

const posted = z.object({
  kind: z.enum(["maintenance", "news", "notice"]),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().max(2000),
  // Minutes from now. Maintenance without an end is a bar that outlives the
  // outage and teaches people to ignore the next one.
  minutes: z.coerce.number().int().min(1).max(10_080).optional(),
  toAgents: z.boolean(),
});

export async function postAnnouncement(formData: FormData): Promise<void> {
  const admin = await requireAdmin().catch(() => redirect("/"));

  const parsed = posted.safeParse({
    kind: formData.get("kind"),
    title: formData.get("title"),
    body: formData.get("body") ?? "",
    minutes: formData.get("minutes") || undefined,
    toAgents: formData.get("toAgents") === "on",
  });
  if (!parsed.success) return;
  const { kind, title, body, minutes, toAgents } = parsed.data;

  await query(
    `insert into announcements (kind, title, body, ends_at, to_agents, created_by)
     values ($1, $2, $3, case when $4::int is null then null
                              else now() + ($4::int || ' minutes')::interval end, $5, $6)`,
    [kind, title, body, minutes ?? null, toAgents, admin.id],
  );

  revalidatePath("/admin/announcements");
  revalidatePath("/changelog");
  revalidatePath("/");
}

export async function retireAnnouncement(formData: FormData): Promise<void> {
  await requireAdmin().catch(() => redirect("/"));
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  await query(`update announcements set published = false where id = $1`, [id.data]);
  revalidatePath("/admin/announcements");
  revalidatePath("/changelog");
  revalidatePath("/");
}
