import { test } from "node:test";
import assert from "node:assert/strict";

import {
  anchorIndex,
  distinctClause,
  assetFilename,
  compileAssetPrompt,
  defaultSpecs,
  ROLES,
  SETS,
  type AssetSpec,
} from "./slotgen";

const SYMBOL: AssetSpec = { role: "symbol", label: "wild", brief: "a golden scarab" };
/** The clause the pack chose; the prompt must repeat it verbatim. */
const KEY = "pure magenta #FF00FF";

test("a cut-out asset asks for the key, a full-bleed one never does", () => {
  const symbol = compileAssetPrompt({ brief: "an egyptian tomb" }, SYMBOL, KEY);
  assert.match(symbol, /#FF00FF/);

  const background = compileAssetPrompt(
    { brief: "an egyptian tomb" },
    { role: "background", label: "bg", brief: "the reel background" },
    KEY,
  );
  // A background is composited whole. Asking for chroma there would key out
  // the picture itself.
  assert.doesNotMatch(background, /#FF00FF/);
});

test("the technical rules come after the artist's, so the file stays shippable", () => {
  const prompt = compileAssetPrompt(
    { brief: "an egyptian tomb", styleRules: "- palette: flat cream and rust, no gradients" },
    SYMBOL,
    KEY,
  );
  const style = prompt.indexOf("flat cream and rust");
  const technical = prompt.indexOf("Technical requirements");
  assert.ok(style > 0 && technical > style);

  // The guarantee that costs a studio the whole asset if it slips: a storefront
  // rejects baked-in wording, whatever the style says. Asserted on the promise
  // rather than on one sentence — a model that wrote WILD across a symbol is
  // why this is now phrased as a property of the artwork instead of a ban.
  assert.match(prompt, /completely wordless/i);
  assert.match(prompt, /live text layer/i);
});

test("the shared brief and palette reach every asset in the set", () => {
  const prompt = compileAssetPrompt(
    { brief: "an egyptian tomb", palette: "gold #E8B04B, deep violet" },
    SYMBOL,
    KEY,
  );
  assert.match(prompt, /an egyptian tomb/);
  assert.match(prompt, /gold #E8B04B/);
  assert.match(prompt, /a golden scarab/);
});

test("the default set is a paytable, not a pile of pictures", () => {
  const specs = defaultSpecs();
  const labels = specs.map((s) => s.label);

  // The three that decide whether it is a slot at all.
  for (const special of ["wild", "scatter", "bonus"]) assert.ok(labels.includes(special), special);
  assert.ok(labels.includes("bg") && labels.includes("tile"));
  // Unique, because the export names files after them.
  assert.equal(new Set(labels).size, labels.length);
});

test("export names never collide, and the extension follows the cutout", () => {
  const taken = new Set<string>();
  assert.equal(assetFilename(SYMBOL, 0, taken), "wild.png");
  // A studio that labels two assets the same way must still get two files.
  assert.equal(assetFilename(SYMBOL, 1, taken), "wild-2.png");
  assert.equal(
    assetFilename({ role: "background", label: "BG Main", brief: "" }, 2, taken),
    "bg-main.jpg",
  );
  // A label made entirely of punctuation still has to produce a filename.
  assert.equal(assetFilename({ role: "symbol", label: "///", brief: "" }, 3, taken), "asset-4.png");
});

test("every role declares an aspect the engine can use", () => {
  for (const [name, preset] of Object.entries(ROLES)) {
    // rules is a function of the key now, so it has to be called to be counted.
    assert.ok(preset.rules(KEY).length > 0, name);
    assert.match(preset.aspect, /^\d+:\d+$/);
  }
});

test("the set is anchored on the asset that carries the most style", () => {
  // The premium symbol: a real prop in a rich material, with the light doing
  // something. Anchoring on a low-pay trinket would pin the whole set to its
  // plainest member.
  const full = defaultSpecs();
  assert.equal(full[anchorIndex(full)].label, "premium");

  // A scene has no symbols at all, so it falls back to something that exists.
  const scene = SETS.scene();
  assert.ok(anchorIndex(scene) >= 0 && anchorIndex(scene) < scene.length);

  // A set of one still has to work.
  assert.equal(anchorIndex([{ role: "tile", label: "tile", brief: "" }]), 0);
});

test("only the assets drawn after the anchor are told to match a reference", () => {
  const spec: AssetSpec = { role: "symbol", label: "wild", brief: "a scarab" };

  const anchor = compileAssetPrompt({ brief: "a tomb" }, spec, KEY, false);
  assert.doesNotMatch(anchor, /reference image/i);

  // The anchor has no picture to match yet — telling it to match one would
  // describe a file that does not exist.
  const rest = compileAssetPrompt({ brief: "a tomb" }, spec, KEY, true);
  assert.match(rest, /reference image of this same game is attached/i);
  assert.match(rest, /only the\s+subject changes/i);
});

test("an asset is told what the set already holds, and only when it holds something", () => {
  // The defect this fixes, seen on a real pack: eleven symbols against one
  // reference came back as two eyes of Horus, two djed pillars and four
  // scarabs. Every call reached for the theme's most obvious object because,
  // as far as the model knew, every call was the first one.
  const clause = distinctClause(["a winged scarab in gold", "a djed pillar"]);
  assert.match(clause, /winged scarab in gold/);
  assert.match(clause, /djed pillar/);
  assert.match(clause, /different silhouette/);

  // The anchor has no siblings, and a sentence listing none of them would be
  // an instruction about an empty set.
  assert.equal(distinctClause([]), "");
});
