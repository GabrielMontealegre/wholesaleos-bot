'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const { providerLabels } = require('../modules/email/provider-labels');
async function main() {
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  const labels = ['WOS/Buyers', '<img src=x onerror=attack()>', 'Long' + 'x'.repeat(196)];
  const row = (id, provider_labels) => ({ id, source_kind: 'connected_mailbox', thread_key: id.repeat(64),
    from: 'Synthetic sender <sender@example.test>', sender_name: 'Synthetic sender', subject: 'Synthetic label discussion',
    date: '2026-10-29T00:00:00Z', provider_labels });
  const receipt = providerLabels(new Set(labels), 'imap_gmail_labels');
  const rows = [row('a', receipt), row('b', receipt)];
  try {
    for (const [width, height] of [[1366, 768], [400, 915], [412, 915], [1038, 503], [1366, 600]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const calls = [], forbidden = [], errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (req.method() !== 'GET' || url.origin !== 'https://fixture.test') { forbidden.push('external_or_write'); return route.abort(); }
        if (url.pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, role: 'admin' } });
        if (url.pathname === '/api/gmail/messages') { calls.push('metadata'); return route.fulfill({ json: { ok: true, messages: rows } }); }
        if (url.pathname.startsWith('/api/gmail/message/')) {
          calls.push('body'); const id = url.pathname.split('/').pop();
          return route.fulfill({ json: { ...rows.find(row => row.id === id), provider_labels: id === 'a' ? receipt : { origin: 'gmail_label_ids', scope: 'message', ids: ['Label_123'] }, body: 'Synthetic readable message remains above the optional label section.' } });
        }
        if (url.pathname.endsWith('/thread-replies/status')) return route.fulfill({ json: { enabled: false, configured: true } });
        if (url.pathname === '/app') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, '../dashboard/workspace/index.html')) });
        assert(url.pathname.startsWith('/dashboard/') && !url.pathname.includes('..'));
        return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../dashboard', url.pathname.slice(11))) });
      });
      const proof = async name => {
        if (!process.env.WOS_MESSAGE_LABELS_PROOF_DIR) return;
        assert(path.isAbsolute(process.env.WOS_MESSAGE_LABELS_PROOF_DIR));
        fs.mkdirSync(process.env.WOS_MESSAGE_LABELS_PROOF_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.WOS_MESSAGE_LABELS_PROOF_DIR, 'synthetic-' + name + '-' + width + 'x' + height + '.png') });
      };
      await page.goto('https://fixture.test/app?preview=1&view=email');
      await page.locator('#today-content[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.ws-mail-row').count(), 2);
      assert.equal(await page.locator('[data-message-labels]').count(), 0, 'No unopened-message label presentation or extra body read');
      assert.deepEqual(calls, ['metadata']); await proof('list');
      await page.locator('.ws-mail-row').first().click();
      await page.locator('[data-message-labels]').waitFor();
      const section = page.locator('[data-message-labels]');
      assert.equal(await section.evaluate(el => el.open), false, 'Labels do not displace the reading space by default');
      assert(await page.locator('.ws-mail-thread').evaluate(el => el.clientHeight >= 180));
      assert.equal(await page.locator('.ws-mail-heading .ws-role--buyer').count(), 0, 'WOS/Buyers is not a recorded buyer role');
      await proof('reader');
      await section.locator('summary').click();
      assert.equal(await section.evaluate(el => el.open), true);
      assert.deepEqual((await section.locator('.ws-badge').allTextContents()).sort(), labels.slice().sort());
      assert.equal(await section.locator('p img,p script,p a,p button,p input').count(), 0, 'Source label names are literal escaped text, not commands');
      assert(await section.locator('.ws-badge').evaluateAll(nodes => nodes.every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await proof('labels');
      await page.locator('.ws-mail-body').click(); await page.keyboard.press('e');
      assert.equal(await section.evaluate(el => el.open), true, 'Earlier-message shortcut does not toggle provider label disclosure');
      await page.getByRole('button', { name: 'Reply', exact: true }).click();
      await page.locator('[name="body"]').fill('Synthetic unsent draft');
      await page.getByRole('button', { name: 'Close reply', exact: true }).click();
      await page.locator('[data-message-labels] summary').click();
      await page.getByRole('button', { name: 'Reply', exact: true }).click();
      assert.equal(await page.locator('[name="body"]').inputValue(), 'Synthetic unsent draft');
      assert.deepEqual(calls, ['metadata', 'body'], 'Disclosure and reply do not fetch label names');
      await page.getByRole('button', { name: 'Close reply', exact: true }).click();
      await page.getByRole('button', { name: 'Back to messages', exact: true }).click();
      await page.locator('.ws-mail-row').nth(1).click(); await page.locator('.ws-mail-body').waitFor();
      assert.equal(await page.locator('[data-message-labels]').count(), 0, 'Opaque or disagreeing body receipts stay unavailable');
      assert.deepEqual(calls, ['metadata', 'body', 'body']);
      assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
  console.log('mail-opened-labels-ui: five viewports;collapsed reading space,source names escaped,long-name fit,draft preservation,no extra GET or role inference,opaque body withholding passed');
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
