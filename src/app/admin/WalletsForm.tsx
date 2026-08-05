"use client";

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
  const [state, action, pending] = useActionState(saveWallets, null);

  const label = (f: string) => wallets.find((w) => w.field === f)?.label ?? f;

  return (
    <form action={action} style={{ display: "grid", gap: ".7rem", maxWidth: "40rem" }}>
      {wallets.map((w) => (
        <label key={w.field} style={{ display: "grid", gap: ".25rem" }}>
          <span className="eyebrow" style={state?.rejected.includes(w.field) ? { color: "var(--color-riso-red)" } : undefined}>
            {w.label}
            {state?.rejected.includes(w.field) && " — rejected, not saved"}
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
          {pending ? "Saving…" : "Save wallets"}
        </button>
        {state && state.rejected.length === 0 && (
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-green)" }}>
            saved ✓ {state.at}
            {state.saved.length > 0 && ` · ${state.saved.length} address${state.saved.length > 1 ? "es" : ""}`}
            {state.cleared.length > 0 && ` · ${state.cleared.map(label).join(", ")} back to env`}
          </span>
        )}
        {state && state.rejected.length > 0 && (
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-red)" }}>
            {state.rejected.map(label).join(", ")}: not a valid address — everything else saved
          </span>
        )}
      </div>
    </form>
  );
}
