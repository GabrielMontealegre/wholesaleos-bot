'use strict';

const crypto = require('crypto');

function cleanPin(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function seededDefaultPins() {
  const pins = [String(1000 + 234)];
  for (let index = 1; index <= 9; index += 1) pins.push(String(2000 + index));
  return pins;
}

function isSeededDefaultPin(value) {
  const pin = cleanPin(value);
  return Boolean(pin) && seededDefaultPins().includes(pin);
}

function configuredAdminPin(env) {
  const status = adminPinStatus(env);
  return status.status === 'configured' ? status.pin : '';
}

function adminPinStatus(env) {
  const pin = cleanPin((env || process.env).WOS_ADMIN_PIN);
  if (!pin) return { status: 'unconfigured', pin: '' };
  if (!/^\d{4}$/.test(pin)) return { status: 'malformed_length', pin: '' };
  if (isSeededDefaultPin(pin)) return { status: 'insecure_default', pin: '' };
  return { status: 'configured', pin };
}

function pinsEqual(left, right) {
  const leftBuffer = Buffer.from(cleanPin(left));
  const rightBuffer = Buffer.from(cleanPin(right));
  return leftBuffer.length === rightBuffer.length && leftBuffer.length > 0 && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    color: user.color,
    initials: user.initials,
    firstLogin: Boolean(user.firstLogin)
  };
}

function authenticatePin(input) {
  const options = input || {};
  const users = Array.isArray(options.users) ? options.users : [];
  const pin = cleanPin(options.pin);
  const pinStatus = adminPinStatus(options.env);
  const adminPin = pinStatus.pin;

  if (pinStatus.status !== 'configured') {
    const codeByStatus = {
      unconfigured: 'ADMIN_LOGIN_NOT_CONFIGURED',
      malformed_length: 'ADMIN_LOGIN_MALFORMED',
      insecure_default: 'ADMIN_LOGIN_INSECURE_DEFAULT'
    };
    return {
      ok: false,
      status: 503,
      code: codeByStatus[pinStatus.status],
      error: pinStatus.status === 'malformed_length'
        ? 'Dashboard login configuration has an unusable format.'
        : pinStatus.status === 'insecure_default'
          ? 'Dashboard login is configured with a retired seeded value.'
          : 'Dashboard login is not configured.'
    };
  }

  const admin = users.find((user) => user && user.id === 'admin' && user.role === 'admin');
  if (admin && pinsEqual(pin, adminPin)) {
    return { ok: true, status: 200, user: publicUser(admin) };
  }

  const user = users.find((candidate) => (
    candidate &&
    candidate.id !== 'admin' &&
    cleanPin(candidate.pin) &&
    !isSeededDefaultPin(candidate.pin) &&
    pinsEqual(pin, candidate.pin)
  ));
  if (user) return { ok: true, status: 200, user: publicUser(user) };

  return { ok: false, status: 401, code: 'INVALID_PIN', error: 'Invalid PIN.' };
}

module.exports = {
  authenticatePin,
  adminPinStatus,
  cleanPin,
  configuredAdminPin,
  isSeededDefaultPin,
  publicUser,
  seededDefaultPins
};
