// Branded HTML report. Renders the report body once; the same markup is used
// on-screen (styled via /report.css) and inside the PDF document (inline CSS).
// Class names are prefixed `ps-` so they never collide with the app shell.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Embed the round efelle logo as a data URI so it renders identically in the
// on-screen report and inside the PDF (which has no base URL for relative paths).
const __dirname = dirname(fileURLToPath(import.meta.url));
let LOGO_DATA_URI = '';
try {
  const png = readFileSync(join(__dirname, '..', 'public', 'efelle-logo.png'));
  LOGO_DATA_URI = `data:image/png;base64,${png.toString('base64')}`;
} catch { /* logo optional */ }

const brandMark = (size = 26) =>
  LOGO_DATA_URI
    ? `<img class="ps-brand-logo" src="${LOGO_DATA_URI}" alt="efelle" width="${size}" height="${size}" />`
    : `<span class="ps-brand-mark">efelle</span>`;

const RISK_META = {
  Critical: { label: 'Critical', color: '#EF4444', bg: '#FEECEC' },
  High: { label: 'High', color: '#F97316', bg: '#FFF1E8' },
  Medium: { label: 'Medium', color: '#F59E0B', bg: '#FEF6E7' },
  Low: { label: 'Low', color: '#10B981', bg: '#EAF8F2' },
  Minimal: { label: 'Minimal', color: '#6B7280', bg: '#F3F4F6' },
};

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const codeSpan = (s = '') => `<code>${esc(String(s).replace(/`/g, ''))}</code>`;

/**
 * Render the report body (masthead + all sections).
 * @param {object} data { company, url, baseHost, scannedAt, analysis, narrative, loadError }
 */
export function renderReportBody(data) {
  const { company, url, baseHost, scannedAt, analysis, narrative } = data;
  const risk = analysis.risk;
  const rm = RISK_META[risk.level] || RISK_META.Minimal;
  const dateStr = new Date(scannedAt).toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const S = []; // section html
  const push = (h) => S.push(h);

  // --- Masthead ---
  push(`
  <header class="ps-masthead">
    <div class="ps-brand">${brandMark(30)}<span class="ps-brand-tool">Privacy Scan</span></div>
    <h1 class="ps-title">Website Privacy &amp; Tracking Review</h1>
    <p class="ps-subtitle">Prepared for <strong>${esc(company)}</strong></p>
    <div class="ps-meta">
      <div><span class="ps-meta-k">Website</span><a href="${esc(url)}">${esc(baseHost)}</a></div>
      <div><span class="ps-meta-k">Scanned</span>${esc(dateStr)}</div>
      <div><span class="ps-meta-k">Session</span>Clean browser, no prior consent</div>
      <div><span class="ps-meta-k">Overall risk</span>
        <span class="ps-pill" style="color:${rm.color};background:${rm.bg}">${rm.label} · ${risk.score}</span>
      </div>
    </div>
  </header>`);

  if (data.loadError) {
    push(`<p class="ps-note">⚠ The page reported a load issue during capture: ${codeSpan(data.loadError)}. Results may be partial.</p>`);
  }

  // --- Scope callout ---
  push(`<div class="ps-scope">
    <p class="ps-scope-lead">This is a privacy/consent tool — it addresses the technical evidence behind:</p>
    <ul class="ps-scope-list">
      <li><strong>GDPR + ePrivacy Directive</strong> (EU/UK “cookie law”) — the core check: are trackers/cookies firing before consent, is there a consent banner, is it opt-in vs. notice-only.</li>
      <li><strong>CCPA/CPRA</strong> (California) — third-party data sharing, “Do Not Sell/Share,” privacy-policy disclosures.</li>
      <li>General privacy-policy / cookie-policy hygiene.</li>
    </ul>
  </div>`);

  // --- Executive summary ---
  push(section('Executive summary', `<p>${esc(narrative.executiveSummary)}</p>`));

  // --- Quick findings ---
  push(section(
    `Quick findings for ${esc(company)}`,
    `<ul class="ps-bullets">${narrative.quickFindings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`,
  ));

  // --- Risk level + factors ---
  let riskBody = `<p><span class="ps-pill" style="color:${rm.color};background:${rm.bg}">${rm.label}</span> — weighted score <strong>${risk.score}</strong>.</p>`;
  if (risk.factors.length) {
    riskBody += `<table class="ps-table"><thead><tr><th style="width:64px;text-align:right">Points</th><th>Factor</th></tr></thead><tbody>${
      risk.factors.map((f) => `<tr><td style="text-align:right">${f.points}</td><td>${esc(f.label)}</td></tr>`).join('')
    }</tbody></table>`;
  }
  push(section('Risk level', riskBody));

  // --- Technologies detected ---
  let techBody;
  if (analysis.detectedVendors.length === 0) {
    techBody = '<p>No known tracking or marketing vendors were detected.</p>';
  } else {
    techBody = `<table class="ps-table"><thead><tr><th>Vendor</th><th>Category</th><th style="text-align:center">Before consent</th></tr></thead><tbody>${
      analysis.detectedVendors.map((v) => {
        const pre = analysis.preConsentVendors.some((x) => x.id === v.id);
        return `<tr><td><strong>${esc(v.name)}</strong></td><td>${esc(v.category)}</td><td style="text-align:center">${pre ? '<span class="ps-flag">⚠ Yes</span>' : 'No'}</td></tr>`;
      }).join('')
    }</tbody></table>`;
  }
  push(section('Technologies detected', techBody));

  // --- Third-party requests before consent ---
  let tpBody = `<p>The homepage contacted <strong>${analysis.counts.thirdPartyDomains}</strong> distinct third-party domain(s) across <strong>${analysis.counts.thirdPartyRequests}</strong> requests before any consent was given.</p>`;
  if (analysis.thirdPartyDomains.length) {
    tpBody += `<div class="ps-chips">${analysis.thirdPartyDomains.map((d) => `<span class="ps-chip">${esc(d)}</span>`).join('')}</div>`;
  }
  push(section('Third-party requests before consent', tpBody));

  // --- Cookies set before consent ---
  let ckBody = `<p>Total cookies on a clean load: <strong>${analysis.counts.cookies}</strong> (known tracking: ${analysis.counts.trackingCookies}, third-party: ${analysis.counts.thirdPartyCookies}). Storage entries — localStorage: ${analysis.counts.localStorage}, sessionStorage: ${analysis.counts.sessionStorage}.</p>`;
  const cookieRows = dedupeCookies([...analysis.trackingCookies, ...analysis.thirdPartyCookies]);
  if (cookieRows.length) {
    ckBody += `<table class="ps-table"><thead><tr><th>Cookie</th><th>Domain</th><th>Party</th><th style="text-align:center">Tracking</th></tr></thead><tbody>${
      cookieRows.map((c) => {
        const isTracking = analysis.trackingCookies.some((t) => t.name === c.name && t.domain === c.domain);
        return `<tr><td>${codeSpan(c.name)}</td><td>${codeSpan(c.domain)}</td><td>${c.firstParty ? 'First' : 'Third'}</td><td style="text-align:center">${isTracking ? '<span class="ps-flag">⚠</span>' : ''}</td></tr>`;
      }).join('')
    }</tbody></table>`;
  } else if (analysis.counts.cookies === 0) {
    ckBody += '<p class="ps-ok">No cookies were set before consent. ✓</p>';
  }
  push(section('Cookies set before consent', ckBody));

  // --- Consent banner ---
  let consentBody;
  if (analysis.consent.present) {
    consentBody = `<p>A consent banner <strong>was detected</strong> (matched by ${codeSpan(analysis.consent.matchedBy)}).</p>`;
    if (analysis.consent.snippet) consentBody += `<blockquote class="ps-quote">${esc(analysis.consent.snippet.replace(/\s+/g, ' '))}</blockquote>`;
    consentBody += analysis.trackingBeforeConsent
      ? '<p class="ps-danger">However, tracking technologies loaded before the banner was actioned. A banner that is merely displayed while trackers already run does not constitute valid prior consent.</p>'
      : '<p class="ps-ok">No consent-requiring trackers were observed firing before the banner was actioned. ✓</p>';
  } else {
    consentBody = '<p>No cookie consent banner was detected in the crawlable homepage content. This does not prove there is no banner, but it matches a "no prior consent" posture.</p>';
    if (analysis.trackingBeforeConsent) consentBody += '<p class="ps-danger">Trackers are loading with no consent mechanism detected at all.</p>';
  }
  push(section('Consent banner findings', consentBody));

  // --- Before vs after consent (only when a banner was present) ---
  if (analysis.consentDelta && (analysis.consent.present || analysis.consentDelta.accepted)) {
    push(section('Before vs after consent', renderConsentDelta(analysis)));
  }

  // --- Privacy policy ---
  const links = analysis.policyLinks;
  let ppBody = `<ul class="ps-checks">
    <li>${analysis.hasPrivacyPolicy ? '✓' : '✗'} Privacy Policy link ${analysis.hasPrivacyPolicy ? 'found' : 'not found'}</li>
    <li>${analysis.hasCookiePolicy ? '✓' : '✗'} Cookie Policy link ${analysis.hasCookiePolicy ? 'found' : 'not found'}</li>
    <li>${(links.terms || []).length ? '✓' : '✗'} Terms link ${(links.terms || []).length ? 'found' : 'not found'}</li>
  </ul>`;
  const linkList = (arr) => arr.map((l) => `<li><a href="${esc(l.href)}">${esc(l.text || l.href)}</a></li>`).join('');
  if ((links.privacy || []).length) ppBody += `<p class="ps-small">Privacy links:</p><ul class="ps-links">${linkList(links.privacy)}</ul>`;
  if ((links.cookie || []).length) ppBody += `<p class="ps-small">Cookie links:</p><ul class="ps-links">${linkList(links.cookie)}</ul>`;
  push(section('Privacy policy findings', ppBody));

  // --- What implementation would look like (AI) ---
  push(section(
    'What implementation would look like',
    `<ol class="ps-steps">${narrative.implementationSteps.map((s) => `<li><span class="ps-step-title">${esc(s.title)}</span><span class="ps-step-detail">${esc(s.detail)}</span></li>`).join('')}</ol>`,
  ));

  // --- Simple client-facing version (AI) ---
  push(section(
    'Simple client-facing version',
    `<blockquote class="ps-quote ps-quote-lead">${esc(narrative.clientFacingSummary)}</blockquote>`,
  ));

  // --- Recommended technical fixes (deterministic) ---
  push(section(
    'Recommended technical fixes',
    `<ul class="ps-bullets">${technicalFixes(analysis).map((r) => `<li>${r}</li>`).join('')}</ul>`,
  ));

  // --- Legal disclaimer ---
  push(section(
    'Legal disclaimer',
    `<p class="ps-disclaimer">This report is generated by an automated tool that inspects front-end network activity, cookies, and page markup on a single homepage load. <strong>It is not legal advice</strong> and does not constitute a formal compliance assessment under the GDPR, ePrivacy Directive, CCPA/CPRA, or any other law. Automated detection can produce false positives and negatives, cannot evaluate the legal basis behind a technology, and does not review pages beyond the one scanned. Consult a qualified privacy professional or attorney before relying on these findings for compliance decisions.</p>`,
  ));

  // --- Footer ---
  const src = narrative.source === 'ai'
    ? `Narrative generated by ${esc(narrative.model || 'Claude')}.`
    : 'Narrative generated by the built-in template (no AI key configured).';
  push(`<footer class="ps-footer">${brandMark(16)} Privacy Scan · ${esc(dateStr)} · ${src}</footer>`);

  return S.join('\n');
}

function section(title, bodyHtml) {
  return `<section class="ps-section"><h2 class="ps-h2">${esc(title)}</h2>${bodyHtml}</section>`;
}

function dedupeCookies(cookies) {
  const seen = new Set();
  const out = [];
  for (const c of cookies) {
    const key = `${c.name}@${c.domain}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, 40);
}

