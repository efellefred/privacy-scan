// efelle Privacy Scan — web server.
// Serves the branded UI and exposes /api/scan (run a scan) and
// /api/report/:id.pdf (download the branded PDF).

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { normalizeUrl, hostOf, isIpAddress } from './src/utils.js';
import { scan } from './src/scanner.js';
import { loadVendors, detectVendors } from './src/vendors.js';
import { analyze } from './src/analyzer.js';
import { generateNarrative } from './src/narrative.js';
import { renderReportBody, REPORT_CSS } from './src/report-html.js';
import { renderPdf } from './src/pdf.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5273;

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(join(__dirname, 'public')));

// Serve the shared report stylesheet from the single source of truth.
app.get('/report.css', (_req, res) => {
  res.type('text/css').set('Cache-Control', 'no-cache').send(REPORT_CSS);
});

// --- In-memory result cache (for PDF generation) ---------------------------
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const results = new Map(); // id -> { data, expires }

function cacheResult(data) {
  const id = randomUUID();
  results.set(id, { data, expires: Date.now() + CACHE_TTL_MS });
  return id;
}
function getResult(id) {
  const hit = results.get(id);
  if (!hit) return null;
  if (Date.now() > hit.expires) { results.delete(id); return null; }
  return hit.data;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, hit] of results) if (now > hit.expires) results.delete(id);
}, 10 * 60 * 1000).unref();

// --- SSRF guard: refuse internal / non-public targets ----------------------
function isBlockedHost(host) {
  const h = hostOf(host);
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (isIpAddress(h)) {
    // Block loopback, private, and link-local IPv4 ranges + IPv6 locals.
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^169\.254\./.test(h) || h === '0.0.0.0') return true;
    if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  }
  return false;
}

// --- Run a scan ------------------------------------------------------------
let vendorsPromise = null;
const getVendors = () => (vendorsPromise ||= loadVendors());

app.post('/api/scan', async (req, res) => {
  const rawUrl = (req.body?.url || '').toString().trim();
  const company = (req.body?.company || '').toString().trim() || 'this client';

  let target;
  try {
    target = normalizeUrl(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Please enter a valid domain or URL.' });
  }

  const parsed = new URL(target);
  if (!/^https?:$/.test(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http and https URLs are supported.' });
  }
  if (isBlockedHost(parsed.hostname)) {
    return res.status(400).json({ error: 'Internal, loopback, and private-network hosts cannot be scanned.' });
  }

  try {
    const capture = await scan(target, { timeout: 30000, headless: true });
    const vendors = await getVendors();
    const detected = detectVendors(vendors, { requests: capture.requests, cookies: capture.cookies });
    const analysis = analyze(capture, detected);
    const narrative = await generateNarrative(company, analysis);

    const scannedAt = new Date().toISOString();
    const data = {
      company, url: target, baseHost: capture.baseHost, scannedAt,
      analysis, narrative, loadError: capture.loadError,
    };
    const id = cacheResult(data);

    res.json({
      id,
      company,
      url: target,
      baseHost: capture.baseHost,
      scannedAt,
      risk: analysis.risk,
      narrativeSource: narrative.source,
      reportBodyHtml: renderReportBody(data),
    });
  } catch (err) {
    console.error('Scan failed:', err);
    const hint = /Executable doesn't exist|Please run the following/.test(err.message)
      ? ' The browser is not installed — run `npx playwright install chromium`.'
      : '';
    res.status(502).json({ error: `Scan failed: ${err.message}.${hint}` });
  }
});

// --- Download the branded PDF ----------------------------------------------
app.get('/api/report/:id.pdf', async (req, res) => {
  const data = getResult(req.params.id);
  if (!data) return res.status(404).send('Report not found or expired. Please re-run the scan.');
  try {
    const pdf = await renderPdf(data);
    const slug = hostOf(data.baseHost).replace(/[^a-z0-9.-]/gi, '_');
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="privacy-scan-${slug}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('PDF generation failed:', err);
    res.status(500).send('PDF generation failed.');
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: !!process.env.ANTHROPIC_API_KEY }));

app.listen(PORT, () => {
  console.log(`efelle Privacy Scan running on http://localhost:${PORT}`);
  console.log(`  AI narrative: ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'disabled (set ANTHROPIC_API_KEY)'}`);
});
