/**
 * A path that may wrap after its slashes and never inside a word:
 * "src/db/migrations" breaks as "src/db/" + "migrations", not "migrati" +
 * "ons". The zero-width space is invisible and copied along with the text.
 */
export function breakable(path: string): string {
  return path.replace(/\//g, "/\u200B");
}
