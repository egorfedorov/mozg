"use client";

import { useEffect, useState } from "react";
import { LANG_TAG, fill, t, type Lang } from "@/lib/i18n";
import { call, field } from "./api";

/**
 * What the operator has posted, as a strip along the top of every page: a
 * notice, a piece of news, a maintenance window.
 *
 * The words are the operator's, written in their panel, and so are not
 * translated here. A piece of news may end at a date, and then the strip counts
 * down to it: the one clock on the site, and only where there is a real date
 * behind it. A cross closes one for good, in this browser.
 */

type Announcement = { id: string; kind: "news" | "notice" | "maintenance"; title: string; body: string; link: string; endsAt: string | null };

const HIDE = "mozg.announce";
const MINUTE = 60_000;

const hidden = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(HIDE) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];
  } catch {
    return [];
  }
};

export default function Announcements({ lang, close }: { lang: Lang; close: string }) {
  const [list, setList] = useState<Announcement[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void call("GET", "/api/announcements").then((answer) => {
      if (answer.ok) setNow(Date.now());
      setList(answer.ok ? field<Announcement[]>(answer, "announcements", []) : []);
    });
    const clock = window.setInterval(() => setNow(Date.now()), MINUTE);
    return () => window.clearInterval(clock);
  }, []);

  // One strip: the first piece that is neither hidden nor over.
  const live = list.find((one) => !hidden().includes(one.id) && (!one.endsAt || Date.parse(one.endsAt) > now));
  if (!live) return null;

  const left = live.endsAt ? Date.parse(live.endsAt) - now : 0;
  const counting = live.kind === "news" && live.endsAt && left > 0;
  const clock = new Intl.DateTimeFormat(LANG_TAG[lang], { day: "numeric", month: "short" }).format(new Date(live.endsAt!));
  const dismiss = () => {
    try {
      localStorage.setItem(HIDE, JSON.stringify([...new Set([...hidden(), live.id])]));
    } catch {
      /* it comes back next time */
    }
    setList((all) => all.filter((one) => one.id !== live.id));
  };

  return (
    <div className="announce" data-kind={live.kind} role="status">
      <span className="announce-dot" aria-hidden="true" />
      <p className="announce-text">
        <strong>{live.title}</strong>
        {live.body && <span className="announce-body">{live.body}</span>}
        {live.endsAt && (
          <span className="mono announce-until">
            {counting ? fill(t("<0/> d <1/> h left"), [Math.floor(left / 3_600_000 / 24), Math.floor((left / 3_600_000) % 24)]) : t("until <0/>").replace("<0/>", clock)}
          </span>
        )}
      </p>
      {live.link && (
        <a className="announce-link" href={live.link}>
          {t("See")}
        </a>
      )}
      <button type="button" className="announce-close" onClick={dismiss} aria-label={close}>
        ✕
      </button>
    </div>
  );
}
