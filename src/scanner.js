// Playwright-driven capture. Loads the target homepage in a clean, cookie-less
// browser context and records everything that happens *before* any consent
// interaction (we never click "Accept").

import { chromium } from 'playwright';
import { hostOf } from './utils.js';

// Selectors / text signatures for common Consent Management Platforms (CMPs)
// and generic cookie banners.
const CONSENT_SELECTORS = [
  '#onetrust-banner-sdk',            // OneTrust
  '#onetrust-consent-sdk',
  '#CybotCookiebotDialog',           // Cookiebot
  '#cookiebot',
  '.cc-window',                      // Cookie Consent (Osano/insites)
  '.osano-cm-window',                // Osano
  '#termly-code-snippet-support',    // Termly
  '.termly-styles-root',
  '#cookieyes',                      // CookieYes
  '.cky-consent-container',
  '#usercentrics-root',              // Usercentrics
  '#cmpbox',                         // Consent Manager / Quantcast
  '.qc-cmp2-container',
  '#didomi-host',                    // Didomi
  '#hs-eu-cookie-confirmation',      // HubSpot cookie banner
  '[id*="cookie" i][class*="banner" i]',
  '[class*="cookie-consent" i]',
  '[class*="cookie-notice" i]',
  '[aria-label*="cookie" i]',
];

const CONSENT_TEXT = [
  'we use cookies',
  'this website uses cookies',
  'accept all cookies',
  'accept cookies',
  'manage cookies',
  'cookie preferences',
  'cookie settings',
  'your privacy choices',
  'by continuing to use',
];

/**
 * Run a full capture against a normalized URL.
 * @returns capture object consumed by analyzer.js
 */
export async function scan(targetUrl, { timeout = 30000, headless = true } = {}) {
  const baseHost = hostOf(targetUrl);
  const browser = await chromium.launch({ headless });

  // A brand-new context = clean session: no cookies, no storage, no cache.
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 privacy-scan/1.0',
  });

  const requests = [];
  const scripts = [];
  // Every request is tagged with the consent phase it fired in: 'before' (clean
  // load, no consent) or 'after' (once we click "Accept"). Flips after the click.
  let phase = 'before';

  // Record every request the page initiates.
  context.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    const entry = {
      url,
      host: hostOf(url),
      method: req.method(),
      resourceType: req.resourceType(),
      phase,
    };
    requests.push(entry);
    if (req.resourceType() === 'script' && phase === 'before') scripts.push(url);
  });

  const page = await context.newPage();

  let loadError = null;
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout });
    // Give late-firing tags / pixels time to load, then settle.
    await page
      .waitForLoadState('networkidle', { timeout: 8000 })
      .catch(() => { /* networkidle is best-effort */ });
    await page.waitForTimeout(2500);
  } catch (err) {
    loadError = err.message;
  }

  // Cookies set before any consent interaction.
  const cookies = (await context.cookies()).map((c) => ({
    name: c.name,
    domain: c.domain,
    host: hostOf(c.domain),
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    session: c.expires === -1,
    firstParty: hostOf(c.domain).includes(baseHost) || baseHost.includes(hostOf(c.domain)),
  }));

  // Storage snapshot.
  const storage = await page
    .evaluate(() => {
      const dump = (s) => {
        const out = [];
        try {
          for (let i = 0; i < s.length; i++) {
            const key = s.key(i);
            out.push({ key, size: (s.getItem(key) || '').length });
          }
        } catch { /* storage may be blocked */ }
        return out;
      };
      return {
        local: dump(window.localStorage),
        session: dump(window.sessionStorage),
      };
    })
    .catch(() => ({ local: [], session: [] }));

  // Consent banner detection.
  const consent = await detectConsentBanner(page);

  // Privacy / cookie policy links.
  const policyLinks = await detectPolicyLinks(page);

  const title = await page.title().catch(() => '');

  // --- Consent interaction: try to click "Accept", then re-capture --------
  // Everything above is the pre-consent snapshot. Now flip to the 'after' phase
  // and see what additionally loads once a visitor accepts.
  const accept = await clickAcceptButton(page);
  let cookiesAfter = cookies;
  if (accept.clicked) {
    phase = 'after';
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    try {
      cookiesAfter = (await context.cookies()).map((c) => ({
        name: c.name,
        domain: c.domain,
        host: hostOf(c.domain),
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
        session: c.expires === -1,
        firstParty: hostOf(c.domain).includes(baseHost) || baseHost.includes(hostOf(c.domain)),
      }));
    } catch { /* keep pre-consent cookies on failure */ }
  }

  await browser.close();

  return {
    target: targetUrl,
    baseHost,
    title,
    loadError,
    requests,
    scripts: [...new Set(scripts)],
    cookies,
    cookiesAfter,
    storage,
    consent: { ...consent, accepted: accept.clicked, acceptMatchedBy: accept.matchedBy },
    policyLinks,
  };
}

