'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const uiPath = path.join(__dirname, '..', 'dashboard', 'wos-public-deals.js');
const uiSource = fs.readFileSync(uiPath, 'utf8');
const definition = uiSource.match(/var SUPPORTED_HELPER_BUILD = '[^']+';/);
assert.ok(definition, 'supported helper build constant must exist');

const helpersStart = uiSource.indexOf('  function normalizedHelperBuild(');
const helpersEnd = uiSource.indexOf('  function pairLocalHelper(', helpersStart);
const captureStart = uiSource.indexOf('  function captureWithLocalHelper(');
const captureEnd = uiSource.indexOf('  function ensureSection(', captureStart);
assert.ok(helpersStart >= 0 && helpersEnd > helpersStart && captureStart >= 0 && captureEnd > captureStart);

function createHarness() {
  const calls = [];
  let statusBody = {};
  const context = {
    Array,
    AbortController: undefined,
    localCaptureResults: {},
    LOCAL_HELPER: 'http://127.0.0.1:8797',
    selectedMarket: () => ({ city: 'Ennis', county: 'Ellis', state: 'TX' }),
    fetchLatestWithNote() {},
    safeArray(value) { return Array.isArray(value) ? value : []; },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (/\/helper\/status$/.test(url)) return { ok: true, json: async () => statusBody };
      return { ok: true, json: async () => ({ ok: true, run: { captures_submitted: 0, outcome: 'synthetic' } }) };
    }
  };
  const script = `${definition[0]}
    var localHelperState = { running:false, paired:false, capture_running:false, checked:false, helper_build:'', subject_facts_supported:false };
    ${uiSource.slice(helpersStart, helpersEnd)}
    ${uiSource.slice(captureStart, captureEnd)}
    ({
      setState:function(value){ localHelperState = value; },
      getState:function(){ return localHelperState; },
      status:localHelperStatusText,
      matches:helperBuildMatches,
      paint:paintLocalHelperStatus,
      refresh:refreshLocalHelperStatus,
      capture:captureWithLocalHelper
    })`;
  const api = vm.runInNewContext(script, context);
  api.setStatusBody = (value) => { statusBody = value; };
  api.calls = calls;
  return api;
}

function renderTarget() {
  const statuses = [{ textContent: '' }, { textContent: '' }];
  const buttons = [
    { dataset: { captureMode: 'subject_facts' }, style: {}, disabled: true, title: '' },
    { dataset: { captureMode: 'sold_comps' }, style: {}, disabled: true, title: '' }
  ];
  const start = [{ style: {} }];
  const outdated = [{ style: {}, textContent: '' }];
  const pair = [{ style: {} }];
  const message = [{ textContent: 'The helper runs only on your computer.' }];
  const bySelector = {
    '.wos-helper-status, .wos-helper-inline-status': statuses,
    '.wos-helper-capture': buttons,
    '.wos-helper-start-instruction': start,
    '.wos-helper-inline-pair': pair,
    '.wos-helper-outdated-instruction': outdated,
    '.wos-helper-message': message
  };
  return { statuses, buttons, start, outdated, pair, message, querySelectorAll: (selector) => bySelector[selector] || [] };
}

function captureButton(mode) {
  const message = { textContent: '' };
  const card = { dataset: { queueKey: 'cycle43-row' } };
  const rowBox = { querySelector: () => message };
  return {
    message,
    button: {
      dataset: { captureMode: mode }, disabled: false, textContent: 'Capture',
      closest: (selector) => selector === '.wos-manual-evidence-card' ? card : rowBox
    }
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  const api = createHarness();
  const target = renderTarget();

  api.setStatusBody({ running: true, paired: true, capture_running: false, helper_build: '9eac148', subject_facts_supported: true });
  api.refresh(target);
  await flush();
  assert.strictEqual(api.getState().helper_build, '9eac148');
  assert.strictEqual(api.getState().subject_facts_supported, true);
  assert.strictEqual(target.statuses[0].textContent, 'Connected - build 9eac148');
  assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [false, false]);

  api.setState({ running: true, paired: true, capture_running: false, helper_build: '811a053', subject_facts_supported: true });
  api.paint(target);
  assert.ok(target.statuses[0].textContent.includes('OUTDATED'));
  assert.ok(target.statuses[0].textContent.includes('811a053'));
  assert.ok(target.statuses[0].textContent.includes('9eac148'));
  assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [true, true]);

  api.setState({ running: true, paired: true, capture_running: false, helper_build: '', subject_facts_supported: true });
  api.paint(target);
  assert.ok(target.statuses[0].textContent.includes('running unknown'));
  assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [true, true]);

  api.setState({ running: true, paired: true, capture_running: false, helper_build: '9eac148', subject_facts_supported: false });
  api.paint(target);
  assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [true, false]);
  assert.ok(target.buttons[0].title.includes('does not support subject-facts'));

  assert.strictEqual(api.matches('9EAC148FA4D32612EF17DEC13A5FB069F4DA0F8E'), true);
  assert.strictEqual(api.matches('9eac148'), true);

  api.setState({ running: true, paired: true, capture_running: true, helper_build: '9eac148', subject_facts_supported: true });
  api.paint(target);
  assert.strictEqual(target.statuses[0].textContent, 'Connected - capture running');
  assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [true, true]);

  api.setState({ running: false, paired: false, capture_running: false, helper_build: '', subject_facts_supported: false });
  api.paint(target);
  assert.strictEqual(target.statuses[0].textContent, 'Not running');
  assert.strictEqual(target.start[0].style.display, 'block');

  api.setState({ running: true, paired: true, capture_running: false, helper_build: '811a053', subject_facts_supported: true });
  const stale = captureButton('subject_facts');
  const captureCallsBefore = api.calls.filter((call) => /\/helper\/capture$/.test(call.url)).length;
  await api.capture({ querySelector: () => stale.message }, stale.button);
  const captureCallsAfter = api.calls.filter((call) => /\/helper\/capture$/.test(call.url)).length;
  assert.strictEqual(captureCallsAfter, captureCallsBefore);
  assert.strictEqual(stale.message.textContent, 'Helper is outdated - nothing was opened.');

  api.setState({
    running: true, paired: true, capture_running: false, helper_build: '811a053', subject_facts_supported: true,
    agent_token: 'SECRET_AGENT_TOKEN_SHOULD_NOT_RENDER', pairing_token: 'SECRET_PAIRING_TOKEN_SHOULD_NOT_RENDER'
  });
  api.paint(target);
  const rendered = JSON.stringify(target);
  assert.ok(!rendered.includes('SECRET_AGENT_TOKEN_SHOULD_NOT_RENDER'));
  assert.ok(!rendered.includes('SECRET_PAIRING_TOKEN_SHOULD_NOT_RENDER'));
  assert.ok(!rendered.includes('agent_token') && !rendered.includes('pairing_token'));

  assert.strictEqual((uiSource.match(/var SUPPORTED_HELPER_BUILD\s*=/g) || []).length, 1);
  console.log('cycle-43-helper-freshness: ok');
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
