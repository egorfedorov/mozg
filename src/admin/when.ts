import { fill, getLanguage, LANG_TAG, t } from "@/lib/i18n";

/** A moment as the operator reads it: the day, the month, the hour. */
export const when = (iso: string): string =>
  new Intl.DateTimeFormat(LANG_TAG[getLanguage()], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** How long ago a moment was, in the largest two units that say something. */
export const howLong = (iso: string): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes >= 1440) return fill(t("<0/> d <1/> h ago"), [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60)]);
  if (minutes >= 60) return fill(t("<0/> h <1/> min ago"), [Math.floor(minutes / 60), minutes % 60]);
  return fill(t("<0/> min ago"), [minutes]);
};

/** How long a server has been up, in the same two units. */
export const upFor = (iso: string): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes >= 1440) return fill(t("<0/> d <1/> h"), [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60)]);
  return fill(t("<0/> h <1/> min"), [Math.floor(minutes / 60), minutes % 60]);
};
