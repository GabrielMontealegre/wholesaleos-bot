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
      assert((await page.locator('.ws-today-stats').innerText()).includes('0 replies waiting'));
      assert((await page.locator('.ws-today-stats').innerText()).includes('Unknown follow-ups due'));
      assert.match((await page.locator('.ws-today-action-main').first().innerText()), /\d{1,2}:\d{2} (AM|PM)/);
      if (width !== 1366) {
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        assert(await page.getByRole('dialog', { name: 'Navigation', exact: true }).isVisible());
        await page.keyboard.press('Escape');
      }
      await page.getByRole('button', { name: /Synthetic source-supported property/ }).click();
      assert.equal(await page.getByRole('link', { name: 'Open full record', exact: true }).getAttribute('href'), '/dashboard/?record_ref=WOS-FL-1012');
      await page.getByRole('button', { name: 'Close Record', exact: true }).click();
      assert(await page.getByRole('heading', { name: 'Best deals', exact: true }).isVisible());
      assert(await page.getByRole('heading', { name: 'Last 24 hours', exact: true }).isVisible());
      assert(await page.getByRole('heading', { name: 'No reviewed deals are ready yet', exact: true }).isVisible());
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
      // Owner455: non-native tools live under one More entry; Back still returns to native Email.
      if (width !== 1366) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      const navScope = page.locator(width === 1366 ? '.ws-sidebar' : '#mobile-nav');
      assert.equal(await navScope.getByRole('link', { name: 'Email', exact: true }).getAttribute('aria-current'), 'page');
      const clipped = await navScope.locator('.ws-nav a,.ws-nav-more').evaluateAll(notes => notes.filter(note => {
        const box = note.getBoundingClientRect(), frame = note.closest('nav').getBoundingClientRect();
        return box.right > frame.right + 1 || note.scrollWidth > note.clientWidth + 1;
      }).length);
      assert.equal(clipped, 0, 'Every current primary navigation control fits');
      await navScope.getByRole('button', { name: 'More', exact: true }).click();
      await page.locator('#more-tools').getByRole('link', { name: 'Deals', exact: true }).click();
      await page.getByRole('heading', { name: 'Classic workspace', exact: true }).waitFor();
      await page.goBack();
      await page.getByRole('heading', { name: 'No conversations in this view', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('view'), 'email');
      await page.goto('https://fixture.test/app?preview=1');
      await page.getByRole('button', { name: /Synthetic source-supported property/ }).waitFor();
      const labels = await page.locator('.ws-sidebar .ws-nav a').evaluateAll(links => links.map(link => [link.getAttribute('href'), link.getAttribute('aria-label') || link.textContent.trim()]));
      assert.deepEqual(labels, [['/app?preview=1', 'Today'], ['/app?preview=1&view=email', 'Email']]);
      assert.equal(await page.locator('.ws-sidebar .ws-nav [data-open-more]').count(), 1);
      assert.equal(await page.locator('.ws-sidebar-footer a').getAttribute('href'), '/app', 'Home follows owner455 nativeToday entry,not the classic tools');
      if (width !== 1366) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.locator(width === 1366 ? '.ws-sidebar' : '#mobile-nav').getByRole('button', { name: 'More', exact: true }).click();
      assert.equal(await page.getByRole('link', { name: 'Settings', exact: true }).count(), 1, 'More is the single non-native tool gateway');
      assert.equal(await page.locator('#more-tools').getByRole('link', { name: 'Settings', exact: true }).getAttribute('href'), '/dashboard/?workspace=settings');
      await page.getByRole('button', { name: 'Close More', exact: true }).click();
      for (const [key, name] of [['leads', 'Leads'], ['deals', 'Deals'], ['buyers', 'Buyers'], ['calendar', 'Calendar'], ['pipeline', 'Pipeline'], ['approvals', 'Approvals']]) {
        if (width !== 1366) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await page.locator(width === 1366 ? '.ws-sidebar' : '#mobile-nav').getByRole('button', { name: 'More', exact: true }).click();
        const selector = '#more-tools a[href="/dashboard/?workspace=' + key + '"]';
        assert.equal(await page.locator(selector).innerText(), name);
        assert(!(await page.locator('#more-tools').innerText()).includes('Classic view'), 'Owner455 removes the old labels,not the supported tool destinations');
        await page.locator(selector).click();
        assert.equal(new URL(page.url()).searchParams.get('workspace'), key);
        await page.goBack();
        await page.getByRole('button', { name: /Synthetic source-supported property/ }).waitFor();
        assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, '/app?preview=1', 'Back returns to the shell screen');
      }
      const drawer = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(drawer, false, 'More navigation adds no horizontal overflow');
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
      assert.equal(await page.getByRole('link', { name: 'Open available tools', exact: true }).getAttribute('href'), '/dashboard/', 'Existing signed users retain their authorized classic tools without admin promotion');
      assert.deepEqual(writes, []);
      assert.deepEqual(external, []);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('workspace-shell-ui: real shell1366/400/412; native Email, More tool targets with Back, Today panels, rows, X/Escape, explicit refresh,401 clearing, role guard, first paint<2s and zero writes/external calls passed');
  } finally { await browser.close(); }
}
prove().catch(error => { console.error(error.stack); process.exitCode = 1; });
