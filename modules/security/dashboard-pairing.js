'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sessions = require('./dashboard-session');

const AGENT_PERMISSIONS = Object.freeze(['deal_board:read', 'manual_evidence:write']);

function statePath(options = {}) {
  return path.resolve(options.state_path || (options.env || process.env).WOS_PAIRING_STATE_PATH || path.join(__dirname, '..', '..', 'data', 'dashboard-pairing-state.json'));
}
function blankState() { return { version: 1, pairings: {}, agents: {} }; }
function readState(options = {}) {
  try {
    const value = JSON.parse(fs.readFileSync(statePath(options), 'utf8'));
    return value && value.version === 1 ? value : blankState();
  } catch (_) { return blankState(); }
}
function writeState(state, options = {}) {
  const file = statePath(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
  fs.renameSync(temporary, file);
}
function prune(state, now) {
  for (const [nonce, item] of Object.entries(state.pairings || {})) {
    if (!item || Number(item.expiresAt) <= now) delete state.pairings[nonce];
  }
  for (const [nonce, item] of Object.entries(state.agents || {})) {
    if (!item || Number(item.expiresAt) <= now) delete state.agents[nonce];
  }
}

function createPairing(user, options = {}) {
  const now = Number(options.now == null ? Date.now() : options.now);
  const nonce = crypto.randomUUID();
  const issued = sessions.issueSession({ userId: user.id, role: user.role, scope: 'pairing', nonce }, {
    env: options.env, secret: options.secret, now, lifetime_ms: sessions.PAIRING_LIFETIME_MS
  });
  const state = readState(options);
  prune(state, now);
  state.pairings[nonce] = { userId: user.id, role: user.role, expiresAt: issued.payload.expiresAt, used: false };
  writeState(state, options);
  const code = crypto.createHash('sha256').update(nonce).digest('hex').slice(0, 6).toUpperCase();
  return { pairing_token: issued.token, pairing_code: code, expires_at: new Date(issued.payload.expiresAt).toISOString() };
}

function exchangePairing(token, options = {}) {
  const now = Number(options.now == null ? Date.now() : options.now);
  const verified = sessions.verifySession(token, { env: options.env, secret: options.secret, now });
  if (!verified.ok || verified.user.scope !== 'pairing') return { ok: false, code: verified.code || 'PAIRING_TOKEN_INVALID' };
  const state = readState(options);
  prune(state, now);
  const pairing = state.pairings[verified.payload.nonce];
  if (!pairing || pairing.used) return { ok: false, code: 'PAIRING_TOKEN_CONSUMED' };
  pairing.used = true;
  const agentNonce = crypto.randomUUID();
  const issued = sessions.issueSession({
    userId: pairing.userId, role: pairing.role, scope: 'agent', permissions: AGENT_PERMISSIONS, nonce: agentNonce
  }, { env: options.env, secret: options.secret, now, lifetime_ms: sessions.AGENT_LIFETIME_MS });
  state.agents[agentNonce] = { userId: pairing.userId, expiresAt: issued.payload.expiresAt, revoked: false };
  writeState(state, options);
  return { ok: true, agent_token: issued.token, expires_at: new Date(issued.payload.expiresAt).toISOString() };
}

function verifyAgent(token, permission, options = {}) {
  const now = Number(options.now == null ? Date.now() : options.now);
  const verified = sessions.verifySession(token, { env: options.env, secret: options.secret, now });
  if (!verified.ok || verified.user.scope !== 'agent') return { ok: false, code: verified.code || 'AGENT_SESSION_INVALID' };
  if (!verified.user.permissions.includes(permission)) return { ok: false, code: 'AGENT_SCOPE_FORBIDDEN' };
  const state = readState(options);
  prune(state, now);
  const agent = state.agents[verified.payload.nonce];
  if (!agent || agent.revoked) return { ok: false, code: 'AGENT_SESSION_REVOKED' };
  return { ok: true, user: verified.user, payload: verified.payload };
}

function revokeForUser(userId, options = {}) {
  const state = readState(options);
  let revoked = 0;
  for (const item of Object.values(state.pairings || {})) {
    if (item.userId === userId && !item.used) { item.used = true; revoked += 1; }
  }
  for (const item of Object.values(state.agents || {})) {
    if (item.userId === userId && !item.revoked) { item.revoked = true; revoked += 1; }
  }
  writeState(state, options);
  return revoked;
}

module.exports = { AGENT_PERMISSIONS, statePath, createPairing, exchangePairing, verifyAgent, revokeForUser };
