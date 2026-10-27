'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scanText, formatFindings } = require('../modules/security/offline-secret-scan');
const root = path.resolve(__dirname, '..');
const forged = 'AIza' + 'Ab2Cd3Ef4Gh5Ij6Kl7Mn8Op9Qr0St1Uv2Wx';
assert.equal(forged.length, 39);
assert(scanText('temporary-fixture.txt', forged).some(row => row.rule === 'google-key'));
assert(!formatFindings(scanText('temporary-fixture.txt', forged)).includes(forged));
const providerFixtures = [
  ['private-key', '-----BEGIN ' + 'PRIVATE KEY-----'],
  ['cloud-key', 'AKIA' + 'A2'.repeat(8)],
  ['github-token', 'ghp_' + 'b3'.repeat(20)],
  ['provider-token', 'sk-' + 'C4d5'.repeat(8)],
  ['twilio-sid', 'AC' + 'a2'.repeat(16)],
  ['jwt', 'eyJ' + 'a2'.repeat(8) + '.' + 'b3'.repeat(8) + '.' + 'c4'.repeat(16)],
  ['url-credentials', 'postgres://' + 'user:fixture-password@db.example.test/database'],
  ['sentry-dsn', 'https://' + 'a2'.repeat(16) + '@o1.ingest.sentry.io/123'],
  ['bearer-token', 'Bearer ' + 'a2B3'.repeat(8)]
];
for (const [rule, value] of providerFixtures) {
  const rows = scanText('temporary-fixture.txt', value);
  assert(rows.some(row => row.rule === rule), 'Detector missing: ' + rule);
  assert(!formatFindings(rows).includes(value), 'Diagnostic contains a value');
  assert.deepEqual(rows, scanText('temporary-fixture.txt', value), 'Deterministic results');
}
assert.equal(scanText('tests/fixture.js', 'password="made-up-test-password"').length, 0);
assert.equal(scanText('tests/fixture.js', forged + ' // synthetic-secret-fixture').length, 0);
assert(scanText('tests/fixture.js', forged).length > 0, 'Realistic unmarked test credentials are not exempt');
assert(scanText('dashboard/fixture.js', forged + ' // synthetic-secret-fixture').length > 0);
for (const name of ['dashboard/fixture.js', 'courthouse-addon/courthouse-tab.js']) {
  assert(scanText(name, 'process.env.SOMETHING').some(row => row.rule === 'client-process-env'));
  assert(scanText(name, 'process["env"].SOMETHING').some(row => row.rule === 'client-process-env'));
  assert(scanText(name, 'process\n.env.SOMETHING').some(row => row.rule === 'client-process-env'));
}
assert.equal(scanText('courthouse-addon/drive-uploader.js', 'process.env.SOMETHING').length, 0);
const assignment = 'password="' + 'aB3dE5gH7jK9mN2pQ4sT6vW8xY0z' + '"';
assert(scanText('module.js', assignment).some(row => row.rule === 'entropy-assignment'));
assert(scanText('module.js', assignment.replace('password', 'apiKey')).some(row => row.rule === 'entropy-assignment'));
assert(scanText('module.json', '{"apiKey":' + assignment.split('=')[1] + '}').some(row => row.rule === 'entropy-assignment'));
assert.equal(scanText('module.js', 'const text = "pin: ' + "'" + ' + expression(value) : ' + "'" + '";').length, 0);
assert(scanText('tests/fixture.js', 'token="synthetic-test-value-123456789"').length === 0);
assert(scanText('module.js', 'ledger_key="public-record-coordinate-123456789"').length === 0);
assert.equal(scanText('tests/fixture.js', assignment + ' // synthetic-secret-fixture').length, 0);
const sentinel = 'PRIVATE-VALUE-MUST-NOT-LEAK';
assert.equal(formatFindings(scanText('module.js', sentinel)), '');
const oldNow = Date.now, oldFetch = global.fetch;
try {
  Date.now = global.fetch = () => { throw Error('Ambient effect'); };
  assert(scanText('temporary-fixture.txt', forged).length > 0);
} finally { Date.now = oldNow; global.fetch = oldFetch; }
const ignored = ['.env', '.env.local', 'nested/.env.private', 'private.pem', 'private.key', 'private.p12', 'private.pfx'];
for (const name of ignored) {
  const result = execFileSync('git', ['check-ignore', '--no-index', name], { cwd: root, encoding: 'utf8' });
  assert.equal(result.trim(), name);
}
const { status: exampleStatus } = require('node:child_process').spawnSync('git', ['check-ignore', '--no-index', '.env.example'], { cwd: root });
assert.equal(exampleStatus, 1, 'Example env template must remain trackable');
const dockerIgnore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split(/\r?\n/);
for (const name of ['exports', 'data/db.json', 'helper.json', '.local-comp-agent.json', '.wholesaleos', '.git', '.env', '.env.*', 'node_modules', 'tests/.tmp', 'docs/screens']) assert(dockerIgnore.includes(name));
const findings = [];
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\0').filter(Boolean);
assert(tracked.length > 0, 'Missing tracked inventory is not a clean scan');
for (const name of tracked) {
  const target = path.resolve(root, name);
  assert(target.startsWith(root + path.sep), 'Tracked path escaped checkout');
  const bytes = fs.readFileSync(target);
  if (bytes.includes(0)) continue;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { continue; }
  findings.push(...scanText(name, text));
}
if (findings.length) {
  console.error(formatFindings(findings));
  process.exitCode = 1;
} else console.log('no-secrets-in-tracked-files: offline tracked text/client gate and redacted synthetic negatives passed');
