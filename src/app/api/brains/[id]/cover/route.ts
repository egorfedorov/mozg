import { NextResponse } from "next/server";
import { maybeOne } from "@/db";
import { storage } from "@/lib/storage";

/**
 * A public brain's cover image.
 *
 * Deliberately its own door rather than a widening of /api/storage. That route
 * serves source material behind an access check, and source material is the
 * artist's private upload — the whole promise of a style brain is that it sells
 * the rules and not the pictures. This serves exactly one image per brain, the
 * one its owner promoted on purpose, and only while the brain is public.
 *
 * Streamed rather than redirected to a presigned URL: a presigned link expires,
 * which would make every gallery card break a few hours after it was rendered.
 *
 * Callers must build the URL with coverUrl() in lib/covers.ts, which appends a
 * ?v of the storage key. The cache header below is immutable — without that
 * version the path would be identical after an owner changed their cover and
 * every viewer would keep the old picture for a year.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const brain = await maybeOne<{ cover_key: string | null; visibility: string }>(
    `select cover_key, visibility from brains where id = $1`,
    [id],
  ).catch(() => null);

  // "Not public" and "no cover" are the same 404 on purpose: a different answer
  // for each would let a stranger probe which private brains have covers.
  if (!brain?.cover_key || brain.visibility !== "public") {
    return new NextResponse(null, { status: 404 });
  }

  // A cover promoted from an upload has a source row carrying its mime; one
  // uploaded straight to the gallery does not, and its extension is all there
  // is. Both paths have to work or half the covers serve as octet-stream.
  const fromSource = await maybeOne<{ mime: string | null }>(
    `select mime from sources where storage_key = $1`,
    [brain.cover_key],
  );
  const ext = brain.cover_key.split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
  };

  try {
    const body = await storage.get(brain.cover_key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": fromSource?.mime ?? byExt[ext] ?? "image/jpeg",
        // Safe only because coverUrl() versions the query string by storage
        // key: same URL always means the same bytes.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
