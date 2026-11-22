'use strict';

// Temporary owner decision (Gabriel, 2026-11-22): the PIN lock is off on the hosted app until the build
// is finished. This test proves the switch is exactly that narrow: open only where Railway runs the app,
// closed again with WOS_LOGIN_LOCK=on, and closed for every local run.

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { probeProcessSpawn } = require('./helpers/process-capability');

const root = path.resolve(__dirname, '..');

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function startServer(extraEnv, index) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-lock-off-'));
  const dbPath = path.join(tmp, 'db.json');
  fs.writeFileSync(dbPath, JSON.stringify({ users: [{ id: 'admin', name: 'Test Admin', role: 'admin', created: '2026-01-01T00:00:00.000Z' }], leads: [] }));
  const port = 43000 + ((process.pid + index * 37) % 15000);
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      PORT: String(port), DB_PATH: dbPath,
      WOS_ADMIN_PIN: String(3000 + crypto.randomInt(5000)),
      WOS_SESSION_SECRET: crypto.randomBytes(48).toString('base64url'),
      RAILWAY_PUBLIC_DOMAIN: '', RAILWAY_ENVIRONMENT_NAME: '', RAILWAY_ENVIRONMENT: '', WOS_LOGIN_LOCK: '',
      SENTRY_DSN: '', GMAIL_CLIENT_ID: '', GMAIL_CLIENT_SECRET: '', GDRIVE_REFRESH_TOKEN: '',
      WOS_ENABLE_BACKGROUND_INGESTION: 'false',
      DEAL_BOARD_SNAPSHOTS_PATH: path.join(tmp, 'snapshots.json'),
      DEAL_BOARD_JOBS_PATH: path.join(tmp, 'jobs.json'),
      DEAL_BOARD_AUTO_RUN_PATH: path.join(tmp, 'auto.json'),
      MANUAL_EVIDENCE_PACKETS_PATH: path.join(tmp, 'packets.json'),
      WOS_PAIRING_STATE_PATH: path.join(tmp, 'pairings.json')
    }, extraEnv),
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 900; attempt += 1) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(base + '/health')).ok) return { base, child, tmp }; } catch (_) {}
    await sleep(100);
  }
  child.kill();
  throw new Error('server did not start: ' + output.slice(-800));
}

async function check(label, extraEnv, index, expectOpen) {
  const server = await startServer(extraEnv, index);
  try {
    const session = await (await fetch(server.base + '/api/auth/session')).json();
    assert.strictEqual(session.authenticated, expectOpen, `${label}: session authenticated`);
    const users = await fetch(server.base + '/api/users');
    assert.strictEqual(users.status, expectOpen ? 200 : 401, `${label}: admin API status`);
    if (expectOpen) {
      assert.strictEqual(session.role, 'admin', `${label}: open session is the admin`);
      const body = await users.text();
      assert.ok(!/password|password_hash|"pin"/i.test(body), `${label}: no credentials in the open response`);
    }
  } finally {
    server.child.kill();
    fs.rmSync(server.tmp, { recursive: true, force: true });
  }
}

(async () => {
  if (!(await probeProcessSpawn()).available) {
    console.log('SKIPPED: login lock checks require process spawn');
    return;
  }
  await check('local run', {}, 1, false);
  await check('hosted app, lock off', { RAILWAY_ENVIRONMENT_NAME: 'production' }, 2, true);
  await check('hosted app, lock on', { RAILWAY_ENVIRONMENT_NAME: 'production', WOS_LOGIN_LOCK: 'on' }, 3, false);
  console.log('login lock-off switch: 3 checks passed');
})().catch((error) => { console.error(error); process.exit(1); });