function technicalFixes(a) {
  const recs = [];
  if (a.trackingBeforeConsent) {
    recs.push('Gate all non-essential tags behind consent — route analytics, ad pixels, session-replay, chat, and embeds through a CMP that defaults to <code>denied</code> (e.g. Google Consent Mode v2).');
  }
  if (a.counts.trackingCookies > 0) {
    recs.push('Ensure no tracking cookies (<code>_ga</code>, <code>_fbp</code>, <code>_hj*</code>, etc.) are written on initial load; defer cookie-setting scripts until consent is recorded.');
  }
  if (!a.consent.present) recs.push('Implement a compliant consent banner with equally-prominent Accept and Reject options and granular category controls.');
  if (a.consent.present && a.trackingBeforeConsent) recs.push('Reconfigure the CMP to <em>block</em> tags pre-consent rather than only display a notice — verify it is in opt-in, not notice-only, mode.');
  if (!a.hasPrivacyPolicy) recs.push('Add a clearly-labelled Privacy Policy link in the site footer on every page.');
  if (!a.hasCookiePolicy && (a.counts.trackingCookies > 0 || a.trackingBeforeConsent)) recs.push('Publish a Cookie Policy enumerating each cookie, its purpose, vendor, and lifespan.');
  if (a.thirdPartyScripts.length > 0) recs.push('Load embeds (YouTube/Vimeo) via privacy-enhanced <code>no-cookie</code> or click-to-load facades, and subresource-integrity-pin critical third-party scripts.');
  if (a.counts.thirdPartyDomains > 10) recs.push(`Audit and reduce the third-party request surface (currently ${a.counts.thirdPartyDomains} domains) — each vendor expands the data-sharing footprint that must be disclosed.`);
  recs.push('Add a <code>Content-Security-Policy</code> to constrain which third-party origins can execute or connect.');
  if (recs.length === 1) recs.unshift('No high-priority technical fixes were identified from this homepage scan. Maintain current consent gating and re-scan periodically.');
  return recs;
}

