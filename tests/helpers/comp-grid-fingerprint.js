'use strict';

const crypto = require('crypto');

const EXPECTED_LF_SHA256 = '0ae7236539b77b2e8312f7cd2ce80db9156a357e424d6eeeee8848d397fbd272';

function compGridFingerprint(source) {
  const text = Buffer.isBuffer(source) ? source.toString('utf8') : String(source);
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

module.exports = { EXPECTED_LF_SHA256, compGridFingerprint };
