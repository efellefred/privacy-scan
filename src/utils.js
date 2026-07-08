// Small, dependency-free helpers shared across the scanner pipeline.

/**
 * Normalize a user-supplied domain/URL into a fully-qualified https URL.
 * Accepts "example.com", "http://example.com", "https://example.com/path".
 */
export function normalizeUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('A domain or URL is required.');
  }
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  // Throws if still not parseable.
  const url = new URL(value);
  return url.toString();
}

/**
 * Extract a bare hostname from any URL, lowercased and stripped of a leading "www.".
 */
export function hostOf(urlOrHost) {
  try {
    const host = urlOrHost.includes('://')
      ? new URL(urlOrHost).hostname
      : urlOrHost;
    return host.toLowerCase().replace(/^www\./, '');
  } catch {
    return String(urlOrHost).toLowerCase();
  }
}

/**
 * Registrable-domain approximation: last two labels of a hostname
 * (e.g. "cdn.assets.example.co" -> "example.co"). Good enough to decide
 * first-party vs third-party for reporting purposes.
 */
export function registrableDomain(host) {
  const clean = hostOf(host);
  // Leave IP addresses (IPv4/IPv6) and bare hostnames untouched.
  if (isIpAddress(clean)) return clean;
  const parts = clean.split('.');
  if (parts.length <= 2) return clean;
  // Handle common two-level public suffixes (co.uk, com.au, etc.).
  const twoLevelSuffixes = new Set([
    'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.au', 'net.au', 'org.au',
    'co.nz', 'co.jp', 'com.br', 'co.za', 'com.mx',
  ]);
  const lastTwo = parts.slice(-2).join('.');
  if (twoLevelSuffixes.has(lastTwo)) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

/** True for IPv4 (1.2.3.4) or IPv6 (contains ':') literals. */
export function isIpAddress(host) {
  if (host.includes(':')) return true; // IPv6
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** True when `host` is the same registrable domain as `baseHost`. */
export function isFirstParty(host, baseHost) {
  return registrableDomain(host) === registrableDomain(baseHost);
}

/** Deduplicate an array of primitives while preserving order. */
export function unique(arr) {
  return [...new Set(arr)];
}

/** Timestamp safe for use in filenames: 2026-07-07T14-31-09. */
export function fileTimestamp(date = new Date()) {
  return date.toISOString().replace(/:/g, '-').replace(/\..+$/, '');
}

/** Turn a hostname/URL into a filesystem-safe slug. */
export function slugify(input) {
  return hostOf(input).replace(/[^a-z0-9.-]/gi, '_');
}
