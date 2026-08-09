"use client";

import { useActionState } from "react";
import { submitReview } from "./review-action";
import { useT } from "@/lib/t-client";

/** The buyer's say: five radio stars and an optional line. One per buyer,
 *  editable — the form doubles as the edit form. */
export default function ReviewBox({
  handle,
  slug,
  existing,
}: {
  handle: string;
  slug: string;
  existing: { rating: number; body: string } | null;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(submitReview, null);

  return (
    <form action={action} className="panel" style={{ display: "grid", gap: ".6rem" }}>
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="slug" value={slug} />
      <p className="eyebrow" style={{ margin: 0 }}>
        {existing ? t("Your review — edit it any time") : t("You bought it — rate it")}
      </p>

      <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map((r) => (
          <label key={r} className="mono" style={{ fontSize: ".9375rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="rating"
              value={r}
              defaultChecked={existing?.rating === r}
              style={{ marginRight: ".25rem" }}
            />
            {r}★
          </label>
        ))}
      </div>

      <textarea
        name="body"
        rows={2}
        maxLength={600}
        defaultValue={existing?.body ?? ""}
        placeholder={t("One honest line: what did it answer well, where did it fall short?")}
        style={{
          width: "100%",
          padding: ".6rem .75rem",
          border: "1.5px solid var(--ink)",
          background: "var(--paper)",
          font: "inherit",
          fontSize: ".9375rem",
        }}
      />

      <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
        <button className="btn btn-ghost" disabled={pending} style={{ padding: ".45rem .9rem" }}>
          {pending ? t("Saving…") : existing ? t("Update review") : t("Post review")}
        </button>
        {state?.ok && <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-green)" }}>{t("saved")}</span>}
        {state?.error && <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-red)" }}>{state.error}</span>}
      </div>
    </form>
  );
}
