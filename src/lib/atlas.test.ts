import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { buildAtlas } from "./atlas";

/** A cut-out symbol: a solid block somewhere inside a transparent square. */
async function symbol(size: number, box: { x: number; y: number; w: number; h: number }) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * size + x) * 4;
      px[i] = 220;
      px[i + 1] = 40;
      px[i + 2] = 40;
      px[i + 3] = 255;
    }
  }
  return sharp(px, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

test("frames are trimmed, placed without overlapping, and named for the engine", async () => {
  const atlas = await buildAtlas([
    { label: "wild", png: await symbol(200, { x: 50, y: 40, w: 60, h: 80 }) },
    { label: "scatter", png: await symbol(200, { x: 20, y: 20, w: 100, h: 40 }) },
  ]);
  assert.ok(atlas);

  const manifest = JSON.parse(atlas.manifest) as {
    frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    meta: { image: string; size: { w: number; h: number } };
  };

  // The studio's own labels, because that is what its code already says.
  const wild = manifest.frames["wild.png"];
  const scatter = manifest.frames["scatter.png"];
  assert.ok(wild && scatter);

  // Trimmed to the content, not left as the square it was drawn in.
  assert.deepEqual([wild.frame.w, wild.frame.h], [60, 80]);
  assert.deepEqual([scatter.frame.w, scatter.frame.h], [100, 40]);

  // Two frames sharing a pixel is the bug that shows up as a sliver of the
  // neighbouring symbol along an edge, in-engine, after everything shipped.
  const overlaps =
    wild.frame.x < scatter.frame.x + scatter.frame.w &&
    scatter.frame.x < wild.frame.x + wild.frame.w &&
    wild.frame.y < scatter.frame.y + scatter.frame.h &&
    scatter.frame.y < wild.frame.y + wild.frame.h;
  assert.equal(overlaps, false);

  // The sheet is real and matches what the manifest claims about it.
  const meta = await sharp(atlas.sheet).metadata();
  assert.equal(meta.width, manifest.meta.size.w);
  assert.equal(meta.height, manifest.meta.size.h);
  assert.equal(manifest.meta.image, "symbols.png");
});

test("an empty pack exports no atlas rather than an empty one", async () => {
  assert.equal(await buildAtlas([]), null);
});
