// Vendor detection: match captured requests and cookies against the
// definitions in data/vendors.json.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hostOf } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENDORS_PATH = join(__dirname, '..', 'data', 'vendors.json');

/** Load and validate the vendor database. */
export async function loadVendors() {
  const raw = await readFile(VENDORS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.vendors)) {
    throw new Error('vendors.json is malformed: missing "vendors" array.');
  }
  return parsed.vendors;
}

/** Does the request host belong to the vendor (exact or subdomain match)? */
function domainMatches(host, vendor) {
  return (vendor.domains || []).some((d) => {
    const dh = hostOf(d);
    return host === dh || host.endsWith(`.${dh}`);
  });
}

/**
 * Does a single request URL match this vendor?
 * A domain match is authoritative; URL patterns are a secondary signal that
 * catches vendors served from shared/proxy domains. Patterns in vendors.json
 * must be DISTINCTIVE (unique filenames/signatures) — generic paths such as
 * "/collect" would otherwise cross-match an unrelated vendor's endpoint.
 */
function requestMatchesVendor(url, vendor) {
  const host = hostOf(url);
  if (domainMatches(host, vendor)) return true;
  return (vendor.urlPatterns || []).some((p) => url.includes(p));
}

/** Does a cookie name match this vendor's known cookie patterns? */
function cookieMatchesVendor(cookieName, vendor) {
  return (vendor.cookiePatterns || []).some((p) => {
    try {
      return new RegExp(p).test(cookieName);
    } catch {
      return false;
    }
  });
}

/**
 * Detect which vendors are present given captured requests and cookies.
 * Returns an array of { ...vendor, evidence: { requests[], cookies[] } }.
 */
export function detectVendors(vendors, { requests = [], cookies = [] }) {
  const detected = [];

  for (const vendor of vendors) {
    const matchedRequests = requests
      .filter((r) => requestMatchesVendor(r.url, vendor))
      .map((r) => r.url);

    const matchedCookies = cookies
      .filter((c) => cookieMatchesVendor(c.name, vendor))
      .map((c) => c.name);

    if (matchedRequests.length > 0 || matchedCookies.length > 0) {
      detected.push({
        ...vendor,
        evidence: {
          requests: [...new Set(matchedRequests)].slice(0, 10),
          cookies: [...new Set(matchedCookies)],
        },
      });
    }
  }

  return detected;
}
