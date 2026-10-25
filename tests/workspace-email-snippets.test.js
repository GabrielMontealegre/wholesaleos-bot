'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const { fixture } = require('./mailbox-snippets.test');
async function run() {
  const source = await fixture();
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  try {
    for (const width of [1366, 400, 412]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      const forbidden = [], errors = []; let metadataReads = 0, bodyReads = 0, unauthorized = false, wrongIdentity = false, held = null, hold = false, signalHeld;
      const bodyHeld = new Promise(resolve => { signalHeld = resolve; });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET' || url.origin !== 'https://fixture.test') { forbidden.push(req.method() + ' ' + url.origin); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin' } });
        if (url.pathname === '/api/gmail/messages') { metadataReads++; return route.fulfill({ json: { ok: true, messages: [source.metadata] } }); }
        if (url.pathname.startsWith('/api/gmail/message/')) {
          bodyReads++; if (hold) { held = route; signalHeld(); return; }
          return unauthorized ? route.fulfill({ status: 401, json: { code: 'admin_required' } }) : route.fulfill({ json: { ...source.body, ...(wrongIdentity ? { subject: 'Forged changed metadata' } : {}) } });
        }
        if (url.pathname.endsWith('/thread-replies/status')) return route.fulfill({ json: { enabled: false, configured: true } });
        if (url.pathname === '/app') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/workspace/index.html')) });
        assert(url.pathname.startsWith('/dashboard/') && !url.pathname.includes('..'));
        return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', url.pathname.slice('/dashboard/'.length))) });
      });
      const open = async () => { await page.locator('.ws-mail-row').click(); await page.locator('.ws-mail-body').waitFor(); };
      const back = () => page.getByRole('button', { name: 'Back to messages', exact: true }).click();
      await page.goto('https://fixture.test/app?preview=1&view=email');
      await page.locator('.ws-mail-row').waitFor();
      assert.equal(bodyReads, 0); assert.equal(await page.locator('.ws-mail-snippet').count(), 0);
      const paint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime);
      assert(paint > 0 && paint < 2000, 'Synthetic first paint under2s');
      if (process.env.WOS_SNIPPET_PROOF_DIR) {
        fs.mkdirSync(process.env.WOS_SNIPPET_PROOF_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.WOS_SNIPPET_PROOF_DIR, 'synthetic-before-open-' + width + '.png') });
      }
      await open(); await back();
      assert((await page.locator('.ws-mail-snippet').innerText()).includes('Actual synthetic source'));
      assert.equal(await page.locator('.ws-mail-snippet img').count(), 0, 'Source markup is escaped, not executed');
      assert.equal(bodyReads, 1); assert.equal(metadataReads, 1, 'Back displays opened-body excerpt without a provider request');
      assert(await page.locator('.ws-mail-row').evaluate(el => { const r = el.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth; }));
      if (process.env.WOS_SNIPPET_PROOF_DIR) await page.screenshot({ path: path.join(process.env.WOS_SNIPPET_PROOF_DIR, 'synthetic-after-open-' + width + '.png') });
      const search = page.getByRole('searchbox', { name: 'Search loaded mail', exact: true });
      await search.fill('Synthetic subject'); assert.equal(await page.locator('.ws-mail-snippet').count(), 0);
      await search.fill(''); assert.equal(await page.locator('.ws-mail-snippet').count(), 0);
      await open(); await page.getByRole('button', { name: 'Reply', exact: true }).click();
      await page.locator('#mail-draft-body').fill('LOCAL SYNTHETIC DRAFT NEVER PREVIEWED');
      await page.getByRole('button', { name: 'Close reply', exact: true }).click(); await back();
      assert(!(await page.locator('.ws-mail-snippet').innerText()).includes('LOCAL SYNTHETIC DRAFT'));
      await page.getByRole('tab', { name: 'Buyers', exact: true }).click(); await page.getByRole('tab', { name: 'Primary', exact: true }).click();
      assert.equal(await page.locator('.ws-mail-snippet').count(), 0);
      wrongIdentity = true; await open(); await back(); assert.equal(await page.locator('.ws-mail-snippet').count(), 0); wrongIdentity = false;
      hold = true; await page.locator('.ws-mail-row').click(); await bodyHeld;
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click();
      await held.fulfill({ json: source.body }); hold = false;
      await page.waitForLoadState('networkidle'); assert.equal(await page.locator('.ws-mail-snippet').count(), 0, 'Obsolete body response cannot populate previews');
      await open(); await back(); assert.equal(await page.locator('.ws-mail-snippet').count(), 1);
      await page.getByRole('button', { name: 'Refresh email', exact: true }).click(); await page.locator('.ws-mail-row').waitFor();
      assert.equal(await page.locator('.ws-mail-snippet').count(), 0, 'Refresh clears retained body previews');
      await open(); await back();
      const folderButton = page.getByRole('button', { name: 'Mail folders', exact: true });
      if (await folderButton.isVisible()) await folderButton.click();
      else await page.getByRole('button', { name: 'Mail labels', exact: true }).click();
      await page.locator('#mail-folder-dialog [data-mail-folder="sent"]').click(); await page.locator('.ws-mail-row').waitFor();
      assert.equal(await page.locator('.ws-mail-snippet').count(), 0, 'Folder change clears even a reused fixture ID');
      unauthorized = true; await page.locator('.ws-mail-row').click();
      await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
      assert.equal(await page.locator('.ws-mail-snippet').count(), 0); assert.equal(await page.locator('.ws-mail-body').count(), 0);
      assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => /snippet|draft/i.test(key))), false);
      assert.equal(bodyReads, 7, 'Only seven explicit opens read bodies, including obsolete/401 cases');
      assert.equal(metadataReads, 3, 'Only mount, explicit refresh and folder change read metadata');
      assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('workspace-email-snippets:1366/400/412 explicit-open-only source previews,escaped text,no background reads,draft isolation,identity/late/search/category/refresh/401 invalidation and zero writes/external/errors passed');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
