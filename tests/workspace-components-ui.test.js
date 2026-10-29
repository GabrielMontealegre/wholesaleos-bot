'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { probeProcessSpawn } = require('./helpers/process-capability');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const c = require('../dashboard/workspace/components');

async function prove() {
  if (!(await probeProcessSpawn()).available) {
    console.log('ENVIRONMENT_SKIP: workspace-components-ui: process spawn not permitted');
    return;
  }
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let blocked = 0;
    await page.route('**/*', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (!pathname.startsWith('/dashboard/workspace/')) { blocked++; return route.abort(); }
      const relative = pathname.slice('/dashboard/workspace/'.length);
      if (relative.includes('..')) return route.abort();
      const file = path.join(__dirname, '../dashboard/workspace', relative);
      const type = relative.endsWith('.svg') ? 'image/svg+xml' : relative.endsWith('.css') ? 'text/css' : 'text/javascript';
      await route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    });
    for (const width of [1366, 400, 412]) {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 915 });
      await page.setContent('<!doctype html><html lang="en"><head><base href="https://fixture.test/"><title>Component fixture</title>' +
        '<link rel="stylesheet" href="https://fixture.test/dashboard/workspace/design-system.css"></head><body>' +
        '<main class="ws-content"><h1>Recorded work</h1>' + c.button({ id: 'open', label: 'Open record', icon: 'house' }) +
        c.tabs('work', [{ key: 'actions', label: 'Actions' }, { key: 'deals', label: 'Deals' }], 'actions') +
        '<section id="work-panel-actions" role="tabpanel" aria-labelledby="work-actions"><ul class="ws-list">' +
        c.listRow({ key: 'synthetic', title: 'Synthetic property with a very long source-supported street description', detail: 'Recorded Tue 12:18 PM', status: 'Review needed', tone: 'red' }) + '</ul></section>' +
        '<section id="work-panel-deals" role="tabpanel" aria-labelledby="work-deals" hidden>' +
        c.card({ title: 'Synthetic deal', detail: 'Value unknown', status: 'Needs evidence' }) + '</section>' +
        c.composer('draft') + c.empty('No other records', 'Open a recorded item to continue.') + c.skeleton('Loading recorded work') +
        '</main>' + c.drawer('record', 'Record') +
        '<script src="https://fixture.test/dashboard/workspace/components.js"></script></body></html>');
      await page.evaluate(() => {
        const c = window.WOSComponents;
        const dialog = document.getElementById('record');
        dialog.querySelector('[data-dialog-body]').textContent = 'Source-supported record. '.repeat(500);
        const widget = c.bindDialog(dialog);
        document.getElementById('open').addEventListener('click', widget.open);
        c.bindTabs(document.querySelector('[role="tablist"]'));
        c.bindComposer(document.getElementById('draft'));
        window.fixtureSends = [];
      });
      await page.getByRole('button', { name: 'Open record', exact: true }).click();
      assert(await page.getByRole('dialog').isVisible());
      await page.keyboard.press('Escape');
      assert(!(await page.getByRole('dialog').isVisible()));
      assert.equal(await page.evaluate(() => document.activeElement.id), 'open');
      await page.getByRole('button', { name: 'Open record', exact: true }).click();
      await page.getByRole('button', { name: 'Close Record', exact: true }).click();
      await page.getByRole('tab', { name: 'Actions', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('tab', { name: 'Deals', exact: true }).getAttribute('aria-selected'), 'true');
      assert(await page.getByRole('heading', { name: 'Synthetic deal', exact: true }).isVisible());
      await page.keyboard.press('Home');
      assert.equal(await page.getByRole('tab', { name: 'Actions', exact: true }).getAttribute('aria-selected'), 'true');
      await page.getByLabel('To', { exact: true }).fill('synthetic@example.test');
      await page.getByLabel('Subject', { exact: true }).fill('Synthetic test');
      await page.getByLabel('Message', { exact: true }).fill('Synthetic text only');
      await page.getByLabel('I reviewed this message').check();
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), 'No callback or permission cannot send');
      await page.evaluate(() => {
        window.WOSComponents.bindComposer(document.getElementById('draft'), { canSend: true,
          onSend: async data => { window.fixtureSends.push(data); throw new Error('secret backend detail'); } });
      });
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Check the message status' }).waitFor();
      assert(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), 'Failure requires renewed explicit review');
      assert.equal(await page.evaluate(() => window.fixtureSends.length), 1);
      assert(!(await page.locator('body').innerText()).includes('secret backend detail'));
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        brokenIcons: Array.from(document.querySelectorAll('.ws-icon')).filter(img => !img.complete || !img.naturalWidth).length,
        clippedControls: Array.from(document.querySelectorAll('button')).filter(el => el.offsetWidth && el.scrollWidth > el.clientWidth + 1).length
      }));
      assert.deepEqual(layout, { overflow: false, brokenIcons: 0, clippedControls: 0 }, String(width));
    }
    assert.equal(blocked, 0, 'Component fixture requests only its local static assets');
    assert.deepEqual(errors, []);
    console.log('workspace-components-ui: 1366/400/412, keyboard tabs, X/Escape/focus return, default no-send, explicit synthetic failure, local icons and fitting passed');
  } finally {
    await browser.close();
  }
}

prove().catch(error => { console.error(error.stack); process.exitCode = 1; });
