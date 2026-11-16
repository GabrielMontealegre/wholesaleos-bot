'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createFixtureApp } = require('../scripts/verify-marketplace-ui');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
async function run() {
  const fixture = createFixtureApp(), writes = [], external = [], errors = [];
  const server = await new Promise(resolve => { const s = fixture.app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser, measured = true;
  const reference = 'WOS-FL-4321', sourceName = 'Fixture WOS-FL-9876 contact';
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext();
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (!['GET', 'HEAD'].includes(req.method())) { writes.push(req.method()); return route.abort(); }
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
      if (url.origin !== base) { external.push(url.hostname); return route.abort(); }
      if (url.pathname === '/api/dashboard/todays-deals') {
        const response = await route.fetch(), payload = await response.json();
        payload.items[0].record_ref = reference;
        payload.items[0].holder_contact.name = sourceName;
        payload.counts = { total: payload.counts.total, shown: payload.counts.shown, ...(measured ? { vetted_today: 0, daily_target: 10, jv: 0 } : {}) };
        return route.fulfill({ response, json: payload });
      }
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.name));
    async function capture(name, selector) {
      if (!process.env.WOS_PLAIN_WORDS_PROOF_DIR) return;
      fs.mkdirSync(process.env.WOS_PLAIN_WORDS_PROOF_DIR, { recursive: true });
      await page.mouse.move(0, 0);
      const options = { path: path.join(process.env.WOS_PLAIN_WORDS_PROOF_DIR, name + '.png') };
      if (selector) await page.locator(selector).screenshot(options);
      else await page.screenshot(options);
    }
    for (const width of [1366, 400, 412]) {
      measured = true; await page.setViewportSize({ width, height: width === 1366 ? 768 : 915 });
      await page.goto(base + '/dashboard/?workspace=deals');
      await page.waitForFunction(() => window.APP?.unlocked === true);
      await page.evaluate(() => navigate('todays_deals', null));
      await page.locator('.td-summary').waitFor();
      const summary = page.locator('.td-summary');
      assert.equal(await summary.locator('.td-reference').count(), 0);
      assert(!(await summary.innerText()).includes(reference));
      assert.equal(await summary.locator('.td-holder').innerText(), 'Holder: ' + sourceName, 'Do not censor source-provided names or text');
      assert.equal(await page.locator('.td-card').getAttribute('data-deal-id'), 'fixture-deal');
      const counts = await page.locator('.td-counts').innerText();
      assert(counts.includes('Checked today: 0 of 10'));
      assert(!/Vetted today|Eligible JV/.test(counts));
      await capture('deals-face-' + width);
      await page.getByRole('button', { name: 'Open deal', exact: true }).click();
      assert((await page.locator('.td-detail').innerText()).includes(reference), 'Full record retains its reference and source context');
      const claimed = page.locator('.td-math div').filter({ has: page.getByText("Seller's value (their claim)", { exact: true }) });
      assert.equal(await claimed.locator('dd').innerText(), '$350,000');
      assert.equal(await page.getByRole('button', { name: 'I re-checked the listing today', exact: true }).count(), 1);
      assert.equal(await page.locator('[data-deal-action="recheck"]').getAttribute('data-deal-action'), 'recheck');
      assert.equal(await page.locator('[data-review-comps]').isChecked(), false);
      assert.equal(await page.locator('.td-compact-math div:last-child dd').innerText(), '$6,625');
      await capture('deal-open-' + width);
      await capture('claimed-value-' + width, '.td-math');
      await capture('recheck-command-' + width, '[data-deal-action="recheck"]');
      await page.getByRole('button', { name: 'Back to results', exact: true }).click();
      await page.locator('.td-summary').waitFor();
      measured = false;
      await page.evaluate(() => navigate('todays_deals', null));
      await page.waitForFunction(() => document.querySelector('#wos-todays-deals')?.getAttribute('aria-busy') === 'false' && !document.querySelector('.td-counts')?.textContent.includes('Checked today:'));
      assert(!(await page.locator('.td-counts').innerText()).includes('Checked today:'), 'Unmeasured remains unknown, never invented zero');
      await page.evaluate(() => navigate('dashboard', null));
      await page.locator('#wos-public-deals').waitFor();
      assert((await page.locator('#wos-public-deals h2').innerText()).includes('Preview: not saved yet'));
      assert(!(await page.locator('#wos-public-deals h2').innerText()).includes('snapshot cache'));
      await capture('preview-home-' + width);
      await page.evaluate(() => navigate('findme_scout', null));
      await page.waitForFunction(() => document.getElementById('wos-public-deals')?.dataset.wosTarget === 'findme_scout');
      assert((await page.locator('#wos-public-deals h2').innerText()).includes('Preview: not saved yet'));
      assert.equal(await page.locator('#wos-public-deals-auto').isChecked(), false);
      assert(await page.locator('#wos-public-deals-market').evaluate(x => x.closest('label').getBoundingClientRect().height <= 60), 'Market label stays a compact readable row, not one letter per line');
      const evidenceControls = await page.locator('.wos-manual-source,.wos-manual-file').all();
      assert(evidenceControls.length > 0);
      for (const control of evidenceControls) assert((await control.getAttribute('aria-label') || '').trim().length > 0, 'Evidence controls have accessible names without opening a file');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await capture('preview-finder-' + width);
    }
    fixture.assertUnchanged(); assert.deepEqual(writes, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log('plain-card-words: 1366/400/412 requested phrases/zero-vs-unknown/metadata-only face reference removal/source-name retention/exact ID/open Back/value gate/recheck action/preview-not-saved/defaultOFF/no writes passed');
  } finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(JSON.stringify({ test: 'plain-card-words', assertion: error.name === 'AssertionError', location: String(error.stack).match(/plain-card-words-ui\.test\.js:\d+:\d+/)?.[0] || null, messageCode: /Timeout/.test(error.name) ? 'fixture_timeout' : 'test_failed' })); process.exitCode = 1; });
