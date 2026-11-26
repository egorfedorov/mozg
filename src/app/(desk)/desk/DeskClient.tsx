"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ExplainView, FeedPanel, countsOf, nextModuleOf, NextPanel, ScorePanel } from "@/components/board/Board";
import { MODULE_FILTERS, ModuleRows, NOTHING, type ModuleFilter } from "@/components/board/Modules";
import { DeskNav, viewOf, type View } from "@/components/board/Nav";
import { OwnMap } from "@/components/board/OwnMap";
import CopyButton from "@/components/CopyButton";
import { Pill } from "@/components/ui";
import { recapText } from "@/core/desk";
import { INSTALL } from "@/lib/install";
import type { DeskState, FeedCard, ModuleView, Settings } from "@/core/types";
import "@/i18n/messages";
import { count, fill, languageOf, LANG_TAG, msg, setLanguage, t, type Lang } from "@/lib/i18n";
import ConnectionPanel from "./ConnectionPanel";

/** Empty in the packed plugin (same origin); set for development by .env.development. */
const API = process.env.NEXT_PUBLIC_MOZG_API ?? "";
/** The page asks often enough to show a verdict a minute after it was recorded. */
const POLL_MS = 20_000;
/** How many of the latest cards today's part shows; the rest are counted, not hidden. */
const LATEST = 3;

type Load = { state: DeskState | null; error: string | null; loading: boolean };

