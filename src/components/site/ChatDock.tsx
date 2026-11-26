"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LANG_TAG, msg, setLanguage, t, type Lang } from "@/lib/i18n";
import { call, field } from "./api";

/**
 * The chat with the person behind mozg: the floating brain, and the panel it opens.
 *
 * A thread belongs to the browser, not to an account. The first time a message
 * is sent the server makes a thread and hands back a secret that is kept here
 * and nowhere else; a letter about the thread carries a second way in, so it
 * can be opened from another device. The operator reads and answers in their
 * panel. While the panel is open the page asks every fifteen seconds; closed,
 * it asks once.
 *
 * The plugin has nothing to do with this. It is a page of the site talking to
 * the site's server, and only when a person writes.
 */

type Message = { id: string; author: "visitor" | "operator"; body: string; at: string };
type Thread = { id: string; email: string | null; messages: Message[] };
/** What this browser keeps: the thread, and the secret that opens it. */
type Kept = { id: string; key: string };

const STORE = "mozg.chat";
const PAUSE_MS = 15_000;

/** What a refusal is called, in a sentence. Chosen where it is shown. */
const ERROR: Record<string, string> = {
  network: msg("The chat is not answering. Try again in a minute."),
  too_soon: msg("That was quick. Wait a moment before the next one."),
  too_many: msg("That is a lot for one hour. Come back later."),
  full: msg("This thread is full. The next one starts on its own."),
  too_large: msg("That is longer than a message. Shorten it a little."),
  origin: msg("The chat answers only on the site itself."),
};

function kept(): Kept | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORE) ?? "null") as Partial<Kept> | null;
    return value && typeof value.id === "string" && typeof value.key === "string" ? { id: value.id, key: value.key } : null;
  } catch {
    return null;
  }
}

function keep(mine: Kept): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(mine));
  } catch {
    /* a private window: the thread lasts as long as the tab */
  }
}

