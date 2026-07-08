// efelle Privacy Scan — front-end logic.

const $ = (id) => document.getElementById(id);
const form = $('scan-form');
const runBtn = $('run-btn');
const hero = $('hero');
const statusEl = $('status');
const statusText = $('status-text');
const errorBox = $('error-box');
const errorText = $('error-text');
const results = $('results');
const report = $('report');
const riskChip = $('risk-chip');
const resultsTarget = $('results-target');
const pdfBtn = $('pdf-btn');
const devPdfBtn = $('dev-pdf-btn');
const aiBadge = $('ai-badge');
const newScanBtn = $('new-scan-btn');

const RISK_COLORS = {
  Critical: { color: '#B91C1C', bg: '#FEECEC' },
  High: { color: '#C2410C', bg: '#FFF1E8' },
  Medium: { color: '#B45309', bg: '#FEF6E7' },
  Low: { color: '#047857', bg: '#EAF8F2' },
  Minimal: { color: '#4B5563', bg: '#F3F4F6' },
};

const PROGRESS = [
  'Loading the site in a clean browser session…',
  'Recording network requests and third-party domains…',
  'Capturing cookies and storage set before consent…',
  'Detecting tracking vendors and consent banners…',
  'Writing the client-ready review…',
];

let progressTimer = null;
function startProgress() {
  let i = 0;
  statusText.textContent = PROGRESS[0];
  progressTimer = setInterval(() => {
    i = Math.min(i + 1, PROGRESS.length - 1);
    statusText.textContent = PROGRESS[i];
  }, 6000);
}
function stopProgress() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = null;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('url').value.trim();
  const company = $('company').value.trim();
  if (!url) return;

  errorBox.hidden = true;
  results.hidden = true;
  statusEl.hidden = false;
  runBtn.disabled = true;
  runBtn.textContent = 'Scanning…';
  startProgress();

  try {
    const resp = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, company }),
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Scan failed.');
    renderResults(payload);
  } catch (err) {
    errorText.textContent = err.message;
    errorBox.hidden = false;
  } finally {
    stopProgress();
    statusEl.hidden = true;
    runBtn.disabled = false;
    runBtn.textContent = 'Run scan →';
  }
});

newScanBtn.addEventListener('click', () => {
  results.hidden = true;
  hero.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('url').focus();
});

function renderResults(payload) {
  report.innerHTML = payload.reportBodyHtml;

  const rc = RISK_COLORS[payload.risk.level] || RISK_COLORS.Minimal;
  riskChip.textContent = `${payload.risk.level} · ${payload.risk.score}`;
  riskChip.style.color = rc.color;
  riskChip.style.background = rc.bg;

  resultsTarget.textContent = payload.baseHost;
  pdfBtn.href = `/api/report/${payload.id}/report.pdf`;
  devPdfBtn.href = `/api/report/${payload.id}/dev.pdf`;
  aiBadge.hidden = payload.narrativeSource !== 'ai';

  hero.hidden = true;
  results.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
