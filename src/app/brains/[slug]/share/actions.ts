"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { maybeOne, query } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { scanSecrets, scanPII } from "@/lib/scan";
import { TOPIC_KEYS } from "@/lib/topics";

async function ownedBrain(slug: string, userId: string): Promise<Brain | null> {
  return maybeOne<Brain>(`select * from brains where owner_id = $1 and slug = $2`, [
    userId,
    slug,
  ]);
}

export async function updateSharing(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await ownedBrain(slug, user.id);
  if (!brain) return { error: "Brain not found." };

  const parsed = z
    .object({
      visibility: z.enum(["private", "link", "public"]),
      license: z.enum(["nc", "mit", "proprietary"]),
      review_required: z.coerce.boolean(),
      // Entered in dollars, stored in cents. Anything above $1000 is a slipped
      // decimal point far more often than it is a real price.
      price: z.coerce.number().min(0).max(1000),
      topic: z.string().transform((t) => (TOPIC_KEYS.includes(t) ? t : "other")),
    })
    .safeParse({
      visibility: formData.get("visibility"),
      license: formData.get("license"),
      review_required: formData.get("review_required") === "on",
      price: String(formData.get("price") ?? "0").replace(",", ".") || "0",
      topic: String(formData.get("topic") ?? "other"),
    });

  if (!parsed.success) return { error: "Invalid settings." };

  const priceCents = Math.round(parsed.data.price * 100);

  // A price on a brain nobody can reach is a trap for the author, not a sale.
  if (priceCents > 0 && parsed.data.visibility !== "public") {
    return { error: "A brain has to be public before it can be sold." };
  }

  // Selling something whose licence lets the buyer resell it is a decision, not
  // an accident — say so rather than silently allowing it.
  if (priceCents > 0 && parsed.data.license === "mit") {
    return {
      error:
        "MIT lets buyers resell your brain. Pick CC BY-NC-SA or Closed if you are charging for it.",
    };
  }

  // Publication gate: a brain that leaks a credential must never become
  // readable by strangers. Ingest scans too, but a note could predate a rule
  // being added, and this is the last door before the internet.
  if (parsed.data.visibility !== "private" && brain.visibility === "private") {
    const notes = await query<{ title: string; body: string }>(
      `select title, body from notes where brain_id = $1 and status = 'active'`,
      [brain.id],
    );
    const corpus = notes.map((n) => `${n.title}\n${n.body}`).join("\n\n");

    const secrets = scanSecrets(corpus);
    if (secrets.length) {
      return {
        error:
          `Cannot share: ${secrets.length} possible credential(s) found — ` +
          `${secrets.map((s) => s.label).join(", ")}. Remove those notes first.`,
      };
    }

    const pii = scanPII(corpus);
    if (pii.length > 5 && parsed.data.visibility === "public") {
      return {
        error:
          `Cannot publish: ${pii.length} pieces of personal data found ` +
          `(${[...new Set(pii.map((p) => p.label))].join(", ")}). Sharing by link is still fine.`,
      };
    }
  }

  await query(
    `update brains set visibility = $2, license = $3, review_required = $4,
            price_cents = $5, topic = $6, updated_at = now()
      where id = $1`,
    [
      brain.id,
      parsed.data.visibility,
      parsed.data.license,
      parsed.data.review_required,
      priceCents,
      parsed.data.topic,
    ],
  );

  revalidatePath(`/brains/${slug}/share`);
  return { ok: true as const };
}

export async function inviteByEmail(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await ownedBrain(slug, user.id);
  if (!brain) return { error: "Brain not found." };

  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().pipe(z.email("That is not an email address")),
      role: z.enum(["viewer", "contributor"]),
    })
    .safeParse({ email: formData.get("email"), role: formData.get("role") });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.email === user.email.toLowerCase()) {
    return { error: "You already own this brain." };
  }

  await query(
    `insert into grants (brain_id, email, role, invited_by) values ($1, $2, $3, $4)
     on conflict (brain_id, email) do update set role = excluded.role`,
    [brain.id, parsed.data.email, parsed.data.role, user.id],
  );

  revalidatePath(`/brains/${slug}/share`);
  return { ok: true as const };
}

export async function removeGrant(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await ownedBrain(slug, user.id);
  if (!brain) return;

  await query(`delete from grants where id = $1 and brain_id = $2`, [
    String(formData.get("id")),
    brain.id,
  ]);
  revalidatePath(`/brains/${slug}/share`);
}
