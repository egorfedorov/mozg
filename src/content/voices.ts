/**
 * What people have said about mozg, in their own words, and who they are.
 *
 * EMPTY ON PURPOSE. The row of faces and stars under the title of a landing
 * page is the loudest claim a site makes, and it is worth making only when
 * every line of it is true. Add a voice here when somebody has really said it,
 * with their leave to print it, and the row appears on its own:
 *
 *   { who: "Ada Lovelace", role: "Staff engineer", text: "What she said.", avatar: "/brand/voices/ada.webp" }
 *
 * The rule of the folder holds: double quotes are sentences and are
 * translated, single quotes are names and are left as they are. A quotation is
 * single-quoted: it is that person's words, not the site's.
 */

export interface Voice {
  who: string;
  /** What they do, in a few words. */
  role: string;
  /** Their words, as they wrote them. */
  text: string;
  /** Their face, 96 by 96, in /public/brand/voices/. */
  avatar: string;
}

export const VOICES: Voice[] = [];
