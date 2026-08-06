/**
 * Cookie consent, as a value.
 *
 * Kept dependency-free and browser-safe: the banner, the footer's settings
 * link and the analytics loader all read the same shape, and a second copy of
 * "is analytics allowed" is how a product ends up loading a tracker it told
 * someone it would not.
 *
 * The decision lives in a first-party cookie rather than localStorage on
 * purpose — the server can read it too, so a future server-rendered pixel
 * cannot bypass it, and it expires on its own instead of outliving the
 * consent it records.
 */

export interface Consent {
  /** Sessions and the consent record itself. Never optional, never asked. */
  essential: true;
  /** Product analytics (PostHog). */
  analytics: boolean;
  /** Remembered choices that are convenience, not function. */
  functional: boolean;
}

export const CONSENT_COOKIE = "mozg_consent";

/** Six months. Consent that never expires stops being a decision. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;

/** The event the banner fires when a choice is saved, so nothing needs a reload. */
export const CONSENT_EVENT = "mozg:consent";

/** The event the footer's "Cookie Settings" link fires to reopen the panel. */
export const CONSENT_OPEN_EVENT = "mozg:cookie-settings";

export const ALL_ON: Consent = { essential: true, analytics: true, functional: true };
export const ESSENTIAL_ONLY: Consent = { essential: true, analytics: false, functional: false };

/**
 * Anything unparseable reads as "not asked yet", which shows the banner again.
 * Asking twice is a small annoyance; assuming consent from a corrupt cookie is
 * not the kind of mistake to make quietly.
 */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    if (typeof v !== "object" || v === null) return null;
    return {
      essential: true,
      analytics: v.analytics === true,
      functional: v.functional === true,
    };
  } catch {
    return null;
  }
}

export function serializeConsent(c: Consent): string {
  return encodeURIComponent(
    JSON.stringify({ analytics: c.analytics, functional: c.functional, v: 1 }),
  );
}

/** Browser-side read. Returns null on the server, where there is no document. */
export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(hit?.slice(CONSENT_COOKIE.length + 1));
}

/** Browser-side write, plus the event that lets listeners react immediately. */
export function writeConsent(c: Consent): void {
  document.cookie =
    `${CONSENT_COOKIE}=${serializeConsent(c)}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax` +
    (location.protocol === "https:" ? "; Secure" : "");
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: c }));
}
