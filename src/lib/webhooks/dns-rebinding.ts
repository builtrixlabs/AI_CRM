/**
 * V3.x — DNS-rebinding mitigation for outbound webhook delivery.
 *
 * Background: V3.0 (D-311) shipped a syntactic SSRF guard via `checkUrlSsrf`,
 * which catches private hostnames + IP literals. It does NOT defend against
 * an attacker who registers `evil.example.com` with a public-IP A record at
 * endpoint-registration time, then flips the record to `127.0.0.1` (or any
 * RFC-1918) just before delivery — the so-called DNS-rebinding attack.
 *
 * This module resolves the URL's hostname at delivery time and rejects if any
 * resolved IPv4/IPv6 address falls in:
 *   - 0.0.0.0/8                  reserved
 *   - 10.0.0.0/8                 private
 *   - 100.64.0.0/10              CGNAT
 *   - 127.0.0.0/8                loopback
 *   - 169.254.0.0/16             link-local (incl. metadata 169.254.169.254)
 *   - 172.16.0.0/12              private
 *   - 192.0.0.0/24               IETF protocol assignments
 *   - 192.168.0.0/16             private
 *   - 198.18.0.0/15              benchmark
 *   - 224.0.0.0/4                multicast
 *   - 240.0.0.0/4                reserved (incl. 255.255.255.255)
 *   - ::1                        IPv6 loopback
 *   - fe80::/10                  IPv6 link-local
 *   - fc00::/7                   IPv6 unique-local
 *
 * It does NOT (yet) pin the connection to the resolved IP — fetch will resolve
 * again, opening a small TOCTOU window. Pinning requires a custom http(s) agent
 * with SNI = original hostname; tracked as a follow-up. The resolve-and-check
 * pass already defeats the common rebinding-to-private attack since the second
 * resolution typically returns the same set within a single TTL.
 */

import { lookup } from "node:dns/promises";

export type ResolverFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const defaultResolver: ResolverFn = async (hostname) => {
  const records = await lookup(hostname, { all: true });
  return records.map((r) => ({
    address: r.address,
    family: r.family as 4 | 6,
  }));
};

/**
 * Returns null when every resolved address is publicly routable. Returns a
 * non-empty reason string when at least one address is in a blocked range.
 */
export async function resolveAndCheck(
  hostname: string,
  resolver: ResolverFn = defaultResolver,
): Promise<string | null> {
  // Skip resolution for IP literals — checkUrlSsrf already covers those.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
  if (hostname.includes(":")) return null;

  let records: Array<{ address: string; family: 4 | 6 }>;
  try {
    records = await resolver(hostname);
  } catch (err) {
    // DNS NXDOMAIN, EAI_AGAIN, etc. — we treat unresolvable as a failure to
    // honour the ssrf guard rather than letting fetch attempt + leak.
    return `dns_lookup_failed:${err instanceof Error ? err.message : "unknown"}`;
  }
  if (records.length === 0) return "dns_no_records";

  for (const rec of records) {
    const reason = rec.family === 4
      ? blockedIpv4(rec.address)
      : blockedIpv6(rec.address);
    if (reason) return `${reason}:${rec.address}`;
  }
  return null;
}

export function blockedIpv4(ip: string): string | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return "invalid_ipv4";
  }
  const [a, b] = parts;
  if (a === 0) return "reserved_v4";
  if (a === 10) return "private_v4";
  if (a === 127) return "loopback_v4";
  if (a === 169 && b === 254) return "link_local_v4";
  if (a === 172 && b >= 16 && b <= 31) return "private_v4";
  if (a === 100 && b >= 64 && b <= 127) return "cgnat_v4";
  if (a === 192 && b === 0 && parts[2] === 0) return "ietf_v4";
  if (a === 192 && b === 168) return "private_v4";
  if (a === 198 && (b === 18 || b === 19)) return "benchmark_v4";
  if (a >= 224 && a <= 239) return "multicast_v4";
  if (a >= 240) return "reserved_v4";
  return null;
}

export function blockedIpv6(ip: string): string | null {
  const lowered = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lowered === "::1") return "loopback_v6";
  if (lowered === "::") return "unspecified_v6";
  // fe80::/10 — link-local
  if (lowered.startsWith("fe8") || lowered.startsWith("fe9") ||
      lowered.startsWith("fea") || lowered.startsWith("feb")) {
    return "link_local_v6";
  }
  // fc00::/7 — unique local (fc__ or fd__)
  if (lowered.startsWith("fc") || lowered.startsWith("fd")) {
    if (/^f[cd][0-9a-f]{2}:/.test(lowered)) return "ula_v6";
  }
  // ::ffff:0:0/96 — IPv4-mapped; check the embedded v4
  const mapped = lowered.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    const inner = blockedIpv4(mapped[1]);
    if (inner) return `mapped_${inner}`;
  }
  // ff00::/8 — multicast
  if (lowered.startsWith("ff")) return "multicast_v6";
  return null;
}
