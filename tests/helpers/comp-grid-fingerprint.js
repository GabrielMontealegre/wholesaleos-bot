'use strict';

const crypto = require('crypto');

const EXPECTED_LF_SHA256 = 'bd3249ae8ad122aacd4f5d7f1c23e00f1af851d550470d366ea1ddf2b91948aa';

function compGridFingerprint(source) {
  const text = Buffer.isBuffer(source) ? source.toString('utf8') : String(source);
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

module.exports = { EXPECTED_LF_SHA256, compGridFingerprint };
