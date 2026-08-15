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

  // One deliberate exception to "the buyer, and nobody else": a pack we made
  // ourselves and flagged as a showcase. A service selling generated art with
  // no generated art on its front page asks to be taken on trust, and nobody
  // does. The flag is off by default and set by hand, so nothing a studio
  // ordered can end up here by accident.
  const shown = await maybeOne<{ storage_key: string | null }>(
    `select g.storage_key
       from generations g
       join asset_packs p on p.id = g.pack_id
      where g.id = $1 and p.showcase and g.status = 'done'`,
    [id],
  ).catch(() => null);

  let key = shown?.storage_key ?? null;
  let publicAsset = Boolean(key);

  if (!key) {
    const user = await requireUser(req).catch(() => null);
    if (!user) return new NextResponse(null, { status: 401 });

    const gen = await maybeOne<{ storage_key: string | null }>(
      `select storage_key from generations where id = $1 and buyer_id = $2`,
      [id, user.id],
    ).catch(() => null);
    if (!gen?.storage_key) return new NextResponse(null, { status: 404 });
    key = gen.storage_key;
    publicAsset = false;
  }

  try {
    const body = await storage.get(key);
    const ext = key.split(".").pop()?.toLowerCase();
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type":
          ext === "webp" ? "image/webp" : ext === "jpg" ? "image/jpeg" : "image/png",
        // A buyer's picture must never be handed to the next request that
        // happens to hit the same edge; a showcase asset is meant to be, and
        // caching it is the difference between a fast front page and thirteen
        // megabytes fetched from storage on every visit.
        "cache-control": publicAsset
          ? "public, max-age=31536000, immutable"
          : "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
