'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const agent = require('../scripts/wos-local-comp-agent');
const helper = require('../scripts/wos-local-helper');

const root = path.join(__dirname, '..');
const uiPath = path.join(root, 'dashboard', 'wos-public-deals.js');
const agentPath = path.join(root, 'scripts', 'wos-local-comp-agent.js');
const helperPath = path.join(root, 'scripts', 'wos-local-helper.js');
const uiSource = fs.readFileSync(uiPath, 'utf8');
const agentSource = fs.readFileSync(agentPath, 'utf8');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const definition = uiSource.match(/var SUPPORTED_HELPER_PROTOCOLS = \[[^\]]+\];/);
assert.ok(definition, 'supported helper protocols constant must exist');

const helpersStart = uiSource.indexOf('  function normalizedHelperBuild(');
const helpersEnd = uiSource.indexOf('  function pairLocalHelper(', helpersStart);
const captureStart = uiSource.indexOf('  function captureWithLocalHelper(');
const captureEnd = uiSource.indexOf('  function ensureSection(', captureStart);
assert.ok(helpersStart >= 0 && helpersEnd > helpersStart && captureStart >= 0 && captureEnd > captureStart);

function completeState(overrides = {}) {
  return Object.assign({
    running: true,
    paired: true,
    capture_running: false,
    checked: true,
    helper_build: 'aaaaaaa',
    helper_protocol_version: 1,
    subject_facts_supported: true,
    sold_comps_supported: true
  }, overrides);
}

