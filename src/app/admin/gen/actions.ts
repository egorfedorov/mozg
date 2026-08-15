"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { setPrice } from "@/lib/genprice";
import { ROLES } from "@/lib/slotgen";

/**
 * Set what each kind of asset costs.
 *
 * Whole cents, one row per role, and a bad number is refused rather than
 * rounded: a price is the one field where "close enough" means somebody was
 * charged the wrong amount. Nothing is retroactive — an asset carries the
 * price it was bought at, so changing this moves the next order and never an
 * order already paid for.
 */
export async function savePrices(_prev: unknown, formData: FormData) {
  await requireAdmin();

  const changed: string[] = [];
  for (const role of Object.keys(ROLES)) {
    const raw = formData.get(role);
    if (raw === null) continue;

    const cents = Number(String(raw).trim());
    if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents < 0) {
      return { error: `"${role}" must be a whole number of cents.` };
    }
    await setPrice(role, cents);
    changed.push(role);
  }

  revalidatePath("/admin/gen");
  revalidatePath("/gen");
  return { ok: true, changed: changed.length };
}
