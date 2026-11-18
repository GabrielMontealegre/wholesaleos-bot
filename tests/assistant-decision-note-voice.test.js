'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { appendSnapshot, latestSnapshot } = require('../modules/records/assistant-snapshot');
const { fixture } = require('./helpers/assistant-snapshot-v2-fixture');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const { SELECTOR, PREVIEW_SELECTOR } = require('../dashboard/wos-local-voice');
assert(SELECTOR.split(',').includes('textarea[data-decision-note]'));
assert.equal(PREVIEW_SELECTOR, 'textarea[data-ask-query],textarea[data-decision-note]');
const now = '2026-11-08T06:10:21Z', config = { now, operatorId: 'synthetic-owner', filename: 'synthetic.json' };
const store = appendSnapshot({}, Buffer.from(JSON.stringify(fixture())), config), original = structuredClone(store);
const latest = latestSnapshot(store, config);
const root = path.join(__dirname, '..'), origin = 'https://voice-fixture.test';
const scripts = ['wos-card-clock.js', 'workspace/components.js', 'workspace/assistant-v2-fields.js',
  'workspace/assistant-model.js', 'workspace/decision-desk.js', 'workspace/assistant-sheet.js', 'wos-local-voice.js'];
const styles = ['workspace/design-system.css', 'wos-local-voice.css'];
const icons = ['list-checks', 'refresh-cw', 'folder', 'arrow-up-right', 'x', 'users'].map(name => 'workspace/vendor/lucide-1.60.0/' + name + '.svg');
const html = '<!doctype html><html data-wos-workspace="preview"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  styles.map(file => '<link rel="stylesheet" href="/dashboard/' + file + '">').join('') + '</head><body><main id="host"></main>' +
  scripts.map(file => '<script src="/dashboard/' + file + '"></script>').join('') +
  '<script>window.sheet=WOSAssistantSheet.create({host:document.querySelector("#host"),today:()=>"2026-11-08",onUnauthorized:()=>{throw Error("unexpected_auth");}});sheet.refresh();</script></body></html>';
