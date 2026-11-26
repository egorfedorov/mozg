"use client";

import { useState, type FormEvent } from "react";
import { call } from "@/components/site/api";
import { t } from "@/lib/i18n";

/** The way in: one address, one link. */
export default function Login({ down }: { down: boolean }) {
  const [email, setEmail] = useState("");
  const [asked, setAsked] = useState<"no" | "sent" | "failed">("no");

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const answer = await call("POST", "/api/operator/login", { email });
    setAsked(answer.ok ? "sent" : "failed");
  };

  if (down) {
    return (
      <main className="shell desk-main">
        <section className="desk-panel">
          <h1 className="h1">{t("The server is not answering.")}</h1>
          <p className="lede">{t("The panel, the chat and the announcements all live on it. Try again in a minute.")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell desk-main">
      <section className="desk-panel login-panel">
        <span className="eyebrow">{t("Operator")}</span>
        <h1 className="h1">{t("The operator's panel")}</h1>
        <p className="lede">{t("It opens by a link sent to one address: yours. The link works once and holds for fifteen minutes.")}</p>
        <form className="login-form" onSubmit={ask}>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("Your address")} aria-label={t("Your address")} className="login-input" />
          <button type="submit" className="btn">
            {t("Send me the link")}
          </button>
        </form>
        {asked === "sent" && (
          <p className="login-said" role="status">
            {t("If that is the address, the link is on its way.")}
          </p>
        )}
        {asked === "failed" && (
          <p className="login-said" role="alert">
            {t("The server is not answering. Try again in a minute.")}
          </p>
        )}
      </section>
    </main>
  );
}
