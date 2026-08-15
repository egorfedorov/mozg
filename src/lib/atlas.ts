import sharp from "sharp";

/**
 * Turn cut-out symbols into something an engine loads in one call.
 *
 * A folder of PNGs is not an export; it is homework. What a frontend wants is
 * a sheet and a manifest — one texture upload, one draw-call batch — with the
 * transparent margin trimmed off each frame and recorded, so the sprite still
 * sits where the artist put it.
 *
 * The manifest is the TexturePacker "hash" shape, which PixiJS reads natively
 * and every other engine has an importer for. Frame names keep the studio's
 * own labels, because those are what its code already says.
 */

export interface AtlasInput {
  /** Engine-side name: wild, scatter, low-1. */
  label: string;
  png: Buffer;
}

export interface AtlasResult {
  sheet: Buffer;
  manifest: string;
  /** Trimmed single files, for anyone who wants them loose. */
  frames: { name: string; png: Buffer }[];
}

/**
 * lazy: symbols are packed at up to 512px on the long side, which is a reel
 * symbol at 2× on a phone. The full-resolution originals go in the zip
 * untouched, so nothing is lost — raise this if someone ships at 4K.
 */
const MAX_SIDE = 512;
const SHEET_WIDTH = 2048;
/** Breathing room so a filter cannot sample its neighbour. */
const PADDING = 2;

interface Placed {
  label: string;
  png: Buffer;
  w: number;
  h: number;
  x: number;
  y: number;
  /** Where the trimmed frame sat inside the original square. */
  offsetX: number;
  offsetY: number;
  sourceW: number;
  sourceH: number;
}

export async function buildAtlas(inputs: AtlasInput[]): Promise<AtlasResult | null> {
  if (!inputs.length) return null;

  const prepared: Placed[] = [];
  for (const input of inputs) {
    const source = await sharp(input.png).metadata();

    // Trim the transparent margin, and keep what was trimmed: a sprite whose
    // margin is silently discarded lands in the wrong place on the reel.
    const trimmed = await sharp(input.png)
      .trim({ threshold: 0 })
      .toBuffer({ resolveWithObject: true });

    const scale = Math.min(1, MAX_SIDE / Math.max(trimmed.info.width, trimmed.info.height));
    const w = Math.max(1, Math.round(trimmed.info.width * scale));
    const h = Math.max(1, Math.round(trimmed.info.height * scale));

    const png =
      scale < 1
        ? await sharp(trimmed.data).resize(w, h, { fit: "fill" }).png().toBuffer()
        : await sharp(trimmed.data).png().toBuffer();

    prepared.push({
      label: input.label,
      png,
      w,
      h,
      x: 0,
      y: 0,
      offsetX: Math.round((trimmed.info.trimOffsetLeft ?? 0) * -1 * scale),
      offsetY: Math.round((trimmed.info.trimOffsetTop ?? 0) * -1 * scale),
      sourceW: Math.round((source.width ?? trimmed.info.width) * scale),
      sourceH: Math.round((source.height ?? trimmed.info.height) * scale),
    });
  }

  // Shelf packing: tallest first, left to right, wrap when the row is full.
  // Not optimal, and optimal is not worth it — a dozen symbols on a 2048 sheet
  // waste a few percent, and the alternative is a bin packer nobody can read.
  prepared.sort((a, b) => b.h - a.h);

  let x = PADDING;
  let y = PADDING;
  let shelfHeight = 0;
  for (const frame of prepared) {
    if (x + frame.w + PADDING > SHEET_WIDTH) {
      x = PADDING;
      y += shelfHeight + PADDING;
      shelfHeight = 0;
    }
    frame.x = x;
    frame.y = y;
    x += frame.w + PADDING;
    shelfHeight = Math.max(shelfHeight, frame.h);
  }
  const height = y + shelfHeight + PADDING;

  const sheet = await sharp({
    create: {
      width: SHEET_WIDTH,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(prepared.map((f) => ({ input: f.png, left: f.x, top: f.y })))
    .png()
    .toBuffer();

  const frames: Record<string, unknown> = {};
  for (const f of prepared) {
    frames[`${f.label}.png`] = {
      frame: { x: f.x, y: f.y, w: f.w, h: f.h },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: f.offsetX, y: f.offsetY, w: f.w, h: f.h },
      sourceSize: { w: f.sourceW, h: f.sourceH },
    };
  }

  const manifest = JSON.stringify(
    {
      frames,
      meta: {
        app: "gen.mozg.sh",
        image: "symbols.png",
        format: "RGBA8888",
        size: { w: SHEET_WIDTH, h: height },
        scale: "1",
      },
    },
    null,
    2,
  );

  return {
    sheet,
    manifest,
    frames: prepared.map((f) => ({ name: `${f.label}.png`, png: f.png })),
  };
}
