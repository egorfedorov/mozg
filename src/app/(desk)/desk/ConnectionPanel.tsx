"use client";

import { useEffect, useRef, useState } from "react";
import { ago } from "@/core/desk";
import type { DeskState, Settings } from "@/core/types";
import { MESSAGE_LANGS } from "@/i18n/messages";
import { LANG_NAME, count, msg, t } from "@/lib/i18n";
import { breakable } from "@/lib/text";

/**
 * Connection and settings: the part of the desk that is about mozg itself.
 *
 * Each line of the connection is something a process wrote down when it
 * happened, or it is a plain "not yet" with the thing to do about it. Nothing
 * is probed, timed or inferred, because a desk that guesses whether it is
 * attached is worse than one that says it has not heard yet.
 *
 * Every control here is wired to something: the gate (see core/gate.ts), the
 * nudge at the end of a turn, and which projects are on the desk.
 */

// Said exactly: mozg asks, or mozg asks nowhere. Where it asks nowhere, the
// permission settings of the session still apply.
const ASKS: { value: boolean; label: string; text: string }[] = [
  { value: true, label: msg("On"), text: msg("Where a module is not yours, the agent's first edit there in a session asks you first. mozg never asks about a module that is yours.") },
  { value: false, label: msg("Off"), text: msg("mozg asks nowhere. The desk still keeps score, and the end-of-turn nudge still speaks.") },
];

const NUDGE: { value: Settings["nudge"]; label: string; text: string }[] = [
  { value: "gentle", label: msg("Gentle"), text: msg("A line at the end of a turn, at most once in 20 minutes.") },
  { value: "firm", label: msg("Firm"), text: msg("The agent offers a one-minute explain-back before it stops, once per turn.") },
  { value: "off", label: msg("Off"), text: msg("Nothing is said. The desk still fills in.") },
];

