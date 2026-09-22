'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js'), 'utf8');

function snapshot(marker) {
  return {
    ok: true,
    has_snapshot: true,
    rows: [],
    counts: {},
    daily: {},
    auto_run: { enabled: false },
    batch: {
      run_at: '2026-09-22T00:00:00.000Z',
      new_rows: 0,
      refreshed_rows: 0,
      rejected_generic_count: 0,
      board_blocker_summary: marker
    }
  };
}

function createHarness() {
  const elements = new Map();
  const timers = [];
  const fetchCalls = [];
  const snapshotRequests = [];

  class FakeNode {
    constructor(tag, id) {
      this.tagName = String(tag || 'div').toUpperCase();
      this.id = id || '';
      this.dataset = {};
      this.style = {};
      this.parentNode = null;
      this.children = [];
      this._html = '';
      this._text = '';
      this._body = null;
      this._pseudoIds = [];
      this.writeCount = 0;
      this.value = '';
      this.checked = false;
      this.disabled = false;
    }
    get firstChild() { return this.children[0] || null; }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this._html = String(value == null ? '' : value);
      this._text = this._html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      this.writeCount += 1;
      if (this.id === 'content') {
        this.children.slice().forEach((child) => child.detach());
        this.children = [];
      }
      if (this.id === 'wos-public-deals') this.buildSectionChildren();
    }
    get textContent() { return this._text; }
    set textContent(value) { this._text = String(value == null ? '' : value); this._html = this._text; }
    buildSectionChildren() {
      this._pseudoIds.forEach((id) => elements.delete(id));
      this._pseudoIds = [];
      const body = new FakeNode('div');
      body.className = 'wos-public-deals-body';
      body.innerHTML = this._html.includes('Loading public deals...') ? 'Loading public deals...' : '';
      body.parentNode = this;
      this._body = body;
      ['wos-public-deals-market', 'wos-public-deals-auto', 'wos-public-deals-run'].forEach((id) => {
        if (!this._html.includes(`id="${id}"`)) return;
        const node = new FakeNode(id.includes('market') ? 'select' : id.includes('auto') ? 'input' : 'button', id);
        node.parentNode = this;
        elements.set(id, node);
        this._pseudoIds.push(id);
      });
    }
    insertBefore(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      this.children.unshift(child);
      child.parentNode = this;
      if (child.id) elements.set(child.id, child);
      return child;
    }
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      child.detach();
    }
    detach() {
      if (this.id && elements.get(this.id) === this) elements.delete(this.id);
      this._pseudoIds.forEach((id) => elements.delete(id));
      this._pseudoIds = [];
      this.parentNode = null;
    }
    remove() {
      if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this);
      else this.detach();
    }
    querySelector(selector) {
      if (selector === '.wos-public-deals-body') return this._body;
      if (selector && selector[0] === '#') return elements.get(selector.slice(1)) || null;
      return null;
    }
    querySelectorAll() { return []; }
    addEventListener() {}
    closest() { return null; }
    getAttribute() { return null; }
  }

  const host = new FakeNode('main', 'content');
  elements.set('content', host);
  const document = {
    readyState: 'loading',
    body: host,
    documentElement: new FakeNode('html'),
    createElement(tag) { return new FakeNode(tag); },
    getElementById(id) { return elements.get(id) || null; },
    addEventListener() {}
  };

  class FakeAbortController {
    constructor() {
      const listeners = [];
      this.signal = {
        addEventListener(type, listener) { if (type === 'abort') listeners.push(listener); },
        _abort() { listeners.forEach((listener) => listener()); }
      };
    }
    abort() { this.signal._abort(); }
  }

  function controlledFetch(url, options = {}) {
    fetchCalls.push({ url: String(url), method: String(options.method || 'GET').toUpperCase() });
    if (String(url).includes('/api/dashboard/research-queue/current')) {
      let resolveRequest;
      let rejectRequest;
      const promise = new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; });
      const request = {
        resolve(data) { resolveRequest({ ok: true, status: 200, json: () => Promise.resolve(data) }); },
        reject(error) { rejectRequest(error); }
      };
      if (options.signal && options.signal.addEventListener) {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          rejectRequest(error);
        });
      }
      snapshotRequests.push(request);
      return promise;
    }
    return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
  }

  const context = {
    window: {
      APP: { page: 'findme_scout' },
      localStorage: { getItem() { return null; }, setItem() {} },
      open() { return null; }
    },
    document,
    MutationObserver: function MutationObserver() { this.observe = function () {}; },
    AbortController: FakeAbortController,
    fetch: controlledFetch,
    setTimeout(fn, ms) {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { if (timer) timer.cleared = true; },
    setInterval() { return 1; },
    clearInterval() {},
    URL: { revokeObjectURL() {}, createObjectURL() { return 'blob:test'; } },
    console,
    Date,
    JSON,
    Promise,
    Array,
    Object,
    String,
    Number,
    RegExp,
    Math,
    Error,
    encodeURIComponent,
    decodeURIComponent
  };
  vm.runInNewContext(source, context);
  const hooks = context.window.__wosPublicDealsTestHooks;
  hooks.setSnapshotWatchdogEnabled(false);

  function destroyAndRemount() {
    host.innerHTML = '';
    hooks.mountForCurrentPage();
    return hooks.liveSection();
  }
  async function flush() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }
  function runLatestRequestTimeout() {
    const candidates = timers.filter((timer) => timer.ms === 20000 && !timer.cleared);
    assert.ok(candidates.length, 'snapshot timeout timer exists');
    candidates[candidates.length - 1].fn();
  }
  return { context, hooks, host, timers, fetchCalls, snapshotRequests, destroyAndRemount, flush, runLatestRequestTimeout };
}