function createHarness() {
  const calls = [];
  let statusBody = {};
  const context = {
    Array,
    Number,
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
    var localHelperState = { running:false, paired:false, capture_running:false, checked:false, helper_build:'', helper_protocol_version:null, subject_facts_supported:false, sold_comps_supported:false };
    ${uiSource.slice(helpersStart, helpersEnd)}
    ${uiSource.slice(captureStart, captureEnd)}
    ({
      setState:function(value){ localHelperState = value; },
      getState:function(){ return localHelperState; },
      status:localHelperStatusText,
      protocolSupported:helperProtocolSupported,
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
  const incompatible = [{ style: {}, textContent: '' }];
  const pair = [{ style: {} }];
  const message = [{ textContent: 'The helper runs only on your computer.' }];
  const bySelector = {
    '.wos-helper-status, .wos-helper-inline-status': statuses,
    '.wos-helper-capture': buttons,
    '.wos-helper-start-instruction': start,
    '.wos-helper-inline-pair': pair,
    '.wos-helper-outdated-instruction': incompatible,
    '.wos-helper-message': message
  };
  return { statuses, buttons, start, incompatible, pair, message, querySelectorAll: (selector) => bySelector[selector] || [] };
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

async function readHelperStatus() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-cycle43-'));
  const dashboard = 'https://dashboard.example.test';
  const server = helper.createHelperServer({ dashboard_url: dashboard, config_path: path.join(tmp, 'helper.json') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/helper/status`, { headers: { Origin: dashboard } });
    assert.strictEqual(response.status, 200);
    return response.json();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const api = createHarness();
  const target = renderTarget();

  // G1: old helpers without a protocol fail closed.
  api.setStatusBody({ running: true, paired: true, capture_running: false, helper_build: 'oldbuild', subject_facts_supported: true, sold_comps_supported: true });
  api.refresh(target);
  await flush();
  assert.strictEqual(api.getState().helper_protocol_version, null);
  assert.ok(target.statuses[0].textContent.includes('INCOMPATIBLE'));
  assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [true, true]);

  // G2: builds are diagnostic only; protocol and capability control enablement.
  for (const build of ['aaaaaaa', 'bbbbbbb', 'unknown']) {
    api.setState(completeState({ helper_build: build }));
    api.paint(target);
    assert.strictEqual(target.statuses[0].textContent, `Connected - build ${build}`);
    assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [false, false]);
  }

  // G3 and G4: unsupported or non-numeric protocol values fail closed.
  for (const protocol of [0, 2, 99, '1', null, true, {}]) {
    api.setState(completeState({ helper_protocol_version: protocol }));
    api.paint(target);
    assert.ok(target.statuses[0].textContent.includes('INCOMPATIBLE'));
    assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [true, true]);
  }

  // G5: each button requires its own reported capability.
  api.setState(completeState({ subject_facts_supported: false, sold_comps_supported: true }));
  api.paint(target);
  assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [true, false]);
  assert.ok(target.buttons[0].title.includes('subject-facts'));
  api.setState(completeState({ subject_facts_supported: true, sold_comps_supported: false }));
  api.paint(target);
  assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [false, true]);
  assert.ok(target.buttons[1].title.includes('sold-comps'));

  // G6: direct invocation cannot bypass protocol or capability checks.
  api.setState(completeState({ helper_protocol_version: 2 }));
  const incompatible = captureButton('subject_facts');
  const captureCallsBefore = api.calls.filter((call) => /\/helper\/capture$/.test(call.url)).length;
  await api.capture({ querySelector: () => incompatible.message }, incompatible.button);
  const captureCallsAfter = api.calls.filter((call) => /\/helper\/capture$/.test(call.url)).length;
  assert.strictEqual(captureCallsAfter, captureCallsBefore);
  assert.strictEqual(incompatible.message.textContent, 'Helper is incompatible - nothing was opened.');

  // G7: diagnostic state never renders credentials, secrets, or local filesystem paths.
  api.setState(completeState({
    agent_token: 'SECRET_AGENT_TOKEN_SHOULD_NOT_RENDER',
    pairing_token: 'SECRET_PAIRING_TOKEN_SHOULD_NOT_RENDER',
    PIN: 'SECRET_PIN_SHOULD_NOT_RENDER',
    config_path: 'C:\\Users\\secret\\helper.json'
  }));
  api.paint(target);
  const rendered = JSON.stringify(target);
  for (const forbidden of ['SECRET_', 'agent_token', 'pairing_token', 'PIN', 'C:\\\\', 'helper.json']) assert.ok(!rendered.includes(forbidden), forbidden);
  assert.ok(!uiSource.includes('scripts\\\\Start-WholesaleOS-Helper.cmd'));

  // G8: protocol values are source literals, unique, and SHA-independent.
  const protocolDefinition = agentSource.match(/const HELPER_PROTOCOL_VERSION = (\d+);/);
  assert.ok(protocolDefinition);
  assert.strictEqual(Number(protocolDefinition[1]), 1);
  const protocolNeighborhood = agentSource.slice(Math.max(0, protocolDefinition.index - 350), protocolDefinition.index + protocolDefinition[0].length + 350);
  assert.ok(!/execFileSync|readFileSync|process\.env|package\.json/.test(protocolNeighborhood));
  assert.strictEqual((uiSource.match(/var SUPPORTED_HELPER_PROTOCOLS\s*=/g) || []).length, 1);
  assert.ok(!/SUPPORTED_HELPER_BUILD|helperBuildMatches|helper_build\s*[!=]==?/.test(uiSource));
  assert.ok(!/[0-9a-f]{7,40}/i.test(uiSource.slice(helpersStart, helpersEnd)), 'no SHA literal appears in helper gating logic');

  // G9: the status contract is additive and reports protocol plus both capabilities.
  const status = await readHelperStatus();
  for (const field of ['ok', 'connected', 'version', 'running', 'paired', 'capture_running', 'helper_build', 'helper_protocol_version', 'subject_facts_supported', 'sold_comps_supported']) {
    assert.ok(Object.prototype.hasOwnProperty.call(status, field), field);
  }
  assert.strictEqual(status.helper_protocol_version, agent.HELPER_PROTOCOL_VERSION);
  assert.strictEqual(status.subject_facts_supported, true);
  assert.strictEqual(status.sold_comps_supported, true);
  assert.ok(helperSource.includes('helper_protocol_version: compAgent.HELPER_PROTOCOL_VERSION'));

  // G10: a running capture remains disabled.
  api.setState(completeState({ capture_running: true }));
  api.paint(target);
  assert.strictEqual(target.statuses[0].textContent, 'Connected - capture running');
  assert.deepStrictEqual(target.buttons.map((button) => button.disabled), [true, true]);

  // G11: not-running and not-paired states remain unchanged.
  api.setState(completeState({ running: false, paired: false }));
  api.paint(target);
  assert.strictEqual(target.statuses[0].textContent, 'Not running');
  assert.strictEqual(target.start[0].style.display, 'block');
  api.setState(completeState({ paired: false }));
  api.paint(target);
  assert.strictEqual(target.statuses[0].textContent, 'Running - click Pair helper');

  console.log('cycle-43-helper-freshness: ok');
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
