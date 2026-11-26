"use client";

import { useEffect, useState, type FormEvent } from "react";
import { call, field } from "@/components/site/api";
import { msg, t } from "@/lib/i18n";
import type { Announcement, AnnouncementKind } from "../types";
import { when } from "../when";

const KINDS: AnnouncementKind[] = ["news", "notice", "maintenance"];
const KIND: Record<AnnouncementKind, string> = { news: msg("News"), notice: msg("Notice"), maintenance: msg("Maintenance") };

type Form = { id?: string; kind: AnnouncementKind; title: string; body: string; link: string; ends: string; published: boolean };
const BLANK: Form = { kind: "news", title: "", body: "", link: "", ends: "", published: true };

/** The moment a field of the form holds, in the shape the field takes. */
function local(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * What the operator tells the site's visitors: a strip along the top of every
 * page. News may end at a date, and then the strip counts down to it.
 */
export default function Announcements({ refresh }: { refresh: () => void }) {
  const [list, setList] = useState<Announcement[]>([]);
  const [form, setForm] = useState<Form>(BLANK);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");

  const load = async () => {
    const answer = await call("GET", "/api/operator/announcements");
    if (answer.ok) setList(field<Announcement[]>(answer, "announcements", []));
  };

  useEffect(() => {
    // The first read a tick later: nothing of it is the render's own.
    const first = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(first);
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const answer = await call("POST", "/api/operator/announcements", {
      id: form.id || undefined,
      kind: form.kind,
      title: form.title,
      body: form.body,
      link: form.link,
      startsAt: new Date().toISOString(),
      endsAt: form.ends ? new Date(form.ends).toISOString() : null,
      published: form.published,
    });
    setState(answer.ok ? "saved" : "failed");
    if (answer.ok) {
      setForm(BLANK);
      await load();
      refresh();
    }
  };

  const retire = async (one: Announcement) => {
    await call("POST", "/api/operator/announcements/retire", { id: one.id });
    await load();
    refresh();
  };

  const edit = (one: Announcement) => {
    setForm({ id: one.id, kind: one.kind, title: one.title, body: one.body, link: one.link, ends: one.endsAt ? local(one.endsAt) : "", published: one.published });
    setState("idle");
  };

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((now) => ({ ...now, [key]: value }));
  const label = "adm-label";

  return (
    <div className="desk-grid">
      <section className="desk-panel col-5" aria-label={t("Post an announcement")}>
        <div className="panel-head">
          <h1 className="h2">{form.id ? t("Change it") : t("Post an announcement")}</h1>
          {form.id && (
            <button type="button" className="linkish" onClick={() => setForm(BLANK)}>
              {t("Start over")}
            </button>
          )}
        </div>
        <form className="adm-form" onSubmit={save}>
          <span className={label}>{t("Kind")}</span>
          <div className="chips" role="radiogroup" aria-label={t("Kind")}>
            {KINDS.map((kind) => (
              <button key={kind} type="button" role="radio" aria-checked={form.kind === kind} className="chip" data-on={form.kind === kind} onClick={() => set("kind", kind)}>
                {t(KIND[kind])}
              </button>
            ))}
          </div>
          <label className={label} htmlFor="an-title">
            {t("Title")}
          </label>
          <input id="an-title" className="login-input" required minLength={3} maxLength={120} value={form.title} onChange={(event) => set("title", event.target.value)} />
          <label className={label} htmlFor="an-body">
            {t("Body")}
          </label>
          <textarea id="an-body" className="adm-area" rows={5} maxLength={2000} value={form.body} onChange={(event) => set("body", event.target.value)} />
          <label className={label} htmlFor="an-link">
            {t("A link, if there is one")}
          </label>
          <input id="an-link" className="login-input" type="url" value={form.link} onChange={(event) => set("link", event.target.value)} placeholder="https://mozg.sh/changelog/" />
          <label className={label} htmlFor="an-ends">
            {t("It ends")}
          </label>
          <input id="an-ends" className="login-input" type="datetime-local" value={form.ends} onChange={(event) => set("ends", event.target.value)} />
          <label className="adm-check">
            <input type="checkbox" checked={form.published} onChange={(event) => set("published", event.target.checked)} />
            {t("On the pages the moment it is saved")}
          </label>
          <div className="dock-actions">
            <button type="submit" className="btn">
              {form.id ? t("Save the change") : t("Post it")}
            </button>
            {state === "saved" && <span className="dock-said">{t("It is on the pages now.")}</span>}
            {state === "failed" && <span className="dock-error">{t("It was not saved. The title needs three letters at least, and the dates need to be dates.")}</span>}
          </div>
        </form>
      </section>

      <section className="desk-panel col-7" aria-label={t("Announcements")}>
        <div className="panel-head">
          <h2 className="h2">{t("Announcements")}</h2>
          <span className="eyebrow">{t("<0/> in all").replace("<0/>", String(list.length))}</span>
        </div>
        {list.length === 0 ? (
          <p className="row-empty">{t("Nothing is posted. The pages show no strip until there is something true to say.")}</p>
        ) : (
          <div className="rows">
            {list.map((one) => (
              <div key={one.id} className="row" data-open={one.published || undefined}>
                <span style={{ minWidth: 0 }}>
                  <strong>{one.title}</strong>
                  {one.body && <span className="row-sub">{one.body}</span>}
                  <span className="row-sub">
                    {t(KIND[one.kind])} · {t("from <0/>").replace("<0/>", when(one.startsAt))}
                    {one.endsAt ? ` · ${t("until <0/>").replace("<0/>", when(one.endsAt))}` : ""}
                  </span>
                </span>
                <span className="mod-side">
                  <span className="tag">{one.published ? t("on the pages") : t("retired")}</span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => edit(one)}>
                    {t("Change")}
                  </button>
                  {one.published && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => void retire(one)}>
                      {t("Retire")}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
