import sharp from "sharp";

/**
 * Turn the key colour into transparency.
 *
 * The model is asked for a flat key precisely so this step can be arithmetic
 * rather than a guess. A background remover has to decide what the subject is,
 * and it decides wrong on the things slot art is made of — smoke, glass, a
 * wisp of flame, the gap inside a handle. A key does not decide anything: a
 * pixel is either that colour or it is not.
 *
 * Four passes over the same pixel, in this order:
 *
 *   1. Hard key — near enough to the reference to be background. Alpha 0.
 *   2. Soft edge — further out, but still unmistakably the key. Alpha falls
 *      off across the band, which is what stops a cut-out symbol from having
 *      the jagged one-pixel staircase that gives away a cheap cutout.
 *   3. Despill — a kept pixel still tinted by the key, because it bounced off
 *      the subject. Left alone every symbol wears a coloured rim that only
 *      shows up over the game's own background, which is the worst place to
 *      find it.
 *   4. Alpha boost — anything left between mostly-transparent and
 *      mostly-opaque is snapped solid. Production tuning: without it the
 *      silhouette keeps a soft halo that reads as blur once the symbol is
 *      scaled down onto a reel.
 *
 * The tolerances are not invented here. tolerance 30 / spill 70 / boost on are
 * the numbers a studio arrived at over a full HUD production run, where the
 * looser default ate anti-aliased edges and the tighter one left fringe.
 */

export interface ChromaKey {
  readonly id: string;
  readonly hex: string;
  readonly rgb: readonly [number, number, number];
  /** How the prompt has to describe it, so the model paints the same colour
   *  this function looks for. */
  readonly clause: string;
}

/**
 * The keys, in the order they are preferred.
 *
 * Magenta first because it is the one colour slot art almost never contains at
 * full saturation. Cyan is deliberately last: it eats teal and blue, which is
 * how a production run lost the blue in a letter and only noticed in-engine.
 */
export const KEYS: Record<string, ChromaKey> = {
  magenta: {
    id: "magenta",
    hex: "#FF00FF",
    rgb: [255, 0, 255],
    clause: "pure magenta #FF00FF",
  },
  green: {
    id: "green",
    hex: "#00B140",
    rgb: [0, 177, 64],
    clause: "pure chroma green #00B140",
  },
  cyan: {
    id: "cyan",
    hex: "#00FFFF",
    rgb: [0, 255, 255],
    clause: "pure cyan #00FFFF",
  },
};

export const DEFAULT_KEY = KEYS.magenta;

/**
 * Pick a key the art will not contain.
 *
 * Read off the brief and palette rather than asked for: a studio describing "a
 * neon magenta jellyfish" should not have to know what a chroma key is, and
 * the one thing that must never happen is keying out the subject. Words are
 * enough here — a palette that says magenta, pink or violet rules magenta out,
 * and only then does green come into play.
 */
export function pickKey(text: string): ChromaKey {
  const t = text.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  const magentaClash = has("magenta", "pink", "fuchsia", "violet", "purple", "orchid", "plum");
  const greenClash = has("green", "emerald", "jade", "forest", "moss", "lime", "olive", "verdant");
  const cyanClash = has("cyan", "teal", "turquoise", "aqua", "blue");

  if (!magentaClash) return KEYS.magenta;
  if (!greenClash) return KEYS.green;
  if (!cyanClash) return KEYS.cyan;
  // Everything clashes — a brief naming every colour there is. Magenta stays
  // the least bad: it is the rarest as a *flat, fully saturated* field, which
  // is what the key actually has to be.
  return KEYS.magenta;
}

/** Distance at which a pixel is unambiguously the key. */
const TOLERANCE = 30;
/** Beyond it, up to this, the pixel is the anti-aliased boundary. */
const SPILL = 70;
/** Alpha inside this band is snapped solid — see pass 4. */
const BOOST_LOW = 80;
const BOOST_HIGH = 200;

export interface CutResult {
  png: Buffer;
  /** Share of pixels that became fully transparent, 0..1. Reported so a caller
   *  can notice a "cutout" that removed nothing — a model that ignored the key
   *  instruction produces a perfectly opaque square, and that is worth seeing
   *  rather than shipping. */
  keyed: number;
}

