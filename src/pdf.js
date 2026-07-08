// Render the branded HTML report to a PDF buffer via headless Chromium.

import { chromium } from 'playwright';

/**
 * @param {string} html a full standalone HTML document (see report-html.js)
 * @returns {Promise<Buffer>} PDF bytes
 */
export async function renderPdf(html) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // Load the fully self-contained document; wait for webfonts to settle.
    await page.setContent(html, { waitUntil: 'networkidle' });
    const footer = `
      <div style="width:100%;font-size:8px;color:#9CA3AF;font-family:sans-serif;padding:0 14mm;display:flex;justify-content:space-between;">
        <span>efelle · Privacy Scan — not legal advice</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`;
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footer,
      margin: { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' },
    });
  } finally {
    await browser.close();
  }
}
