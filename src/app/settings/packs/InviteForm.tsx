"use client";

import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";
import { useActionState } from "react";
import { invitePackSeat } from "./actions";

/**
 * One row per pack: an address and a button. The seat count sits above it on
 * the page, so the form does not have to explain a limit it cannot show.
 */
export default function InviteForm({
  pack,
  disabled,
}: {
  pack: string;
  disabled?: boolean;
}) {
  const t = useT();

  const [state, action, pending] = useActionState(invitePackSeat, null);

  return (
    <form action={action} className="stack-tight" style={{ marginTop: ".75rem" }}>
      <input type="hidden" name="pack" value={pack} />
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <input
          name="email"
          type="email"
          required
          disabled={disabled}
          placeholder={t("colleague@studio.com")}
          autoComplete="off"
          style={{
            flex: "1 1 14rem",
            minWidth: 0,
            padding: ".5rem .6rem",
            border: "1.5px solid var(--ink)",
            background: "var(--paper)",
            font: "inherit",
            fontSize: ".875rem",
          }}
        />
        <button className="btn" type="submit" disabled={pending || disabled}>
          {pending ? t("Adding…") : t("Give a seat")}
        </button>
      </div>

      {state?.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem" }}>
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="mono" style={{ color: "var(--color-riso-green)", fontSize: ".8125rem" }}>
          {markup(t("<0/> has a seat. It opens the moment they sign in with that address and verify it — there is nothing for them to accept."), [
          state.email,
        ])}</p>
      )}
    </form>
  );
}
