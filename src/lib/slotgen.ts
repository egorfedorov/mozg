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
  readonly rules: readonly string[];
}

/**
 * A symbol is cut out, and everything about its prompt follows from that.
 *
 * The cutout is done by chroma key rather than by a background remover,
 * because a remover guesses and a flat key does not: it fails visibly (a green
 * rim) instead of quietly eating a horn or a wisp of smoke. So the model is
 * asked for one specific green, edge to edge, with nothing of the subject
 * touching the frame and no shadow falling onto the key — a shadow on chroma
 * keys out as a hole, and that hole is only noticed in-engine.
 */
const CHROMA = "#00B140";

export const ROLES: Record<AssetRole, RolePreset> = {
  symbol: {
    summary: "Reel symbol, cut out on transparency",
    aspect: "1:1",
    cutout: true,
    rules: [
      `Place the subject on a completely flat ${CHROMA} background, filling the whole frame behind it.`,
      "No shadow, glow, reflection or particle may touch that background — it is keyed out, and anything on it becomes a hole.",
      "Leave a clear margin on all four sides: nothing the subject is made of may reach or cross the frame edge.",
      "One subject, centred, seen straight on, no scene and no ground plane.",
      "Read at 128×128: one silhouette, one dominant hue, detail that survives being shrunk.",
    ],
  },
  background: {
    summary: "Reel background, full bleed",
    aspect: "16:9",
    cutout: false,
    rules: [
      "Composition holds the centre open and quiet: the reels sit there and must stay readable over it.",
      "Detail and contrast belong at the edges; the middle stays low-contrast.",
      "No character, no focal object competing with the symbols.",
    ],
  },
  tile: {
    summary: "Lobby tile / key art",
    aspect: "3:4",
    cutout: false,
    rules: [
      "Hero composition: the theme's most recognisable subject, large, unmistakable at thumbnail size.",
      "Leave the lower third calmer — the storefront overlays a gradient and the title there.",
      "No baked-in text, logo, wordmark, number or multiplier anywhere in the image.",
    ],
  },
  frame: {
    summary: "UI frame / panel",
    aspect: "1:1",
    cutout: true,
    rules: [
      `Flat ${CHROMA} background, and the panel's interior is that same ${CHROMA} — both are keyed out, leaving only the frame.`,
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
  "Never render text, numbers, letters, currency signs or multipliers.",
  "Never add a watermark, signature, border or logo.",
  "Never imitate a real brand, licensed character or existing game.",
] as const;

/**
 * The classic ladder, in the order a paytable lists it.
 *
 * A studio that has never shipped a slot asks for "some symbols" and gets an
 * unbalanced set; the ladder is what makes twelve pictures a paytable. Low
 * symbols are deliberately generic and cheap-looking — they pay the least and
 * must read as filler — while the premiums carry the theme.
 */
export const SYMBOL_LADDER = [
  { label: "low-1", tier: "low", brief: "the humblest themed trinket, plain and cheap-looking" },
  { label: "low-2", tier: "low", brief: "a second minor trinket, clearly the same family as low-1" },
  { label: "low-3", tier: "low", brief: "a third minor trinket, same family, different silhouette" },
  { label: "low-4", tier: "low", brief: "a fourth minor trinket, same family, different silhouette" },
  { label: "high-1", tier: "high", brief: "a valuable themed object, richer material and colour than the lows" },
  { label: "high-2", tier: "high", brief: "a second valuable object, clearly above high-1 in worth" },
  { label: "high-3", tier: "high", brief: "the theme's signature object, the one a player would name" },
  { label: "character", tier: "high", brief: "the theme's central character, bust or full figure, facing the player" },
  { label: "wild", tier: "special", brief: "the wild: the theme's most powerful emblem, unmistakably different from every other symbol" },
  { label: "scatter", tier: "special", brief: "the scatter: a key-like object that promises a bonus, radiating importance" },
  { label: "bonus", tier: "special", brief: "the bonus trigger, kin to the scatter but plainly a different object" },
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
export function compileAssetPrompt(pack: PackBrief, spec: AssetSpec): string {
  const preset = ROLES[spec.role];
  const parts = [
    `Game art for a slot game. The whole set shares one world: ${pack.brief.trim()}`,
    pack.palette?.trim() ? `Palette for every asset in the set: ${pack.palette.trim()}` : "",
    "",
    `This asset: ${spec.brief}.`,
    "",
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
    ...preset.rules.map((r) => `- ${r}`),
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
