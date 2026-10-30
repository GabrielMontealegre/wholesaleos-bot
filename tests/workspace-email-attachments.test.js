'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const { fixture } = require('./mailbox-attachments.test');
const { manifest } = require('../modules/email/attachment-manifest');
async function run() {
  const source = await fixture();
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  try {
    for (const width of [1366, 400, 412]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      const forbidden = [], errors = []; let reads = 0, badIdentity = false, override = null;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET' || url.origin !== 'https://fixture.test') { forbidden.push(req.method() + ' ' + url.origin); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin' } });
        if (url.pathname === '/api/gmail/messages') return route.fulfill({ json: { ok: true, messages: [source.metadata] } });
        if (url.pathname.startsWith('/api/gmail/message/')) { reads++; return route.fulfill({ json: { ...source.body, ...override, ...(badIdentity ? { subject: 'Changed metadata' } : {}) } }); }
        if (url.pathname.endsWith('/thread-replies/status')) return route.fulfill({ json: { enabled: false, configured: true } });
        if (url.pathname === '/app') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/workspace/index.html')) });
        assert(url.pathname.startsWith('/dashboard/') && !url.pathname.includes('..'));
        return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', url.pathname.slice('/dashboard/'.length))) });
      });
      await page.goto('https://fixture.test/app?preview=1&view=email'); await page.locator('.ws-mail-row').waitFor();
      assert.equal(reads, 0); assert.equal(await page.locator('.ws-mail-attachments').count(), 0);
      await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-attachments').waitFor();
      const section = page.getByRole('region', { name: 'Message attachments', exact: true });
      assert.equal(await section.locator('li').count(), 2); assert.equal(await section.locator('img,a,button').count(), 0, 'Metadata does not execute markup,link downloads or fake commands');
      assert((await section.innerText()).includes('<img src=x onerror=attack()>'));
      assert((await section.innerText()).includes('4 bytes'));
      assert(await section.evaluate(el => { const r = el.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth; }));
      if (process.env.WOS_ATTACHMENT_PROOF_DIR) { fs.mkdirSync(process.env.WOS_ATTACHMENT_PROOF_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.WOS_ATTACHMENT_PROOF_DIR, 'synthetic-attachments-' + width + '.png') }); }
      assert.equal(reads, 1);
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click(); assert.equal(await page.locator('.ws-mail-attachments').count(), 0);
      badIdentity = true; await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-body').waitFor();
      assert.equal(await page.locator('.ws-mail-attachments').count(), 0, 'Wrong identity cannot supply file metadata');
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click(); badIdentity = false;
      override = manifest([{ contentDisposition: 'attachment' }]);
      await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-attachments').waitFor();
      const unknown = await page.locator('.ws-mail-attachments').innerText();
      assert(unknown.includes('Name not recorded') && unknown.includes('Type not recorded') && unknown.includes('Size not recorded') && !unknown.includes('0 bytes'));
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click(); override = manifest([]);
      await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-body').waitFor();
      assert.equal(await page.locator('.ws-mail-attachments').count(), 0);
      assert.equal(reads, 4, 'Only explicit source opens fetch bodies');
      assert.deepEqual(forbidden, []); assert.deepEqual(errors, []); await page.close();
    }
    console.log('workspace-email-attachments:1366/400/412 explicit-reader metadata,escaped long filenames,no content/downloads/commands,contained shared badges,identity refusal and zero writes/external/errors passed');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
