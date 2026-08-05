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
}
