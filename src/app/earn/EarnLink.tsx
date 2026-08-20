"use client";

import { useState } from "react";
import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";

/**
 * The affiliate's link, and the four seconds after they see it.
 *
 * Copy is the whole job, so copy is the loudest thing here. The rest exists
 * because of what people actually do with a referral link: they send it
 * somewhere, and they want it to land on the page that makes their argument
 * rather than on the home page.
 *
 * `to` is the second half of that. An SEO consultant recommending one brain
 * wants the link to open that brain — the credit still attaches at /r, the
 * visitor never sees the hop, and the affiliate never has to explain why the
 * link they posted about a Tailwind brain opened a manifesto.
 */
const SHARES: { label: string; url: (link: string, text: string) => string }[] = [
  { label: "X", url: (l, x) => `https://x.com/intent/tweet?text=${enc(x)}&url=${enc(l)}` },
  { label: "Telegram", url: (l, x) => `https://t.me/share/url?url=${enc(l)}&text=${enc(x)}` },
  { label: "Reddit", url: (l, x) => `https://reddit.com/submit?url=${enc(l)}&title=${enc(x)}` },
  {
    label: "LinkedIn",
    url: (l) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(l)}`,
  },
  { label: "Email", url: (l, x) => `mailto:?subject=${enc(x)}&body=${enc(l)}` },
];

function enc(s: string): string {
  return encodeURIComponent(s);
}

export default function EarnLink({ base, pitch }: { base: string; pitch: string }) {
  const t = useT();

  const [to, setTo] = useState("");
  const [copied, setCopied] = useState(false);

  // A path, not a URL. Anything else is dropped rather than pasted into a
  // link somebody is about to post publicly — the route refuses it too, but a
  // link that visibly does not contain the junk is easier to trust.
  const path = to.trim().replace(/^https?:\/\/[^/]+/, "");
  const link = path.startsWith("/") ? `${base}?to=${enc(path)}` : base;

  return (
    <div className="panel" style={{ display: "grid", gap: "1rem" }}>
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>
          {t("Your link")}
        </p>
        <p style={{ color: "var(--ink-2)", margin: ".35rem 0 0", fontSize: ".9375rem" }}>
          {t("Anyone who opens it is yours for 30 days, whether they sign up that minute or the following Tuesday.")}
        </p>
      </div>

      <div
        className="mono"
        style={{
          display: "flex",
          alignItems: "center",
          gap: ".75rem",
          flexWrap: "wrap",
          border: "1.5px solid var(--ink)",
          background: "var(--paper)",
          padding: ".7rem .9rem",
          fontSize: ".875rem",
          wordBreak: "break-all",
        }}
      >
        <span style={{ flex: 1, minWidth: 200 }}>{link}</span>
        <button
          className="btn"
          type="button"
          style={{
            background: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
            borderColor: copied ? "var(--color-riso-green)" : "var(--color-riso-yellow)",
            color: "var(--ink)",
          }}
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? t("Copied") : t("Copy")}
        </button>
      </div>

      <div>
        <label className="eyebrow" htmlFor="earn-to" style={{ display: "block", marginBottom: ".4rem" }}>
          {t("Land them somewhere specific — optional")}
        </label>
        <input
          id="earn-to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={t("/b/mozg/tailwind — a brain, the catalogue, any page here")}
          className="mono"
          style={{
            width: "100%",
            fontSize: ".8125rem",
            padding: ".55rem .7rem",
            border: "1.5px solid var(--rule)",
            background: "var(--paper)",
            color: "var(--ink)",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span className="eyebrow">{t("Send it")}</span>
        {SHARES.map((s) => (
          <a
            key={s.label}
            className="mono"
            href={s.url(link, pitch)}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: ".75rem",
              padding: ".35rem .6rem",
              border: "1.25px solid var(--rule)",
              color: "var(--ink-2)",
            }}
          >
            {s.label}
          </a>
        ))}
      </div>

      <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: 0 }}>
        {markup(t("Commission lands on your balance the second they pay — not at the end of a month, and not after somebody approves it. Withdraw it from <0>Balance</0>."), [
          <a key="s0" href="/settings/balance" style={{ textDecoration: "underline" }} />,
        ])}
      </p>
    </div>
  );
}
