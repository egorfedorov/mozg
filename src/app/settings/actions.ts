"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { requestPayout, MIN_PAYOUT_CENTS } from "@/lib/money";
import { formatCents } from "@/lib/money-math";
import { createInvoice } from "@/lib/payments";

/** Handles are a public namespace — /b/{handle}/{slug} — so they are strict. */
const HANDLE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

const RESERVED = new Set([
  "admin", "api", "b", "beta", "brains", "connect", "explore", "guide", "make",
  "mcp", "pricing", "settings", "sign-in", "sign-up", "vs", "why", "www",
  "support", "help",
]);

export async function updateProfile(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const parsed = z
    .object({
      name: z.string().trim().min(1, "A name cannot be empty").max(60),
      handle: z
        .string()
        .trim()
        .toLowerCase()
        .regex(HANDLE, "Handles are 3–30 characters: letters, numbers and dashes"),
    })
    .safeParse({ name: formData.get("name"), handle: formData.get("handle") });

  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (RESERVED.has(parsed.data.handle)) {
    return { error: "That handle is reserved." };
  }

  // The unique index is the real guard; this turns a constraint violation into
  // a sentence the person can act on.
  const taken = await query(
    `select 1 from "user" where handle = $1 and id <> $2`,
    [parsed.data.handle, user.id],
  );
  if (taken.length) return { error: "That handle is taken." };

  await query(
    `update "user" set name = $2, handle = $3, "updatedAt" = now() where id = $1`,
    [user.id, parsed.data.name, parsed.data.handle],
  );

  revalidatePath("/settings");
  return { ok: true as const, handle: parsed.data.handle };
}

export async function askForPayout(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const parsed = z
    .object({
      amount: z.coerce.number().positive("Enter an amount").max(10000),
      destination: z
        .string()
        .trim()
        .min(8, "Where should it go? Paste a wallet address and its network")
        .max(200),
    })
    .safeParse({
      amount: String(formData.get("amount") ?? "").replace(",", "."),
      destination: formData.get("destination"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const res = await requestPayout({
    userId: user.id,
    amountCents: Math.round(parsed.data.amount * 100),
    destination: parsed.data.destination,
  });

  if (!res.ok) {
    return {
      error:
        res.reason === "too-small"
          ? `The smallest withdrawal is ${formatCents(MIN_PAYOUT_CENTS)} — below that the transfer fee eats it.`
          : res.reason === "already-open"
            ? "You already have a withdrawal waiting. It has to be settled first."
            : "That is more than your balance.",
    };
  }

  revalidatePath("/settings/balance");
  return { ok: true as const };
}

export async function startTopUp(
  _prev: unknown,
  formData: FormData,
): Promise<{ payUrl?: string; amountCents?: number; error?: string }> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const amountCents = Number(formData.get("amount") ?? 0);
  const res = await createInvoice({ userId: user.id, amountCents });

  if (!res.ok) {
    return {
      error:
        res.reason === "unconfigured"
          ? "Top-ups are not switched on yet."
          : res.reason === "amount"
            ? "Pick one of the amounts above."
            : `The payment provider did not answer (${res.reason}). Try again shortly.`,
    };
  }

  revalidatePath("/settings/balance");
  return { payUrl: res.invoice.payUrl, amountCents: res.invoice.amountCents };
}
