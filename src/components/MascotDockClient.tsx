"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ChatForm from "@/app/chat/ChatForm";

/**
 * The dock: a brain that breathes in the corner, and the drawer it opens.
 *
 * Deliberately not a support bot. Nothing here answers on its own — the thread
 * goes to a person, and the empty state says so, because a mascot that improvises
 * answers about a product whose entire pitch is measured knowledge would be the
 * funniest possible own goal.
 *
 * The animation is two things: a slow breath on the whole figure, and one fold
 * that pulses like a thought. Both stop dead under prefers-reduced-motion, and
 * neither runs while the drawer is open — a thing that moves beside text you are
 * reading is a thing you close.
 */

interface Message {
  id: string;
  author: "user" | "operator";
  body: string;
  at: string;
}

export default function MascotDockClient({
  signedIn,
  messages,
  unread,
}: {
  signedIn: boolean;
  messages: Message[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);

  // Escape closes it, like every other drawer on the internet. Bound only while
  // open so the handler is not sitting on every page doing nothing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close the chat" : "Ask the developer"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="dock-button"
        data-open={open}
      >
        <BrainFace animate={!open} />
        {unread > 0 && !open && <span className="dock-badge">{unread}</span>}
      </button>

      {open && (
        <aside className="dock-panel" aria-label="chatmozg">
          <header className="dock-head">
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>
                chatmozg
              </p>
              <p className="mono dock-sub">a person reads this, not a bot</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="dock-close"
            >
              ✕
            </button>
          </header>

          <div className="dock-body">
            {!signedIn ? (
              <div style={{ display: "grid", gap: ".9rem" }}>
                <p style={{ margin: 0, color: "var(--ink-2)", fontSize: ".9375rem", lineHeight: 1.6 }}>
                  Ask anything — a bug, a brain you wish existed, or what any of
                  this is. Messages are a thread, so an answer comes back here.
                </p>
                <p style={{ margin: 0, color: "var(--ink-2)", fontSize: ".9375rem", lineHeight: 1.6 }}>
                  It needs an account, only so the reply has somewhere to land.
                </p>
                <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
                  <Link className="btn" href="/sign-in?next=/chat">
                    Sign in and ask
                  </Link>
                  <Link className="btn btn-ghost" href="/basics">
                    Or read the basics
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {messages.length === 0 ? (
                  <p style={{ margin: "0 0 1rem", color: "var(--ink-2)", fontSize: ".9375rem", lineHeight: 1.6 }}>
                    Nothing here yet. One full message beats five pings: what
                    happened, where, and what you expected instead.
                  </p>
                ) : (
                  <div className="dock-thread">
                    {messages.map((m) => (
                      <div key={m.id} className="dock-msg" data-author={m.author}>
                        <p className="mono dock-msg-at">
                          {m.author === "operator" ? "mozg" : "you"} · {m.at}
                        </p>
                        <p className="dock-msg-body">{m.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                <ChatForm />
                <p className="mono dock-foot">
                  <Link className="linkish" href="/chat">
                    open the full thread →
                  </Link>
                </p>
              </>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

/**
 * The mascot itself — a drawn brain in the same print style as the portraits on
 * /stories, which is where the site's illustration already lives. It replaced an
 * inline SVG I drew by hand: two lobes made of bezier guesswork read as a diagram
 * of a brain, not as a character, and this thing has to be likeable.
 */
function BrainFace({ animate }: { animate: boolean }) {
  // A fixed-size local illustration inside a fixed-size button: next/image would
  // add a loader and an optimisation round trip for 23KB that never changes size.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mascot.webp" alt="" width={44} height={44} className={animate ? "dock-brain dock-brain-live" : "dock-brain"} />;
}
