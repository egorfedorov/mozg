"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import CopyButton from "@/components/CopyButton";
import { call, field } from "@/components/site/api";
import { LANG_NAME, t } from "@/lib/i18n";
import type { Thread } from "../types";
import { howLong, when } from "../when";

const POLL_MS = 20_000;

/**
 * The threads of the chat, waiting ones first, and the one in front with its
 * reply. Opening a thread is reading it: what waited there waits no longer.
 */
export default function Chat({ refresh }: { refresh: () => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const load = useCallback(async () => {
    const answer = await call("GET", "/api/operator/threads");
    if (answer.ok) setThreads(field<Thread[]>(answer, "threads", []));
  }, []);

  useEffect(() => {
    // The first read a tick later: nothing of it is the render's own.
    const first = window.setTimeout(() => void load(), 0);
    const clock = window.setInterval(() => void (document.hidden || load()), POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(clock);
    };
  }, [load]);

  const thread = threads.find((one) => one.id === chosen) ?? null;
  const waiting = thread?.waiting ?? 0;
  const id = thread?.id;

  // To have it in front is to have read it.
  useEffect(() => {
    if (!id || !waiting) return;
    void call("POST", `/api/operator/threads/${id}/read`).then(() => {
      void load();
      refresh();
    });
  }, [id, waiting, load, refresh]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = reply.trim();
    if (!thread || !body || state === "sending") return;
    setState("sending");
    const answer = await call("POST", `/api/operator/threads/${thread.id}/reply`, { body });
    setState(answer.ok ? "sent" : "failed");
    if (answer.ok) {
      setReply("");
      await load();
    }
  };

  const remove = async () => {
    if (!thread) return;
    if (!window.confirm(t("Delete it for good? The visitor is not told."))) return;
    await call("DELETE", `/api/operator/threads/${thread.id}`);
    setChosen(null);
    await load();
    refresh();
  };

  const last = (one: Thread) => one.messages[one.messages.length - 1];

  return (
    <div className="desk-grid chat-grid">
      <section className="desk-panel chat-side col-4" aria-label={t("Threads")}>
        <div className="panel-head">
          <h1 className="h2">{t("Chat")}</h1>
          <span className="eyebrow">{t(threads.length === 1 ? "<0/> thread" : "<0/> threads").replace("<0/>", String(threads.length))}</span>
        </div>
        {threads.length === 0 ? (
          <p className="row-empty">{t("Nothing has come in yet. The brain in the corner of every page is where it starts.")}</p>
        ) : (
          <ul className="thread-list">
            {threads.map((one) => (
              <li key={one.id}>
                <button type="button" className="thread" data-on={one.id === chosen || undefined} onClick={() => setChosen(one.id)}>
                  <span className="thread-top">
                    <span className="mono thread-lang">{LANG_NAME[one.lang as keyof typeof LANG_NAME] ?? one.lang}</span>
                    <span className="mono thread-when">{howLong(last(one)?.at ?? one.createdAt)}</span>
                    {one.waiting > 0 && <span className="tag" data-attention="true">{t("new")}</span>}
                    {one.email && <span className="tag">{t("by mail too")}</span>}
                  </span>
                  <span className="thread-snip">{last(one)?.body ?? t("No message yet.")}</span>
                  <span className="mono thread-page">{one.page}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="desk-panel chat-thread col-8" aria-label={t("The thread")}>
        {!thread ? (
          <p className="row-empty">{t("Choose a thread on the left.")}</p>
        ) : (
          <>
            <div className="panel-head">
              <h2 className="h2 mono adm-path">{thread.page}</h2>
              <button type="button" className="linkish" onClick={() => void remove()}>
                {t("Delete the thread")}
              </button>
            </div>
            <div className="rows">
              {thread.messages.length === 0 && <p className="row-empty">{t("No message yet.")}</p>}
              {thread.messages.map((m) => (
                <div key={m.id} className="row" data-state={m.author === "operator" ? "explained" : "unexplained"}>
                  <span style={{ minWidth: 0 }}>
                    <span className="row-meta">
                      {m.author === "operator" ? "mozg" : t("the visitor")} · {when(m.at)}
                    </span>
                    <span className="adm-said">{m.body}</span>
                  </span>
                </div>
              ))}
            </div>
            <form className="reply" onSubmit={send}>
              <textarea rows={4} required maxLength={4000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder={t("Write the reply here. It is sent as written, in the language you write it.")} aria-label={t("Your reply")} />
              <div className="dock-actions">
                <button type="submit" className="btn" disabled={state === "sending"}>
                  {state === "sending" ? t("Sending…") : t("Send the reply")}
                </button>
                {state === "sent" && <span className="dock-said">{t("Sent.")}</span>}
                {state === "failed" && <span className="dock-error">{t("It was not sent. Try once more.")}</span>}
                {thread.email && <CopyButton text={thread.email} label={t("Copy the address")} copied={t("Copied")} />}
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
