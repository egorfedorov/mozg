"use client";

import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";
import { useActionState } from "react";
import { updateProfile } from "./actions";

export default function ProfileForm({
  name,
  handle,
}: {
  name: string;
  handle: string;
}) {
  const t = useT();

  const [state, action, pending] = useActionState(updateProfile, null);

  return (
    <form action={action} className="panel" style={{ display: "grid", gap: "1.25rem" }}>
      <label style={{ display: "grid", gap: ".35rem" }}>
        <span style={{ fontWeight: 600 }}>{t("Display name")}</span>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
          {t("Shown next to brains you publish.")}</span>
        <input name="name" defaultValue={name} maxLength={60} required style={input} />
      </label>

      <label style={{ display: "grid", gap: ".35rem" }}>
        <span style={{ fontWeight: 600 }}>{t("Handle")}</span>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
          {t("Your public namespace. Changing it changes every link to your brains.")}</span>
        <span style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
          <span className="mono" style={{ color: "var(--ink-2)" }}>
            {t("mozg.sh/b/")}</span>
          <input
            name="handle"
            defaultValue={handle}
            maxLength={30}
            required
            style={{ ...input, maxWidth: 260 }}
          />
        </span>
      </label>

      {state?.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="mono" style={{ color: "var(--color-riso-green)", fontSize: ".8125rem", margin: 0 }}>
          {markup(t("Saved. Your brains now live at /b/<0/>/…"), [
          state.handle,
        ])}</p>
      )}

      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? t("Saving…") : t("Save profile")}
        </button>
      </div>
    </form>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: ".6rem .8rem",
  border: "1.5px solid var(--ink)",
  background: "var(--paper)",
  color: "var(--ink)",
  font: "inherit",
};
