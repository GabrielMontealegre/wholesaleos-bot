'use strict';
const path = require('node:path'), os = require('node:os');
const target = path.resolve(process.env.DB_PATH || '');
if (process.env.WOS_ISOLATED_DEVICE_TEST !== '1' || path.dirname(target) === target || path.dirname(path.dirname(target)) !== path.resolve(os.tmpdir()) || !path.basename(path.dirname(target)).startsWith('wos-device-fixture-')) throw Error('isolated_device_fixture_required');
require('dotenv').config = () => ({ parsed: {} });
for (const name of Object.keys(process.env)) if (/^(SENTRY_|GMAIL_|GDRIVE_|GOOGLE_|TWILIO_|STRIPE_|OPENAI_|ANTHROPIC_|SERPER_|SCRAPERAPI_|APIFY_)/.test(name)) process.env[name] = '';
function local(input) { const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input?.hostname || input?.host || 'localhost'; return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).replace(/:\d+$/, '')); }
for (const name of ['node:http', 'node:https']) { const mod = require(name); for (const method of ['request', 'get']) { const original = mod[method]; mod[method] = function (...args) { if (!local(args[0])) throw Error('isolated_external_request_blocked'); return original.apply(this, args); }; } }
const originalFetch = global.fetch; global.fetch = (input, options) => local(typeof input === 'object' && input.url ? input.url : input) ? originalFetch(input, options) : Promise.reject(Error('isolated_external_request_blocked'));
if (process.env.WOS_ISOLATED_DEVICE_WRITE_FAILURE === '1') { const db = require('../../db'), original = db.writeDB; db.writeDB = function (value) { if (Object.hasOwn(value, 'remembered_devices')) throw Error('synthetic_store_write_failure'); return original(value); }; }
