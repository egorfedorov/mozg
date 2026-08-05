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
 * The same brain the brain pages use, at dock size. Fixed at five filled folds
 * here rather than tied to a score: this one is the product, not a measurement.
 */
function BrainFace({ animate }: { animate: boolean }) {
  return (
    <svg
      viewBox="0 0 96 96"
      width="42"
      height="42"
      aria-hidden
      className={animate ? "dock-brain dock-brain-live" : "dock-brain"}
    >
      <path
        d="M34 18c-9 0-15 6-15 13 0 3-4 4-4 9s4 7 4 10c0 8 7 13 15 13h4v9h6v-9h10c9 0 15-5 15-13 0-3 4-5 4-10s-4-6-4-9c0-7-6-13-15-13-3-4-8-6-12-6s-8 2-8 6z"
        fill="var(--paper)"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          className={i === 2 ? "dock-fold dock-fold-think" : "dock-fold"}
          d={`M${26 + i * 2} ${30 + i * 9} q10 ${i % 2 ? -6 : 6} 22 0 q10 ${i % 2 ? 6 : -6} 18 0`}
          fill="none"
          stroke="var(--color-riso-red)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.85"
        />
      ))}
    </svg>
  );
}
