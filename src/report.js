// Markdown report generation. Consumes the analyzer output and produces a
// human-readable audit document.

const RISK_BADGE = {
  Critical: '🔴 Critical',
  High: '🟠 High',
  Medium: '🟡 Medium',
  Low: '🟢 Low',
  Minimal: '⚪ Minimal',
};

export function buildReport(analysis, meta = {}) {
  const {
    baseHost, counts, thirdPartyDomains, thirdPartyScripts, thirdPartyCookies,
    trackingCookies, detectedVendors, preConsentVendors, trackingBeforeConsent,
    consent, policyLinks, hasPrivacyPolicy, hasCookiePolicy, risk,
  } = analysis;

  const scannedAt = meta.scannedAt || new Date().toISOString();
  const target = meta.target || baseHost;

  const L = []; // lines
  const p = (s = '') => L.push(s);

  p(`# Privacy & Tracking Scan — ${baseHost}`);
  p();
  p(`**Target:** ${target}  `);
  p(`**Scanned:** ${scannedAt}  `);
  p(`**Session:** Clean browser context (no cookies, no prior consent)  `);
  p(`**Overall risk:** ${RISK_BADGE[risk.level] || risk.level} (score ${risk.score})`);
  p();
  if (meta.loadError) {
    p(`> ⚠️ The page reported a load issue during capture: \`${meta.loadError}\`. Results may be partial.`);
    p();
  }
  p('---');
  p();

  // --- Executive summary -----------------------------------------------------
  p('## Executive Summary');
  p();
  p(executiveSummary(analysis));
  p();

  // --- Risk level ------------------------------------------------------------
  p('## Risk Level');
  p();
  p(`**${RISK_BADGE[risk.level] || risk.level}** — weighted score **${risk.score}**.`);
  p();
  if (risk.factors.length) {
    p('Contributing factors:');
    p();
    p('| Points | Factor |');
    p('| ---: | --- |');
    for (const f of risk.factors) p(`| ${f.points} | ${escape(f.label)} |`);
  } else {
    p('No material privacy risk factors were detected on the homepage load.');
  }
  p();

  // --- Technologies detected -------------------------------------------------
  p('## Technologies Detected');
  p();
  if (detectedVendors.length === 0) {
    p('No known tracking or marketing vendors were detected.');
  } else {
    p('| Vendor | Category | Sets cookies | Loaded before consent |');
    p('| --- | --- | :---: | :---: |');
    for (const v of detectedVendors) {
      const pre = preConsentVendors.some((x) => x.id === v.id) ? '⚠️ Yes' : 'No';
      const ck = v.evidence.cookies.length > 0 ? 'Yes' : (v.setsCookies ? 'Possible' : 'No');
      p(`| ${escape(v.name)} | ${escape(v.category)} | ${ck} | ${pre} |`);
    }
    p();
    p('<details><summary>Evidence per vendor</summary>');
    p();
    for (const v of detectedVendors) {
      p(`**${escape(v.name)}**`);
      if (v.evidence.cookies.length) p(`- Cookies: ${v.evidence.cookies.map(code).join(', ')}`);
      if (v.evidence.requests.length) {
        p('- Requests:');
        for (const r of v.evidence.requests) p(`  - ${code(r)}`);
      }
      p();
    }
    p('</details>');
  }
  p();

  // --- Third-party requests before consent -----------------------------------
  p('## Third-Party Requests Before Consent');
  p();
  p(`Distinct third-party domains contacted on load: **${counts.thirdPartyDomains}** ` +
    `across **${counts.thirdPartyRequests}** requests (of ${counts.totalRequests} total).`);
  p();
  if (thirdPartyDomains.length) {
    p('| Third-party domain |');
    p('| --- |');
    for (const d of thirdPartyDomains) p(`| ${code(d)} |`);
  } else {
    p('No third-party domains were contacted.');
  }
  p();
  if (thirdPartyScripts.length) {
    p('<details><summary>Third-party JavaScript files loaded (' +
      thirdPartyScripts.length + ')</summary>');
    p();
    for (const s of thirdPartyScripts.slice(0, 60)) p(`- ${code(s)}`);
    if (thirdPartyScripts.length > 60) p(`- …and ${thirdPartyScripts.length - 60} more`);
    p();
    p('</details>');
    p();
  }

  // --- Cookies set before consent --------------------------------------------
  p('## Cookies Set Before Consent');
  p();
  p(`Total cookies on clean load: **${counts.cookies}** ` +
    `(third-party: ${counts.thirdPartyCookies}, known tracking: ${counts.trackingCookies}).`);
  p();
  if (counts.cookies > 0) {
    p('| Cookie | Domain | Party | Tracking | Flags |');
    p('| --- | --- | --- | :---: | --- |');
    const rows = [...trackingCookies, ...thirdPartyCookies.filter(
      (c) => !trackingCookies.includes(c))];
    const seen = new Set();
    for (const c of rows) {
      const key = `${c.name}@${c.domain}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isTracking = trackingCookies.includes(c) ? '⚠️' : '';
      const flags = [
        c.httpOnly ? 'HttpOnly' : null,
        c.secure ? 'Secure' : null,
        c.session ? 'Session' : 'Persistent',
      ].filter(Boolean).join(', ');
      p(`| ${code(c.name)} | ${code(c.domain)} | ${c.firstParty ? 'First' : 'Third'} | ${isTracking} | ${flags} |`);
    }
    if (rows.length === 0) {
      p('| _(only first-party, non-tracking cookies)_ | | | | |');
    }
  } else {
    p('No cookies were set before consent. ✅');
  }
  p();
  p(`Storage entries on load — localStorage: **${counts.localStorage}**, ` +
    `sessionStorage: **${counts.sessionStorage}**.`);
  p();

  // --- Consent banner findings -----------------------------------------------
  p('## Consent Banner Findings');
  p();
  if (consent.present) {
    p(`A consent banner **was detected** (matched by \`${consent.matchedBy}\`).`);
    if (consent.snippet) {
      p();
      p('> ' + escape(consent.snippet).replace(/\n+/g, ' '));
    }
    p();
    if (trackingBeforeConsent) {
      p('🔴 **However, tracking technologies loaded before the banner was actioned.** ' +
        'Under GDPR/ePrivacy, non-essential cookies and trackers must not fire until the ' +
        'user gives affirmative consent. A banner that is merely *displayed* while trackers ' +
        'already run does not constitute valid consent.');
    } else {
      p('🟢 No consent-requiring trackers were observed firing before the banner was actioned.');
    }
  } else {
    p('No consent banner was detected on the homepage.');
    if (trackingBeforeConsent) {
      p();
      p('🔴 **Trackers are loading with no consent mechanism present at all.**');
    }
  }
  p();

  // --- Privacy policy findings -----------------------------------------------
  p('## Privacy Policy Findings');
  p();
  p(`- Privacy policy link: ${hasPrivacyPolicy ? '✅ found' : '❌ not found'}`);
  p(`- Cookie policy link: ${hasCookiePolicy ? '✅ found' : '❌ not found'}`);
  p(`- Terms link: ${(policyLinks.terms || []).length ? '✅ found' : '❌ not found'}`);
  p();
  const linkList = (arr) =>
    arr.map((l) => `  - [${escape(l.text || l.href)}](${l.href})`).join('\n');
  if ((policyLinks.privacy || []).length) {
    p('Privacy policy links:');
    p(linkList(policyLinks.privacy));
  }
  if ((policyLinks.cookie || []).length) {
    p('Cookie policy links:');
    p(linkList(policyLinks.cookie));
  }
  p();

  // --- Recommended technical fixes -------------------------------------------
  p('## Recommended Technical Fixes');
  p();
  for (const rec of recommendations(analysis)) p(`- ${rec}`);
  p();

  // --- Legal disclaimer ------------------------------------------------------
  p('---');
  p();
  p('## Legal Disclaimer');
  p();
  p('> This report is generated by an automated tool that inspects front-end network ' +
    'activity, cookies, and page markup on a single homepage load. **It is not legal ' +
    'advice** and does not constitute a formal compliance assessment under the GDPR, ' +
    'ePrivacy Directive, CCPA/CPRA, or any other law or regulation. Automated detection ' +
    'can produce false positives and false negatives, cannot evaluate the legal basis or ' +
    'consent configuration behind a given technology, and does not review pages beyond the ' +
    'one scanned. Consult a qualified privacy professional or attorney before relying on ' +
    'these findings for compliance decisions.');
  p();

  return L.join('\n');
}

// --- helpers -----------------------------------------------------------------

function executiveSummary(a) {
  const parts = [];
  parts.push(
    `A clean-session scan of \`${a.baseHost}\` contacted **${a.counts.thirdPartyDomains} ` +
    `third-party domain(s)** and detected **${a.counts.vendors} known vendor(s)** ` +
    `before any consent was given.`,
  );
  if (a.trackingBeforeConsent) {
    parts.push(
      `**${a.preConsentVendors.length} consent-requiring tracker(s) fired before consent**, ` +
      `and **${a.counts.trackingCookies} tracking cookie(s)** were set on load — ` +
      `the primary driver of the ${a.risk.level.toLowerCase()} risk rating.`,
    );
  } else if (a.counts.vendors > 0) {
    parts.push('No consent-requiring trackers were observed firing before consent on load.');
  } else {
    parts.push('No tracking vendors were detected on the homepage.');
  }
  const gaps = [];
  if (!a.consent.present) gaps.push('no consent banner detected');
  if (!a.hasPrivacyPolicy) gaps.push('no privacy policy link');
  if (!a.hasCookiePolicy) gaps.push('no cookie policy link');
  if (gaps.length) parts.push(`Notable gaps: ${gaps.join(', ')}.`);
  return parts.join(' ');
}

function recommendations(a) {
  const recs = [];
  if (a.trackingBeforeConsent) {
    recs.push(
      '**Gate all non-essential tags behind consent.** Route Google Analytics, ad pixels, ' +
      'session-replay, and chat widgets through a Consent Management Platform so they only ' +
      'load *after* an affirmative opt-in (e.g. Google Consent Mode v2 in `denied` default state).',
    );
  }
  if (a.counts.trackingCookies > 0) {
    recs.push(
      'Ensure no tracking cookies (`_ga`, `_fbp`, `_hj*`, etc.) are written on initial page ' +
      'load; defer cookie-setting scripts until consent is recorded.',
    );
  }
  if (!a.consent.present) {
    recs.push(
      'Implement a compliant consent banner with equally-prominent “Accept” and “Reject” ' +
      'options and granular category controls.',
    );
  }
  if (a.consent.present && a.trackingBeforeConsent) {
    recs.push(
      'Reconfigure the existing consent banner so it *blocks* tags pre-consent rather than ' +
      'only displaying a notice — verify the CMP is set to “opt-in”, not “notice-only” mode.',
    );
  }
  if (!a.hasPrivacyPolicy) {
    recs.push('Add a clearly-labelled privacy policy link in the site footer on every page.');
  }
  if (!a.hasCookiePolicy && (a.counts.trackingCookies > 0 || a.trackingBeforeConsent)) {
    recs.push('Publish a cookie policy enumerating each cookie, its purpose, vendor, and lifespan.');
  }
  if (a.thirdPartyScripts.length > 0) {
    recs.push(
      'Self-host or subresource-integrity-pin critical third-party scripts where possible, ' +
      'and load embeds (YouTube/Vimeo) via privacy-enhanced/`no-cookie` or click-to-load facades.',
    );
  }
  if (a.counts.thirdPartyDomains > 10) {
    recs.push(
      'Audit and reduce the third-party request surface; each additional vendor expands the ' +
      'data-sharing footprint that must be disclosed and justified.',
    );
  }
  recs.push(
    'Add a `Content-Security-Policy` to constrain which third-party origins can execute or ' +
    'connect, limiting unexpected tracker injection.',
  );
  if (recs.length === 1) {
    recs.unshift('No high-priority technical fixes were identified from this homepage scan. ' +
      'Maintain current consent gating and periodically re-scan.');
  }
  return recs;
}

const escape = (s = '') => String(s).replace(/\|/g, '\\|');
const code = (s = '') => '`' + String(s).replace(/`/g, '') + '`';
