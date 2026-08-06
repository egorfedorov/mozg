import { NextResponse } from "next/server";
import { maybeOne } from "@/db";
import { storage } from "@/lib/storage";
import { requireUser } from "@/lib/session";

/**
 * A generated image, to the person who paid for it.
 *
 * Access is the buyer, not the brain: a style can be public while what someone
 * asked it to draw is nobody else's business. The artist is deliberately not
 * on this list either — they are paid for the use, they do not get to browse
 * what their customers made.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const user = await requireUser(req).catch(() => null);
  if (!user) return new NextResponse(null, { status: 401 });

  const gen = await maybeOne<{ storage_key: string | null }>(
    `select storage_key from generations where id = $1 and buyer_id = $2`,
    [id, user.id],
  ).catch(() => null);
  if (!gen?.storage_key) return new NextResponse(null, { status: 404 });

  try {
    const body = await storage.get(gen.storage_key);
    const ext = gen.storage_key.split(".").pop()?.toLowerCase();
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type":
          ext === "webp" ? "image/webp" : ext === "jpg" ? "image/jpeg" : "image/png",
        // Private: a shared cache must never hand one buyer's picture to the
        // next request that happens to hit the same edge.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
