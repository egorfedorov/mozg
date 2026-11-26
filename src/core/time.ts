/**
 * Days, not instants. "Today" is the person's today, so every boundary here is
 * a local calendar day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Whole local days from `a` to `b`, rounded down; negative if `b` is earlier. */
export function daysBetween(a: Date, b: Date): number {
  const a0 = startOfDay(a).getTime();
  const b0 = startOfDay(b).getTime();
  return Math.round((b0 - a0) / DAY_MS);
}

/** The last `n` days ending today, oldest first. */
export function lastDays(now: Date, n: number): string[] {
  const out: string[] = [];
  const today = startOfDay(now);
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(addDays(today, -i)));
  return out;
}

export function parseIso(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

export function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
