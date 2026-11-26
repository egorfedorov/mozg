"use client";

import { useCallback, useEffect, useState } from "react";
import { call } from "@/components/site/api";
import { LANG_NAME, LANG_TAG, msg, setLanguage, t, type Lang } from "@/lib/i18n";
import { OPERATOR_LANGS } from "@/i18n/operator";
import "@/i18n/messages";
import { INSTALL } from "@/lib/install";
import type { Overview } from "./types";
import Announcements from "./views/Announcements";
import Chat from "./views/Chat";
import Errors from "./views/Errors";
import Launches from "./views/Launches";
import Login from "./views/Login";
import System from "./views/System";

/**
 * The operator's panel: one page, five parts, each named in the address.
 *
 * It is a page like any other on the site and talks to the site's server like
 * the chat does. What it shows is the operator's alone, and the server gives
 * it only to a session that arrived by the link sent to one address.
 *
 * It speaks English and Russian, and nothing else: this is not a visitor's
 * page, and its words are kept apart from the site's so that they never decide
 * which languages the site offers.
 */

const VIEWS = [
  { id: "system", label: msg("System") },
  { id: "chat", label: msg("Chat") },
  { id: "errors", label: msg("Errors") },
  { id: "announcements", label: msg("Announcements") },
  { id: "launches", label: msg("Launches") },
] as const;

type View = (typeof VIEWS)[number]["id"];
const viewOf = (hash: string): View => VIEWS.find((one) => one.id === hash.replace(/^#/, ""))?.id ?? "system";
const KEEP = "mozg.admin.lang";
/** The counts on the way around are refreshed this often while the panel is in front. */
const POLL_MS = 20_000;

export default function AdminClient() {
  const [ready, setReady] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<View>("system");
  const [session, setSession] = useState<"asking" | "down" | "out" | "in">("asking");
  const [overview, setOverview] = useState<Overview | null>(null);

  /** The panel speaks this language from the next render on. */
  const speak = useCallback((next: Lang) => {
    setLanguage(next);
    setLang(next);
    document.documentElement.lang = LANG_TAG[next];
  }, []);

  const load = useCallback(async () => {
    const answer = await call("GET", "/api/operator/overview");
    // The answer is the overview itself, beside its "ok".
    const { ok, ...rest } = answer;
    if (ok) {
      setOverview(rest as Overview);
      setSession("in");
    } else setSession(answer.error === "operator" ? "out" : "down");
  }, []);

  // Which language the panel speaks: the one chosen last time, or the machine's
  // if the panel has it. Decided here, in the browser, so the printed page and
  // the first render agree.
  useEffect(() => {
    let chosen: Lang = "en";
    try {
      const kept = localStorage.getItem(KEEP);
      if (kept === "ru" || kept === "en") chosen = kept;
    } catch {
      /* a private window */
    }
    if (chosen === "en" && OPERATOR_LANGS.includes("ru") && typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru")) chosen = "ru";
    // A tick later, so that the page as printed and the first render agree;
    // and the language is set before the first word is chosen in it.
    const start = window.setTimeout(() => {
      speak(chosen);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(start);
  }, [speak]);

  useEffect(() => {
    if (!ready) return;
    const follow = () => setView(viewOf(window.location.hash));
    const first = window.setTimeout(() => {
      follow();
      void load();
    }, 0);
    const clock = window.setInterval(() => void (document.hidden || load()), POLL_MS);
    window.addEventListener("hashchange", follow);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(clock);
      window.removeEventListener("hashchange", follow);
    };
  }, [ready, load]);

  const choose = (next: Lang) => {
    speak(next);
    try {
      localStorage.setItem(KEEP, next);
    } catch {
      /* it asks again next time */
    }
  };

  const logout = async () => {
    await call("POST", "/api/operator/logout");
    setSession("out");
    setOverview(null);
  };

  const waiting = overview?.threads.waiting ?? 0;
  const open = overview?.errors.open ?? 0;

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <a href={INSTALL.site} className="wordmark" aria-label={t("mozg, to the site")}>
            mozg<span aria-hidden="true">.</span>
          </a>
          <span className="eyebrow">{t("Operator")}</span>
          <div className="topbar-end">
            {OPERATOR_LANGS.length > 1 && (
              <div className="seg" role="group" aria-label={t("Language")}>
                {OPERATOR_LANGS.map((one) => (
                  <button key={one} type="button" className="seg-opt" aria-pressed={lang === one} onClick={() => choose(one)} lang={LANG_TAG[one]}>
                    {LANG_NAME[one]}
                  </button>
                ))}
              </div>
            )}
            {session === "in" && (
              <button type="button" className="linkish" onClick={() => void logout()}>
                {t("Log out")}
              </button>
            )}
          </div>
        </div>
      </header>

      {ready && session !== "in" && <Login down={session === "down"} />}

      {ready && session === "in" && (
        <div className="shell desk-shell">
          <nav className="desk-nav" aria-label={t("Operator")}>
            <ul>
              {VIEWS.map((item) => {
                const count = item.id === "chat" ? waiting : item.id === "errors" ? open : 0;
                return (
                  <li key={item.id}>
                    <a className="nav-part" href={`#${item.id}`} aria-current={view === item.id ? "page" : undefined}>
                      {t(item.label)}
                      {count > 0 && (
                        <span className="nav-count" data-attention={item.id === "chat" ? "true" : undefined} data-defect={item.id === "errors" ? "true" : undefined}>
                          {count}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <main className="desk-main">
            {view === "system" && <System overview={overview} refresh={() => void load()} />}
            {view === "chat" && <Chat refresh={() => void load()} />}
            {view === "errors" && <Errors refresh={() => void load()} />}
            {view === "announcements" && <Announcements refresh={() => void load()} />}
            {view === "launches" && <Launches />}
          </main>
        </div>
      )}
    </>
  );
}
