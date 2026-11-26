/**
 * Sending mail, in one place: the mail service's REST API over fetch, with no
 * SDK, as the first mozg did. One dependency fewer is one supply chain fewer.
 *
 * Inert until `RESEND_API_KEY` and `EMAIL_FROM` are set. Callers ask
 * `configured` first, so a missing key means mail stays off, not that the
 * chat fails.
 */

export interface Mailer {
  readonly configured: boolean;
  send(to: string, subject: string, text: string): Promise<void>;
}

export function resendMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const key = env.RESEND_API_KEY?.trim() ?? "";
  const from = env.EMAIL_FROM?.trim() ?? "";
  return {
    configured: Boolean(key && from),
    async send(to, subject, text) {
      if (!key || !from) throw new Error("mail is not configured: RESEND_API_KEY and EMAIL_FROM are needed");
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        // The service's own words name the problem (a bad key, a domain not yet verified).
        throw new Error(`the mail service answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      }
    },
  };
}

/** Writes every letter to the console instead of sending it: development and tests. */
export function letterbox(log: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): Mailer & { sent: { to: string; subject: string; text: string }[] } {
  const sent: { to: string; subject: string; text: string }[] = [];
  return {
    configured: true,
    sent,
    async send(to, subject, text) {
      sent.push({ to, subject, text });
      log(`letter to ${to}: ${subject}`);
    },
  };
}
