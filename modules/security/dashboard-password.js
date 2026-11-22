'use strict';

const crypto = require('crypto');
const PREFIX = 'scrypt-v1$';

function hashPassword(password) {
  if (typeof password !== 'string' || !password) throw new Error('Invalid password');
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return PREFIX + salt.toString('hex') + '$' + key.toString('hex');
}

function equalBytes(left, right) {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPassword(password, stored, legacy = false) {
  if (typeof password !== 'string' || !password || typeof stored !== 'string' || !stored) {
    return { ok: false, legacy: false };
  }
  if (!legacy) {
    const match = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
    if (!match) return { ok: false, legacy: false };
    const key = crypto.scryptSync(password, Buffer.from(match[1], 'hex'), 64);
    return { ok: equalBytes(key, Buffer.from(match[2], 'hex')), legacy: false };
  }
  // Fixed-length digests avoid timing-sensitive comparisons of legacy plaintext.
  const digest = (value) => crypto.createHash('sha256').update(value).digest();
  return { ok: equalBytes(digest(password), digest(stored)), legacy: true };
}

module.exports = { hashPassword, verifyPassword };
