"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { call, field } from "@/components/site/api";
import { t } from "@/lib/i18n";
import type { SiteError } from "../types";
import { howLong, when } from "../when";

const POLL_MS = 30_000;

/** What the site's pages have thrown, counted by message. Open first. */
export default function Errors({ refresh }: { refresh: () => void }) {
  const [errors, setErrors] = useState<SiteError[]>([]);

  const load = async () => {
    const answer = await call("GET", "/api/operator/errors");
    if (answer.ok) setErrors(field<SiteError[]>(answer, "errors", []));
  };

  useEffect(() => {
    // The first read a tick later: nothing of it is the render's own.
    const first = window.setTimeout(() => void load(), 0);
    const clock = window.setInterval(() => void (document.hidden || load()), POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(clock);
    };
  }, []);

  const resolve = async (id: string) => {
    await call("POST", "/api/operator/errors/resolve", { id });
    await load();
    refresh();
  };

  const open = errors.filter((one) => one.resolvedAt === null);
  const closed = errors.filter((one) => one.resolvedAt !== null);

  const line = (one: SiteError) => (
    <div key={one.id} className="row error-row" data-open={one.resolvedAt === null || undefined}>
      <span style={{ minWidth: 0 }}>
        <strong className="adm-error">{one.message}</strong>
        <span className="row-sub">
          {one.url ? t("on <0/>").replace("<0/>", one.url) : t("on a page that was not named")} · {t("first <0/>").replace("<0/>", howLong(one.firstAt))} · {t("last <0/>").replace("<0/>", howLong(one.lastAt))}
        </span>
        {one.stack && (
          <details className="error-stack">
            <summary>{t("The stack")}</summary>
            <pre className="recap">{one.stack}</pre>
          </details>
        )}
      </span>
      <span className="mod-side">
        <span className="tag">{t("<0/> times").replace("<0/>", String(one.count))}</span>
        {one.resolvedAt === null ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void resolve(one.id)}>
            {t("Resolve")}
          </button>
        ) : (
          <span className="tag">{t("solved")}</span>
        )}
      </span>
    </div>
  );

  return (
    <section className="desk-panel" aria-label={t("Errors")}>
      <div className="panel-head">
        <h1 className="h2">{t("Errors")}</h1>
        <span className="eyebrow">
          {t("<0/> open").replace("<0/>", String(open.length))} · {t("<0/> solved").replace("<0/>", String(closed.length))}
        </span>
        {open.length > 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void resolve("all")}>
            {t("Resolve all")}
          </button>
        )}
      </div>
      <p className="adm-text">{t("A page of the site that throws reports it here: three times per page load at most, one line per message, thirty reports an hour from one address.")}</p>
      {errors.length === 0 ? (
        <p className="row-empty">{t("Nothing has been reported. Either the pages hold, or nobody has opened them.")}</p>
      ) : (
        <div className="rows">
          {open.map(line)}
          {closed.length > 0 && <p className="eyebrow adm-solved-head">{t("Solved")}</p>}
          {closed.map(line)}
        </div>
      )}
      {open.length > 0 && (
        <p className="adm-text">
          <CopyButton
            text={open.map((one) => `${one.message}\n  ${one.url || "?"} · ${one.count}× · first ${when(one.firstAt)} · last ${when(one.lastAt)}\n${one.stack.split("\n").slice(0, 4).join("\n")}`).join("\n\n")}
            label={t("Copy the report")}
            copied={t("Copied")}
          />
        </p>
      )}
    </section>
  );
}
