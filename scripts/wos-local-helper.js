'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const compAgent = require('./wos-local-comp-agent');
const localConfig = require('../modules/security/local-config-path');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8797;
const DEFAULT_DASHBOARD = 'https://wholesaleos-bot-production.up.railway.app';

function clean(value) { return String(value == null ? '' : value).trim(); }

function dashboardOrigin(value) {
  return compAgent.dashboardOrigin(value || DEFAULT_DASHBOARD);
}

function configResolution(options = {}) {
  if (options.config_path) {
    const file = path.resolve(options.config_path);
    return { path: file, directory: path.dirname(file), source: 'EXPLICIT_OPTION', read_only: false, warnings: [] };
  }
  return localConfig.resolveLocalConfigPath({ env: options.env || process.env });
}

function readConfig(file) {
  const target = file || configResolution().path;
  try {
    const value = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (!value || !clean(value.dashboard_url) || !clean(value.agent_token)) return null;
    return { dashboard_url: dashboardOrigin(value.dashboard_url), agent_token: clean(value.agent_token) };
  } catch (_) { return null; }
}

function writeConfig(value, file) {
  const config = { dashboard_url: dashboardOrigin(value.dashboard_url), agent_token: clean(value.agent_token) };
  if (!config.agent_token) throw new Error('agent_token_required');
  const resolved = file ? { path: file, read_only: false } : configResolution();
  if (resolved.read_only) throw Object.assign(new Error('legacy_helper_config_is_read_only'), { code: 'WOS_HELPER_CONFIG_READ_ONLY' });
  localConfig.writeFileAtomic(resolved.path, JSON.stringify(config));
  return config;
}

function clearConfig(file) {
  const resolved = file ? { path: file, read_only: false } : configResolution();
  if (resolved.read_only) return false;
  try { fs.unlinkSync(resolved.path); } catch (error) { if (!error || error.code !== 'ENOENT') throw error; }
  return true;
}

function json(res, status, body, origin) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('request_body_too_large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (_) { reject(Object.assign(new Error('invalid_json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function probePort(host, port, options = {}) {
  const netImpl = options.net_impl || net;
  return new Promise((resolve) => {
    const server = netImpl.createServer();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch (_) { /* Probe server may not be listening. */ }
      resolve(result);
    };
    server.once('error', (error) => done({ free: false, reason: clean(error && error.code || error && error.message || 'unknown') }));
    server.listen(port, host, () => done({ free: true, reason: '' }));
  });
}

