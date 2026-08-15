import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assetFilename,
  compileAssetPrompt,
  defaultSpecs,
  ROLES,
  type AssetSpec,
} from "./slotgen";

const SYMBOL: AssetSpec = { role: "symbol", label: "wild", brief: "a golden scarab" };

test("a cut-out asset asks for the key, a full-bleed one never does", () => {
  const symbol = compileAssetPrompt({ brief: "an egyptian tomb" }, SYMBOL);
  assert.match(symbol, /#00B140/);

  const background = compileAssetPrompt(
    { brief: "an egyptian tomb" },
    { role: "background", label: "bg", brief: "the reel background" },
  );
  // A background is composited whole. Asking for chroma there would key out
  // the picture itself.
  assert.doesNotMatch(background, /#00B140/);
});

test("the technical rules come after the artist's, so the file stays shippable", () => {
  const prompt = compileAssetPrompt(
    { brief: "an egyptian tomb", styleRules: "- palette: flat cream and rust, no gradients" },
    SYMBOL,
  );
  const style = prompt.indexOf("flat cream and rust");
  const technical = prompt.indexOf("Technical requirements");
  assert.ok(style > 0 && technical > style);

  // The refusal that costs a studio the asset if it loses: baked-in wording is
  // rejected by the storefront, whatever the style says.
  assert.match(prompt, /Never render text, numbers/);
});

test("the shared brief and palette reach every asset in the set", () => {
  const prompt = compileAssetPrompt(
    { brief: "an egyptian tomb", palette: "gold #E8B04B, deep violet" },
    SYMBOL,
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
    assert.ok(preset.rules.length > 0, name);
    assert.match(preset.aspect, /^\d+:\d+$/);
  }
});
