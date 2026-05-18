/**
 * Best-effort E.164 normalization tuned for Indian real-estate operators
 * (the demo target). Scope deliberately narrow — no full libphonenumber.
 *
 * Handles common forms:
 *   "+91 98xxxxxxxx", "+91-98xxxxxxxx", "0091 98xxxxxxxx",
 *   "98xxxxxxxx", "(+91) 98xxx xxxxx"
 *
 * Returns the E.164 form (e.g. "+919812345678") or null if the input
 * cannot be confidently normalized.
 *
 * Country-code default is 91 (India). Set `BUILTRIX_DEFAULT_COUNTRY_CODE`
 * to override (e.g. "1" for US).
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1) collect digits + leading-+ marker
  let stripped = trimmed.replace(/[\s\-()_. ]/g, "");
  let hasPlus = false;
  if (stripped.startsWith("+")) {
    hasPlus = true;
    stripped = stripped.slice(1);
  } else if (stripped.startsWith("00")) {
    hasPlus = true;
    stripped = stripped.slice(2);
  }

  // Must be all digits at this point.
  if (!/^\d+$/.test(stripped)) return null;

  const defaultCC = (process.env.BUILTRIX_DEFAULT_COUNTRY_CODE ?? "91").trim();

  // 2) attach country code if missing
  if (!hasPlus) {
    if (stripped.length === 10) {
      stripped = defaultCC + stripped;
    } else if (stripped.length === 11 && stripped.startsWith("0")) {
      // common Indian local trunk-zero form
      stripped = defaultCC + stripped.slice(1);
    } else if (stripped.length === 12 && stripped.startsWith(defaultCC)) {
      // already CC-prefixed without +
    } else {
      // ambiguous — refuse
      return null;
    }
  }

  // 3) sanity: between 8 and 15 digits per E.164
  if (stripped.length < 8 || stripped.length > 15) return null;

  return `+${stripped}`;
}

/** True when both inputs normalize to the same E.164 form. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhoneE164(a);
  const nb = normalizePhoneE164(b);
  if (!na || !nb) return false;
  return na === nb;
}