/** "Before vs after consent" section body. */
function renderConsentDelta(a) {
  const d = a.consentDelta;
  if (!d.accepted) {
    return '<p>A consent banner was detected, but no “Accept” control could be clicked automatically, so an automated before/after comparison isn’t available for this site. A manual check is recommended.</p>';
  }
  const parts = [];
  parts.push(`<p>We clicked the banner’s <strong>Accept</strong> control (${codeSpan(d.acceptMatchedBy || 'accept')}) and re-scanned. After acceptance:</p>`);
  parts.push(`<ul class="ps-bullets">
    <li><strong>${d.newThirdPartyDomains.length}</strong> new third-party domain(s) contacted</li>
    <li><strong>${d.newCookies.length}</strong> new cookie(s) set</li>
    <li><strong>${d.newVendors.length}</strong> new tracking vendor(s): ${d.newVendors.length ? esc(d.newVendors.join(', ')) : '—'}</li>
  </ul>`);
  let verdict;
  if (a.trackingBeforeConsent && d.newVendors.length) {
    verdict = '<p class="ps-danger">Trackers fired <strong>both before and after</strong> consent. The pre-consent activity is the compliance problem; the post-consent additions show more tags waiting behind the banner.</p>';
  } else if (a.trackingBeforeConsent) {
    verdict = '<p class="ps-danger">The trackers were already active <strong>before</strong> consent — accepting added little because they had already loaded. Pre-consent firing is the core issue to fix.</p>';
  } else if (d.newVendors.length) {
    verdict = '<p class="ps-ok">Consent-requiring trackers loaded <strong>only after</strong> acceptance — the correct opt-in gating behavior. ✓</p>';
  } else {
    verdict = '<p>No additional tracking vendors were observed after acceptance.</p>';
  }
  parts.push(verdict);
  if (d.newThirdPartyDomains.length) {
    parts.push(`<div class="ps-chips">${d.newThirdPartyDomains.map((x) => `<span class="ps-chip">${esc(x)}</span>`).join('')}</div>`);
  }
  return parts.join('');
}

