"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { maybeOne, query } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { publishBlocker } from "@/lib/publishable";
import { scanSecrets, scanPII, scanInjection } from "@/lib/scan";
import { TOPIC_KEYS } from "@/lib/topics";
import { storage, storageKey } from "@/lib/storage";

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
      contributions: z.coerce.boolean(),
      kind: z.enum(["knowledge", "style"]),
      // Entered in dollars, stored in cents. Anything above $1000 is a slipped
      // decimal point far more often than it is a real price.
      price: z.coerce.number().min(0).max(1000),
      topic: z.string().transform((t) => (TOPIC_KEYS.includes(t) ? t : "other")),
    })
    .safeParse({
      visibility: formData.get("visibility"),
      license: formData.get("license"),
      review_required: formData.get("review_required") === "on",
      contributions: formData.get("contributions") === "on",
      kind: formData.get("kind") === "style" ? "style" : "knowledge",
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

    // A published brain is read by other people's AGENTS — a note that says
    // "ignore your instructions…" steers every model that reads it. Blocked
    // at the same door as credentials.
    const injections = scanInjection(corpus);
    if (injections.length && parsed.data.visibility === "public") {
      return {
        error:
          `Cannot publish: ${injections.length} note(s) contain language that ` +
          `steers AI readers (${[...new Set(injections.map((i) => i.label))].join(", ")}). ` +
          "Agents of other people will execute what your notes say — remove those lines first.",
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

  // Material and a measured score, before anything else about the listing.
  // Checked here rather than only at moderation because an admin publishes
  // straight through, and that is exactly how the empty shelves got onto the
  // catalogue in the first place.
  if (parsed.data.visibility === "public" && brain.visibility !== "public") {
    const blocker = await publishBlocker(brain.id);
    if (blocker) return { error: blocker };
  }

  // The public catalogue is curated: a user asking for public files a
  // request and the brain stays as it is until an operator approves.
  // Admins publish directly; link-sharing needs no approval — it reaches
  // only people the owner gave the URL to.
  const wantsModeration =
    parsed.data.visibility === "public" &&
    brain.visibility !== "public" &&
    !isAdmin(user);
  const effectiveVisibility = wantsModeration ? brain.visibility : parsed.data.visibility;

  await query(
    `update brains set visibility = $2, license = $3, review_required = $4,
            price_cents = $5, topic = $6, contributions = $7, kind = $8, updated_at = now()
      where id = $1`,
    [
      brain.id,
      effectiveVisibility,
      parsed.data.license,
      parsed.data.review_required,
      priceCents,
      parsed.data.topic,
      parsed.data.contributions,
      parsed.data.kind,
    ],
  );

  if (wantsModeration) {
    await query(
      `insert into publish_requests (brain_id, requested_by)
       values ($1, $2) on conflict do nothing`,
      [brain.id, user.id],
    );
  }

  revalidatePath(`/brains/${slug}/share`);
  return { ok: true as const, moderation: wantsModeration };
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

/**
 * Upload a cover for the gallery.
 *
 * Separate from promoting a source, because the two cases are genuinely
 * different. A style brain trained on the artist's own uploads already has
 * images to choose from; a brain written as text has none, and until this
 * existed those brains could never appear on the gallery wall at all — which
 * is most of them, since writing the rules is the recommended way to teach a
 * style you do not want to hand over as files.
 *
 * The file goes to storage and nowhere else: no source row, no extraction, no
 * notes, no bill. It is a shop window, not material.
 */
export async function uploadCover(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await ownedBrain(slug, user.id);
  if (!brain) return { error: "Brain not found." };

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick an image first." };
  if (!file.type.startsWith("image/")) return { error: "That is not an image." };
  // A cover renders at ~400px wide. Anything past a few megabytes is a camera
  // original nobody meant to publish at full size.
  if (file.size > 6_000_000) return { error: "Too large — 6 MB is the ceiling for a cover." };

  const key = storageKey(brain.id, file.name);
  await storage.put(key, Buffer.from(await file.arrayBuffer()), file.type);
  await query(`update brains set cover_key = $2 where id = $1`, [brain.id, key]);

  revalidatePath(`/brains/${slug}/share`);
  revalidatePath("/gallery");
  return { ok: true };
}
