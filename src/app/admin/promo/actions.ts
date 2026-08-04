"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query } from "@/db";
import { requireAdmin } from "@/lib/admin";

/**
 * Mint a promo code. The code itself is generated, never typed — human-chosen
 * codes collide with the guessable ("LAUNCH50") and the guessable gets brute
 * forced the day the discount is worth it.
 */
export async function mintPromo(formData: FormData): Promise<void> {
  await requireAdmin().catch(() => redirect("/"));

  const parsed = z
    .object({
      percent: z.coerce.number().int().min(1).max(100),
      uses: z.coerce.number().int().min(1).max(10_000),
      days: z.coerce.number().int().min(1).max(365).optional(),
      note: z.string().trim().max(200).optional(),
    })
    .safeParse({
      percent: formData.get("percent"),
      uses: formData.get("uses"),
      days: formData.get("days") || undefined,
      note: formData.get("note") || undefined,
    });
  if (!parsed.success) return;

  // MOZG-XXXXXX from an unambiguous alphabet (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code =
    "MOZG-" +
    Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");

  await query(
    `insert into promo_codes (code, percent_off, max_uses, expires_at, note)
     values ($1, $2, $3, $4, $5)`,
    [
      code,
      parsed.data.percent,
      parsed.data.uses,
      parsed.data.days ? new Date(Date.now() + parsed.data.days * 86_400_000) : null,
      parsed.data.note ?? null,
    ],
  );

  revalidatePath("/admin/promo");
}
