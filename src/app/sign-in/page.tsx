"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const result =
      mode === "in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: email.split("@")[0] });

    setBusy(false);
    if (result.error) setError(result.error.message ?? "That didn't work.");
    else router.push("/brains");
  }

  return (
    <main
      className="shell"
      style={{ paddingBlock: "clamp(3rem, 9vw, 6rem)", maxWidth: 460 }}
    >
      <Link href="/" className="wordmark" style={{ display: "inline-block" }}>
        mozg<span style={{ color: "var(--color-riso-red)" }}>.</span>
      </Link>

      <h1 className="display" style={{ fontSize: "2.25rem", margin: "1.5rem 0 1.75rem" }}>
        {mode === "in" ? "Sign in" : "Create an account"}
      </h1>

      <button
        className="btn btn-ghost"
        style={{ width: "100%", justifyContent: "center" }}
        onClick={() => signIn.social({ provider: "github", callbackURL: "/brains" })}
        type="button"
      >
        Continue with GitHub
      </button>

      <div
        className="mono"
        style={{
          display: "flex",
          alignItems: "center",
          gap: ".75rem",
          margin: "1.5rem 0",
          fontSize: ".75rem",
          color: "var(--ink-3)",
        }}
      >
        <span style={{ flex: 1, borderTop: "1px solid var(--rule)" }} />
        or
        <span style={{ flex: 1, borderTop: "1px solid var(--rule)" }} />
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: "1rem" }}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={field}
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password — at least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={field}
        />

        {error && (
          <p
            className="mono"
            style={{ color: "var(--color-riso-red)", fontSize: ".8125rem", margin: 0 }}
          >
            {error}
          </p>
        )}

        <button className="btn" type="submit" disabled={busy} style={{ justifyContent: "center" }}>
          {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setError(null);
        }}
        className="mono"
        style={{
          marginTop: "1.25rem",
          background: "none",
          border: 0,
          padding: 0,
          color: "var(--ink-2)",
          fontSize: ".8125rem",
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {mode === "in" ? "No account yet? Create one" : "Already have an account? Sign in"}
      </button>
    </main>
  );
}

const field: React.CSSProperties = {
  width: "100%",
  padding: ".7rem .85rem",
  border: "1.5px solid var(--ink)",
  background: "var(--paper-2)",
  color: "var(--ink)",
  font: "inherit",
  fontSize: "1rem",
};
