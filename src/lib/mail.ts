import { env, emailReady } from "./env";

/**
 * Sending mail, in one place. Resend's REST API over fetch — the official SDK
 * is a wrapper around this exact call, and one dependency fewer is one supply
 * chain fewer.
 *
 * Inert until EMAIL_FROM and RESEND_API_KEY exist (emailReady) — callers gate
 * on that, so a missing key means features stay off, not that sends fail.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  if (!emailReady) throw new Error("mail is not configured (EMAIL_FROM / RESEND_API_KEY)");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    // The provider's message names the actual problem (bad key, unverified
    // domain) — "send failed" alone would send whoever reads the log to guess.
    const body = await res.text().catch(() => "");
    throw new Error(`resend answered ${res.status}: ${body.slice(0, 300)}`);
  }
}
