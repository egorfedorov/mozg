import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Small authenticated encryption for values we must hold but never show:
 * AES-256-GCM, key derived from BETTER_AUTH_SECRET. Not a KMS — a lock on
 * the drawer, so a database dump alone does not leak users' API keys.
 */

function key(): Buffer {
  return createHash("sha256").update(`${env.BETTER_AUTH_SECRET}:secretbox:v1`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function open(sealed: string): string | null {
  try {
    const [v, ivB, encB, tagB] = sealed.split(".");
    if (v !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encB, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // A rotated BETTER_AUTH_SECRET or corrupt row reads as "no key" — the
    // worker falls back to the platform key rather than crashing ingest.
    return null;
  }
}