export async function cutChroma(input: Buffer, key: ChromaKey = DEFAULT_KEY): Promise<CutResult> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const [kr, kg, kb] = key.rgb;
  const px = new Uint8ClampedArray(data);
  let keyedCount = 0;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];

    const dist = Math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2);

    if (dist <= TOLERANCE) {
      px[i + 3] = 0;
      keyedCount++;
      continue;
    }

    if (dist < SPILL) {
      // Linear across the band: at the tolerance it is background, at the
      // spill limit it is subject, and in between it is the pixel the
      // anti-aliaser blended.
      const t = (dist - TOLERANCE) / (SPILL - TOLERANCE);
      px[i + 3] = Math.round(px[i + 3] * t);

      // Whatever survives is still tinted by the key; pull the offending
      // channels back to what the pixel would be without the bounce.
      despill(px, i, key);
    }

    // A half-transparent pixel in the middle of a subject is spill the eye
    // reads as blur. Snap it.
    const a = px[i + 3];
    if (a >= BOOST_LOW && a <= BOOST_HIGH) px[i + 3] = 255;
  }

  bleed(px, info.width, info.height);

  const png = await sharp(Buffer.from(px.buffer), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  return { png, keyed: keyedCount / (info.width * info.height) };
}

/** How far the subject's colour is pushed out under the transparency. Four
 *  pixels covers bilinear filtering and the first mip levels, which is where
 *  the halo actually appears. */
const BLEED_PASSES = 4;

/**
 * Push the subject's colour outwards under the transparent pixels.
 *
 * Zeroing alpha does not remove the key — it hides it, and the colour is still
 * sitting there in the red, green and blue channels. Nothing notices until the
 * asset is scaled, mipmapped or packed into an atlas, at which point the
 * filter mixes those hidden pixels back in and every symbol wears a rim of
 * exactly the colour we spent this whole file removing.
 *
 * So transparent pixels next to the subject take the subject's colour, and
 * that spreads outward a few pixels. Alpha is untouched — this changes nothing
 * anyone can see directly, and everything about what a filter produces.
 * Whatever is still unclaimed at the end is flattened to black, because a
 * magenta field under a transparent one is a trap for the next tool in the
 * chain.
 */
function bleed(px: Uint8ClampedArray, w: number, h: number): void {
  const known = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) known[p] = px[i + 3] > 0 ? 1 : 0;

  for (let pass = 0; pass < BLEED_PASSES; pass++) {
    const added: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (known[p]) continue;

        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const q = ny * w + nx;
            if (!known[q]) continue;
            r += px[q * 4];
            g += px[q * 4 + 1];
            b += px[q * 4 + 2];
            n++;
          }
        }
        if (!n) continue;

        px[p * 4] = Math.round(r / n);
        px[p * 4 + 1] = Math.round(g / n);
        px[p * 4 + 2] = Math.round(b / n);
        added.push(p);
      }
    }
    // Marked after the pass, not during it, or the colour races across the
    // image in whichever direction the loop happens to run.
    for (const p of added) known[p] = 1;
    if (!added.length) break;
  }

  for (let p = 0; p < known.length; p++) {
    if (known[p]) continue;
    px[p * 4] = 0;
    px[p * 4 + 1] = 0;
    px[p * 4 + 2] = 0;
  }
}

/**
 * Pull the key's own channels down to the level of the channels it is not
 * made of. For magenta that means red and blue may not exceed green; for green
 * it means green may not exceed the brighter of red and blue.
 */
function despill(px: Uint8ClampedArray, i: number, key: ChromaKey): void {
  const [kr, kg, kb] = key.rgb;
  const r = px[i];
  const g = px[i + 1];
  const b = px[i + 2];

  // The channels the key is made of, and the one it is not.
  const strong = [kr > 200, kg > 200, kb > 200];
  const ceiling = Math.max(...[r, g, b].filter((_, n) => !strong[n]), 0);

  if (strong[0] && r > ceiling) px[i] = ceiling;
  if (strong[1] && g > ceiling) px[i + 1] = ceiling;
  if (strong[2] && b > ceiling) px[i + 2] = ceiling;
}
