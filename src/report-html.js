// Branded HTML report. Renders the report body once; the same markup is used
// on-screen (styled via /report.css) and inside the PDF document (inline CSS).
// Class names are prefixed `ps-` so they never collide with the app shell.

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
    <div class="ps-brand"><span class="ps-brand-mark">efelle</span><span class="ps-brand-sep">·</span><span class="ps-brand-tool">Privacy Scan</span></div>
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
  push(`<footer class="ps-footer"><span class="ps-brand-mark">efelle</span> Privacy Scan · ${esc(dateStr)} · ${src}</footer>`);

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

/** CSS for the report body — single source, served at /report.css and inlined in the PDF. */
export const REPORT_CSS = `
.ps-report { max-width: 820px; margin: 0 auto; color: #0D1117; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; line-height: 1.6; }
.ps-report a { color: #C44D00; text-decoration: none; }
.ps-report a:hover { text-decoration: underline; }
.ps-report code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em; background: #F5F4F1; border: 1px solid #E8E5E0; border-radius: 4px; padding: 1px 5px; word-break: break-all; }
.ps-masthead { border-bottom: 3px solid #F56300; padding-bottom: 20px; margin-bottom: 8px; }
.ps-brand { display: flex; align-items: baseline; gap: 8px; margin-bottom: 14px; }
.ps-brand-mark { font-family: 'Lora', Georgia, serif; font-weight: 600; color: #F56300; }
.ps-brand-sep { color: #D1CCC5; }
.ps-brand-tool { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #9CA3AF; font-family: ui-monospace, monospace; }
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
.ps-disclaimer { font-size: 12.5px; color: #6B7280; background: #F5F4F1; border-radius: 8px; padding: 14px 16px; line-height: 1.55; }
.ps-footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #E8E5E0; font-size: 12px; color: #9CA3AF; }
@media (max-width: 560px) { .ps-meta { grid-template-columns: 1fr; } .ps-title { font-size: 24px; } }
`;

/** Full standalone HTML document for PDF rendering. */
export function renderReportDocument(data) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Privacy Scan — ${esc(data.company)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Lora:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { padding: 8px 4px; }
  ${REPORT_CSS}
</style></head>
<body><div class="ps-report">${renderReportBody(data)}</div></body></html>`;
}
