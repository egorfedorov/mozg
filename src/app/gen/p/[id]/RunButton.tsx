"use client";

import { useActionState } from "react";
import { useT } from "@/lib/t-client";
import { generate } from "@/app/gen/project-actions";

/**
 * The one control on this page that spends money, and it says so.
 *
 * Disabled when the balance will not cover the run, rather than letting the
 * click fail: the server refuses an unaffordable set before creating anything,
 * so a button that looks live and then says no is a worse version of the same
 * answer.
 */
export default function RunButton({
  projectId,
  count,
  affordable,
}: {
  projectId: string;
  count: number;
  affordable: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(generate, null);

  if (!count) return null;

  return (
    <form action={action} style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="project" value={projectId} />
      {affordable ? (
        <button className="btn" disabled={pending}>
          {pending ? t("Starting…") : t("Generate the planned set")}
        </button>
      ) : (
        <a className="btn" href="https://mozg.sh/settings/balance">
          {t("Top up to generate")}
        </a>
      )}
      {state && "error" in state && state.error && (
        <span style={{ color: "var(--color-riso-red)", fontSize: ".8125rem" }}>{state.error}</span>
      )}
      {state && "ok" in state && (
        <span className="mono" style={{ fontSize: ".75rem" }}>
          {t("started — refresh to watch them land")}
        </span>
      )}
    </form>
  );
}
