"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ChatForm from "@/app/chat/ChatForm";
import AutoRefresh from "@/components/AutoRefresh";
import { markDockSeen } from "./dock-actions";

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

interface FreshAchievement {
  kind: string;
  title: string;
  blurb: string;
}

export default function MascotDockClient({
  signedIn,
  messages,
  unread,
  fresh,
  operator,
}: {
  signedIn: boolean;
  messages: Message[];
  unread: number;
  fresh: FreshAchievement[];
  /** Set only for the operator: the whole product's waiting work. */
  operator: { unread: number; payments: number } | null;
}) {
  const [open, setOpen] = useState(false);
  // Opening the drawer is reading it: the server forgets the counters, the
  // client zeroes its own copy, and the two agree without a refetch. The new
  // badges themselves stay visible for the rest of the visit — only the count
  // goes; a notification that vanishes while you reach for it is a bug.
  // Exception: the operator's waiting USER messages stay counted until they
  // are actually answered — glancing at a number is not support.
  const [seen, setSeen] = useState(false);
  const badge =
    (seen ? 0 : unread + fresh.length + (operator?.payments ?? 0)) + (operator?.unread ?? 0);

  // A short blip when the count grows while the page is open — the corner
  // moving is easy to miss, a sound is not. WebAudio needs no asset; browsers
  // that have seen no interaction yet simply stay silent.
  const prevBadge = useRef(badge);
  useEffect(() => {
    if (badge > prevBadge.current) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
        osc.stop(ctx.currentTime + 0.28);
        osc.onended = () => void ctx.close();
      } catch {
        /* no audio context — fine */
      }
    }
    prevBadge.current = badge;
  }, [badge]);

  const toggle = () => {
    setOpen((o) => !o);
    if (!seen && badge > 0) {
      setSeen(true);
      void markDockSeen();
    }
  };

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
      {/* The operator's dock watches even while closed — a payment or a
          message should ring the corner within half a minute, not on the next
          navigation. Everyone else polls only with the drawer open. */}
      {operator && <AutoRefresh active intervalMs={open ? 15_000 : 30_000} />}
      <button
        type="button"
        aria-label={open ? "Close the chat" : "Ask the developer"}
        aria-expanded={open}
        onClick={toggle}
        className="dock-button"
        data-open={open}
      >
        <BrainFace animate={!open} />
        {badge > 0 && !open && <span className="dock-badge">{badge}</span>}
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
                {operator && (operator.unread > 0 || operator.payments > 0) && (
                  <div className="dock-ach-list">
                    {operator.unread > 0 && (
                      <Link href="/admin/chat" className="dock-ach">
                        <span>
                          <strong>chatmozg</strong>
                          <span className="dock-ach-blurb">
                            {operator.unread} message{operator.unread === 1 ? "" : "s"} waiting for you
                          </span>
                        </span>
                        <span className="mono dock-ach-new">reply →</span>
                      </Link>
                    )}
                    {operator.payments > 0 && (
                      <Link href="/admin" className="dock-ach">
                        <span>
                          <strong>Payments</strong>
                          <span className="dock-ach-blurb">
                            {operator.payments} new invoice{operator.payments === 1 ? "" : "s"} since you last looked
                          </span>
                        </span>
                        <span className="mono dock-ach-new">see →</span>
                      </Link>
                    )}
                  </div>
                )}
                {fresh.length > 0 && (
                  <div className="dock-ach-list">
                    {fresh.map((a) => (
                      <Link key={a.kind} href="/achievements" className="dock-ach">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/achievements/${a.kind}.webp`} alt="" width={40} height={40} />
                        <span>
                          <strong>{a.title}</strong>
                          <span className="dock-ach-blurb">{a.blurb}</span>
                        </span>
                        <span className="mono dock-ach-new">new</span>
                      </Link>
                    ))}
                  </div>
                )}
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
                {/* While the drawer is open, replies land without a reload —
                    the server half re-renders on each tick, closed costs zero.
                    (The operator's always-on poll above already covers them.) */}
                {!operator && <AutoRefresh active={open} intervalMs={15_000} />}
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
