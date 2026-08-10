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
