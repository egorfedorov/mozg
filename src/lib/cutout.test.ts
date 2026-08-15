import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { cutChroma, KEY } from "./cutout";

const W = 20;

/** A keyed frame with a solid subject in the middle — the shape every symbol
 *  comes back as. */
async function card(subject: [number, number, number]): Promise<Buffer> {
  const px = Buffer.alloc(W * W * 4);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inside = x >= 6 && x < 14 && y >= 6 && y < 14;
      const [r, g, b] = inside ? subject : [KEY.r, KEY.g, KEY.b];
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return sharp(px, { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();
}

async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * W + x) * 4 + 3];
}

test("the key becomes transparent and the subject does not", async () => {
  const { png, keyed } = await cutChroma(await card([200, 40, 40]));

  assert.equal(await alphaAt(png, 0, 0), 0, "corner should be keyed out");
  assert.equal(await alphaAt(png, 10, 10), 255, "subject should be untouched");
  // The frame is the background: most of a 20×20 card with an 8×8 subject.
  assert.ok(keyed > 0.7 && keyed < 0.9, `keyed ${keyed}`);
});

test("a green subject survives — the guard is what stops holes", async () => {
  // A dark forest green is not the key: it is what a scarab, a leaf or a
  // bottle is made of, and eating it leaves a hole nobody sees until the
  // symbol is over the game's own background.
  const { png } = await cutChroma(await card([20, 90, 35]));
  assert.equal(await alphaAt(png, 10, 10), 255);
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
  const solid = await sharp(cut.png).ensureAlpha().raw().toBuffer();
  assert.ok(cut.keyed < 0.01, `keyed ${cut.keyed}`);
  assert.equal(solid[3], 255);
});

test("green spill on a kept pixel is pulled back", async () => {
  // A grey subject lit by the key comes back tinted; after despill the green
  // channel may not exceed the other two.
  const { png } = await cutChroma(await card([120, 170, 110]));
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (10 * W + 10) * 4;
  assert.ok(data[i + 1] <= Math.max(data[i], data[i + 2]), `g=${data[i + 1]}`);
});
