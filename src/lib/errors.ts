import { query } from "@/db";

/**
 * One door for every layer's failures. Fire-and-forget by contract: error
 * reporting that can itself fail the work it is reporting on would be a
 * second bug on top of the first, so this never throws and never awaits
 * anything the caller cares about. It also still console.errors — the
 * table is for triage, the log line is for `docker logs` mid-incident.
 */
export function reportError(
  source: "app" | "worker" | "mcp" | "client" | "payments",
  kind: string,
  err: unknown,
  meta: { userId?: string | null; brainId?: string | null; detail?: string } = {},
): void {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[${source}:${kind}] ${message}`);

  void query(
    `insert into app_errors (source, kind, message, detail, user_id, brain_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      source,
      kind.slice(0, 80),
      message.slice(0, 500),
      [meta.detail, stack].filter(Boolean).join("\n\n").slice(0, 4000) || null,
      meta.userId ?? null,
      meta.brainId ?? null,
    ],
  ).catch(() => {});

  void alertIfNew(source, kind, message);
}

/**
 * Tell somebody when a NEW kind of failure appears.
 *
 * The error page is a good place to read failures and a bad place to notice
 * them: rows sat there for a day and a half because nobody had a reason to
 * open it. The first occurrence is the one worth interrupting for — after
 * that, the same message repeating is a known incident, not news.
 *
 * Silent by construction if push is not configured, and it never throws:
 * an alert that can break the thing it is reporting on is a second bug.
 */
async function alertIfNew(source: string, kind: string, message: string): Promise<void> {
  try {
    const [seen] = await query<{ n: number }>(
      `select count(*)::int as n from app_errors
        where source = $1 and kind = $2
          and message = $3
          and created_at < now() - interval '10 minutes'`,
      [source, kind.slice(0, 80), message.slice(0, 500)],
    );
    if (seen?.n) return;

    const { sendPush } = await import("@/lib/push");
    await sendPush(
      {
        title: `New failure: ${source}/${kind}`,
        body: message.slice(0, 160),
        url: "/admin/errors",
      },
      "admins",
    );
  } catch {
    // An alert that cannot be delivered must not become an error of its own —
    // that is how one broken push endpoint turns into a loop.
  }
}

/**
 * Say once, loudly, that the platform key has run dry.
 *
 * Swallowing the 402 fixed 169 duplicate rows and created a worse problem: an
 * empty key would now stall every lane in total silence, and the balance
 * running out is exactly the thing an operator has to hear about immediately.
 * The August outage was noticed because the error page was loud, not because
 * anything watched the balance — nothing does.
 *
 * One row per outage, not one per hour or one per source: an unresolved row
 * stays on the error page for as long as the outage lasts, which is the state
 * the operator needs, and reportError's own alert fires on the first one. When
 * they resolve it and the key is still empty, the next source says so again.
 *
 * Two workers could both write a row in the same instant. Two is not 169, and
 * a lock to prevent it would cost more than it saves.
 */
export async function reportOutOfCreditOnce(
  source: "worker",
  err: unknown,
  meta: { detail?: string; brainId?: string } = {},
): Promise<void> {
  await reportOnce(source, "provider-credit", err, meta);
}

/**
 * One unresolved row per ongoing condition, for anything that repeats on a
 * clock rather than happening once.
 *
 * The rule that makes this work is that the *message* must not carry the
 * changing number — a spend figure or a balance in the message makes every
 * occurrence a new one to alertIfNew, and the operator gets a push every pass
 * for a condition they already know about. Put the moving number in `detail`,
 * which is read on the error page and never compared.
 */
export async function reportOnce(
  source: "app" | "worker" | "mcp" | "client" | "payments",
  kind: string,
  err: unknown,
  meta: { detail?: string; brainId?: string; userId?: string | null } = {},
): Promise<void> {
  const [open] = await query<{ n: number }>(
    `select count(*)::int as n from app_errors
      where kind = $1 and resolved_at is null`,
    [kind],
  );
  if (open?.n) return;
  reportError(source, kind, err, meta);
}