export default function ChatDock({ lang, openLabel, closeLabel }: { lang: Lang; openLabel: string; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [asked, setAsked] = useState(false);
  /** The trap for machines. A person never fills it, because a person never sees it. */
  const [website, setWebsite] = useState("");

  // The page is printed in one language already; the panel's own words are chosen in it here.
  useEffect(() => {
    setLanguage(lang);
  }, [lang]);

  const read = useCallback(async (mine: Kept, shown: boolean) => {
    const answer = await call("GET", `/api/chat/threads/${mine.id}`, undefined, { Authorization: `Bearer ${mine.key}` });
    if (!answer.ok) return false;
    setThread(field<Thread | null>(answer, "thread", null));
    // Reading is seeing: the server forgets what was new, so the count is taken first.
    if (!shown) setUnseen(field(answer, "unseen", 0));
    return true;
  }, []);

  // Once: the thread this browser keeps, or the one a letter linked to.
  useEffect(() => {
    const url = new URL(location.href);
    const id = url.searchParams.get("chat");
    const key = url.searchParams.get("k");
    const fromLetter = id && key ? { id, key } : null;
    const mine = fromLetter ?? kept();
    if (fromLetter) keep(fromLetter);
    const arrive = url.hash === "#chat";
    if (mine) {
      void (async () => {
        setSecret(mine.key);
        if ((await read(mine, arrive)) && arrive) setOpen(true);
      })();
    } else if (arrive) {
      // No thread to open yet: the panel opens empty, and the first message makes one.
      setTimeout(() => setOpen(true), 0);
    }
    // A link may ask for the chat: the footer's "write to the author".
    const ask = () => setOpen(true);
    window.addEventListener("mozg:chat", ask);
    return () => window.removeEventListener("mozg:chat", ask);
  }, [read]);

  // While open, replies land without a reload. Closed costs nothing.
  useEffect(() => {
    if (!open || !secret || !thread) return;
    const mine = { id: thread.id, key: secret };
    const tick = () => void (document.hidden || read(mine, true));
    const clock = window.setInterval(tick, PAUSE_MS);
    return () => window.clearInterval(clock);
  }, [open, secret, thread, read]);

  // Escape closes, and the latest message stays in view.
  const latest = thread?.messages[thread.messages.length - 1]?.id ?? "";
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.querySelector(".dock-body")?.scrollTo({ top: 1_000_000 });
    return () => window.removeEventListener("keydown", onKey);
  }, [open, latest]);

  /** The thread to write in: this browser's, or one made now. Null when the server cannot be reached. */
  const ensure = async (): Promise<Kept | null> => {
    if (secret && thread) return { id: thread.id, key: secret };
    const made = await call("POST", "/api/chat/threads", { lang, page: location.pathname });
    if (!made.ok) {
      setRefused(made.error);
      return null;
    }
    const id = field(made, "id", "");
    const key = field(made, "key", "");
    if (!id || !key) {
      setRefused("network");
      return null;
    }
    keep({ id, key });
    setSecret(key);
    setThread(field<Thread | null>(made, "thread", null) ?? { id, email: null, messages: [] });
    return { id, key };
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setRefused(null);
    const mine = await ensure();
    const answer = mine ? await call("POST", `/api/chat/threads/${mine.id}/messages`, { body, website }, { Authorization: `Bearer ${mine.key}` }) : null;
    setSending(false);
    if (!answer?.ok) {
      setRefused(answer && !answer.ok ? answer.error : "network");
      return;
    }
    setText("");
    setSaid(true);
    const message = field<Message | null>(answer, "message", null);
    if (message) setThread((now) => (now ? { ...now, messages: [...now.messages, message] } : now));
  };

  const leaveEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!thread || !secret || !email.trim()) return;
    await call("POST", `/api/chat/threads/${thread.id}/email`, { email: email.trim() }, { Authorization: `Bearer ${secret}` });
    // The server answers the same either way, so this says what was asked, not what was taken.
    setAsked(true);
  };

  const toggle = () => {
    setOpen(!open);
    setUnseen(0);
    if (!open && secret && thread) void read({ id: thread.id, key: secret }, true);
  };

  const when = (at: string) => new Intl.DateTimeFormat(LANG_TAG[lang], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
  const messages = thread?.messages ?? [];

  return (
    <>
      <button type="button" className="dock-button" data-open={open || undefined} onClick={toggle} aria-expanded={open} aria-label={openLabel}>
        {/* A printed illustration, not a drawn one: a brain of curves reads as a diagram. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="dock-brain" src="/brand/mascot.webp" alt="" width={44} height={44} data-live={!open || undefined} />
        {unseen > 0 && !open && <span className="dock-badge">{unseen}</span>}
      </button>

      {open && (
        <aside className="dock-panel" aria-label="chatmozg">
          <header className="dock-head">
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>
                {t("chatmozg")}
              </p>
              <p className="mono dock-sub">{t("a person reads this, not a bot")}</p>
            </div>
            <button type="button" className="dock-close" onClick={() => setOpen(false)} aria-label={closeLabel}>
              ✕
            </button>
          </header>

          <div className="dock-body">
            {messages.length === 0 ? (
              <p className="dock-intro">{t("Ask anything: a bug, a wish, or what any of this is. It is a thread, so an answer comes back here.")}</p>
            ) : (
              <div className="dock-thread">
                {messages.map((m) => (
                  <div key={m.id} className="dock-msg" data-author={m.author}>
                    <p className="mono dock-msg-at">
                      {m.author === "operator" ? "mozg" : t("you")} · {when(m.at)}
                    </p>
                    <p className="dock-msg-body">{m.body}</p>
                  </div>
                ))}
              </div>
            )}

            <form className="dock-form" onSubmit={send}>
              <textarea
                rows={4}
                required
                maxLength={4000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t(
                  "One full message beats five pings: what happened, where (a link helps), what you expected instead. Feature ideas are just as welcome as bugs.",
                )}
                aria-label={t("Your message")}
              />
              {/* The trap for machines: a field nobody can see. */}
              <input className="dock-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" placeholder="website" value={website} onChange={(event) => setWebsite(event.target.value)} />
              <div className="dock-actions">
                <button type="submit" className="btn" disabled={sending}>
                  {sending ? t("Sending…") : t("Send to the developer")}
                </button>
                {said && !refused && <span className="mono dock-said">{t("delivered — replies land right here")}</span>}
                {refused && (
                  <span className="mono dock-error" role="alert">
                    {t(ERROR[refused] ?? ERROR.network)}
                  </span>
                )}
              </div>
            </form>

            {said && thread && !thread.email && !asked && (
              <form className="dock-mail" onSubmit={leaveEmail}>
                <p className="dock-mail-note">{t("Get the reply by mail too")}</p>
                <div className="dock-mail-row">
                  <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("Your email")} aria-label={t("Your email")} />
                  <button type="submit" className="btn btn-ghost">
                    {t("Send")}
                  </button>
                </div>
              </form>
            )}
            {asked && !thread?.email && <p className="mono dock-mail-note">{t("Check your mail: confirm the link, and replies land there as well as here.")}</p>}
          </div>
        </aside>
      )}
    </>
  );
}
