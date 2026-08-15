import { NextResponse } from "next/server";
import { query, maybeOne } from "@/db";
import { requireUser } from "@/lib/session";
import { storage } from "@/lib/storage";
import { buildAtlas } from "@/lib/atlas";
import { zip, type ZipEntry } from "@/lib/zip";
import { ROLES, type AssetRole } from "@/lib/slotgen";

/**
 * The pack, as an engine takes it.
 *
 * Three things in one download, because a studio that has to assemble them
 * itself has not been given an export at all:
 *
 *   originals/  — every asset exactly as generated, nothing thrown away
 *   symbols.png + symbols.json — the trimmed sheet and its manifest, which is
 *                 what a frontend actually loads
 *   PROMPTS.md  — what each asset was asked for, so the set can be extended
 *                 later without guessing at the wording that produced it
 *
 * Scoped to the owner: a brief is as private as the art it produced.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const user = await requireUser(req).catch(() => null);
  if (!user) return new NextResponse(null, { status: 401 });

  const pack = await maybeOne<{
    title: string;
    brief: string;
    palette: string | null;
    chroma: string;
  }>(
    `select title, brief, palette, chroma from asset_packs where id = $1 and owner_id = $2`,
    [id, user.id],
  ).catch(() => null);
  if (!pack) return new NextResponse(null, { status: 404 });

  const assets = await query<{
    label: string;
    role: string;
    storage_key: string;
    full_prompt: string | null;
  }>(
    `select label, role, storage_key, full_prompt
       from generations
      where pack_id = $1 and status = 'done' and storage_key is not null
      order by created_at`,
    [id],
  );
  if (!assets.length) return new NextResponse(null, { status: 409 });

  const entries: ZipEntry[] = [];
  const symbols: { label: string; png: Buffer }[] = [];
  const taken = new Set<string>();

  for (const asset of assets) {
    const body = await storage.get(asset.storage_key).catch(() => null);
    // One unreadable file must not cost the studio the whole export.
    if (!body) continue;

    const ext = asset.storage_key.split(".").pop()?.toLowerCase() ?? "png";
    let name = `${asset.label}.${ext}`;
    for (let n = 2; taken.has(name); n++) name = `${asset.label}-${n}.${ext}`;
    taken.add(name);

    entries.push({ name: `originals/${name}`, body });
    if (ROLES[asset.role as AssetRole]?.cutout) symbols.push({ label: asset.label, png: body });
  }

  const atlas = await buildAtlas(symbols).catch(() => null);
  if (atlas) {
    entries.push({ name: "symbols.png", body: atlas.sheet });
    entries.push({ name: "symbols.json", body: Buffer.from(atlas.manifest) });
    for (const frame of atlas.frames) {
      entries.push({ name: `trimmed/${frame.name}`, body: frame.png });
    }
  }

  entries.push({
    name: "PROMPTS.md",
    body: Buffer.from(
      [
        `# ${pack.title}`,
        "",
        pack.brief,
        pack.palette ? `\nPalette: ${pack.palette}` : "",
        `\nChroma key: ${pack.chroma}. Symbols are already cut; the originals keep the key.`,
        "",
        ...assets.map((a) => `\n## ${a.label} (${a.role})\n\n\`\`\`\n${a.full_prompt ?? ""}\n\`\`\``),
        "",
      ].join("\n"),
    ),
  });

  const archive = zip(entries);
  const slug = pack.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pack";

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${slug}.zip"`,
      "content-length": String(archive.length),
      "cache-control": "private, no-store",
    },
  });
}
