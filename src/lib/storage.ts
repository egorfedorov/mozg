import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { env } from "@/lib/env";

/**
 * Object storage. Two drivers: local disk for dev, S3-compatible (Cloudflare
 * R2) for anything else. Keys look like `brains/{brainId}/{uuid}.png`.
 */

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  del(key: string): Promise<void>;
  /** Time-limited read URL, for showing a source back to its owner. */
  url(key: string, expiresInSeconds?: number): Promise<string>;
}

export function storageKey(brainId: string, filename: string): string {
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "bin";
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
  return `brains/${brainId}/${randomUUID()}.${safeExt}`;
}

// ─── local disk ──────────────────────────────────────────────────────────────

function localPath(key: string): string {
  const root = resolve(env.STORAGE_LOCAL_DIR);
  const full = resolve(root, key);
  // Keys are ours, but one path-traversal bug here writes anywhere on disk.
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`storage key escapes root: ${key}`);
  }
  return full;
}

const localDriver: Storage = {
  async put(key, body) {
    const path = localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  },
  async get(key) {
    return readFile(localPath(key));
  },
  async del(key) {
    await unlink(localPath(key)).catch(() => {});
  },
  async url(key) {
    // Served by the app itself in dev — see app/api/storage/[...key]/route.ts.
    return `${env.NEXT_PUBLIC_APP_URL}/api/storage/${key}`;
  },
};

// ─── S3 / R2 ─────────────────────────────────────────────────────────────────

let s3Driver: Storage | null = null;

function getS3(): Storage {
  if (s3Driver) return s3Driver;

  // Imported lazily so the local-dev path never loads the AWS SDK.
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  } = require("@aws-sdk/client-s3") as typeof import("@aws-sdk/client-s3");
  const { getSignedUrl } =
    require("@aws-sdk/s3-request-presigner") as typeof import("@aws-sdk/s3-request-presigner");

  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });
  const Bucket = env.S3_BUCKET!;

  s3Driver = {
    async put(Key, Body, ContentType) {
      await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
    },
    async get(Key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    },
    async del(Key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key }));
    },
    async url(Key, expiresIn = 3600) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn });
    },
  };

  return s3Driver;
}

export const storage: Storage =
  env.STORAGE_DRIVER === "s3"
    ? new Proxy({} as Storage, { get: (_t, prop) => getS3()[prop as keyof Storage] })
    : localDriver;

/** Content hash, used to skip re-ingesting a file the brain already has. */
export function contentHash(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

export { join as joinKey };
