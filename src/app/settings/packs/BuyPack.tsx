"use client";

import { useActionState } from "react";
import { useT } from "@/lib/t-client";
import { fill } from "@/lib/markup";
import { buyPack } from "./actions";
import { formatCents } from "@/lib/money-math";

/** One button. The price is the pack's, read on the server — never posted. */
export default function BuyPack({
  pack,
  priceCents,
  affordable,
}: {
  pack: string;
  priceCents: number;
  affordable: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(buyPack, null);

  return (
    <form action={action} style={{ display: "inline-flex", gap: ".5rem", flexWrap: "wrap" }}>
      <input type="hidden" name="pack" value={pack} />
      <button className={affordable ? "btn" : "btn btn-ghost"} type="submit" disabled={pending}>
        {pending ? t("Buying…") : fill(t("Buy for <0/>"), [formatCents(priceCents)])}
      </button>
      {state?.error && (
        <span className="mono" style={{ alignSelf: "center", fontSize: ".8125rem", color: "var(--color-riso-red)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
