import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Guard for URLs the server will fetch on a user's behalf.
 *
 * Without this, "add a source by URL" is a server-side request forgery hole:
 * the worker runs inside the network, so a user could point it at cloud
 * metadata (169.254.169.254), at a database admin panel on another container,
 * or at localhost, and read back whatever came out as brain notes.
 *
 * DNS is resolved here and every resulting address is checked, because a
 * hostname that looks public can resolve to a private one on purpose.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Private, loopback, link-local and other ranges that must never be fetched. */
function isBlockedIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;

  const [a, b] = p;
  return (
    a === 0 || // this network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0) || // protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

function isBlockedIPv6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::" || v === "::1") return true; // unspecified, loopback
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;

  // IPv4-mapped addresses inherit the IPv4 rules. WHATWG URL parsing rewrites
  // ::ffff:127.0.0.1 into ::ffff:7f00:1, so matching only the dotted form
  // leaves loopback reachable through a hex address.
  const mapped = /^::ffff:(.+)$/.exec(v);
  if (mapped) {
    const tail = mapped[1];
    if (tail.includes(".")) return isBlockedIPv4(tail);

    const groups = tail.split(":");
    if (groups.length === 2) {
      const hi = parseInt(groups[0], 16);
      const lo = parseInt(groups[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        return isBlockedIPv4(
          [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join("."),
        );
      }
    }
    // Anything else in the mapped range we cannot parse — refuse it rather
    // than assume it is safe.
    return true;
  }

  return false;
}

export interface UrlCheck {
  ok: boolean;
  url?: string;
  reason?: string;
}

export async function checkFetchableUrl(input: string): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `only http and https, not ${url.protocol}` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URLs with credentials are not accepted" };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  // Literal addresses skip DNS but not the checks.
  const literal = isIP(host);
  if (literal === 4) {
    return isBlockedIPv4(host)
      ? { ok: false, reason: "points at a private address" }
      : { ok: true, url: url.toString() };
  }
  if (literal === 6) {
    return isBlockedIPv6(host)
      ? { ok: false, reason: "points at a private address" }
      : { ok: true, url: url.toString() };
  }

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return { ok: false, reason: "points at the server itself" };
  }

  let addresses;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: "host does not resolve" };
  }
  if (!addresses.length) return { ok: false, reason: "host does not resolve" };

  for (const { address, family } of addresses) {
    const blocked = family === 4 ? isBlockedIPv4(address) : isBlockedIPv6(address);
    if (blocked) return { ok: false, reason: "resolves to a private address" };
  }

  return { ok: true, url: url.toString() };
}
