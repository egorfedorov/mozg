"use client";

import { useT } from "@/lib/t-client";
import { useActionState } from "react";
import { createWorkflow } from "./actions";

const input: React.CSSProperties = {
  padding: ".55rem .7rem",
  border: "1px solid var(--rule)",
  borderRadius: 6,
  font: "inherit",
  background: "var(--paper)",
  color: "inherit",
};

export default function NewWorkflowForm() {
  const t = useT();
  const [state, action, pending] = useActionState(createWorkflow, null);

  return (
    <form action={action} className="panel" style={{ display: "grid", gap: "1rem" }}>
      <label style={{ display: "grid", gap: ".35rem" }}>
        <span style={{ fontWeight: 600 }}>{t("What it builds")}</span>
        <input
          name="title"
          required
          maxLength={80}
          placeholder={t("A slot game for Stake Engine")}
          style={input}
        />
      </label>

      <label style={{ display: "grid", gap: ".35rem" }}>
        <span style={{ fontWeight: 600 }}>{t("One line more")}</span>
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-2)" }}>
          {t("This is what an agent matches against when the user does not name a workflow.")}
        </span>
        <input
          name="summary"
          maxLength={200}
          placeholder={t("Concept, math, art, front end, then the publish checks")}
          style={input}
        />
      </label>

      {state?.error && (
        <p className="mono" style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}>
          {state.error}
        </p>
      )}

      <button className="btn" disabled={pending} style={{ justifySelf: "start" }}>
        {pending ? t("Creating…") : t("Create, then add steps")}
      </button>
    </form>
  );
}