function probeRunningHelper(host, port, origin) {
  return new Promise((resolve) => {
    const request = http.get({ host, port, path: '/helper/status', headers: { Origin: origin }, timeout: 1500 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (_) { resolve(null); }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

async function doctorReport(options = {}) {
  const resolved = configResolution(options);
  const fsImpl = options.fs_impl || fs;
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || process.env.LOCAL_COMP_AGENT_PORT || DEFAULT_PORT);
  let writable = false;
  let writeReason = '';
  const probeFile = path.join(resolved.directory, `.wos-doctor-${process.pid}-${Date.now()}.tmp`);
  try {
    fsImpl.mkdirSync(resolved.directory, { recursive: true });
    fsImpl.writeFileSync(probeFile, 'probe', { mode: 0o600 });
    fsImpl.unlinkSync(probeFile);
    writable = true;
  } catch (error) {
    writeReason = clean(error && error.code || error && error.message || 'write failed');
    try { fsImpl.unlinkSync(probeFile); } catch (_) { /* Best effort. */ }
  }
  const portState = await probePort(host, port, options);
  const config = readConfig(resolved.path);
  const runningStatus = portState.free ? null : await (options.running_status_impl
    ? options.running_status_impl(host, port) : probeRunningHelper(host, port, config && config.dashboard_url || DEFAULT_DASHBOARD));
  const nextAction = !writable
    ? 'Set WOS_HELPER_HOME to a folder you can write to, then run scripts\\Start-WholesaleOS-Helper.cmd again.'
    : !portState.free
      ? 'The helper port is already in use. Return to the dashboard and click Retry connection.'
      : config
        ? 'Start the helper and leave this window open, then return to the dashboard and click Retry connection.'
        : 'Start the helper, leave this window open, then use Pair helper once in the dashboard.';
  return {
    node_binary: process.execPath,
    node_version: process.version,
    config_directory: resolved.directory,
    config_writable: writable,
    config_write_reason: writeReason,
    port,
    port_free: portState.free,
    port_reason: portState.reason,
    pairing_config_exists: !!config,
    dashboard_origin: config ? config.dashboard_url : '',
    local_helper_build: compAgent.HELPER_BUILD,
    local_subject_facts_supported: compAgent.SUPPORTED_MODES.includes('subject_facts'),
    running_helper_build: clean(runningStatus && runningStatus.helper_build) || 'unknown',
    running_subject_facts_supported: runningStatus && runningStatus.subject_facts_supported === true,
    running_helper_stale: !!runningStatus && (!clean(runningStatus.helper_build) || runningStatus.subject_facts_supported !== true),
    next_action: nextAction
  };
}

function printDoctor(report) {
  console.log('WholesaleOS Local Helper Doctor');
  console.log(`Node: ${report.node_binary} (${report.node_version})`);
  console.log(`Configuration directory: ${report.config_directory}`);
  console.log(`Configuration directory writable: ${report.config_writable ? 'YES' : `NO (${report.config_write_reason || 'unknown reason'})`}`);
  console.log(`Port ${report.port}: ${report.port_free ? 'FREE' : `ALREADY HELD (${report.port_reason || 'unknown reason'})`}`);
  console.log(`Pairing configuration: ${report.pairing_config_exists ? `PRESENT for ${report.dashboard_origin}` : 'NOT PRESENT'}`);
  console.log(`Local checkout helper build: ${report.local_helper_build}; subject_facts: ${report.local_subject_facts_supported ? 'YES' : 'NO'}`);
  if (!report.port_free) console.log(`Running helper build: ${report.running_helper_build}; subject_facts: ${report.running_subject_facts_supported ? 'YES' : 'NO/UNKNOWN'}${report.running_helper_stale ? '; STALE/UNKNOWN BUILD - restart helper' : ''}`);
  console.log(`Next action: ${report.next_action}`);
}

function createHelperServer(options = {}) {
  const allowedOrigin = dashboardOrigin(options.dashboard_url || process.env.WOS_DASHBOARD_URL || DEFAULT_DASHBOARD);
  const resolvedConfig = configResolution(options);
  const configFile = resolvedConfig.path;
  const fetchImpl = options.fetch_impl || global.fetch;
  const runCapture = options.run_capture_impl || compAgent.runCapture;
  let captureRunning = false;

  return http.createServer(async (req, res) => {
    const origin = clean(req.headers.origin);
    if (origin !== allowedOrigin) return json(res, 403, { ok: false, code: 'HELPER_ORIGIN_FORBIDDEN' });
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.setHeader('Access-Control-Max-Age', '600');
      res.setHeader('Vary', 'Origin');
      return res.end();
    }

    try {
      if (req.method === 'GET' && req.url === '/helper/status') {
        return json(res, 200, { ok: true, connected: true, version: 1, running: true, paired: !!readConfig(configFile),
          capture_running: captureRunning, helper_build: compAgent.HELPER_BUILD, subject_facts_supported: compAgent.SUPPORTED_MODES.includes('subject_facts') }, allowedOrigin);
      }

      if (req.method === 'POST' && req.url === '/helper/pair') {
        const body = await readJson(req);
        const pairingToken = clean(body.pairing_token);
        if (!pairingToken) return json(res, 400, { ok: false, code: 'PAIRING_TOKEN_REQUIRED' }, allowedOrigin);
        const response = await fetchImpl(`${allowedOrigin}/api/auth/pairing-exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairing_token: pairingToken })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok || !clean(result.agent_token)) {
          return json(res, 401, { ok: false, code: clean(result.code) || 'PAIRING_EXCHANGE_FAILED' }, allowedOrigin);
        }
        writeConfig({ dashboard_url: allowedOrigin, agent_token: result.agent_token }, configFile);
        return json(res, 200, { ok: true, paired: true, expires_at: result.expires_at || null }, allowedOrigin);
      }

      if (req.method === 'POST' && req.url === '/helper/capture') {
        if (captureRunning) return json(res, 409, { ok: false, code: 'CAPTURE_ALREADY_RUNNING' }, allowedOrigin);
        const config = readConfig(configFile);
        if (!config) return json(res, 401, { ok: false, code: 'HELPER_PAIRING_REQUIRED' }, allowedOrigin);
        const body = await readJson(req);
        if (!body.market || !clean(body.queue_key)) return json(res, 400, { ok: false, code: 'MARKET_AND_QUEUE_KEY_REQUIRED' }, allowedOrigin);
        if (!compAgent.SUPPORTED_MODES.includes(body.mode)) return json(res, 400, { ok: false, code: 'CAPTURE_MODE_REQUIRED' }, allowedOrigin);
        captureRunning = true;
        try {
          const result = await runCapture({
            market: body.market,
            queue_key: clean(body.queue_key),
            site: clean(body.site || 'zillow'),
            mode: body.mode,
            dashboard_url: config.dashboard_url,
            agent_token: config.agent_token
          });
          return json(res, 200, { ok: true, run: result.run, log_path: result.log_path }, allowedOrigin);
        } catch (error) {
          const reason = compAgent.safeFailureReason(error);
          if (/http_401|session|pair/i.test(reason) || /401/.test(clean(error && error.message))) clearConfig(configFile);
          return json(res, 502, { ok: false, code: reason }, allowedOrigin);
        } finally { captureRunning = false; }
      }

      return json(res, 404, { ok: false, code: 'HELPER_ROUTE_NOT_FOUND' }, allowedOrigin);
    } catch (error) {
      return json(res, Number(error && error.status) || 500, { ok: false, code: compAgent.safeFailureReason(error) }, allowedOrigin);
    }
  });
}

async function main(argv = process.argv.slice(2)) {
  let resolvedConfig;
  try { resolvedConfig = configResolution(); }
  catch (error) {
    console.error(error && error.message ? error.message : 'WholesaleOS helper config resolution failed.');
    process.exitCode = 1;
    return 1;
  }
  if (argv.includes('--print-config-directory')) {
    console.log(resolvedConfig.directory);
    return 0;
  }
  if (argv.includes('--doctor')) {
    printDoctor(await doctorReport({ config_path: resolvedConfig.path }));
    return 0;
  }
  const host = DEFAULT_HOST;
  const port = Number(process.env.LOCAL_COMP_AGENT_PORT || DEFAULT_PORT);
  const server = createHelperServer({ config_path: resolvedConfig.path });
  server.listen(port, host, () => {
    console.log(`WholesaleOS local helper ready at http://${host}:${port}.`);
    console.log(`Pairing configuration directory: ${resolvedConfig.directory}`);
    console.log('Leave this window open. In the dashboard, click Pair helper once, then click Capture on one property row.');
    console.log('No listing page opens until you click Capture in the dashboard.');
  });
}

if (require.main === module) main().catch((error) => {
  console.error(error && error.message ? error.message : 'WholesaleOS helper failed.');
  process.exitCode = 1;
});

module.exports = {
  DEFAULT_DASHBOARD,
  DEFAULT_HOST,
  DEFAULT_PORT,
  clearConfig,
  createHelperServer,
  configResolution,
  doctorReport,
  dashboardOrigin,
  readConfig,
  probePort,
  printDoctor,
  writeConfig
};