(async () => {
  // R1, R4, R8: remount gets its own request and succeeds without the watchdog.
  const success = createHarness();
  success.hooks.mountForCurrentPage();
  assert.strictEqual(success.snapshotRequests.length, 1);
  const successLive = success.destroyAndRemount();
  assert.strictEqual(success.snapshotRequests.length, 2, 'R4 remounted section issues its own request');
  success.snapshotRequests[1].resolve(snapshot('R1_LIVE_ROWS'));
  await success.flush();
  assert.ok(successLive.querySelector('.wos-public-deals-body').innerHTML.includes('R1_LIVE_ROWS'), 'R1 rows render into the live section');
  assert.ok(!successLive.querySelector('.wos-public-deals-body').innerHTML.includes('Loading public deals...'));
  assert.strictEqual(success.timers.some((timer) => timer.ms === 25000), false, 'R8 watchdog is disabled and not required');

  // R2: rejection paints the live remounted section.
  const rejected = createHarness();
  rejected.hooks.mountForCurrentPage();
  const rejectedLive = rejected.destroyAndRemount();
  rejected.snapshotRequests[1].reject(new Error('blocked'));
  await rejected.flush();
  const rejectedHtml = rejectedLive.querySelector('.wos-public-deals-body').innerHTML;
  assert.ok(rejectedHtml.includes('Could not load the property queue') && rejectedHtml.includes('wos-snapshot-retry'), 'R2 error and Retry render live');
  assert.ok(!rejectedHtml.includes('Loading public deals...'));

  // R3: AbortController timeout also paints the live section.
  const timedOut = createHarness();
  timedOut.hooks.mountForCurrentPage();
  const timeoutLive = timedOut.destroyAndRemount();
  timedOut.runLatestRequestTimeout();
  await timedOut.flush();
  const timeoutHtml = timeoutLive.querySelector('.wos-public-deals-body').innerHTML;
  assert.ok(timeoutHtml.includes('Could not load the property queue') && timeoutHtml.includes('Retry'), 'R3 timeout renders the error block');
  assert.ok(!timeoutHtml.includes('Loading public deals...'));

  // R5: latest token wins even when the older request resolves last.
  const outOfOrder = createHarness();
  outOfOrder.hooks.mountForCurrentPage();
  const latestLive = outOfOrder.destroyAndRemount();
  const latestBody = latestLive.querySelector('.wos-public-deals-body');
  const writesBeforeResolution = latestBody.writeCount;
  outOfOrder.snapshotRequests[1].resolve(snapshot('LATEST_REQUEST_ROWS'));
  await outOfOrder.flush();
  const writesAfterLatest = latestBody.writeCount;
  assert.strictEqual(writesAfterLatest, writesBeforeResolution + 1, 'R5 latest request renders exactly once');
  outOfOrder.snapshotRequests[0].resolve(snapshot('STALE_REQUEST_ROWS'));
  await outOfOrder.flush();
  assert.strictEqual(latestBody.writeCount, writesAfterLatest, 'R5 stale completion performs no render');
  assert.ok(latestBody.innerHTML.includes('LATEST_REQUEST_ROWS') && !latestBody.innerHTML.includes('STALE_REQUEST_ROWS'));

  // R6: no mounted section means a successful response is discarded silently.
  const noSection = createHarness();
  noSection.hooks.mountForCurrentPage();
  noSection.host.innerHTML = '';
  noSection.snapshotRequests[0].resolve(snapshot('NO_SECTION'));
  await noSection.flush();
  assert.strictEqual(noSection.hooks.liveSection(), null, 'R6 no section is recreated by a completion');

  // R7: the existing market staleness guard remains effective.
  const marketSwitch = createHarness();
  marketSwitch.hooks.mountForCurrentPage();
  const marketBody = marketSwitch.hooks.liveSection().querySelector('.wos-public-deals-body');
  marketSwitch.hooks.storeSelectedMarket('san_antonio');
  marketSwitch.snapshotRequests[0].resolve(snapshot('WRONG_MARKET_ROWS'));
  await marketSwitch.flush();
  assert.ok(!marketBody.innerHTML.includes('WRONG_MARKET_ROWS'), 'R7 previous-market response is discarded');

  // R9: the render path is read-only and starts no operational endpoint.
  const allCalls = [success, rejected, timedOut, outOfOrder, noSection, marketSwitch]
    .flatMap((harness) => harness.fetchCalls);
  assert.strictEqual(allCalls.filter((call) => call.method !== 'GET').length, 0, 'R9 render path performs zero POSTs');
  assert.strictEqual(allCalls.some((call) => /\/run|\/upload|\/proposal|\/confirmation|\/capture/.test(call.url)), false, 'R9 starts no batch, capture, or confirmation');

  console.log('cycle-39-snapshot-mount-race.test.js passed (R1-R9)');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
