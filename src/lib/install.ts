/**
 * How the plugin is installed and where the desk opens. One place, so the
 * landing, the desk and the README cannot disagree, and so publishing is a
 * change to two lines.
 *
 * The page never shows a path on the author's machine. The way that works
 * before publishing (a local copy of the repository) belongs in the README.
 */
export const INSTALL = {
  /** True once the plugin is in the marketplace everyone can add. */
  published: true,
  marketplace: "/plugin marketplace add egorfedorov/mozg-plugin",
  plugin: "/plugin install mozg@mozg",
  /**
   * Where the plugin serves the desk. It exists only on a machine that has
   * the plugin, which is all the link can honestly promise.
   */
  desk: "http://127.0.0.1:4317/desk/",
  /** The public site. The desk's one way out leads here. */
  site: "https://mozg.sh",
} as const;
