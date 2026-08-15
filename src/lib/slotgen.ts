/**
 * What a slot game actually needs from an image model.
 *
 * The generation itself is a commodity — anyone can send a sentence to an
 * image API. What a studio cannot get from one is a *set*: twelve symbols that
 * read as one game, each cut out cleanly on transparency, at the sizes an
 * engine wants, named the way a developer expects. That is what this file
 * knows, and it is the whole product.
 *
 * Pure on purpose: no database, no network. The prompt is a value, so the
 * rules that make an asset shippable can be tested without spending a cent.
 */

/** Roles differ in what a correct picture even looks like, so each carries its
 *  own framing, aspect and refusals rather than one prompt with branches. */
export type AssetRole = "symbol" | "background" | "tile" | "frame";

interface RolePreset {
  /** Shown to the studio when it picks what to generate. */
  readonly summary: string;
  /** Aspect the engine expects. */
  readonly aspect: "1:1" | "16:9" | "3:4";
  /** Cut out of its background before it reaches the game. */
  readonly cutout: boolean;
  /** The key is chosen per pack — against what the art is made of — so the
   *  clause that names it cannot be baked into the rule. */
  readonly rules: (keyClause: string) => readonly string[];
}

/**
 * A symbol is cut out, and everything about its prompt follows from that.
 *
 * The cutout is done by chroma key rather than by a background remover,
 * because a remover guesses and a flat key does not: it fails visibly (a
 * coloured rim) instead of quietly eating a horn or a wisp of smoke. So the
 * model is asked for one specific colour, edge to edge, with nothing of the
 * subject touching the frame and no shadow falling onto the key — a shadow on
 * the key cuts out as a hole, and that hole is only noticed in-engine.
 *
 * Which colour is not fixed: it is picked per pack against the brief, because
 * the one unrecoverable failure is keying out the subject itself.
 */

export const ROLES: Record<AssetRole, RolePreset> = {
  symbol: {
    summary: "Reel symbol, cut out on transparency",
    aspect: "1:1",
    cutout: true,
    rules: (key) => [
      `Place the subject on a completely flat ${key} background, filling the whole frame behind it.`,
      "No shadow, glow, reflection or particle may touch that background — it is keyed out, and anything on it becomes a hole.",
      "Leave a clear margin on all four sides: nothing the subject is made of may reach or cross the frame edge.",
      "One subject, centred, seen straight on, no scene and no ground plane.",
      // Watched a model return a framed plaque with a disc behind it. After
      // keying, the frame survives as debris around the symbol and the disc as
      // an opaque blob — a reel symbol has to be the object and nothing else.
      "The subject is a free-standing object floating on the key. Nothing may sit behind it or around it: no frame, plaque, cartouche, medallion, badge, ribbon, banner, plinth or backing disc.",
      "Read at 128×128: one silhouette, one dominant hue, detail that survives being shrunk.",
    ],
  },
  background: {
    summary: "Reel background, full bleed",
    aspect: "16:9",
    cutout: false,
    rules: () => [
      "Composition holds the centre open and quiet: the reels sit there and must stay readable over it.",
      "Detail and contrast belong at the edges; the middle stays low-contrast.",
      "No character, no focal object competing with the symbols.",
    ],
  },
  tile: {
    summary: "Lobby tile / key art",
    aspect: "3:4",
    cutout: false,
    rules: () => [
      "Hero composition: the theme's most recognisable subject, large, unmistakable at thumbnail size.",
      "Leave the lower third calmer — the storefront overlays a gradient and the title there.",
      "No baked-in text, logo, wordmark, number or multiplier anywhere in the image.",
    ],
  },
  frame: {
    summary: "UI frame / panel",
    aspect: "1:1",
    cutout: true,
    rules: (key) => [
      `Flat ${key} background, and the panel's interior is that same ${key} — both are keyed out, leaving only the frame.`,
      "Symmetrical, tileable edges, even border weight.",
      "No text inside the frame: the game writes live values there.",
    ],
  },
};

/**
 * The refusals that apply to every asset regardless of role.
 *
 * The text one is not aesthetic. A storefront rejects art with wording,
 * multipliers or figures baked into it — that copy has to be a live, localised
 * layer — so a beautiful tile with "MEGA WIN 5000x" painted on is a tile the
 * studio has to throw away.
 */
const NEVERS = [
  // Stated as a property of the artwork rather than as a prohibition: a model
  // asked for "the wild mark" and told never to write text returned a symbol
  // with WILD carved across it. What works is describing a wordless object,
  // and saying where the name is allowed to live instead.
  "The artwork is completely wordless. No letters, words, glyphs, runes, inscriptions, numerals or currency signs anywhere — including carved or embossed on the object own surface.",
  "A symbol called wild, scatter or bonus says so through the object itself; its name is written by the game in a live text layer, never painted into the picture.",
  "No watermark, no signature, no logo.",
  "Never imitate a real brand, licensed character or existing game.",
] as const;

