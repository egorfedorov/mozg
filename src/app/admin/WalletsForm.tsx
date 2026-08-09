"use client";

import { useT } from "@/lib/t-client";
import { fill, markup } from "@/lib/markup";
import { useActionState } from "react";
import { saveWallets } from "./actions";

/**
 * The wallets form with a voice. Saving money-receiving addresses silently is
 * how a typo becomes a support thread — every submit answers with exactly
 * what was saved, what was cleared back to env, and what was refused for not
 * looking like an address on its chain.
 */
export interface WalletField {
  field: string;
  label: string;
  value: string;
  envValue?: string;
}

export default function WalletsForm({ wallets }: { wallets: WalletField[] }) {
  const t = useT();

  const [state, action, pending] = useActionState(saveWallets, null);

  const label = (f: string) => wallets.find((w) => w.field === f)?.label ?? f;

  return (
    <form action={action} style={{ display: "grid", gap: ".7rem", maxWidth: "40rem" }}>
      {wallets.map((w) => (
        <label key={w.field} style={{ display: "grid", gap: ".25rem" }}>
          <span className="eyebrow" style={state?.rejected.includes(w.field) ? { color: "var(--color-riso-red)" } : undefined}>
            {w.label}
            {state?.rejected.includes(w.field) && t(" — rejected, not saved")}
          </span>
          <input
            type="text"
            name={w.field}
            defaultValue={w.value}
            placeholder={w.envValue ? `env: ${w.envValue}` : "not set — coin hidden from payers"}
            className="mono"
            style={{
              width: "100%",
              padding: ".5rem .7rem",
              border: state?.rejected.includes(w.field)
                ? "1.5px solid var(--color-riso-red)"
                : "1.5px solid var(--ink)",
              background: "var(--paper)",
              fontSize: ".8125rem",
            }}
          />
        </label>
      ))}

      <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" disabled={pending}>
          {pending ? t("Saving…") : t("Save wallets")}
        </button>
        {state && state.rejected.length === 0 && (
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-green)" }}>
            {markup(t("saved ✓ <0/> <1/> <2/>"), [
            state.at,
            state.saved.length > 0 &&
              fill(
                state.saved.length === 1 ? t(" · <0/> address") : t(" · <0/> addresses"),
                [state.saved.length],
              ),
            state.cleared.length > 0 &&
              fill(t(" · <0/> back to env"), [state.cleared.map(label).join(", ")]),
          ])}</span>
        )}
        {state && state.rejected.length > 0 && (
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-red)" }}>
            {markup(t("<0/>: not a valid address — everything else saved"), [
            state.rejected.map(label).join(", "),
          ])}</span>
        )}
      </div>
    </form>
  );
}
