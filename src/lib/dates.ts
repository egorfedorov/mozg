/**
 * Not toLocaleDateString: it renders differently on the server and in the
 * browser (a hydration mismatch), and "8/3/2026" is ambiguous to half the
 * planet. ISO is identical everywhere and reads the same in every locale.
 */
export function isoDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}
