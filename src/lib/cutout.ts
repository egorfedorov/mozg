import sharp from "sharp";

/**
 * Turn the green key into transparency.
 *
 * The model is asked for a flat #00B140 background precisely so this step can
 * be arithmetic rather than a guess. A background remover has to decide what
 * the subject is, and it decides wrong on the things slot art is made of —
 * smoke, glass, a wisp of flame, the gap inside a handle. A key does not
 * decide anything: a pixel is either that green or it is not.
 *
 * Three passes over the same pixel, in this order:
 *
 *   1. Hard key — near enough to the reference to be background. Alpha 0.
 *   2. Soft edge — further out, but still unmistakably the key colour. Alpha
 *      falls off across the band, which is what stops a cut-out symbol from
 *      having the jagged one-pixel staircase that gives away a cheap cutout.
 *   3. Despill — a kept pixel that is still tinted green, because the key
 *      bounced off it. Left alone, every symbol wears a green rim that only
 *      shows up against the game's own background, which is the worst place
 *      to discover it.
 *
 * The greenish test guards all three: without it a dark teal shadow sits
 * inside the distance threshold and gets eaten, and the hole it leaves is
 * invisible on this page and obvious in the engine.
 */

/** The colour the prompt asks for, in lib/slotgen. */
export const KEY = { r: 0, g: 177, b: 64 } as const;

/** Inside this distance the pixel is the background. */
const HARD = 60;
/** Between HARD and this, alpha falls off — the anti-aliased boundary. */
const SOFT = 100;
/**
 * The key is a *bright* green (g=177), and the greens slot art is actually
 * made of — a scarab's shell, a bottle, a leaf in shadow — are dark. Without
 * this floor a forest green at (20, 90, 35) lands inside the soft band and
 * comes back half transparent, which is a hole nobody sees until the symbol is
 * over the game's own background. An edge pixel blended half-and-half with the
 * key still sits well above it, so the boundary keeps feathering.
 */
const KEY_FLOOR = 110;

function greenish(r: number, g: number, b: number): boolean {
  return g >= KEY_FLOOR && g > r + 30 && g > b + 10;
}

export interface CutResult {
  png: Buffer;
  /** Share of pixels that became fully transparent, 0..1. Reported so a
   *  caller can notice a "cutout" that removed nothing — a model that ignored
   *  the key instruction produces a perfectly opaque square, and that is worth
   *  seeing rather than shipping. */
  keyed: number;
}

export async function cutChroma(input: Buffer): Promise<CutResult> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = new Uint8ClampedArray(data);
  let keyedCount = 0;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];

    if (!greenish(r, g, b)) continue;

    const dist = Math.sqrt(r * r + (g - KEY.g) ** 2 + (b - KEY.b) ** 2);

    if (dist <= HARD) {
      px[i + 3] = 0;
      keyedCount++;
      continue;
    }

    if (dist < SOFT) {
      // Linear across the band: at HARD it is background, at SOFT it is the
      // subject, and in between it is the pixel the anti-aliaser blended.
      const t = (dist - HARD) / (SOFT - HARD);
      px[i + 3] = Math.round(px[i + 3] * t);
    }

    // Whatever survived is still green-tinted; pull the channel back to what
    // the pixel would be without the bounce.
    const ceiling = Math.max(r, b);
    if (g > ceiling) px[i + 1] = ceiling;
  }

  const png = await sharp(Buffer.from(px.buffer), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  return { png, keyed: keyedCount / (info.width * info.height) };
}
