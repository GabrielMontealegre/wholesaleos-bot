'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const at = '2026-10-21T18:00:00Z';
const message = { id: 'a', thread_key: 'a'.repeat(64), source_kind: 'connected_mailbox', date: at, from: 'Synthetic Person <person@example.test>', sender_name: 'Synthetic Person', subject: 'Synthetic loading proof' };
const today = { source_kind: 'derived_workflow', now: at, today: '2026-10-21', counts: { replies: 0, approvals: 0, followups: 0, deadlines: 0 }, actions: [], best_deals: [], last_24h: [] };
async function prove() {
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  try {
    for (const width of [1366, 400, 412]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      const forbidden = [], errors = [], requests = [];
      let nextList = deferred(), nextBody = deferred(), nextToday = deferred(), nextDeals = deferred();
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET' || url.origin !== 'https://fixture.test') { forbidden.push(req.method()); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin' } });
        let held;
        if (url.pathname === '/api/gmail/messages') { held = nextList; requests.push('list'); }
        if (url.pathname === '/api/gmail/message/a') { held = nextBody; requests.push('body'); }
        if (url.pathname === '/api/dashboard/today-workspace') { held = nextToday; requests.push('today'); }
        if (url.pathname.startsWith('/api/dashboard/todays-deals')) { held = nextDeals; requests.push('deals'); }
        if (held) return route.fulfill(await held.promise);
        if (url.pathname === '/app') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/workspace/index.html')) });
        if (url.pathname === '/deals-proof') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/dashboard/wos-marketplace.css"><link rel="stylesheet" href="/dashboard/wos-desk-shell.css"><body data-wos-design="marketplace"><div id="app"><div id="content"></div></div><script>window.APP={page:"todays_deals"};window.renderDashboard=function(){return "";};</script><script src="/dashboard/wos-todays-deals.js"></script><script>document.querySelector("#content").innerHTML=renderTodaysDeals();</script></body></html>' });
        if (url.pathname === '/api/dashboard/filter-counties') return route.fulfill({ json: { schema_version: 1, states: [], counties: [] } });
        assert(url.pathname.startsWith('/dashboard/') && !url.pathname.includes('..'));
        return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', url.pathname.slice(11))) });
      });
      async function capture(name) {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (process.env.WOS_LOADING_PROOF_DIR) { fs.mkdirSync(process.env.WOS_LOADING_PROOF_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.WOS_LOADING_PROOF_DIR, 'synthetic-' + name + '-' + width + '.png') }); }
      }
      await page.goto('https://fixture.test/app?view=email', { waitUntil: 'domcontentloaded' });
      await page.locator('.ws-mail-list .ws-skeleton').waitFor();
      assert.equal(await page.locator('.ws-mail-row').count(), 0);
      await capture('email-loading');
      nextList.resolve({ status: 503, json: { error: 'SYNTHETIC private error must not be reflected' } });
      await page.getByRole('button', { name: 'Retry email', exact: true }).waitFor();
      assert.equal(await page.getByText('SYNTHETIC private error must not be reflected', { exact: true }).count(), 0);
      await capture('email-error');
      nextList = deferred();
      await page.getByRole('button', { name: 'Retry email', exact: true }).click();
      nextList.resolve({ json: { ok: true, messages: [message] } });
      await page.locator('.ws-mail-row').waitFor();
      await page.locator('.ws-mail-row').click();
      await page.getByText('Loading conversation', { exact: true }).waitFor();
      await page.locator('#mail-search').focus();
      await page.getByText('Still loading...', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'mail-search', 'The delayed label cannot repaint the workspace or steal focus');
      assert.equal(requests.filter(x => x === 'body').length, 1, 'The two-second message cannot retry a provider read');
      await capture('email-slow');
      nextBody.resolve({ status: 503, json: {} });
      await page.getByRole('button', { name: 'Retry conversation', exact: true }).waitFor();
      await capture('email-body-error');
      nextBody = deferred();
      await page.getByRole('button', { name: 'Retry conversation', exact: true }).click();
      nextBody.resolve({ json: { ...message, body: 'Synthetic exact source body' } });
      await page.locator('.ws-mail-body').waitFor();
      assert.equal(await page.locator('.ws-mail-body').innerText(), 'Synthetic exact source body');
      assert.equal(await page.getByText('Still loading...', { exact: true }).count(), 0);
      // Reopening gets its own timer; leaving selection rejects its late body.
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click();
      nextBody = deferred();
      await page.locator('.ws-mail-row').click();
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click();
      nextBody.resolve({ json: { ...message, body: 'Synthetic stale body' } });
      await page.waitForTimeout(2100);
      assert.equal(await page.locator('.ws-mail-body').count(), 0);
      assert.equal(await page.getByText('Still loading...', { exact: true }).count(), 0);
      // A rate limit is terminal until the operator explicitly retries.
      nextBody = deferred();
      await page.locator('.ws-mail-row').click();
      nextBody.resolve({ status: 429, json: {} });
      await page.getByRole('button', { name: 'Retry conversation', exact: true }).waitFor();
      const terminalReads = requests.filter(x => x === 'body').length;
      await page.waitForTimeout(2100);
      assert.equal(requests.filter(x => x === 'body').length, terminalReads);
      nextBody = deferred();
      await page.getByRole('button', { name: 'Retry conversation', exact: true }).click();
      nextBody.resolve({ status: width === 1366 ? 401 : 403, json: {} });
      await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
      await page.waitForTimeout(2100);
      assert.equal(await page.locator('.ws-mail').count(), 0);
      assert.equal(await page.getByText('Still loading...', { exact: true }).count(), 0);
      await page.goto('https://fixture.test/app', { waitUntil: 'domcontentloaded' });
      await page.getByText('Loading recorded work', { exact: true }).waitFor();
      await capture('today-loading');
      nextToday.resolve({ status: 500, json: {} });
      await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
      await capture('today-error');
      nextToday = deferred();
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      nextToday.resolve({ json: today });
      await page.locator('#today-content[aria-busy="false"]').waitFor();
      await page.goto('https://fixture.test/deals-proof', { waitUntil: 'domcontentloaded' });
      await page.locator('.td-loading-row').first().waitFor();
      assert.equal(await page.locator('.td-loading-row').count(), 6);
      assert.equal(await page.getByText(/No deals submitted/).count(), 0, 'Pending is not an empty result');
      await capture('deals-loading');
      nextDeals.resolve({ status: 503, json: {} });
      await page.getByRole('button', { name: 'Retry deals', exact: true }).waitFor();
      const retryRect = await page.getByRole('button', { name: 'Retry deals', exact: true }).boundingBox();
      assert(retryRect && retryRect.height >= 44 && retryRect.width >= 44 && retryRect.x >= 0 && retryRect.x + retryRect.width <= width + 1);
      assert.equal(await page.locator('.td-loading-row').count(), 0);
      await capture('deals-error');
      nextDeals = deferred();
      await page.getByRole('button', { name: 'Retry deals', exact: true }).click();
      assert.equal(await page.locator('.td-loading-row').count(), 6);
      nextDeals.resolve({ json: { items: [], counts: { shown: 0 } } });
      await page.locator('#wos-todays-deals[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.td-loading-row').count(), 0);
      assert.equal(requests.filter(x => x === 'deals').length, 2);
      // An uncached record must also offer Back before its request completes.
      nextDeals = deferred();
      const oldRecord = nextDeals;
      const recordRead = page.waitForRequest(req => new URL(req.url()).pathname === '/api/dashboard/todays-deals' && !!new URL(req.url()).searchParams.get('record_id'));
      await page.evaluate(() => { window.navigate = () => { document.querySelector('#content').innerHTML = renderTodaysDeals(); }; openReviewedDeal('synthetic-unloaded'); });
      await recordRead;
      await page.getByRole('button', { name: 'Back to results', exact: true }).waitFor();
      await capture('deals-record-pending');
      nextDeals = deferred();
      const listRead = page.waitForRequest(req => new URL(req.url()).pathname === '/api/dashboard/todays-deals' && !new URL(req.url()).searchParams.get('record_id'));
      await page.getByRole('button', { name: 'Back to results', exact: true }).click();
      await listRead;
      oldRecord.resolve({ json: { items: [], counts: { shown: 0 } } });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('.td-loading-row').count(), 6);
      nextDeals.resolve({ json: { items: [], counts: { shown: 0 } } });
      await page.locator('#wos-todays-deals[aria-busy="false"]').waitFor();
      assert.equal(requests.filter(x => x === 'deals').length, 4);
      assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('workspace-loading-states: three sizes, held reads/skeletons/errors/explicit retries, slow/reopened/stale body lifecycle, zero writes/external/runtime errors passed');
  } finally { await browser.close(); }
}
prove().catch(error => { console.error(error.stack); process.exitCode = 1; });