// --- Developer implementation guide (second PDF) ---------------------------

// How to gate each vendor category behind consent.
const GATING = {
  Analytics: 'Load only after the visitor grants analytics consent (or use Google Consent Mode v2 with analytics_storage denied by default).',
  'Tag Manager': 'Do not let GTM fire tags pre-consent — implement Consent Mode v2 (all storage denied by default) and set tag triggers to require consent.',
  Advertising: 'Load only after marketing consent. Pixels must not fire on initial page load.',
  'Session Replay': 'Load only after analytics/functional consent — session replay records user interaction and needs explicit opt-in.',
  Hotjar: 'Load only after analytics consent.',
  'Live Chat': 'Load on user intent or after functional consent; if you treat chat as essential, document that basis in the cookie policy.',
  'Video / Social': 'Replace direct embeds with a click-to-load facade, or use the privacy-enhanced no-cookie domain (youtube-nocookie.com), so nothing loads until the user clicks play/accept.',
  'Call Tracking': 'Load only after marketing consent; dynamic number insertion sets identifiers that require opt-in.',
  'Marketing / CRM': 'Load only after marketing consent.',
};
const gatingFor = (cat) => GATING[cat] || 'Load only after the relevant consent category is granted.';

/** Build a starter CSP from observed third-party domains. */
function starterCsp(domains) {
  const origins = domains.slice(0, 20).map((d) => `https://${d}`).join(' ');
  return [
    "default-src 'self';",
    `script-src 'self' ${origins};`,
    `connect-src 'self' ${origins};`,
    `frame-src 'self' ${origins};`,
    "img-src 'self' data: https:;",
  ].join('\n');
}

