"use client";

import { useT } from "@/lib/t-client";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { fill } from "@/lib/markup";

/**
 * Drag a folder of screenshots in. Uploads go straight to the queue, so the
 * rows appear immediately and fill in as the worker gets to them.
 */
export default function Dropzone({ brainId }: { brainId: string }) {
  const t = useT();

  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;

      setBusy(true);
      setError(null);
      setMessage(
        fill(
          list.length === 1 ? t("Uploading <0/> file…") : t("Uploading <0/> files…"),
          [list.length],
        ),
      );

      const form = new FormData();
      for (const f of list) form.append("files", f);

      try {
        const res = await fetch(`/api/brains/${brainId}/sources`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Upload failed.");
          setMessage(null);
        } else {
          const skipped = data.rejected?.length
            ? fill(t(" · skipped <0/>"), [data.rejected.length])
            : "";
          setMessage(
            fill(
              data.accepted === 1 ? t("Queued <0/> file") : t("Queued <0/> files"),
              [data.accepted],
            ) + skipped,
          );
          router.refresh();
        }
      } catch {
        setError("Upload failed — check your connection and try again.");
        setMessage(null);
      } finally {
        setBusy(false);
      }
    },
    // t is memoised on the dictionary, so this is stable across renders.
    [brainId, router, t],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void upload(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className="card-new"
      style={{
        minHeight: 150,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        cursor: busy ? "progress" : "pointer",
        borderColor: over ? "var(--ink)" : undefined,
        background: over ? "var(--paper-2)" : undefined,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,application/json,.md,.txt,.pdf"
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />

      <span className="plus" aria-hidden>
        ↓
      </span>
      <span className="mono" style={{ fontSize: ".8125rem" }}>
        {busy ? t("Uploading…") : t("Drop screenshots here")}
      </span>
      <span style={{ fontSize: ".8125rem", color: "var(--ink-3)" }}>
        {t("Screenshots, PDFs, Markdown or text · up to 20 MB each")}</span>

      {message && (
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-green)" }}>
          {message}
        </span>
      )}
      {error && (
        <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-red)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
