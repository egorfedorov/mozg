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
  INGEST_USE_BATCH: z.stringbool().default(false),
  INGEST_IMAGE_MAX_EDGE: z.coerce.number().int().min(512).max(2576).default(1568),

  EMBED_URL: z.string().url().default("http://localhost:8099"),
  EMBED_DIM: z.coerce.number().int().default(1024),

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

export const env = parsed.data;

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