/** Developer-facing implementation guide body (technical, actionable). */
export function renderDevReportBody(data) {
  const { company, url, baseHost, scannedAt, analysis } = data;
  const rm = RISK_META[analysis.risk.level] || RISK_META.Minimal;
  const dateStr = new Date(scannedAt).toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const S = [];
  const p = (h) => S.push(h);

  p(`
  <header class="ps-masthead">
    <div class="ps-brand">${brandMark(30)}<span class="ps-brand-tool">Privacy Scan · Developer Guide</span></div>
    <h1 class="ps-title">Developer Implementation Guide</h1>
    <p class="ps-subtitle">Consent-gating fixes for <strong>${esc(company)}</strong> — ${esc(baseHost)}</p>
    <div class="ps-meta">
      <div><span class="ps-meta-k">Website</span><a href="${esc(url)}">${esc(baseHost)}</a></div>
      <div><span class="ps-meta-k">Scanned</span>${esc(dateStr)}</div>
      <div><span class="ps-meta-k">Current risk</span><span class="ps-pill" style="color:${rm.color};background:${rm.bg}">${rm.label} · ${analysis.risk.score}</span></div>
      <div><span class="ps-meta-k">Goal</span>No non-essential tags fire before consent</div>
    </div>
  </header>`);

  // Priority tasks
  p(section('Priority fixes', `<ol class="ps-steps">${technicalFixes(analysis).map((r) => `<li><span class="ps-step-detail">${r}</span></li>`).join('')}</ol>`));

  // Tags to gate
  if (analysis.detectedVendors.length) {
    p(section('Tags & vendors to gate', `<table class="ps-table"><thead><tr><th>Vendor</th><th>Category</th><th>How to gate</th></tr></thead><tbody>${
      analysis.detectedVendors.map((v) => `<tr><td><strong>${esc(v.name)}</strong></td><td>${esc(v.category)}</td><td>${esc(gatingFor(v.category))}</td></tr>`).join('')
    }</tbody></table>`));
  }

  // Cookies to defer
  if (analysis.trackingCookies.length) {
    p(section('Cookies to defer until consent', `<table class="ps-table"><thead><tr><th>Cookie</th><th>Domain</th></tr></thead><tbody>${
      analysis.trackingCookies.slice(0, 40).map((c) => `<tr><td>${codeSpan(c.name)}</td><td>${codeSpan(c.domain)}</td></tr>`).join('')
    }</tbody></table><p class="ps-small">None of these should be written on initial load.</p>`));
  }

  // CMP setup
  p(section('Consent management platform (CMP) setup', `<ol class="ps-steps">
    <li><span class="ps-step-title">Install a CMP</span><span class="ps-step-detail">CookieYes or Termly. Configure for <strong>prior consent</strong>, not notice-only.</span></li>
    <li><span class="ps-step-title">Default all non-essential storage to denied</span><span class="ps-step-detail">Enable Google Consent Mode v2 with <code>analytics_storage</code>, <code>ad_storage</code>, <code>ad_user_data</code>, <code>ad_personalization</code> = <code>denied</code> by default.</span></li>
    <li><span class="ps-step-title">Categorize every tag</span><span class="ps-step-detail">Map each vendor above to a consent category (necessary / analytics / marketing / functional) and block it until its category is granted.</span></li>
    <li><span class="ps-step-title">Equal Accept / Reject</span><span class="ps-step-detail">Reject must be as easy as Accept; no pre-ticked boxes.</span></li>
  </ol>`));

  // Video embeds
  if (analysis.detectedVendors.some((v) => v.category.includes('Video'))) {
    p(section('Video embeds', '<p>Replace direct YouTube/Vimeo iframes with a click-to-load facade (e.g. <code>lite-youtube-embed</code>) or the <code>youtube-nocookie.com</code> domain so no request fires until the user clicks play.</p>'));
  }

  // CSP
  if (analysis.thirdPartyDomains.length) {
    p(section('Starter Content-Security-Policy', `<p>A baseline to constrain third-party origins (observed on this page — refine before enforcing; test with <code>Content-Security-Policy-Report-Only</code> first):</p><pre class="ps-pre">${esc(starterCsp(analysis.thirdPartyDomains))}</pre>`));
  }

  // Acceptance criteria
  p(section('Verification / acceptance criteria', `<ul class="ps-checks">
    <li>☐ Re-run this scan — <strong>0</strong> consent-requiring trackers fire before consent</li>
    <li>☐ No <code>_ga</code> / <code>_fbp</code> / <code>_hj*</code> / vendor cookies set on initial load</li>
    <li>☐ Trackers appear only after clicking Accept</li>
    <li>☐ Reject leaves the site tracker-free</li>
    <li>☐ Privacy Policy and Cookie Policy linked in the footer sitewide</li>
  </ul>`));

  p(section('Note', '<p class="ps-disclaimer">This guide is generated from an automated scan of a single homepage load and lists technical remediation steps only. It is not legal advice and is not a formal compliance assessment. Validate consent categorization and legal basis with a qualified privacy professional.</p>'));

  p(`<footer class="ps-footer">${brandMark(16)} Privacy Scan · Developer Guide · ${esc(dateStr)}</footer>`);
  return S.join('\n');
}