async function main() {
  const { browser } = await launchChromiumWithResolvedBrowser(require('playwright'), { headless: true });
  try {
    for (const width of [1366, 400, 412]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1366 ? 768 : 915 }, timezoneId: 'Asia/Tokyo' });
      const page = await context.newPage(), errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin || request.method() !== 'GET') { external.push(request.method()); return route.abort(); }
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
        const file = url.pathname.replace(/^\/dashboard\//, '');
        if (!scripts.includes(file) && !styles.includes(file) && !icons.includes(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ contentType: file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8', body: fs.readFileSync(path.join(root, 'dashboard', file)) });
      });
      await page.addInitScript(({ latest, now }) => {
        const proof = window.voiceProof = { starts: 0, checks: 0, aborts: 0, posts: [], availability: 'available', local: [] };
        class Recognition {
          static async available(options) { proof.checks++; proof.local.push(options.processLocally === true); return proof.availability; }
          start() { proof.starts++; proof.local.push(this.processLocally === true); proof.active = this; }
          abort() { proof.aborts++; }
        }
        Recognition.prototype.processLocally = false;
        window.SpeechRecognition = Recognition;
        window.fetch = async (url, options = {}) => {
          const parsed = new URL(url, location.href), method = options.method || 'GET';
          if (method !== 'GET') {
            if (method !== 'POST' || parsed.pathname !== '/api/dashboard/assistant-snapshot-answers') throw Error('unexpected_write');
            const input = JSON.parse(options.body); proof.posts.push(input);
            return new Response(JSON.stringify({ ok: true, now, answer: { id: 'b'.repeat(64), snapshot_id: input.snapshot_id,
              item_id: input.item_id, choice: input.choice, note: input.note, answered_at: now } }), { status: 200 });
          }
          if (parsed.pathname === '/api/dashboard/assistant-snapshots') return new Response(JSON.stringify({ ok: true, latest,
            viewer_scope: 'a'.repeat(64), capabilities: { can_import: true, schema: 'wos-assistant-snapshot', version: 1, max_bytes: 1048576 } }));
          if (parsed.pathname === '/api/dashboard/assistant-snapshot-answers') return new Response(JSON.stringify({ ok: true, now, items: [], next_after: null }));
          throw Error('unexpected_read');
        };
        window.emitSyntheticSpeech = (text, final = true) => { const result = [{ transcript: text }]; result.isFinal = final; proof.active.onresult({ results: [result] }); };
      }, { latest, now });
      try {
        await page.goto(origin);
        await page.waitForFunction(() => document.querySelector('[data-decision-choice="0:A"]')?.disabled === false);
        const note = page.locator('[data-decision-note="0"]'), bar = note.locator('xpath=following-sibling::div[contains(@class,"wos-voice-tools")][1]');
        await bar.waitFor(); assert.equal(await page.locator('.wos-voice-tools').count(), 3);
        assert.deepEqual(await page.evaluate(() => [voiceProof.starts, voiceProof.checks, voiceProof.posts.length]), [0, 0, 0]);
        await note.fill('Typed '); await bar.locator('[data-voice-dictate]').click();
        await page.waitForFunction(() => voiceProof.starts === 1);
        await page.evaluate(() => emitSyntheticSpeech('interim', false)); assert.equal(await note.inputValue(), 'Typed ');
        await page.evaluate(() => emitSyntheticSpeech('Synthetic note')); assert.equal(await note.inputValue(), 'Typed Synthetic note');
        assert.equal(await page.evaluate(() => voiceProof.posts.length), 0, 'Dictation never submits an answer');
        await page.getByRole('tab', { name: 'Agents', exact: true }).click();
        await page.getByRole('tab', { name: 'Decision Desk', exact: true }).click();
        await bar.waitFor(); assert.equal(await note.inputValue(), 'Typed Synthetic note', 'Real sheet input handler retains the unsent note across tabs');
        assert.equal(await page.locator('.wos-voice-tools').count(), 3, 'Rerender attaches once per note');
        assert(await page.evaluate(() => voiceProof.aborts >= 1), 'Replaced note target cancels dictation');
        await bar.locator('[data-voice-lang]').selectOption('es-MX');
        await page.evaluate(() => { voiceProof.availability = 'unavailable'; });
        await bar.locator('[data-voice-dictate]').click();
        await bar.getByText('On-device Spanish is not installed or supported. Type instead; no language pack or audio was uploaded.', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => voiceProof.starts), 1);
        const geometry = await bar.locator('[data-voice-dictate]').evaluate(el => ({ height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width }));
        assert(geometry.height >= 44 && geometry.width >= 44);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0));
        if (process.argv.includes('--screenshots')) {
          const dir = path.join(root, 'docs/screens/2026-11-08-decision-note-voice'); fs.mkdirSync(dir, { recursive: true });
          await page.mouse.move(0, 0);
          await page.locator('[data-decision-card]').first().screenshot({ path: path.join(dir, 'synthetic-note-' + width + '.png') });
        }
        await page.locator('[data-decision-choice="0:A"]').click();
        await page.getByText('Answer recorded.', { exact: true }).waitFor();
        assert.deepEqual(await page.evaluate(() => voiceProof.posts.map(row => ({ choice: row.choice, note: row.note }))), [{ choice: 'A', note: 'Typed Synthetic note' }]);
        assert(await page.evaluate(() => voiceProof.local.every(Boolean)));
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
      } finally { await context.close(); }
    }
    assert.deepEqual(store, original);
    console.log('Decision note voice: actual synthetic sheet1366/400/412Tokyo, local-only explicit final text, keyboard fallback, unsent tab retention, exact explicit answer payload,44px/no overflow/no external effects passed');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
