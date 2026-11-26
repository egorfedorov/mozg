"use client";

import { useEffect, useState, type FormEvent } from "react";
import CopyButton from "@/components/CopyButton";
import { call, field } from "@/components/site/api";
import { t } from "@/lib/i18n";
import type { Draft } from "../types";
import { when } from "../when";

/** Where a launch is posted. Names, not sentences: they are not translated. */
const CHANNELS = ["Product Hunt", "X", "Hacker News", "Reddit", "Discord", "GitHub"];

/** The drafts of a launch: what to post, where, kept on the server between sittings. */
export default function Launches() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [id, setId] = useState<string | undefined>();
  const [state, setState] = useState<"idle" | "kept" | "failed">("idle");

  const load = async () => {
    const answer = await call("GET", "/api/operator/drafts");
    if (answer.ok) setDrafts(field<Draft[]>(answer, "drafts", []));
  };

  useEffect(() => {
    // The first read a tick later: nothing of it is the render's own.
    const first = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(first);
  }, []);

  const reset = () => {
    setChannel(CHANNELS[0]);
    setTitle("");
    setBody("");
    setId(undefined);
    setState("idle");
  };

  const keep = async (event: FormEvent) => {
    event.preventDefault();
    const answer = await call("PUT", "/api/operator/drafts", { id, channel, title, body });
    setState(answer.ok ? "kept" : "failed");
    if (answer.ok) {
      const draft = field<Draft | null>(answer, "draft", null);
      setId(draft?.id);
      await load();
    }
  };

  const edit = (one: Draft) => {
    setChannel(one.channel);
    setTitle(one.title);
    setBody(one.body);
    setId(one.id);
    setState("idle");
  };

  const label = "adm-label";

  return (
    <div className="desk-grid">
      <section className="desk-panel col-5" aria-label={t("The draft")}>
        <div className="panel-head">
          <h1 className="h2">{id ? t("The draft") : t("A new draft")}</h1>
          {id && (
            <button type="button" className="linkish" onClick={reset}>
              {t("Start over")}
            </button>
          )}
        </div>
        <form className="adm-form" onSubmit={keep}>
          <label className={label} htmlFor="dr-channel">
            {t("Channel")}
          </label>
          <select id="dr-channel" className="select" value={channel} onChange={(event) => setChannel(event.target.value)}>
            {CHANNELS.map((one) => (
              <option key={one}>{one}</option>
            ))}
          </select>
          <label className={label} htmlFor="dr-title">
            {t("Title")}
          </label>
          <input id="dr-title" className="login-input" maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} />
          <label className={label} htmlFor="dr-body">
            {t("Text")}
          </label>
          <textarea id="dr-body" className="adm-area" rows={9} value={body} onChange={(event) => setBody(event.target.value)} />
          <span className="mono adm-count">{t("<0/> characters").replace("<0/>", String(body.length))}</span>
          <div className="dock-actions">
            <button type="submit" className="btn" disabled={!title && !body}>
              {t("Keep the draft")}
            </button>
            {state === "kept" && <span className="dock-said">{t("Kept.")}</span>}
            {state === "failed" && <span className="dock-error">{t("It was not kept. Try once more.")}</span>}
          </div>
        </form>
      </section>

      <section className="desk-panel col-7" aria-label={t("Drafts")}>
        <div className="panel-head">
          <h2 className="h2">{t("Drafts")}</h2>
          <span className="eyebrow">{t("<0/> in all").replace("<0/>", String(drafts.length))}</span>
        </div>
        {drafts.length === 0 ? (
          <p className="row-empty">{t("Nothing kept yet. The first one is written on the left.")}</p>
        ) : (
          <div className="rows">
            {drafts.map((one) => (
              <div key={one.id} className="row">
                <span style={{ minWidth: 0 }}>
                  <span className="row-meta">
                    {one.channel} · {t("<0/> characters").replace("<0/>", String(one.body.length))} · {t("changed <0/>").replace("<0/>", when(one.updatedAt))}
                  </span>
                  <strong>{one.title || t("Untitled")}</strong>
                  <span className="row-sub adm-snip">{one.body}</span>
                </span>
                <span className="mod-side">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => edit(one)}>
                    {t("Change")}
                  </button>
                  <CopyButton text={[one.title, one.body].filter(Boolean).join("\n\n")} label={t("Copy the text")} copied={t("Copied")} className="btn btn-sm btn-ghost" />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
