"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

/**
 * Drag a folder of screenshots in. Uploads go straight to the queue, so the
 * rows appear immediately and fill in as the worker gets to them.
 */
export default function Dropzone({ brainId }: { brainId: string }) {
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
      setMessage(`Uploading ${list.length} file${list.length > 1 ? "s" : ""}…`);

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
            ? ` · skipped ${data.rejected.length}`
            : "";
          setMessage(`Queued ${data.accepted} file${data.accepted === 1 ? "" : "s"}${skipped}`);
          router.refresh();
        }
      } catch {
        setError("Upload failed — check your connection and try again.");
        setMessage(null);
      } finally {
        setBusy(false);
      }
    },
    [brainId, router],
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
        {busy ? "Uploading…" : "Drop screenshots here"}
      </span>
      <span style={{ fontSize: ".8125rem", color: "var(--ink-3)" }}>
        Screenshots, PDFs, Markdown or text · up to 20 MB each
      </span>

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
