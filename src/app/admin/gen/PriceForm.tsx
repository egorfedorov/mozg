"use client";

import { useActionState } from "react";
import { useT } from "@/lib/t-client";
import { savePrices } from "./actions";

interface Row {
  role: string;
  cents: number;
  summary: string;
}

/**
 * The price list, editable.
 *
 * In cents rather than dollars, because that is what the database stores and
 * what the ledger moves — a form that takes "0.25" and multiplies is a form
 * that eventually rounds somebody's money.
 */
export default function PriceForm({ rows, setCosts }: { rows: Row[]; setCosts: Record<string, number> }) {
  const t = useT();
  const [state, action, pending] = useActionState(savePrices, null);

  return (
    <form action={action} style={{ display: "grid", gap: "1rem", maxWidth: "40rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.role} style={{ borderTop: "1px solid var(--rule)" }}>
              <td style={{ padding: ".5rem 0" }}>
                <strong>{r.role}</strong>
                <br />
                <span className="muted" style={{ fontSize: ".85em" }}>{r.summary}</span>
              </td>
              <td style={{ textAlign: "right", padding: ".5rem 0" }}>
                <input
                  name={r.role}
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={r.cents}
                  style={{ width: "6rem", textAlign: "right" }}
                />{" "}
                <span className="muted">¢</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted" style={{ fontSize: ".9em" }}>
        {t("At these prices a full game costs")}{" "}
        <strong>${(setCosts.full / 100).toFixed(2)}</strong>
        {t(", symbols only")} <strong>${(setCosts.symbols / 100).toFixed(2)}</strong>
        {t(", a scene")} <strong>${(setCosts.scene / 100).toFixed(2)}</strong>
        {t(". One asset costs us about 1.5¢ to generate.")}
      </p>

      {state?.error ? (
        <p role="alert" style={{ margin: 0, color: "var(--ink-2)" }}>{state.error}</p>
      ) : state?.ok ? (
        <p style={{ margin: 0, color: "var(--ink-2)" }}>{t("Saved — the next order uses these.")}</p>
      ) : null}

      <div>
        <button type="submit" disabled={pending}>{pending ? t("Saving…") : t("Save prices")}</button>
      </div>
    </form>
  );
}
