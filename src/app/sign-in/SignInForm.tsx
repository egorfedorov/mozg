"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";

/**
 * Errors here say what happened and what to do about it. "Invalid credentials"
 * is technically true and useless — the two cases (wrong password, no account)
 * need different next steps from the person reading it.
 */
function humanError(message: string | undefined, mode: "in" | "up"): string {
  const m = (message ?? "").toLowerCase();

  if (m.includes("invalid") && m.includes("password")) {
    return "That password does not match. Try again, or create an account if you have not yet.";
  }
  if (m.includes("user") && (m.includes("not found") || m.includes("exist"))) {
    return mode === "in"
      ? "No account with that email. Create one below."
      : "That email is already registered — sign in instead.";
  }
  if (m.includes("already")) {
    return "That email is already registered — sign in instead.";
  }
  if (m.includes("password") && m.includes("short")) {
    return "Passwords need at least 8 characters.";
  }
  return message || "That did not work. Try again.";
}

export default function SignInForm({
  githubEnabled,
  googleEnabled,
  signUpEnabled,
}: {
  githubEnabled: boolean;
  googleEnabled: boolean;
  /** Password sign-up is closed until mail can be sent — see lib/auth.ts. */
  signUpEnabled: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/brains";

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
    if (result.error) setError(humanError(result.error.message, mode));
    else router.push(next);
  }

  return (
    <main className="shell" style={{ paddingBlock: "clamp(3rem, 9vw, 6rem)", maxWidth: 460 }}>
      <Link href="/" className="wordmark" style={{ display: "inline-block" }}>
        mozg<span style={{ color: "var(--color-riso-red)" }}>.</span>
      </Link>

      <h1 className="h1" style={{ margin: "1.5rem 0 .5rem" }}>
        {mode === "in" ? "Sign in" : "Create an account"}
      </h1>
      <p style={{ color: "var(--ink-2)", marginTop: 0, marginBottom: "1.75rem" }}>
        {mode === "in"
          ? "Your brains and the agents connected to them."
          : "One brain free, no card. Upgrade when you hit the limit."}
      </p>

      {(githubEnabled || googleEnabled) && (
        <>
          {googleEnabled && (
            <button
              className="btn btn-ghost"
              style={{ width: "100%", justifyContent: "center", marginBottom: githubEnabled ? ".75rem" : 0 }}
              onClick={() => signIn.social({ provider: "google", callbackURL: next })}
              type="button"
            >
              Continue with Google
            </button>
          )}
          {githubEnabled && (
          <button
            className="btn btn-ghost"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => signIn.social({ provider: "github", callbackURL: next })}
            type="button"
          >
            Continue with GitHub
          </button>
          )}

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
        </>
      )}

      <form onSubmit={submit} style={{ display: "grid", gap: "1rem" }}>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={field}
        />
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
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

        <button
          className="btn"
          type="submit"
          disabled={busy}
          style={{ justifyContent: "center" }}
        >
          {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      {signUpEnabled ? (
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
      ) : (
        /* Said out loud rather than left as a dead link: without mail we cannot
           verify an address or reset a password, and an account that can do
           neither is a trap. */
        <p
          className="mono"
          style={{ marginTop: "1.25rem", fontSize: ".75rem", color: "var(--ink-3)", maxWidth: "42ch" }}
        >
          New accounts are created with GitHub while email is being set up — it
          confirms your address, which is what lets people share brains with you.
          Passwords cannot be reset yet, so we are not handing out new ones.
        </p>
      )}
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
