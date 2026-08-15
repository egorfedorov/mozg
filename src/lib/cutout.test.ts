import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { cutChroma, KEYS, pickKey } from "./cutout";

const W = 20;

/** A keyed frame with a solid subject in the middle — the shape every symbol
 *  comes back as. */
async function card(
  subject: [number, number, number],
  key: readonly [number, number, number] = KEYS.magenta.rgb,
): Promise<Buffer> {
  const px = Buffer.alloc(W * W * 4);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inside = x >= 6 && x < 14 && y >= 6 && y < 14;
      const [r, g, b] = inside ? subject : key;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return sharp(px, { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();
}

async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

test("the key becomes transparent and the subject does not", async () => {
  const { png, keyed } = await cutChroma(await card([200, 40, 40]));

  assert.equal((await pixel(png, 0, 0))[3], 0, "corner should be keyed out");
  assert.equal((await pixel(png, 10, 10))[3], 255, "subject should be untouched");
  // The frame is the background: most of a 20×20 card with an 8×8 subject.
  assert.ok(keyed > 0.7 && keyed < 0.9, `keyed ${keyed}`);
});

test("a subject the colour of the default key survives another key", async () => {
  // The failure this whole mechanism exists to avoid: a magenta mascot keyed
  // on magenta vanishes. The brief names the clash, so the key moves.
  const key = pickKey("a neon magenta jellyfish over deep violet water");
  assert.notEqual(key.id, "magenta");

  const { png } = await cutChroma(await card([230, 30, 220], key.rgb), key);
  assert.equal((await pixel(png, 10, 10))[3], 255, "the mascot must not be eaten");
  assert.equal((await pixel(png, 0, 0))[3], 0, "its background must still go");
});

test("the key is chosen against what the art is made of", async () => {
  assert.equal(pickKey("an egyptian tomb, gold and limestone").id, "magenta");
  assert.equal(pickKey("a pink candy kingdom").id, "green");
  // Pink rules out magenta and forest rules out green, so cyan is what is left.
  assert.equal(pickKey("a pink orchid in a deep forest").id, "cyan");
});

test("a picture with no key at all comes back whole", async () => {
  // A model that ignored the instruction produces a picture with no key in it.
  // It must not be silently mangled — and `keyed` near zero is the signal that
  // something went wrong upstream.
  const flat = Buffer.alloc(W * W * 4);
  for (let i = 0; i < flat.length; i += 4) {
    flat[i] = 180;
    flat[i + 1] = 180;
    flat[i + 2] = 180;
    flat[i + 3] = 255;
  }
  const png = await sharp(flat, { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();

  const cut = await cutChroma(png);
  assert.ok(cut.keyed < 0.01, `keyed ${cut.keyed}`);
  assert.equal((await pixel(cut.png, 5, 5))[3], 255);
});

test("fringe pixels are despilled and snapped solid, not left as a halo", async () => {
  // A pixel the anti-aliaser blended: close to magenta but not it. It must
  // come back with the key's channels pulled down, and fully opaque — a
  // half-transparent rim reads as blur once the symbol is scaled onto a reel.
  const px = Buffer.alloc(W * W * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 230;
    px[i + 1] = 40;
    px[i + 2] = 230;
    px[i + 3] = 255;
  }
  const png = await sharp(px, { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();

  const [r, g, b, a] = await pixel((await cutChroma(png)).png, 10, 10);
  assert.equal(a, 255, "boosted to solid");
  assert.ok(r <= g && b <= g, `despilled: ${r},${g},${b}`);
});
