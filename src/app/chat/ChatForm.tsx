"use client";

import { useT } from "@/lib/t-client";
import { useActionState } from "react";
import { sendChatMessage } from "./chat-actions";

export default function ChatForm() {
  const t = useT();

  const [state, action, pending] = useActionState(sendChatMessage, null);

  return (
    <form action={action} style={{ display: "grid", gap: ".6rem" }}>
      <textarea
        name="body"
        rows={4}
        required
        maxLength={4000}
        placeholder={t("One full message beats five pings: what happened, where (a link helps), what you expected instead. Feature ideas and brain requests are just as welcome as bugs.")}
        style={{
          width: "100%",
          padding: ".7rem .85rem",
          border: "1.5px solid var(--ink)",
          background: "var(--paper)",
          font: "inherit",
          fontSize: ".9375rem",
        }}
      />
      <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" disabled={pending} style={{ padding: ".5rem 1rem" }}>
          {pending ? t("Sending…") : t("Send to the developer")}
        </button>
        {state?.ok && (
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-green)" }}>
            {t("delivered — replies land right here")}</span>
        )}
        {state?.error && (
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-red)" }}>
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
