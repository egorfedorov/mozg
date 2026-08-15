import { query, maybeOne } from "@/db";
import { storage } from "@/lib/storage";
import { buildAtlas } from "@/lib/atlas";
import { zip, type ZipEntry } from "@/lib/zip";
import { ROLES, type AssetRole } from "@/lib/slotgen";

/**
 * The pack, assembled into the thing an engine takes.
 *
 * A library rather than route code, for the reason every export eventually
 * needs: the operator has to be able to build one without a browser session —
 * to check after a deploy that the archive is still readable, and to seed the
 * examples a storefront shows before it has customers. One implementation, so
 * what the operator inspects is what a studio downloads.
 */

export interface PackExport {
  filename: string;
  bytes: Buffer;
  /** What went in, for the operator's log. */
  contents: string[];
}

export async function exportPack(id: string, ownerId: string): Promise<PackExport | null> {
  const pack = await maybeOne<{
    title: string;
    brief: string;
    palette: string | null;
    chroma: string;
  }>(`select title, brief, palette, chroma from asset_packs where id = $1 and owner_id = $2`, [
    id,
    ownerId,
  ]);
  if (!pack) return null;

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
  if (!assets.length) return null;

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

  const slug =
    pack.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pack";

  return {
    filename: `${slug}.zip`,
    bytes: zip(entries),
    contents: entries.map((e) => e.name),
  };
}
