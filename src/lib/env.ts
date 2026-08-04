import { z } from "zod";

/**
 * Validated process env. Import this instead of touching process.env directly —
 * a missing var should fail at boot with a readable message, not at 3am inside
 * an ingest job.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Any Anthropic-compatible endpoint. Lets the app run through a reseller
  // (apimart, OpenRouter, …) when a card for console.anthropic.com is not an
  // option — the request and response shapes are identical, so nothing else
  // in the codebase changes.
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  MODEL_EXTRACT: z.string().default("claude-opus-5"),
  MODEL_JUDGE: z.string().default("claude-haiku-4-5"),
  // The judge is not deterministic: the same brain re-sat the same exam and
  // moved ±10 points (62→51 on one, 49→46 on another). An odd number of votes
  // with majority rule turns that noise into a stable number the owner can
  // read week over week. 3 triples the judge cost — which is Haiku, cents —
  // set 1 to trade stability back for the cheapest possible run.
  JUDGE_VOTES: z.coerce.number().int().min(1).max(5).default(3),
  INGEST_USE_BATCH: z.stringbool().default(false),
  INGEST_IMAGE_MAX_EDGE: z.coerce.number().int().min(512).max(2576).default(1568),

  EMBED_URL: z.string().url().default("http://localhost:8099"),
  EMBED_DIM: z.coerce.number().int().default(1024),
  // The reranker lives on the same embed service, so it defaults to EMBED_URL
  // (filled in after parse). Set it only if /rerank is served elsewhere.
  RERANK_URL: z.string().url().optional(),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3300"),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3300"),

  // Set once an email provider is wired up. Until then the product cannot send
  // a verification link or a password reset, so signing up with a password
  // creates an account that can never be verified and never recovered.
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  // Crypto top-ups. Inert until both exist: an invoice we cannot verify a
  // callback for would be a balance credited by anyone who guesses a URL.
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),

  // Nightly note consolidation. Off until the similarity threshold separates
  // duplicates from neighbours on real material — measured on bge-m3, three
  // notes stating the same fact sat at 0.15/0.22/0.27 while the first pair of
  // genuinely different facts sat at 0.2766, so there is no threshold that
  // catches the duplicates without gluing unrelated facts together. Merging is
  // destructive; an unattended job should not run on a number nobody has
  // validated.
  CONSOLIDATE_ENABLED: z.stringbool().default(false),

  // Comma-separated addresses that may open /admin. Empty means nobody can —
  // an admin surface that defaults to open is a breach waiting for its first
  // sign-up.
  ADMIN_EMAILS: z.string().default(""),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment:\n${issues}\n\nCopy .env.example to .env`);
}

export const env = { ...parsed.data, RERANK_URL: parsed.data.RERANK_URL ?? parsed.data.EMBED_URL };

/**
 * Can the product send mail? Everything that depends on reaching someone by
 * email is gated on this, so wiring a provider turns those paths on rather
 * than requiring them to be found and un-commented.
 */
export const emailReady = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

/** S3 driver needs its whole credential set or none of it. */
if (env.STORAGE_DRIVER === "s3") {
  const missing = (
    ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const
  ).filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`STORAGE_DRIVER=s3 but missing: ${missing.join(", ")}`);
  }
}
