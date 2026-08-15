import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exportPack } from "@/lib/packexport";

/**
 * The pack, as an engine takes it: the trimmed sheet and its manifest, every
 * original untouched, and what each asset was asked for.
 *
 * Scoped to the owner — a brief is as private as the art it produced — and
 * thin on purpose: the assembly lives in lib/packexport so the operator can
 * build the same archive without a browser session.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const user = await requireUser(req).catch(() => null);
  if (!user) return new NextResponse(null, { status: 401 });

  const built = await exportPack(id, user.id).catch(() => null);
  // No pack, not yours, or nothing finished in it yet — all three are "there
  // is nothing here for you", and telling them apart would say whose pack it is.
  if (!built) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(built.bytes), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${built.filename}"`,
      "content-length": String(built.bytes.length),
      "cache-control": "private, no-store",
    },
  });
}
