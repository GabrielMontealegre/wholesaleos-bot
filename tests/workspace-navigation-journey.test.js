'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createFixtureApp } = require('../scripts/verify-marketplace-ui');
const { registerAppHome, registerWorkspacePreview } = require('../modules/ui/workspace-preview');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const { probeProcessSpawn } = require('./helpers/process-capability');
const navigation = require('../dashboard/workspace/navigation');

async function prove({ screenshots = false } = {}) {
  if (!(await probeProcessSpawn()).available) {
    console.log('ENVIRONMENT_SKIP: workspace-navigation-journey: process spawn not permitted');
    return;
  }
  const fixture = createFixtureApp({ seedLead: true }), app = express();
  let authenticated = true, role = 'admin', mailboxReads = 0;
  app.get('/api/auth/session', (_, res) => res.json({ authenticated, role }));
  const message = { id: 'fixture-navigation-message', source_kind: 'connected_mailbox',
    sender_name: 'Synthetic sender', from: 'sender@example.test', subject: 'Synthetic navigation message',
    date: '2026-10-20T12:00:00Z', thread_key: 'a'.repeat(64), direction: 'in', link_status: 'unlinked' };
  app.get('/api/gmail/messages', (_, res) => { mailboxReads++; res.json({ ok: true, messages: [message] }); });
  app.get('/api/gmail/message/:id', (_, res) => res.json({ ...message, body: 'Synthetic text. No real mailbox is used.' }));
  registerAppHome(app, () => ({ status: 'synthetic' }));
  registerWorkspacePreview(app);
  app.use(fixture.app);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const dir = path.resolve(__dirname, '../docs/screens/429/journey');
  const writes = [], errors = [], external = [], report = [];
  let browser;
  try {
    browser = (await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true })).browser;
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.pathname === '/helper/status') return route.fulfill({ json: { paired: false } });
      if (url.origin !== base) { external.push(url.hostname); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    if (screenshots) fs.mkdirSync(dir, { recursive: true });
    async function shot(name, width) {
      if (screenshots) await page.screenshot({ path: path.join(dir, name + '-' + width + '.png') });
    }
    async function classicMenu(width) {
      if (width < 901 && !await page.locator('.sidebar').isVisible()) {
        await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
      }
    }
    for (const width of [1366, 400, 412]) {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 915 });
      await page.goto(base + '/');
      await page.locator('.ws-topbar h1').waitFor();
      assert.equal(page.url(), base + '/app', 'Owner455item2 makes nativeToday the stable browser Home');
      assert.equal(await page.locator('.ws-topbar h1').innerText(), 'Today');
      await shot('1-home', width);
      if (width < 901) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.locator(width === 1366 ? '.ws-sidebar' : '#mobile-nav').getByRole('button', { name: 'More', exact: true }).click();
      await page.locator('#more-tools').getByRole('link', { name: 'Deals', exact: true }).click();
      await page.locator('.desk-settings').waitFor();
      await page.locator('.td-card').first().waitFor();
      await shot('2-deals', width);
      await classicMenu(width);
      await page.getByRole('button', { name: 'More tools', exact: true }).click();
      const entry = page.getByRole('link', { name: 'Email workspace', exact: true });
      assert.equal(await entry.count(), 1, 'Repeated presentation updates never duplicate the entry');
      assert.equal(await entry.getAttribute('href'), navigation.navHref('email'));
      const entryBox = await entry.boundingBox();
      assert(entryBox && entryBox.x >= 0 && entryBox.x + entryBox.width <= width && entryBox.y >= 0 && entryBox.y + entryBox.height <= page.viewportSize().height && entryBox.height >= 44, 'Explicit entry fits without scrolling and keeps a44px touch target');
      await page.mouse.move(width - 1, 0);
      await shot('3-email-entry', width);
      await entry.click();
      await page.locator('.ws-mail-row').first().waitFor();
      assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, navigation.navHref('email'));
      await page.locator('.ws-mail-row').first().click();
      await page.locator('.ws-mail-body').waitFor();
      await shot('4-native-email', width);
      if (width < 901) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      const scope = page.locator(width === 1366 ? '.ws-sidebar' : '#mobile-nav');
      await scope.getByRole('button', { name: 'More', exact: true }).click();
      await page.locator('#more-tools').getByRole('link', { name: 'Deals', exact: true }).click();
      await page.locator('.td-card').first().waitFor();
      assert.equal(new URL(page.url()).searchParams.get('workspace'), 'deals');
      await shot('5-return-deals', width);
      await page.goBack();
      await page.locator('.ws-mail-row').first().waitFor();
      assert.equal(new URL(page.url()).searchParams.get('view'), 'email', 'Back returns to real native Email');
      await page.goto(base + navigation.recordHref('WOS-FL-1040') + '&workspace=deals');
      await page.locator('#modal-overlay').waitFor({ state: 'visible' });
      assert((await page.locator('#modal-content').innerText()).includes('100 Example St'), 'Exact record opens its lead modal, not merely a matching row');
      assert.equal(await page.evaluate(() => APP.selectedLead), 'fixture-lead', 'Exact lead, not an arbitrary matching row, is selected');
      assert.notEqual(await page.evaluate(() => APP.page), 'todays_deals', 'Competing Deals bridge does not override the record');
      assert.equal(new URL(page.url()).searchParams.get('record_ref'), 'WOS-FL-1040');
      report.push({ width, home: '/app', journey: 'Native Today > classic Deals > Email workspace > Deals > Back to Email', exact_record: 'WOS-FL-1040' });
    }
    const before = mailboxReads;
    authenticated = false;
    await page.goto(base + navigation.navHref('email'));
    await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
    assert.equal(mailboxReads, before, 'Locked native entry does not read the mailbox');
    authenticated = true; role = 'user';
    await page.reload();
    await page.getByRole('heading', { name: 'Unlock your workspace', exact: true }).waitFor();
    assert.equal(mailboxReads, before, 'Non-admin native entry does not read the mailbox');
    assert.deepEqual(writes, []); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    fixture.assertUnchanged();
    if (screenshots) fs.writeFileSync(path.join(dir, 'synthetic-proof.json'), JSON.stringify({ synthetic_only: true, report, writes, errors, external }, null, 2) + '\n');
    console.log('workspace-navigation-journey: nativeToday Home/classicDeals, explicit Email entry, native reader, Deals/Back, exact record and locked/non-admin negatives1366/400/412; zero writes/external/errors passed');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
if (require.main === module) prove({ screenshots: process.argv.includes('--screenshots') }).catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { prove };
