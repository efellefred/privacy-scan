#!/usr/bin/env node
// privacy-scan — CLI entry point.
// Usage: privacy-scan <domain> [--headed] [--timeout <ms>] [--out <dir>] [--json]

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { normalizeUrl, slugify, fileTimestamp } from '../src/utils.js';
import { scan } from '../src/scanner.js';
import { loadVendors, detectVendors } from '../src/vendors.js';
import { analyze } from '../src/analyzer.js';
import { buildReport } from '../src/report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(__dirname, '..', 'reports');

function parseArgs(argv) {
  const args = { _: [], headed: false, timeout: 30000, out: DEFAULT_OUT, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--headed': args.headed = true; break;
      case '--json': args.json = true; break;
      case '-h':
      case '--help': args.help = true; break;
      case '--timeout': args.timeout = parseInt(argv[++i], 10) || 30000; break;
      case '--out': args.out = resolve(argv[++i]); break;
      default:
        if (a.startsWith('-')) { console.error(`Unknown option: ${a}`); process.exit(2); }
        args._.push(a);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
privacy-scan — audit a website for third-party trackers and pre-consent cookies.

Usage:
  privacy-scan <domain> [options]

Arguments:
  <domain>            Domain or URL to scan (e.g. example.com or https://example.com)

Options:
  --headed           Run the browser with a visible window (default: headless)
  --timeout <ms>     Navigation timeout in milliseconds (default: 30000)
  --out <dir>        Output directory for reports (default: ./reports)
  --json             Also write a raw JSON capture alongside the markdown report
  -h, --help         Show this help

Examples:
  privacy-scan example.com
  privacy-scan https://shop.example.com --headed --json
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args._.length === 0) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  let target;
  try {
    target = normalizeUrl(args._[0]);
  } catch (err) {
    console.error(`✗ Invalid domain/URL: ${err.message}`);
    process.exit(2);
  }

  console.error(`▶ Scanning ${target} (clean session)…`);

  let capture;
  try {
    capture = await scan(target, { timeout: args.timeout, headless: !args.headed });
  } catch (err) {
    console.error(`✗ Scan failed: ${err.message}`);
    if (/Executable doesn't exist|Please run the following/.test(err.message)) {
      console.error('  Hint: install the browser with `npx playwright install chromium`.');
    }
    process.exit(1);
  }

  const vendors = await loadVendors();
  const detected = detectVendors(vendors, {
    requests: capture.requests,
    cookies: capture.cookies,
  });

  const analysis = analyze(capture, detected);
  const scannedAt = new Date().toISOString();
  const markdown = buildReport(analysis, {
    target,
    scannedAt,
    loadError: capture.loadError,
  });

  await mkdir(args.out, { recursive: true });
  const base = `${slugify(capture.baseHost)}_${fileTimestamp(new Date(scannedAt))}`;
  const mdPath = join(args.out, `${base}.md`);
  await writeFile(mdPath, markdown, 'utf8');

  if (args.json) {
    const jsonPath = join(args.out, `${base}.json`);
    await writeFile(jsonPath, JSON.stringify({ capture, analysis }, null, 2), 'utf8');
    console.error(`  JSON capture → ${jsonPath}`);
  }

  // Console summary.
  const r = analysis.risk;
  console.error('');
  console.error(`  Risk:              ${r.level} (score ${r.score})`);
  console.error(`  Vendors detected:  ${analysis.counts.vendors}`);
  console.error(`  3rd-party domains: ${analysis.counts.thirdPartyDomains}`);
  console.error(`  Cookies on load:   ${analysis.counts.cookies} (tracking: ${analysis.counts.trackingCookies})`);
  console.error(`  Tracking before consent: ${analysis.trackingBeforeConsent ? 'YES ⚠️' : 'no'}`);
  console.error(`  Consent banner:    ${analysis.consent.present ? 'present' : 'not detected'}`);
  console.error('');
  console.error(`✔ Report written → ${mdPath}`);
}

main().catch((err) => {
  console.error(`✗ Unexpected error: ${err.stack || err.message}`);
  process.exit(1);
});
