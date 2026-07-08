# efelle · Privacy Scan

A branded web app (and CLI) that loads a website's homepage in a **clean,
cookie-less browser session** and audits it for third-party trackers, cookies
set before consent, consent-banner behavior, and privacy-policy hygiene — then
generates a **client-ready review and branded PDF**.

Built for [efelle creative](https://www.seattlewebdesign.com). Light theme,
DM Sans + Lora, `#F56300` accent — matching the efelle design system.

---

## Run it

```bash
npm install                 # installs deps + Chromium (via Playwright)
cp .env.example .env        # optional: add ANTHROPIC_API_KEY for AI narrative
npm start                   # → http://localhost:5273
```

Open the URL, enter a domain and client name, and click **Run scan**. Then
**Download branded PDF**.

The app runs **without** an API key — it falls back to a deterministic template
for the narrative. Set `ANTHROPIC_API_KEY` in `.env` to have Claude write the
client-facing prose (the "AI narrative" badge appears when it's active).

### Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Enables Claude-generated narrative | _(unset → template)_ |
| `PRIVACY_SCAN_MODEL` | Model for narrative generation | `claude-opus-4-8` |
| `PORT` | HTTP port | `5273` |

---

## What it captures

- All network requests + third-party domains
- JavaScript files loaded (first- and third-party)
- Cookies set **before** any consent interaction
- `localStorage` / `sessionStorage` entries
- Known tracking vendors (Google Analytics, GTM, Meta Pixel, LinkedIn Insight,
  Microsoft Clarity, Hotjar, HubSpot, CallRail, Intercom, Drift, YouTube,
  Vimeo, TikTok) — defined in [`data/vendors.json`](data/vendors.json)
- Whether a cookie consent banner appears
- Whether trackers load **before** consent
- Whether privacy-policy and cookie-policy links exist

## The report

Executive summary · **Quick findings for {client}** · Risk level · Technologies
detected · Third-party requests before consent · Cookies set before consent ·
Consent banner findings · Privacy policy findings · **What implementation would
look like** · **Simple client-facing version** · Recommended technical fixes ·
Legal disclaimer.

The **bolded** sections are written by Claude (or the fallback template) in a
client-facing voice; the rest are deterministic scan evidence.

---

## Architecture

```
server.js              Express: serves the UI + /api/scan + /api/report/:id.pdf
public/                Branded front-end (index.html, styles.css, app.js)
src/
  scanner.js           Playwright capture (requests, cookies, storage, banner, links)
  vendors.js           Vendor matching against data/vendors.json
  analyzer.js          Pure analysis + risk scoring
  narrative.js         Claude-generated prose (+ deterministic fallback)
  report-html.js       Branded HTML report (shared by screen + PDF) + REPORT_CSS
  pdf.js               HTML → PDF via headless Chromium
  utils.js             URL / domain / IP helpers
  report.js            Markdown report (used by the CLI)
data/vendors.json      Vendor detection database (extend to add vendors)
bin/privacy-scan.js    CLI: node bin/privacy-scan.js <domain> (Markdown output)
Dockerfile             Container image (Playwright base — Chromium preinstalled)
```

## Deploy

The `Dockerfile` is based on Microsoft's Playwright image (Chromium + system
libs preinstalled), so it runs anywhere that takes a container (Render,
Railway, Fly, Cloud Run):

```bash
docker build -t privacy-scan .
docker run -p 5273:5273 -e ANTHROPIC_API_KEY=sk-... privacy-scan
```

## CLI (bonus)

The original terminal tool still works and needs no API key (deterministic
Markdown report to `reports/`):

```bash
node bin/privacy-scan.js example.com --json
```

## Security note

`/api/scan` refuses internal, loopback, and private-network targets (a basic
SSRF guard). Scans run real headless Chromium against user-supplied public URLs —
deploy it somewhere you're comfortable making outbound requests from.

## Disclaimer

**Not legal advice.** This tool inspects front-end behavior on a single homepage
load and does not constitute a formal compliance assessment. See the disclaimer
at the bottom of every generated report.
