"use client";

import { useState } from "react";
import { call, SITE_API } from "@/components/site/api";
import { count, t } from "@/lib/i18n";
import type { Overview } from "../types";
import { upFor } from "../when";

/** How the site's server is doing, and the two things to do about it. */
export default function System({ overview, refresh }: { overview: Overview | null; refresh: () => void }) {
  const [letter, setLetter] = useState<"no" | "sent" | "failed" | "unset">("no");

  const testMail = async () => {
    const answer = await call("POST", "/api/operator/test-mail");
    setLetter(!answer.ok ? "failed" : answer.error === "no_mail" ? "unset" : "sent");
  };

  const stat = (label: string, value: string, note: string) => (
    <div className="stat" key={label}>
      <span className="eyebrow">{label}</span>
      <span className="stat-value num">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );

  return (
    <>
      <h1 className="sr-only">{t("System")}</h1>
      <div className="desk-grid">
        <div className="stats col-12">
          {stat(t("Up for"), overview ? upFor(overview.startedAt) : "—", t("since the server was started"))}
          {stat(t("Threads"), String(overview?.threads.all ?? 0), overview ? count(overview.threads.waiting, "<0/> waiting", "<0/> waiting") : "")}
          {stat(t("Errors"), String(overview?.errors.open ?? 0), t("open on the site's pages"))}
          {stat(t("Announcements"), String(overview?.announcements.live ?? 0), t("on the pages now"))}
          {stat(t("Drafts"), String(overview?.drafts ?? 0), t("for the launch"))}
        </div>
      </div>

      <div className="desk-grid">
        <section className="desk-panel col-6" aria-label={t("Mail")}>
          <div className="panel-head">
            <h2 className="h2">{t("Mail")}</h2>
            <span className="tag" data-attention={overview?.mail ? undefined : "true"}>
              {overview?.mail ? t("set up") : t("not set up")}
            </span>
          </div>
          <p className="adm-text">{t("A new message in the chat reaches you by mail. Without mail the badge in this panel is the only sign.")}</p>
          <button type="button" className="btn btn-ghost" onClick={() => void testMail()}>
            {t("Send yourself a letter")}
          </button>
          {letter === "sent" && <p className="login-said">{t("A letter is on its way to you.")}</p>}
          {letter === "unset" && <p className="login-said">{t("Set RESEND_API_KEY and EMAIL_FROM on the server first.")}</p>}
          {letter === "failed" && <p className="login-said">{t("The letter was not sent. The server's log says why.")}</p>}
        </section>

        <section className="desk-panel col-6" aria-label={t("Everything the server remembers")}>
          <div className="panel-head">
            <h2 className="h2">{t("Everything the server remembers")}</h2>
          </div>
          <p className="adm-text">{t("The threads, the errors, the announcements and the drafts, in one file. Take one before touching the server.")}</p>
          <a className="btn btn-ghost" href={`${SITE_API}/api/operator/export`}>
            {t("Download it as one file")}
          </a>
        </section>
      </div>

      <div className="desk-grid">
        <section className="desk-panel col-12" aria-label={t("The server")}>
          <div className="panel-head">
            <h2 className="h2">{t("The server")}</h2>
            <button type="button" className="linkish" onClick={refresh}>
              {t("Refresh")}
            </button>
          </div>
          <div className="rows">
            <div className="row">
              <span>
                <strong>{t("Version")}</strong>
              </span>
              <span className="mono">{overview?.version ?? "—"}</span>
            </div>
            <div className="row">
              <span>
                <strong>{t("The site")}</strong>
              </span>
              <a className="mono" href={overview?.origin ?? "#"} target="_blank" rel="noopener noreferrer">
                {overview?.origin ?? "—"}
              </a>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