/** CSS for the report body — single source, served at /report.css and inlined in the PDF. */
export const REPORT_CSS = `
.ps-report { max-width: 820px; margin: 0 auto; color: #0D1117; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; }
.ps-report a { color: #C44D00; text-decoration: none; }
.ps-report a:hover { text-decoration: underline; }
.ps-report code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em; background: #F5F4F1; border: 1px solid #E8E5E0; border-radius: 4px; padding: 1px 5px; word-break: break-all; }
.ps-masthead { border-bottom: 3px solid #F56300; padding-bottom: 20px; margin-bottom: 8px; }
.ps-brand { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
.ps-brand-mark { font-family: 'Lora', Georgia, serif; font-weight: 600; color: #F56300; }
.ps-brand-logo { display: inline-block; border-radius: 50%; vertical-align: middle; }
.ps-brand-tool { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #9CA3AF; font-family: ui-monospace, monospace; }
.ps-pre { background: #0D1117; color: #E8E5E0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.5; padding: 14px 16px; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 12px; }
.ps-title { font-family: 'Lora', Georgia, serif; font-size: 30px; font-weight: 600; line-height: 1.15; margin: 0 0 6px; }
.ps-subtitle { color: #4B5563; margin: 0 0 18px; font-size: 16px; }
.ps-meta { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px 24px; }
.ps-meta > div { font-size: 14px; }
.ps-meta-k { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #9CA3AF; margin-bottom: 2px; font-family: ui-monospace, monospace; }
.ps-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 600; font-size: 13px; }
.ps-section { margin-top: 30px; page-break-inside: avoid; }
.ps-h2 { font-family: 'Lora', Georgia, serif; font-size: 20px; font-weight: 600; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid #E8E5E0; }
.ps-report p { margin: 0 0 12px; }
.ps-bullets, .ps-checks, .ps-links { margin: 0 0 12px; padding-left: 22px; }
.ps-bullets li, .ps-checks li { margin-bottom: 7px; }
.ps-checks { list-style: none; padding-left: 0; }
.ps-links { list-style: none; padding-left: 0; }
.ps-links li { margin-bottom: 4px; font-size: 14px; }
.ps-small { font-size: 12px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
.ps-table { width: 100%; border-collapse: collapse; margin: 4px 0 14px; font-size: 14px; }
.ps-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #9CA3AF; border-bottom: 2px solid #E8E5E0; padding: 6px 10px; font-weight: 600; }
.ps-table td { border-bottom: 1px solid #F0EEE9; padding: 7px 10px; vertical-align: top; }
.ps-flag { color: #C44D00; font-weight: 600; }
.ps-chips, .ps-report .ps-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ps-chip { display: inline-block; background: #F5F4F1; border: 1px solid #E8E5E0; border-radius: 6px; padding: 3px 9px; font-size: 12.5px; font-family: ui-monospace, monospace; color: #4B5563; }
.ps-quote { border-left: 3px solid #F56300; background: #FFF5EE; margin: 0 0 12px; padding: 12px 16px; border-radius: 0 8px 8px 0; color: #4B5563; }
.ps-quote-lead { font-size: 15.5px; color: #0D1117; }
.ps-steps { counter-reset: step; list-style: none; padding-left: 0; margin: 0; }
.ps-steps li { position: relative; padding: 0 0 16px 44px; }
.ps-steps li::before { counter-increment: step; content: counter(step); position: absolute; left: 0; top: 0; width: 28px; height: 28px; background: #F56300; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
.ps-step-title { display: block; font-weight: 600; margin-bottom: 2px; }
.ps-step-detail { display: block; color: #4B5563; font-size: 14px; }
.ps-ok { color: #10B981; font-weight: 500; }
.ps-danger { color: #EF4444; font-weight: 500; }
.ps-note { background: #FEF6E7; border: 1px solid #F59E0B33; border-radius: 8px; padding: 10px 14px; font-size: 14px; }
.ps-scope { background: #FFF5EE; border: 1px solid #F5630022; border-left: 3px solid #F56300; border-radius: 0 8px 8px 0; padding: 14px 16px; margin-top: 18px; }
.ps-scope-lead { font-weight: 600; margin: 0 0 8px; }
.ps-scope-list { margin: 0; padding-left: 20px; }
.ps-scope-list li { margin-bottom: 6px; font-size: 14px; color: #4B5563; }
.ps-scope-list strong { color: #0D1117; }
.ps-disclaimer { font-size: 12.5px; color: #6B7280; background: #F5F4F1; border-radius: 8px; padding: 14px 16px; line-height: 1.55; }
.ps-footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #E8E5E0; font-size: 12px; color: #9CA3AF; }
@media (max-width: 560px) { .ps-meta { grid-template-columns: 1fr; } .ps-title { font-size: 24px; } }
`;

/** Wrap report-body HTML in a full standalone document for PDF rendering. */
function wrapDocument(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Lora:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { padding: 8px 4px; }
  ${REPORT_CSS}
</style></head>
<body><div class="ps-report">${bodyHtml}</div></body></html>`;
}

/** Full standalone HTML document for the client report PDF. */
export function renderReportDocument(data) {
  return wrapDocument(`Privacy Scan — ${data.company}`, renderReportBody(data));
}

/** Full standalone HTML document for the developer implementation guide PDF. */
export function renderDevReportDocument(data) {
  return wrapDocument(`Developer Guide — ${data.company}`, renderDevReportBody(data));
}
