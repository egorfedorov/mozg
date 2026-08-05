"use client";

import { useEffect, useState } from "react";

/**
 * The operator's "notify this browser" switch. Chrome and Firefox subscribe
 * on click; Safari 16.4+ works the same way but insists the permission
 * prompt comes from a user gesture — which a button click is, so one code
 * path covers all three.
 */
export default function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<
    "checking" | "unsupported" | "off" | "on" | "denied" | "working"
  >("checking");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported" as const;
      if (Notification.permission === "denied") return "denied" as const;
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      return sub ? ("on" as const) : ("off" as const);
    })().then(setState, () => setState("off"));
  }, []);

  const enable = async () => {
    setState("working");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      // base64url → bytes: older Chrome and current Safari want a BufferSource.
      const raw = atob(vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("on");
    } catch {
      setState("off");
    }
  };

  const disable = async () => {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  };

  if (state === "checking") return null;
  if (state === "unsupported") {
    return (
      <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", margin: 0 }}>
        This browser does not support web push.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-red)", margin: 0 }}>
        Notifications are blocked for mozg.sh in this browser — allow them in
        site settings, then come back here.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
      {state === "on" ? (
        <>
          <span className="mono" style={{ fontSize: ".8125rem", color: "var(--color-riso-green)" }}>
            ✓ this browser gets a notification for new messages and payments
          </span>
          <button className="btn btn-ghost" style={{ padding: ".35rem .8rem" }} onClick={disable}>
            Turn off
          </button>
        </>
      ) : (
        <button className="btn" disabled={state === "working"} onClick={enable}>
          {state === "working" ? "Asking the browser…" : "Notify this browser"}
        </button>
      )}
    </div>
  );
}