// Known CMP "accept all" buttons + generic accept-button text. Best-effort — a
// site with no clickable accept simply reports consent as not accepted.
const ACCEPT_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '.cky-btn-accept',
  '#cookiescript_accept',
  '.osano-cm-accept-all',
  '#hs-eu-confirmation-button',
  '[aria-label*="accept all" i]',
  '[aria-label*="accept cookies" i]',
];

const ACCEPT_TEXT = [
  /^accept all( cookies)?$/i,
  /^allow all( cookies)?$/i,
  /^i (accept|agree)$/i,
  /^accept( cookies)?$/i,
  /^agree$/i,
  /^got it$/i,
];

/** Try to click an "Accept" button in the consent banner. Returns {clicked, matchedBy}. */
async function clickAcceptButton(page) {
  for (const sel of ACCEPT_SELECTORS) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) && (await el.isVisible())) {
        await el.click({ timeout: 2000 });
        return { clicked: true, matchedBy: `selector:${sel}` };
      }
    } catch { /* try next */ }
  }
  for (const re of ACCEPT_TEXT) {
    try {
      const btn = page.getByRole('button', { name: re }).first();
      if ((await btn.count()) && (await btn.isVisible())) {
        await btn.click({ timeout: 2000 });
        return { clicked: true, matchedBy: `text:${re.source}` };
      }
    } catch { /* try next */ }
  }
  return { clicked: false, matchedBy: null };
}

/** Look for a consent banner via known CMP selectors and generic cookie text. */
async function detectConsentBanner(page) {
  return page
    .evaluate(
      ({ selectors, phrases }) => {
        const found = { present: false, matchedBy: null, snippet: null };

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            found.present = true;
            found.matchedBy = `selector:${sel}`;
            found.snippet = (el.innerText || '').trim().slice(0, 200);
            return found;
          }
        }

        const bodyText = (document.body?.innerText || '').toLowerCase();
        for (const phrase of phrases) {
          if (bodyText.includes(phrase)) {
            found.present = true;
            found.matchedBy = `text:"${phrase}"`;
            const idx = bodyText.indexOf(phrase);
            found.snippet = document.body.innerText
              .slice(Math.max(0, idx - 20), idx + 160)
              .trim();
            return found;
          }
        }
        return found;
      },
      { selectors: CONSENT_SELECTORS, phrases: CONSENT_TEXT },
    )
    .catch(() => ({ present: false, matchedBy: null, snippet: null }));
}

/** Find privacy-policy and cookie-policy links on the page. */
async function detectPolicyLinks(page) {
  return page
    .evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const match = (re) =>
        anchors
          .filter((a) => re.test(a.href) || re.test((a.textContent || '')))
          .map((a) => ({ text: (a.textContent || '').trim().slice(0, 60), href: a.href }))
          .filter((x, i, arr) => arr.findIndex((y) => y.href === x.href) === i)
          .slice(0, 5);

      return {
        privacy: match(/privacy/i),
        cookie: match(/cookie/i),
        terms: match(/terms|conditions/i),
      };
    })
    .catch(() => ({ privacy: [], cookie: [], terms: [] }));
}
