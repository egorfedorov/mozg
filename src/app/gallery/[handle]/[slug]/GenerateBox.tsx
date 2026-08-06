"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generate } from "./actions";

interface Job {
  id: string;
  status: string;
  prompt: string;
  error: string | null;
  created_at: string;
}

/**
 * The thing you came to the gallery to do.
 *
 * It polls, because generation takes tens of seconds and the alternative is a
 * page that looks broken while it works. The poll stops the moment nothing is
 * running — a gallery tab left open all afternoon must not sit hammering the
 * server for a queue that emptied at lunchtime.
 */
export default function GenerateBox({
  handle,
  slug,
  priceCents,
  artistCents,
  balanceCents,
  free,
  jobs,
}: {
  handle: string;
  slug: string;
  priceCents: number;
  artistCents: number;
  balanceCents: number;
  /** The artist generating in their own style pays nothing. */
  free: boolean;
  jobs: Job[];
}) {
  const [state, action, pending] = useActionState(generate, null);
  const router = useRouter();

  // Derived, not stored: "something is running" is a fact about the rows the
  // server just sent, and copying it into state only creates a second version
  // that can disagree with them.
  const live = jobs.some((j) => j.status === "queued" || j.status === "running");

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [live, router]);

  const broke = !free && balanceCents < priceCents;

  return (
    <section className="gen-box">
      <form action={action} className="gen-form">
        <input type="hidden" name="handle" value={handle} />
        <input type="hidden" name="slug" value={slug} />
        <label className="eyebrow" htmlFor="gen-prompt">
          What should it draw?
        </label>
        <textarea
          id="gen-prompt"
          name="prompt"
          rows={3}
          required
          maxLength={600}
          placeholder="a fox sitting and reading a small book"
          className="gen-input"
        />
        <div className="gen-actions">
          <button className="btn" disabled={pending || broke}>
            {pending ? "Sending…" : free ? "Generate — free, your style" : `Generate — ${priceCents}¢`}
          </button>
          <span className="mono gen-note">
            {free
              ? "your own style, so nothing is charged"
              : `${artistCents}¢ of that goes to the artist, every time`}
          </span>
        </div>
        {broke && (
          <p className="mono gen-err">
            Your balance is {(balanceCents / 100).toFixed(2)} — top up in settings.
          </p>
        )}
        {state?.error && <p className="mono gen-err">{state.error}</p>}
      </form>

      {jobs.length > 0 && (
        <div className="gen-grid">
          {jobs.map((j) => (
            <figure key={j.id} className="gen-item">
              {j.status === "done" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/generations/${j.id}/image`} alt={j.prompt} loading="lazy" />
              ) : (
                <span className="gen-placeholder mono" data-failed={j.status === "failed"}>
                  {j.status === "failed" ? (j.error ?? "failed") : "drawing…"}
                </span>
              )}
              <figcaption className="mono">{j.prompt}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {live && (
        <p className="mono gen-note" style={{ marginTop: ".75rem" }}>
          Working — this takes up to a minute. You can leave the page; it will be here.
        </p>
      )}
    </section>
  );
}
