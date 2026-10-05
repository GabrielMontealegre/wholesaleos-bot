'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EXPECTED_LF_SHA256, compGridFingerprint } = require('./helpers/comp-grid-fingerprint');

const source = fs.readFileSync(path.join(__dirname, '..', 'modules/research/strict-comp-grid-config.js'), 'utf8');
const lf = source.replace(/\r\n/g, '\n');
const crlf = lf.replace(/\n/g, '\r\n');

assert.strictEqual(compGridFingerprint(lf), EXPECTED_LF_SHA256);
assert.strictEqual(compGridFingerprint(crlf), EXPECTED_LF_SHA256);
assert(lf.includes('max_distance_miles: 1,'));
assert.notStrictEqual(compGridFingerprint(lf.replace('max_distance_miles: 1,', 'max_distance_miles: 2,')),
  EXPECTED_LF_SHA256);

console.log('comp-grid fingerprint: LF and CRLF agree; content change fails');
