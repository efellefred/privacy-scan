// Analysis layer: turn a raw capture + detected vendors into structured
// findings and an overall risk rating. No I/O here — pure functions.

import { isFirstParty, registrableDomain, unique } from './utils.js';

/**
 * @param {object} capture  output of scanner.scan()
 * @param {Array}  detectedVendors  output of vendors.detectVendors()
 */
export function analyze(capture, detectedVendors) {
  const { baseHost, requests, cookies, storage, consent, policyLinks, scripts } = capture;

  // --- Third-party breakdown -------------------------------------------------
  const thirdPartyRequests = requests.filter((r) => !isFirstParty(r.host, baseHost));
  const thirdPartyDomains = unique(
    thirdPartyRequests.map((r) => registrableDomain(r.host)),
  ).sort();

  const thirdPartyScripts = unique(
    scripts.filter((url) => !isFirstParty(url, baseHost)),
  );

  // --- Cookies before consent ------------------------------------------------
  // Since we never clicked "Accept", every cookie captured was set pre-consent.
  const thirdPartyCookies = cookies.filter((c) => !c.firstParty);
  const trackingCookies = cookies.filter((c) =>
    detectedVendors.some((v) => v.evidence.cookies.includes(c.name)),
  );

  // --- Tracking-before-consent judgement ------------------------------------
  // A vendor that "requiresConsent" and fired a request or dropped a cookie on
  // a clean load (no accept click) = tracking before consent.
  const preConsentVendors = detectedVendors.filter(
    (v) =>
      v.requiresConsent &&
      (v.evidence.requests.length > 0 || v.evidence.cookies.length > 0),
  );
  const trackingBeforeConsent = preConsentVendors.length > 0;

  // --- Policy hygiene --------------------------------------------------------
  const hasPrivacyPolicy = (policyLinks.privacy || []).length > 0;
  const hasCookiePolicy = (policyLinks.cookie || []).length > 0;

  // --- Risk scoring ----------------------------------------------------------
  const risk = scoreRisk({
    consentPresent: consent.present,
    trackingBeforeConsent,
    preConsentVendorCount: preConsentVendors.length,
    thirdPartyCookieCount: thirdPartyCookies.length,
    trackingCookieCount: trackingCookies.length,
    thirdPartyDomainCount: thirdPartyDomains.length,
    hasPrivacyPolicy,
    hasCookiePolicy,
  });

  return {
    baseHost,
    counts: {
      totalRequests: requests.length,
      thirdPartyRequests: thirdPartyRequests.length,
      thirdPartyDomains: thirdPartyDomains.length,
      cookies: cookies.length,
      thirdPartyCookies: thirdPartyCookies.length,
      trackingCookies: trackingCookies.length,
      localStorage: storage.local.length,
      sessionStorage: storage.session.length,
      vendors: detectedVendors.length,
    },
    thirdPartyDomains,
    thirdPartyScripts,
    thirdPartyCookies,
    trackingCookies,
    detectedVendors,
    preConsentVendors,
    trackingBeforeConsent,
    consent,
    policyLinks,
    hasPrivacyPolicy,
    hasCookiePolicy,
    risk,
  };
}

/**
 * Weighted risk model. Returns { level, score, factors[] }.
 * The single biggest driver is trackers firing before consent while a banner
 * is shown — the classic GDPR/ePrivacy failure mode.
 */
function scoreRisk(f) {
  let score = 0;
  const factors = [];

  if (f.trackingBeforeConsent) {
    const pts = 40 + Math.min(f.preConsentVendorCount * 5, 20);
    score += pts;
    factors.push({
      points: pts,
      label: `${f.preConsentVendorCount} consent-requiring tracker(s) fired before any consent interaction`,
    });
  }

  if (f.consentPresent && f.trackingBeforeConsent) {
    score += 15;
    factors.push({
      points: 15,
      label: 'A consent banner is displayed, yet trackers already loaded — implied consent is not valid consent',
    });
  }

  if (!f.consentPresent && f.trackingBeforeConsent) {
    score += 20;
    factors.push({
      points: 20,
      label: 'Trackers load and no consent mechanism was detected at all',
    });
  }

  if (f.trackingCookieCount > 0) {
    const pts = Math.min(f.trackingCookieCount * 4, 20);
    score += pts;
    factors.push({
      points: pts,
      label: `${f.trackingCookieCount} known tracking cookie(s) set before consent`,
    });
  }

  if (f.thirdPartyCookieCount > 0) {
    const pts = Math.min(f.thirdPartyCookieCount * 2, 12);
    score += pts;
    factors.push({
      points: pts,
      label: `${f.thirdPartyCookieCount} third-party cookie(s) present on load`,
    });
  }

  if (f.thirdPartyDomainCount > 10) {
    score += 8;
    factors.push({
      points: 8,
      label: `High third-party surface: ${f.thirdPartyDomainCount} distinct third-party domains`,
    });
  }

  if (!f.hasPrivacyPolicy) {
    score += 12;
    factors.push({ points: 12, label: 'No privacy policy link found on the homepage' });
  }

  if (!f.hasCookiePolicy && (f.trackingCookieCount > 0 || f.trackingBeforeConsent)) {
    score += 8;
    factors.push({
      points: 8,
      label: 'Cookies/trackers are in use but no cookie policy link was found',
    });
  }

  let level;
  if (score >= 70) level = 'Critical';
  else if (score >= 45) level = 'High';
  else if (score >= 20) level = 'Medium';
  else if (score > 0) level = 'Low';
  else level = 'Minimal';

  return { level, score, factors };
}
