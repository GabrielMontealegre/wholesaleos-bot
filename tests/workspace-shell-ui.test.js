'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { probeProcessSpawn } = require('./helpers/process-capability');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');

async function prove() {
  if (!(await probeProcessSpawn()).available) {
    console.log('ENVIRONMENT_SKIP: workspace-shell-ui: process spawn not permitted');
    return;
  }
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  const today = { source_kind: 'derived_workflow', now: '2026-10-20T18:00:00Z',
    counts: { replies: 0, approvals: 1, followups: null, deadlines: 0 },
    actions: [{ key: 'a', heading: 'Synthetic source-supported property', label: 'Review needed', ref: 'WOS-FL-1012', recorded_at: '2026-10-20T17:18:00Z', source_kind: 'derived_workflow' }],
    best_deals: [], last_24h: [{ key: 'b', label: 'Record imported', at: '2026-10-20T17:18:00Z', source_kind: 'recorded_activity' }] };
  try {
    for (const width of [1366, 400, 412]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1366 ? 768 : 915 } });
      let auth = true, role = 'admin', fail = false, reads = 0;
      const writes = [], errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== 'https://fixture.test') { external.push(url.origin); return route.abort(); }
        if (req.method() !== 'GET') {
          writes.push(url.pathname);
          if (url.pathname === '/api/auth/logout') { auth = false; return route.fulfill({ json: { ok: true } }); }
          throw Error('Unexpected write');
        }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: auth, role } });
        if (url.pathname === '/api/gmail/messages') return route.fulfill({ json: { ok: true, messages: [] } });
        if (url.pathname === '/api/dashboard/today-workspace') {
          reads++;
          return route.fulfill({ status: auth ? fail ? 503 : 200 : 401, json: auth && !fail ? today : { code: 'unavailable' } });
        }
        if (url.pathname === '/app') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/workspace/index.html')) });
        if (url.pathname === '/dashboard/') return route.fulfill({ contentType: 'text/html', body: '<html lang="en"><title>Classic fixture</title><h1>Classic workspace</h1></html>' });
        if (url.pathname.startsWith('/dashboard/')) {
          const relative = url.pathname.slice('/dashboard/'.length);
          assert(!relative.includes('..'));
          const file = path.join(__dirname, '../dashboard', relative);
          return route.fulfill({ contentType: relative.endsWith('.css') ? 'text/css' : relative.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(file) });
        }
        throw Error('Unexpected fixture request ' + url.pathname);
      });
      await page.goto('https://fixture.test/app?preview=1');
      await page.getByRole('button', { name: /Synthetic source-supported property/ }).waitFor();
      assert((await page.locator('.ws-stats').innerText()).includes('0 replies'));
      assert((await page.locator('.ws-stats').innerText()).includes('Unknown follow-ups'));
      assert((await page.locator('.ws-row-main').first().innerText()).includes('10:18 AM'));
      if (width !== 1366) {
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        assert(await page.getByRole('dialog', { name: 'Navigation', exact: true }).isVisible());
        await page.keyboard.press('Escape');
      }
      await page.getByRole('button', { name: /Synthetic source-supported property/ }).click();
      assert.equal(await page.getByRole('link', { name: 'Open full record', exact: true }).getAttribute('href'), '/dashboard/?record_ref=WOS-FL-1012');
      await page.getByRole('button', { name: 'Close Record', exact: true }).click();
      await page.getByRole('tab', { name: 'Best deals', exact: true }).click();
      assert(await page.getByRole('heading', { name: 'No best deals recorded', exact: true }).isVisible());
      await page.getByRole('tab', { name: 'Last 24 hours', exact: true }).click();
      await page.getByRole('button', { name: /Record imported/ }).click();
      assert(await page.getByText('No unique property or buyer reference is attached.', { exact: false }).isVisible());
      await page.keyboard.press('Escape');
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        scrollParents: Array.from(document.querySelectorAll('body, .ws-shell, .ws-workspace, .ws-sidebar')).filter(el => el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY)).length,
        firstPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || null,
        sheets: Array.from(document.styleSheets).map(sheet => new URL(sheet.href).pathname)
      }));
      assert.equal(layout.overflow, false);
      assert.equal(layout.scrollParents, 0);
      assert.deepEqual(layout.sheets, ['/dashboard/workspace/design-system.css']);
      assert(layout.firstPaint !== null && layout.firstPaint < 2000, 'Fixture first contentful paint <2s');
      // Email intentionally migrates to the shared native shell in #412.
      if (width !== 1366) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.locator((width === 1366 ? '.ws-sidebar ' : '#mobile-nav ') + 'a[href="/app?preview=1&view=email"]').click();
      await page.getByRole('heading', { name: 'No conversations in this view', exact: true }).waitFor();
      assert(await page.locator('.ws-mail').isVisible());
      await page.goto('https://fixture.test/app?preview=1');
      await page.getByRole('button', { name: /Synthetic source-supported property/ }).waitFor();
      for (const key of ['leads', 'deals', 'buyers', 'calendar', 'pipeline', 'approvals']) {
        if (width !== 1366) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        const selector = (width === 1366 ? '.ws-sidebar ' : '#mobile-nav ') + 'a[href="/dashboard/?workspace=' + key + '"]';
        await page.locator(selector).click();
        assert.equal(new URL(page.url()).searchParams.get('workspace'), key);
        await page.goto('https://fixture.test/app?preview=1');
        await page.getByRole('button', { name: /Synthetic source-supported property/ }).waitFor();
      }
      fail = true;
      await page.getByRole('button', { name: 'Refresh recorded work', exact: true }).click();
      await page.getByRole('heading', { name: 'Recorded work is unavailable', exact: true }).waitFor();
      fail = false;
      await page.getByRole('button', { name: 'Refresh recorded work', exact: true }).click();
      await page.getByRole('button', { name: /Synthetic source-supported property/ }).waitFor();
      auth = false;
      await page.getByRole('button', { name: 'Refresh recorded work', exact: true }).click();
      await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
      assert(!(await page.locator('body').innerText()).includes('Synthetic source-supported property'));
      const before = reads;
      await page.reload();
      await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
      assert.equal(reads, before, 'Locked loads must not request business data');
      auth = true; role = 'user';
      await page.reload();
      await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
      assert.equal(reads, before, 'Non-admin cannot read the admin workspace');
      assert.deepEqual(writes, []);
      assert.deepEqual(external, []);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('workspace-shell-ui: real shell1366/400/412; native Email and six classic nav targets, tabs, rows, X/Escape, explicit refresh,401 clearing, role guard, first paint<2s and zero writes/external calls passed');
  } finally { await browser.close(); }
}
prove().catch(error => { console.error(error.stack); process.exitCode = 1; });
