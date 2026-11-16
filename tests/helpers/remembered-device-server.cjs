'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), net = require('node:net'), cp = require('node:child_process');
const auth = require('../../modules/security/dashboard-auth');
const root = path.resolve(__dirname, '../..');
async function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wos-device-fixture-')), dbPath = path.join(dir, 'db.json');
  const pin = nextPin(), otherPin = nextPin(pin), secret = crypto.randomBytes(48).toString('base64url');
  let child, base, output = '';
  function nextPin(other) { let value; do { value = String(3000 + crypto.randomInt(5000)); } while (value === other || auth.isSeededDefaultPin(value)); return value; }
  fs.writeFileSync(dbPath, JSON.stringify({ users: [{ id: 'admin', role: 'admin', name: 'Synthetic owner', firstLogin: false }, { id: 'synthetic-user', role: 'user', name: 'Synthetic user', pin: otherPin, firstLogin: false }], buyers: [], leads: [], assistant_snapshots: [], assistant_upload_keys: [] }));
  async function stop() { if (!child || child.exitCode !== null) return; const active = child; await new Promise(resolve => { active.once('exit', resolve); active.kill(); }); child = null; }
  async function start(options = {}) {
    await stop();
    const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    base = 'http://127.0.0.1:' + port;
    child = cp.spawn(process.execPath, ['-r', path.join(__dirname, 'isolated-dashboard-runtime.cjs'), 'server.js'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port), DB_PATH: dbPath, WOS_ADMIN_PIN: pin, WOS_SESSION_SECRET: secret, WOS_ENABLE_BACKGROUND_INGESTION: 'false', WOS_ISOLATED_DEVICE_TEST: '1', WOS_ISOLATED_DEVICE_WRITE_FAILURE: options.writeFailure ? '1' : '0', DEAL_BOARD_SNAPSHOTS_PATH: path.join(dir, 'snapshots.json'), DEAL_BOARD_JOBS_PATH: path.join(dir, 'jobs.json'), DEAL_BOARD_AUTO_RUN_PATH: path.join(dir, 'auto.json'), MANUAL_EVIDENCE_PACKETS_PATH: path.join(dir, 'packets.json'), WOS_PAIRING_STATE_PATH: path.join(dir, 'pairing.json') } });
    child.stdout.on('data', value => { output += String(value); }); child.stderr.on('data', value => { output += String(value); });
    let spawnError; child.once('error', error => { spawnError = error; });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) { if (spawnError) throw spawnError; if (child.exitCode !== null) throw Error('synthetic_server_exited'); try { if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error('synthetic_server_start_timeout');
  }
  async function close() { await stop(); const resolved = path.resolve(dir); if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('wos-device-fixture-')) throw Error('fixture_cleanup_boundary'); fs.rmSync(resolved, { recursive: true, force: true }); }
  async function request(method, route, body, headers = {}) { const response = await fetch(base + route, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const value = await response.json(); return { status: response.status, headers: response.headers, body: value }; }
  return { start, close, request, pin, otherPin, secret, get base() { return base; }, read: () => JSON.parse(fs.readFileSync(dbPath, 'utf8')), write: value => fs.writeFileSync(dbPath, JSON.stringify(value)), logsContain: values => values.some(value => output.includes(value)) };
}
module.exports = { createFixture };