/**
 * The ladder, in four tiers, in the order a paytable lists it.
 *
 * A studio that has never shipped a slot asks for "some symbols" and gets an
 * unbalanced pile; the tiers are what make eleven pictures a paytable. The
 * progression is a *material* one — low symbols are plain forms that read
 * instantly, mid symbols gain texture, the premium carries a real prop of the
 * world, and the top tier holds the personality. A player reads value off that
 * rise before they ever open the paytable.
 */
export const SYMBOL_LADDER = [
  { label: "low-1", tier: "low", brief: "the humblest themed trinket: a simple form, flat material, quick colour read" },
  { label: "low-2", tier: "low", brief: "a second minor trinket, same family as low-1, clearly different silhouette" },
  { label: "low-3", tier: "low", brief: "a third minor trinket, same family, another distinct silhouette" },
  { label: "low-4", tier: "low", brief: "a fourth minor trinket, same family, another distinct silhouette" },
  { label: "mid-1", tier: "mid", brief: "a step up in worth: more material and surface texture than the lows, still a modest object" },
  { label: "mid-2", tier: "mid", brief: "a second mid-tier object, plainly richer than the lows and plainly below the premium" },
  { label: "premium", tier: "premium", brief: "a recognisable prop of this world in a rich material — the object a player would name if asked what the game is about" },
  { label: "character", tier: "top", brief: "the theme's central character, bust or full figure, facing the player, the strongest personality in the set" },
  { label: "wild", tier: "top", brief: "the wild: the single most powerful object of the theme, unmistakable at a glance and unlike every other symbol, an object only with no lettering of any kind" },
  { label: "scatter", tier: "top", brief: "the scatter: an object that promises a bonus and radiates importance, an object only with no lettering of any kind" },
  { label: "bonus", tier: "top", brief: "the bonus trigger: kin to the scatter but plainly a different object, and likewise with no lettering" },
] as const;

/**
 * What makes eleven pictures one set rather than eleven pictures.
 *
 * Every line here is a rule a studio's art director would give, and each one
 * fixes a specific way a generated set fails review: symbols that cannot be
 * told apart in motion blur, a light direction that flips between assets, an
 * outer glow copied onto everything so nothing looks special, and a value
 * ladder a player cannot read without the paytable.
 */
const SET_RULES = [
  "One border treatment for every symbol in the set: same outline weight, same corner logic.",
  "One light direction for every symbol in the set, stated once and never flipped.",
  "Material rises with tier and must be visible: plain at low, textured at mid, rich at premium, strongest personality at top.",
  "Silhouettes must differ enough to tell symbols apart when blurred by motion — small internal detail may never be the only difference.",
  "Do not put the same outer glow on every symbol; a glow that is everywhere marks nothing.",
] as const;

export interface AssetSpec {
  role: AssetRole;
  /** The engine-side name: wild, scatter, low-1, bg, tile. */
  label: string;
  /** What this particular asset shows. */
  brief: string;
}

/** The default set a studio gets when it just describes a theme: the full
 *  ladder plus the two pieces every game needs around it. */
export function defaultSpecs(): AssetSpec[] {
  return [
    ...SYMBOL_LADDER.map((s) => ({ role: "symbol" as const, label: s.label, brief: s.brief })),
    { role: "background", label: "bg", brief: "the game's reel background" },
    { role: "tile", label: "tile", brief: "lobby key art for the game" },
  ];
}

/**
 * What can be ordered in one go.
 *
 * Three sets rather than a checklist of thirteen boxes: the point of the
 * service is that it knows what a slot needs, and a form asking the studio to
 * assemble its own paytable has handed the expertise back to them. Anyone who
 * wants a different mix orders twice.
 *
 * Here rather than next to the form because the price of a set has to be added
 * up on the server, and a server action file can only export functions.
 */
export const SETS: Record<string, () => AssetSpec[]> = {
  full: () => defaultSpecs(),
  symbols: () =>
    SYMBOL_LADDER.map((s) => ({ role: "symbol" as const, label: s.label, brief: s.brief })),
  scene: () => [
    { role: "background", label: "bg", brief: "the game's reel background" },
    { role: "tile", label: "tile", brief: "lobby key art for the game" },
    { role: "frame", label: "frame", brief: "the reel frame and UI panel" },
  ],
};