/** A home folder reads as a tilde, the way a person writes it. */
function short(path: string, home: string): string {
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export default function ConnectionPanel({ state, onSave }: { state: DeskState; onSave: (next: Settings) => Promise<boolean> }) {
  const c = state.connection!;
  const settings = state.settings!;
  const [busy, setBusy] = useState(false);
  // What happened, not its words: the language may have just changed, and the
  // note is said in the one on the page now, not in the one there was before.
  const [note, setNote] = useState<"saved" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const save = async (next: Settings) => {
    setBusy(true);
    const ok = await onSave(next);
    setBusy(false);
    setNote(ok ? "saved" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 3000);
  };

  const called = c.pulses.mcpCalled ? ago(c.pulses.mcpCalled, new Date()) : null;
  const started = c.pulses.mcpStarted ? ago(c.pulses.mcpStarted, new Date()) : null;
  const session = c.pulses.sessionStart ? ago(c.pulses.sessionStart, new Date()) : null;
  const nudge = NUDGE.find((n) => n.value === settings.nudge) ?? NUDGE[0];

  const row = (name: string, ok: boolean, text: string) => (
    <div className="kv-row">
      <dt>
        <span className="dot" data-state={ok ? "explained" : "unexplained"} aria-hidden="true" />
        {name}
      </dt>
      <dd>{text}</dd>
    </div>
  );

  return (
    <section className="desk-panel col-12" id="connection" aria-labelledby="connection-title" style={{ scrollMarginTop: 76 }}>
      <div className="panel-head">
        <h2 className="h2" id="connection-title">
          {t("Connection and settings")}
        </h2>
        <span className="eyebrow">{t("This machine only")}</span>
      </div>

      <div className="set">
        <div className="set-head">
          <span className="eyebrow" id="language-label">
            {t("Language")}
          </span>
          <span className="set-note" role="status">
            {note === "saved" ? t("Saved.") : note === "failed" ? t("Not saved: the local mozg server did not take it.") : ""}
          </span>
        </div>
        <select
          id="language"
          className="select"
          value={settings.language}
          disabled={busy}
          onChange={(event) => void save({ ...settings, language: event.target.value as Settings["language"] })}
        >
          <option value="system">{t("Follows this machine")}</option>
          {MESSAGE_LANGS.map((option) => (
            <option key={option} value={option}>
              {LANG_NAME[option]}
            </option>
          ))}
        </select>
        <p className="set-text">{t("For the desk, for the reason the agent shows before it asks, and for the nudge at the end of a turn. The agent itself is spoken to in English, and answers you in yours.")}</p>
      </div>

      <dl className="kv">
        {row(t("Plugin"), true, c.plugin ? `${c.plugin.name} ${c.plugin.version}` : t("Running from the source folder, not from an installed plugin."))}
        {row(
          t("MCP"),
          Boolean(called),
          called
            ? t("The agent last called mozg <0/>.").replace("<0/>", called)
            : started
              ? t("The agent connected <0/> and has not called a tool yet. Say 'status' to it.").replace("<0/>", started)
              : t("No call from the agent yet. Open a project in Claude Code and say 'status' to it."),
        )}
        {row(
          t("Hooks"),
          Boolean(session),
          session
            ? t("A session started <0/>.").replace("<0/>", session)
            : t("No session hook has fired yet. Check that the plugin is enabled in Claude Code."),
        )}
        {row(
          t("Reading"),
          c.indexComplete,
          `${breakable(short(c.logsDir, c.home))} · ${count(c.logs, "<0/> log", "<0/> logs")}${
            c.indexedAt ? (c.indexComplete ? t(", all read <0/>.").replace("<0/>", ago(c.indexedAt, new Date())) : t(", still reading older sessions")) : ""
          }`,
        )}
        {row(
          t("Notes"),
          true,
          `${breakable(short(c.storeDir, c.home))} · ${count(c.changes, "<0/> change", "<0/> changes")} · ${count(
            c.sessions,
            "<0/> session",
            "<0/> sessions",
          )} · ${count(c.explains, "<0/> explain-back", "<0/> explain-backs")}`,
        )}
      </dl>

      <div className="set">
        <div className="set-head">
          <span className="eyebrow" id="asks-label">
            {t("The agent asks first")}
          </span>
        </div>
        <div className="seg" role="radiogroup" aria-labelledby="asks-label">
          {ASKS.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={option.value === settings.asks}
              className="seg-opt"
              disabled={busy}
              onClick={() => void save({ ...settings, asks: option.value })}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <p className="set-text">
          {t((ASKS.find((o) => o.value === settings.asks) ?? ASKS[0]).text)}{" "}
          {t("In a session started with bypassed permissions there is nobody to ask, so the gate stays quiet and those changes count as unasked.")}
        </p>
      </div>

      <div className="set">
        <div className="set-head">
          <span className="eyebrow" id="nudge-label">
            {t("At the end of a turn")}
          </span>
        </div>
        <div className="seg" role="radiogroup" aria-labelledby="nudge-label">
          {NUDGE.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={option.value === settings.nudge}
              className="seg-opt"
              disabled={busy}
              onClick={() => void save({ ...settings, nudge: option.value })}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <p className="set-text">{t(nudge.text)}</p>
      </div>

      {c.projects.length > 0 && (
        <div className="set">
          <div className="set-head">
            <span className="eyebrow" id="projects-label">
              {t("Projects on the desk")}
            </span>
          </div>
          <p className="set-text" id="projects-label-text">
            {t("A hidden project is left off the desk and out of every number on it. Its logs are still read and nothing is deleted. Show it again any time.")}
          </p>
          <div className="picks" role="group" aria-labelledby="projects-label" aria-describedby="projects-label-text">
            {c.projects.map((p) => {
              const off = settings.hidden.includes(p.project);
              return (
                <button
                  key={p.project}
                  type="button"
                  className="pick"
                  aria-pressed={!off}
                  disabled={busy}
                  onClick={() => void save({ ...settings, hidden: off ? settings.hidden.filter((h) => h !== p.project) : [...settings.hidden, p.project] })}
                >
                  {p.name}
                  {off && <span className="pick-off"> · {t("hidden")}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
