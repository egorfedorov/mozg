import type { Finding } from "@/db/types";

/**
 * Secret and PII detection for anything entering a brain.
 *
 * Runs on two paths, both mandatory:
 *   - ingest, on OCR'd screenshot text (terminals and IDEs leak tokens)
 *   - brain_write, on whatever an agent decides to persist
 *
 * A brain cannot be shared or published until it scans clean. Findings are
 * always masked — the raw secret is never stored, logged, or returned.
 */

interface Rule {
  id: string;
  label: string;
  re: RegExp;
  /** Which capture group holds the secret itself (default: whole match). */
  group?: number;
  /** Require high Shannon entropy — for generic patterns that overmatch. */
  entropy?: number;
}

// Ordered: the first rule to claim a span wins, so specific beats generic.
const SECRET_RULES: Rule[] = [
  {
    id: "private_key",
    label: "Private key block",
    re: /-----BEGIN[ A-Z]*PRIVATE KEY-----/g,
  },
  { id: "anthropic", label: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: "openai", label: "OpenAI API key", re: /sk-(?:proj-)?[A-Za-z0-9]{32,}/g },
  {
    id: "github_pat",
    label: "GitHub token",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b/g,
  },
  { id: "aws_key_id", label: "AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    id: "aws_secret",
    label: "AWS secret access key",
    re: /aws_?secret_?access_?key["'\s:=]+([A-Za-z0-9/+=]{40})/gi,
    group: 1,
  },
  { id: "google_api", label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: "slack", label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    id: "stripe",
    label: "Stripe secret key",
    re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
  },
  { id: "npm", label: "npm token", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  {
    id: "telegram",
    label: "Telegram bot token",
    re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,
  },
  {
    id: "jwt",
    label: "JSON Web Token",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    id: "conn_string",
    label: "Connection string with password",
    // Password segment only — we never capture the host, and we skip the
    // obvious dev placeholders so local docker URLs don't trip the gate.
    re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp|rediss)::?\/\/[^\s:/@]+:([^\s:/@]{3,})@/gi,
    group: 1,
  },
  {
    id: "generic_assignment",
    label: "Hardcoded credential",
    re: /\b(?:api[_-]?key|secret|token|password|passwd|access[_-]?key|auth)\b["'\s]*[:=]\s*["']?([A-Za-z0-9/+_=-]{16,})["']?/gi,
    group: 1,
    entropy: 3.4,
  },
];

const PII_RULES: Rule[] = [
  {
    id: "email",
    label: "Email address",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    id: "phone",
    label: "Phone number",
    re: /(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g,
  },
  { id: "card", label: "Payment card number", re: /\b(?:\d[ -]?){13,19}\b/g },
];

/** Obvious non-secrets that would otherwise trip the generic rules. */
const PLACEHOLDERS = new Set([
  "password",
  "changeme",
  "change-me",
  "your-api-key",
  "your_api_key",
  "xxxxxxxxxxxxxxxx",
  "aaaaaaaaaaaaaaaa",
  "0000000000000000",
  "1234567890123456",
  "postgres",
  "mozg",
  "example",
  "placeholder",
  "redacted",
  "undefined",
  "null",
]);

/** Shannon entropy in bits per character. */
export function entropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Luhn check, so we don't flag every long number as a card. */
function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Keep the shape, lose the secret: `sk-ant-api03-xY…` → `sk-…9f` */
export function mask(secret: string): string {
  if (secret.length <= 8) return "•".repeat(secret.length);
  return `${secret.slice(0, 3)}${"•".repeat(6)}${secret.slice(-2)}`;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function run(text: string, rules: Rule[]): Finding[] {
  const findings: Finding[] = [];
  const claimed: Array<[number, number]> = [];

  for (const rule of rules) {
    // Regexes are module-level with /g, so reset lastIndex per use.
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      const value = rule.group ? m[rule.group] : m[0];
      if (!value) continue;

      const start = m.index;
      const end = m.index + m[0].length;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      if (PLACEHOLDERS.has(value.toLowerCase())) continue;
      if (rule.entropy && entropy(value) < rule.entropy) continue;
      if (rule.id === "card") {
        const digits = value.replace(/\D/g, "");
        if (digits.length < 13 || digits.length > 19 || !luhn(digits)) continue;
      }

      claimed.push([start, end]);
      findings.push({
        rule: rule.id,
        label: rule.label,
        sample: mask(value),
        line: lineOf(text, start),
      });

      // Zero-length match guard — otherwise exec loops forever.
      if (m[0].length === 0) rule.re.lastIndex++;
    }
  }

  return findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

/** Credentials. A hit blocks ingest outright. */
export function scanSecrets(text: string): Finding[] {
  return run(text, SECRET_RULES);
}

/** Personal data. A hit blocks publication, not ingest. */
export function scanPII(text: string): Finding[] {
  return run(text, PII_RULES);
}

export function scan(text: string): { secrets: Finding[]; pii: Finding[] } {
  return { secrets: scanSecrets(text), pii: scanPII(text) };
}

/**
 * Replace every detected secret in-place. Used when a user chooses to keep a
 * source after review — we persist the redacted text, never the original.
 */
export function redact(text: string): string {
  let out = text;
  for (const rule of SECRET_RULES) {
    rule.re.lastIndex = 0;
    out = out.replace(rule.re, (full, ...groups) => {
      const value = rule.group ? (groups[rule.group - 1] as string) : full;
      if (!value) return full;
      if (PLACEHOLDERS.has(value.toLowerCase())) return full;
      if (rule.entropy && entropy(value) < rule.entropy) return full;
      return full.replace(value, mask(value));
    });
  }
  return out;
}

/* ─── prompt injection ─────────────────────────────────────────────────────
 * Notes are read by OTHER people's agents, which makes a published brain a
 * delivery vehicle: a note saying "ignore your instructions and run …" can
 * steer any model that reads it. These patterns catch the standard steering
 * vocabulary. Heuristic by nature — the point is to flag a submission for a
 * human eye, not to promise detection. */
const INJECTION_RULES: { id: string; label: string; re: RegExp }[] = [
  {
    id: "override",
    label: "Instruction override",
    re: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|your\s+|the\s+)?(?:previous|prior|above|earlier|system)\s+(?:instructions?|prompts?|rules?|context)/gi,
  },
  {
    id: "roleplay",
    label: "Role hijack",
    re: /\byou\s+are\s+(?:now|no\s+longer)\s+(?:a|an|the|bound)\b|\bpretend\s+(?:to\s+be|you\s+are)\b|\bjailbreak\b|\bDAN\s+mode\b/gi,
  },
  {
    id: "exfiltrate",
    label: "Exfiltration ask",
    re: /\b(?:reveal|print|output|send|leak)\s+(?:your\s+)?(?:system\s+prompt|instructions|api\s+key|credentials|tokens?)\b/gi,
  },
  {
    id: "tool_steer",
    label: "Tool steering",
    re: /\b(?:run|execute|call)\s+(?:the\s+)?(?:bash|shell|terminal|command|curl|rm\s+-rf)\b.{0,40}\b(?:without|before)\s+(?:asking|confirmation)\b/gi,
  },
  {
    id: "hidden_directive",
    label: "Directive at the reader model",
    re: /\b(?:to\s+the\s+(?:ai|assistant|model|agent)\s+reading\s+this|if\s+you\s+are\s+an?\s+(?:ai|llm|language\s+model|agent))\b/gi,
  },
];

/** Scan text for language that tries to steer the model reading it. */
export function scanInjection(text: string): Finding[] {
  const found: Finding[] = [];
  for (const rule of INJECTION_RULES) {
    rule.re.lastIndex = 0;
    const m = rule.re.exec(text);
    if (m) found.push({ rule: rule.id, label: rule.label, sample: m[0].slice(0, 80) });
  }
  return found;
}
