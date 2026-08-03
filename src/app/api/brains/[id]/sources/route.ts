import { NextResponse } from "next/server";
import { one, query } from "@/db";
import type { Brain, Plan, Source } from "@/db/types";
import { requireUser } from "@/lib/session";
import { storage, storageKey } from "@/lib/storage";
import { enqueueIngest } from "@/worker/queue";

/** Sources per brain, by plan. */
const SOURCE_LIMIT: Record<Plan, number> = { free: 50, pro: 1000, team: 5000 };

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
]);
const PDF_TYPE = "application/pdf";

const MAX_BYTES = 20 * 1024 * 1024;
// PDFs go to the model whole, and the API caps a request at 32 MB including
// the base64 overhead. Refusing early beats a confusing failure mid-ingest.
const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const brain = await query<Brain>(
    `select * from brains where id = $1 and owner_id = $2`,
    [id, user.id],
  ).then((r) => r[0]);
  if (!brain) return NextResponse.json({ error: "Brain not found." }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: "No files received." }, { status: 400 });
  }

  const limit = SOURCE_LIMIT[user.plan];
  if (brain.source_count + files.length > limit) {
    return NextResponse.json(
      {
        error:
          `That would exceed ${limit} sources on the ${user.plan} plan ` +
          `(${brain.source_count} used).`,
      },
      { status: 402 },
    );
  }

  const accepted: Source[] = [];
  const rejected: { name: string; reason: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      rejected.push({ name: file.name, reason: "over 20 MB" });
      continue;
    }

    const isImage = IMAGE_TYPES.has(file.type);
    const isPdf = file.type === PDF_TYPE;
    const isText = TEXT_TYPES.has(file.type) || file.type === "";
    if (!isImage && !isPdf && !isText) {
      rejected.push({ name: file.name, reason: `unsupported type ${file.type}` });
      continue;
    }
    if (isPdf && file.size > MAX_PDF_BYTES) {
      rejected.push({ name: file.name, reason: "PDF over 20 MB — split it first" });
      continue;
    }

    const body = Buffer.from(await file.arrayBuffer());
    const key = storageKey(brain.id, file.name);
    await storage.put(key, body, file.type || "application/octet-stream");

    const source = await one<Source>(
      `insert into sources (brain_id, kind, storage_key, original_name, mime, bytes)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [
        brain.id,
        isImage ? "image" : isPdf ? "file" : "text",
        key,
        file.name,
        file.type,
        body.length,
      ],
    );

    // Queue rather than process inline: a folder of 40 screenshots would blow
    // through any request timeout, and the user should see rows appear at once.
    await enqueueIngest(source.id);
    accepted.push(source);
  }

  return NextResponse.json({
    accepted: accepted.length,
    rejected,
    sources: accepted.map((s) => ({ id: s.id, name: s.original_name, status: s.status })),
  });
}