export default function DeskClient() {
  const [load, setLoad] = useState<Load>({ state: null, error: null, loading: true });
  const [project, setProject] = useState<string | null>(null);
  // The page is printed in English. On its first moment in the browser it
  // takes the language of the machine, and from then on the one chosen below.
  const [lang, setLang] = useState<Lang>("en");
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<View>("today");
  const [filter, setFilter] = useState<ModuleFilter>("all");

  const read = useCallback(async () => {
    try {
      const params = new URLSearchParams({ lang, ...(project ? { project } : {}) });
      const url = `${API}/api/state?${params}`;
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const state = (await res.json()) as DeskState;
      setLoad({ state, error: null, loading: false });
    } catch (err) {
      setLoad((before) => ({
        state: before.state,
        error: err instanceof Error && err.name === "TimeoutError" ? t("The local mozg server did not answer in time.") : t("The local mozg server is not running."),
        loading: false,
      }));
    }
  }, [project, lang]);

  useEffect(() => {
    const machine = languageOf(navigator.language);
    if (machine !== "en") {
      setLanguage(machine);
      setLang(machine);
      document.documentElement.lang = LANG_TAG[machine];
    }
  }, []);

  // The setting, once the desk has told what it is: its own language, or the machine's.
  useEffect(() => {
    if (!load.state?.settings) return;
    const chosen = load.state.settings.language === "system" ? languageOf(navigator.language) : load.state.settings.language;
    if (chosen !== lang) {
      setLanguage(chosen);
      setLang(chosen);
      // The page says which language it is now in: for the fonts, and for a screen reader.
      document.documentElement.lang = LANG_TAG[chosen];
    }
  }, [load.state?.settings, lang]);

  useEffect(() => {
    void read();
    // Only while the tab is in front: a desk nobody is looking at costs nothing.
    const timer = setInterval(() => {
      if (!document.hidden) void read();
    }, POLL_MS);
    const onShow = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [read]);

  // Which part of the desk is in front is in the address (#modules), so that
  // it can be kept, sent, and come back to.
  useEffect(() => {
    const follow = () => setView(viewOf(window.location.hash));
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  /** The one write: the settings. Everything else on the desk is read. */
  const save = useCallback(
    async (next: Settings): Promise<boolean> => {
      try {
        const res = await fetch(`${API}/api/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return false;
        const saved = (await res.json()).settings as Settings;
        setLoad((before) => (before.state ? { ...before, state: { ...before.state, settings: saved } } : before));
        // A project just hidden is not asked for again; the fetch the change
        // triggers then brings the desk without it.
        if (project !== null && saved.hidden.includes(project)) setProject(null);
        else void read();
        return true;
      } catch {
        return false;
      }
    },
    [project, read],
  );

  const state = load.state;

  // Never keep asking for a project that is no longer on the desk.
  useEffect(() => {
    if (project && state?.settings?.hidden.includes(project)) setProject(null);
  }, [project, state?.settings]);

  const nextModule = useMemo(() => (state ? nextModuleOf(state) : null), [state]);
  const command = nextModule ? t("explain <0/>").replace("<0/>", nextModule) : t("status");
  const commandNote = nextModule ? t("the next change worth a minute of your time") : undefined;

  const renderAction = (card: FeedCard): ReactNode => {
    if (card.state === "bug") {
      const id = card.id.replace(/^bug-/, "");
      return (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
          {t(card.action?.label ?? msg("Show the answer"))}
        </button>
      );
    }
    if (!card.change || !card.module) return null;
    return (
      <CopyButton
        className="btn btn-sm btn-ghost"
        text={t("Explain-back time. Start with the change <0/> in <1/>.").replace("<0/>", card.change).replace("<1/>", card.module)}
        label={t(card.action?.label ?? msg("Explain · 60 s"))}
        copied={t("Copied. Paste it to your agent.")}
      />
    );
  };

  /** The way to make a module yours: the explain-back its card offers, where it offers one. */
  const renderModuleAction = (m: ModuleView): ReactNode => {
    const card = state?.feed.find((c) => c.change && c.module === m.module);
    if (!card?.change || !card.module) return null;
    return renderAction(card);
  };

  const lists = useMemo(
    () => Object.fromEntries(MODULE_FILTERS.map((f) => [f.id, state ? state.modules.filter(f.takes) : []])) as Record<ModuleFilter, ModuleView[]>,
    [state],
  );

  const hasDesk = Boolean(state?.project);
  const allHidden = Boolean(state?.connection && state.connection.projects.length > 0 && state.projects.length === 0);

  const feedPanel = (cards: FeedCard[], title: string, more?: ReactNode) => (
    <FeedPanel
      cards={cards}
      title={title}
      open={open}
      onClose={() => setOpen(null)}
      explains={state?.explains ?? []}
      renderAction={renderAction}
      more={more}
    />
  );

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          {/* Out of the local desk there is only one place to go, and it is not
              "/" : inside the plugin that is the desk itself. */}
          <a href={INSTALL.site} className="wordmark" aria-label={t("mozg, to the site")}>
            mozg
            <span aria-hidden="true">.</span>
          </a>
          {/* Several projects on one machine: one of them is in front, and this says which. */}
          {state && hasDesk && state.projects.length > 1 && (
            <select className="select desk-project" aria-label={t("Project")} value={state.project ?? ""} onChange={(event) => setProject(event.target.value)}>
              {state.projects.map((p) => (
                <option key={p.project} value={p.project}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <div className="topbar-end">
            {state?.sample && <Pill>{t("Sample session")}</Pill>}
            <Pill live>{state && !load.error ? t("Local · up to date") : t("Local")}</Pill>
          </div>
        </div>
      </header>

      <div className="shell desk-shell">
        {state && hasDesk && <DeskNav view={view} counts={countsOf(state)} />}

        <main className="desk-main">
          {load.error && !state && (
            <div className="panel" role="alert">
              <h1 className="h2">{load.error}</h1>
              <p className="lede" style={{ marginTop: ".6rem" }}>
                {t("The desk is a small server on this machine. Start it from the plugin folder, then reload this page:")}
              </p>
              <pre className="term" style={{ marginBottom: 0 }}>
                <div>
                  <span className="c">$</span> node plugin/dist/server.mjs desk
                </div>
              </pre>
            </div>
          )}

          {!state && !load.error && (
            <div aria-busy="true" aria-label={t("Reading your session logs")}>
              <span className="sr-only">{t("Reading your session logs")}</span>
              <div className="skel" style={{ height: 380 }} />
            </div>
          )}

          {state && !hasDesk && !allHidden && (
            <div className="panel">
              <h1 className="h2">{t("mozg has not seen your agent change anything yet.")}</h1>
              <p className="lede" style={{ marginTop: ".6rem" }}>
                {t("It reads the session logs Claude Code already writes, on this machine. Open a project in Claude Code, let the agent edit a file, and this page fills in on its own.")}
              </p>
            </div>
          )}

          {/* Everything hidden is not the same as nothing seen, and must not read
              as it: one heading, the true one, never both. */}
          {state && !hasDesk && allHidden && (
            <>
              <div className="panel">
                <h1 className="h2">{t("Every project is off the desk.")}</h1>
                <p className="lede" style={{ marginTop: ".6rem" }}>
                  {t("mozg is still reading. Show a project again below and the desk comes back with everything it had.")}
                </p>
              </div>
              {state.connection && state.settings && <ConnectionPanel state={state} onSave={save} />}
            </>
          )}

          {state && hasDesk && (
            <>
              {view === "today" && (
                <>
                  <h1 className="sr-only">{t("Today")}</h1>
                  <div className="desk-grid">
                    <section className="desk-panel col-8" aria-label={t("Ownership today")}>
                      <ScorePanel state={state} />
                    </section>
                    <NextPanel className="col-4" state={state} command={command} commandNote={commandNote} plate />
                  </div>
                  <div className="desk-grid">
                    <StatsPanel state={state} />
                  </div>
                  <div className="desk-grid">
                    <section className="desk-panel col-7" aria-label={t("Your modules")}>
                      <div className="panel-head">
                        <span className="eyebrow">{t("Your modules")}</span>
                        <a className="more-link" href="#modules">
                          {t("All modules")}
                          <span aria-hidden="true"> →</span>
                        </a>
                      </div>
                      <OwnMap modules={state.modules} limit={8} />
                    </section>
                    <section className="desk-panel col-5" aria-label={t("Latest cards")}>
                      {feedPanel(
                        state.feed.slice(0, LATEST),
                        t("Latest cards"),
                        state.feed.length > LATEST && (
                          <>
                            <p className="feed-more">{count(state.feed.length - LATEST, "<0/> more on your desk", "<0/> more on your desk")}</p>
                            <a className="more-link" href="#activity">
                              {t("All activity")}
                              <span aria-hidden="true"> →</span>
                            </a>
                          </>
                        ),
                      )}
                    </section>
                  </div>
                </>
              )}

              {view === "modules" && (
                <section className="desk-panel" aria-label={t("Modules")}>
                  <div className="panel-head">
                    <h1 className="h2">{t("Modules")}</h1>
                    <div className="chips" role="group" aria-label={t("Modules")}>
                      {MODULE_FILTERS.map((f) => (
                        <button key={f.id} type="button" className="chip" data-on={filter === f.id} onClick={() => setFilter(f.id)}>
                          {t(f.label)}
                          <span className="chip-count">{lists[f.id].length}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="board-note board-note-top">
                    {state.settings?.asks === false
                      ? t("Asking is switched off: mozg asks nowhere, and the desk still keeps score.")
                      : t("Where it asks, the agent's first edit of a session waits for your approval. Where it runs free, mozg adds no prompt of its own.")}
                  </p>
                  <ModuleRows modules={lists[filter]} empty={t(NOTHING[filter])} renderAction={renderModuleAction} asks={state.settings?.asks !== false} />
                </section>
              )}

              {view === "activity" && (
                <section className="desk-panel" aria-label={t("The feed")}>
                  <h1 className="sr-only">{t("Activity")}</h1>
                  {state.feed.length ? (
                    feedPanel(state.feed, t("The feed"))
                  ) : (
                    <p className="row-empty">{t("Nothing left to explain.")}</p>
                  )}
                </section>
              )}

              {view === "history" && (
                <>
                  <h1 className="sr-only">{t("History")}</h1>
                  <section className="desk-panel" aria-label={t("Explain-backs")}>
                    <div className="panel-head">
                      <h2 className="h2">{t("Explain-backs")}</h2>
                      <span className="eyebrow">{t("Newest first")}</span>
                    </div>
                    {state.explains.length ? (
                      <div className="rows">
                        {state.explains.map((e) => (
                          <ExplainView key={e.id} explain={e} />
                        ))}
                      </div>
                    ) : (
                      <p className="row-empty" style={{ border: "1.5px dashed var(--ink-3)" }}>
                        {t("None yet. Say 'explain' to your agent in Claude Code: one question, about a minute.")}
                      </p>
                    )}
                  </section>

                  <section className="desk-panel" aria-label={t("The day in lines")}>
                    <div className="panel-head">
                      <h2 className="h2">{t("The day in lines")}</h2>
                      <CopyButton text={recapText(state)} label={t("Copy recap")} copied={t("Recap copied")} />
                    </div>
                    <pre className="recap" style={{ marginBottom: 0 }}>
                      {recapText(state)}
                    </pre>
                  </section>
                </>
              )}

              {view === "settings" && state.connection && state.settings && (
                <>
                  <h1 className="sr-only">{t("Settings")}</h1>
                  <ConnectionPanel state={state} onSave={save} />
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

function StatsPanel({ state }: { state: DeskState }) {
  return (
    <div className="stats col-12">
      <Stat label={t("Streak")} value={fill(t("<0/> d"), [String(state.streak.days)])} note={fill(t("days in a row with an explain-back · best <0/>"), [String(state.streak.best)])} />
      <Stat label={t("Explained")} value={String(state.streak.explainedTotal)} note={t("explain-backs passed, ever")} />
      <Stat label={t("Bugs found")} value={String(state.streak.bugsFound)} note={t("by explaining a change out loud")} />
      <Stat label={t("Waiting")} value={String(state.pending)} note={t("modules worth a minute")} />
      <Stat
        label={t("Ran free")}
        value={String(state.week.free)}
        note={`${count(state.week.free, "<0/> agent edit this week", "<0/> agent edits this week")} ${t("in modules that are yours, none asked")} · ${count(
          state.week.guarded,
          "<0/> in modules to explain",
          "<0/> in modules to explain",
        )}`}
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <span className="stat-value num">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}