/**
 * Which asset the rest of the set is drawn against.
 *
 * The premium symbol, when there is one: it is the asset carrying the most
 * information about the world — a real prop, a rich material, the light doing
 * something — so a model handed it as a reference has the most to copy. A
 * low-pay trinket would anchor the set to its plainest member, and a
 * background would anchor it to a composition no symbol shares.
 *
 * Falls back to whatever comes first, because a set of one still has to work.
 */
export function anchorIndex(specs: AssetSpec[]): number {
  const order = ["premium", "character", "wild", "tile", "background"];
  for (const wanted of order) {
    const i = specs.findIndex((s) => s.label === wanted || s.role === wanted);
    if (i >= 0) return i;
  }
  return 0;
}

/** The clause that makes a reference image binding rather than decorative. */
export const REFERENCE_CLAUSE = [
  "A reference image of this same game is attached.",
  "Match it exactly: the palette, the light direction, the outline weight, the",
  "material language and the level of detail are already decided by it. This is",
  "another asset from the same set, not a variation on a theme — only the",
  "subject changes.",
].join(" ");

/**
 * Tell an asset what the set already contains.
 *
 * Eleven symbols generated independently against one reference come back as
 * one game and four silhouettes: the model reaches for the theme's most
 * obvious objects every time, so a tomb set arrives with two eyes of Horus,
 * two djed pillars and four scarabs. A player cannot read a paytable like
 * that, and the value ladder it was built on stops meaning anything.
 *
 * The cure is the information the model was missing. It is generated last, at
 * the moment the asset runs, because only then is it known which siblings
 * actually exist.
 */
export function distinctClause(existing: string[]): string {
  if (!existing.length) return "";
  return [
    `The set already contains: ${existing.join("; ")}.`,
    "Those pictures are attached. Yours must be a different object from every",
    "one of them — a different silhouette, recognisable as a different thing at",
    "a glance and when blurred by motion. Do not draw a variation of one that",
    "exists; draw something the set does not have yet, in the same world and the",
    "same style.",
  ].join(" ");
}

export interface PackBrief {
  /** The studio's own description of the game: theme, mood, period. */
  brief: string;
  /** Hex values or colour names the whole set shares. */
  palette?: string | null;
  /** An artist's documented rules, when the pack is generated in a bought
   *  style. Already compiled by the caller from that brain's notes. */
  styleRules?: string | null;
}

/**
 * Compile one asset's prompt.
 *
 * Order matters and is not cosmetic: the shared brief goes first so every
 * asset in the set is anchored to the same world, the artist's rules come
 * before the role's because a bought style outranks our house defaults on
 * look, and the role's technical rules come last because they are about the
 * file rather than the picture — those must not be overridden by anything.
 */
export function compileAssetPrompt(
  pack: PackBrief,
  spec: AssetSpec,
  keyClause: string,
  /** True when this asset will be generated with the pack's anchor attached. */
  withReference = false,
): string {
  const preset = ROLES[spec.role];
  const tier = SYMBOL_LADDER.find((s) => s.label === spec.label)?.tier;
  const parts = [
    `Game art for a slot game. The whole set shares one world: ${pack.brief.trim()}`,
    pack.palette?.trim() ? `Palette for every asset in the set: ${pack.palette.trim()}` : "",
    "",
    withReference ? REFERENCE_CLAUSE : "",
    withReference ? "" : "",
    `This asset: ${spec.brief}.`,
    tier ? `Its tier in the paytable: ${tier}.` : "",
    "",
    spec.role === "symbol"
      ? ["Rules that hold across the whole symbol set:", ...SET_RULES.map((r) => `- ${r}`), ""].join("\n")
      : "",
    pack.styleRules?.trim()
      ? [
          "Render it in the artist's style, defined by these rules. They are the",
          "artist's own and they override your defaults — where a rule and your",
          "instinct disagree, the rule wins:",
          "",
          pack.styleRules.trim().slice(0, 4000),
          "",
        ].join("\n")
      : "",
    "Technical requirements, which override every stylistic choice above:",
    ...preset.rules(keyClause).map((r) => `- ${r}`),
    ...NEVERS.map((r) => `- ${r}`),
    "",
    `Aspect ratio ${preset.aspect}.`,
  ];

  return parts.filter((p) => p !== "").join("\n");
}

/**
 * The filename this asset gets in the export.
 *
 * Engine-side names are lowercase, hyphenless where possible, and never
 * collide — two assets labelled "wild" in one pack would silently overwrite
 * each other inside the zip, so the index disambiguates rather than the
 * studio having to.
 */
export function assetFilename(spec: AssetSpec, index: number, taken: Set<string>): string {
  const base = spec.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `asset-${index + 1}`;
  const ext = ROLES[spec.role].cutout ? "png" : "jpg";

  let name = `${base}.${ext}`;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}.${ext}`;
  taken.add(name);
  return name;
}
