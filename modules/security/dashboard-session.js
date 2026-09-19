'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'wos_session';
const DASHBOARD_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const AGENT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PAIRING_LIFETIME_MS = 10 * 60 * 1000;

function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function configuredSecret(options = {}) {
  const env = options.env || process.env;
  return clean(options.secret || env.WOS_SESSION_SECRET);
}
function isConfigured(options = {}) { return Buffer.byteLength(configuredSecret(options)) >= 32; }
function encode(value) { return Buffer.from(value).toString('base64url'); }
function sign(unsigned, secret) { return crypto.createHmac('sha256', secret).update(unsigned).digest('base64url'); }

function issueSession(identity = {}, options = {}) {
  const secret = configuredSecret(options);
  if (Buffer.byteLength(secret) < 32) throw Object.assign(new Error('Session signing is not configured.'), { code: 'SESSION_NOT_CONFIGURED' });
  const now = Number(options.now == null ? Date.now() : options.now);
  const lifetime = Number(options.lifetime_ms || DASHBOARD_LIFETIME_MS);
  const payload = {
    v: 1,
    userId: clean(identity.userId || identity.id),
    role: clean(identity.role),
    scope: clean(identity.scope || 'dashboard'),
    permissions: Array.isArray(identity.permissions) ? identity.permissions.map(clean).filter(Boolean) : [],
    issuedAt: now,
    expiresAt: now + lifetime,
    nonce: clean(identity.nonce) || crypto.randomUUID()
  };
  if (!payload.userId || !payload.role) throw new Error('session_identity_required');
  const unsigned = encode(JSON.stringify(payload));
  return { token: `${unsigned}.${sign(unsigned, secret)}`, payload, lifetime_ms: lifetime };
}

function verifySession(token, options = {}) {
  const value = clean(token);
  if (!value) return { ok: false, code: 'SESSION_MISSING' };
  const parts = value.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, code: 'SESSION_MALFORMED' };
  const secret = configuredSecret(options);
  if (Buffer.byteLength(secret) < 32) return { ok: false, code: 'SESSION_BAD_SIGNATURE' };
  const expected = Buffer.from(sign(parts[0], secret));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return { ok: false, code: 'SESSION_BAD_SIGNATURE' };
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch (_) { return { ok: false, code: 'SESSION_MALFORMED' }; }
  if (!payload || payload.v !== 1 || !clean(payload.userId) || !clean(payload.role) ||
      !Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt) || !clean(payload.nonce)) {
    return { ok: false, code: 'SESSION_MALFORMED' };
  }
  const now = Number(options.now == null ? Date.now() : options.now);
  if (payload.expiresAt <= now) return { ok: false, code: 'SESSION_EXPIRED' };
  const lifetime = payload.expiresAt - payload.issuedAt;
  return {
    ok: true,
    user: { id: payload.userId, role: payload.role, scope: clean(payload.scope || 'dashboard'), permissions: payload.permissions || [] },
    payload,
    should_renew: now - payload.issuedAt > lifetime / 2
  };
}

function parseCookies(header) {
  return clean(header).split(';').reduce((out, part) => {
    const index = part.indexOf('=');
    if (index < 1) return out;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch (_) { out[key] = value; }
    return out;
  }, {});
}

function tokenFromRequest(req) { return parseCookies(req && req.headers && req.headers.cookie)[COOKIE_NAME] || ''; }
function sessionCookie(token, maxAgeMs) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${Math.max(0, Math.floor(Number(maxAgeMs) / 1000))}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
function clearCookie() { return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`; }

module.exports = {
  COOKIE_NAME,
  DASHBOARD_LIFETIME_MS,
  AGENT_LIFETIME_MS,
  PAIRING_LIFETIME_MS,
  configuredSecret,
  isConfigured,
  issueSession,
  verifySession,
  parseCookies,
  tokenFromRequest,
  sessionCookie,
  clearCookie
};
