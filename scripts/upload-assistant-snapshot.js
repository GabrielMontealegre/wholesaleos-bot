'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { MAX_BYTES } = require('../modules/records/assistant-snapshot');
const ENDPOINT = 'https://wholesaleos-bot-production.up.railway.app/api/dashboard/assistant-snapshots';
function readBounded(filename, limit) {
  if (!fs.lstatSync(filename).isFile()) throw Error();
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    if (!fs.fstatSync(fd).isFile()) throw Error();
    const bytes = Buffer.alloc(limit + 1); let length = 0, count;
    while (length < bytes.length && (count = fs.readSync(fd, bytes, length, bytes.length - length, null)) > 0) length += count;
    if (!length || length > limit) throw Error();
    return bytes.subarray(0, length);
  } finally { fs.closeSync(fd); }
}
function json(bytes) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
function exact(value, names) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)); }
async function uploadLatest({ keyFile = path.join(__dirname, '../exports/assistant/assistant-upload-key.json'), snapshotDir = path.join(__dirname, '../exports/assistant/snapshots'), fetchImpl = fetch } = {}) {
  let key, bytes, filename;
  try {
    const file = json(readBounded(keyFile, 4096));
    if (!exact(file, ['schema', 'version', 'key']) || file.schema !== 'wos-assistant-upload-key' || file.version !== 1 || typeof file.key !== 'string' || !/^wosai_[a-f0-9]{32}_[a-f0-9]{64}$/.test(file.key)) throw Error();
    key = file.key;
  } catch (_) { return { exitCode: 1, message: 'upload key missing or revoked' }; }
  try {
    const files = fs.readdirSync(snapshotDir, { withFileTypes: true }).filter(file => file.isFile() && /^wos-assistant-[a-zA-Z0-9._-]+\.json$/.test(file.name) && file.name.length <= 128)
      .map(file => ({ name: file.name, time: fs.lstatSync(path.join(snapshotDir, file.name)).mtimeMs }));
    files.sort((a, b) => b.time - a.time || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    if (!files.length) throw Error();
    filename = files[0].name; bytes = readBounded(path.join(snapshotDir, filename), MAX_BYTES);
    const value = json(bytes);
    if (!value || value.schema !== 'wos-assistant-snapshot' || value.version !== 1) throw Error();
    // Calendar/field/future validation remains authoritative in the server decoder.
  } catch (_) { key = ''; return { exitCode: 1, message: 'Assistant snapshot unavailable or invalid.' }; }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetchImpl(ENDPOINT, { method: 'POST', redirect: 'error', credentials: 'omit', signal: controller.signal, body: bytes,
      headers: { 'Content-Type': 'application/octet-stream', 'X-WOS-Assistant-Upload-Key': key, 'X-WOS-Assistant-Filename': filename, 'X-WOS-Assistant-Request': crypto.createHash('sha256').update(bytes).digest('hex') } });
    if ([401, 403].includes(response.status)) return { exitCode: 1, message: 'upload key missing or revoked' };
    if (!response.ok) throw Error();
    const value = await response.json(), names = ['deals', 'buyers', 'texts', 'calls', 'emails_waiting'];
    if (!exact(value, ['ok', 'imported_at', 'counts', 'duplicate']) || value.ok !== true || typeof value.duplicate !== 'boolean' || !exact(value.counts, names) ||
        !names.every(name => Number.isSafeInteger(value.counts[name]) && value.counts[name] >= 0 && value.counts[name] <= 10000) ||
        typeof value.imported_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.imported_at) || new Date(value.imported_at).toISOString() !== value.imported_at) throw Error();
    return { exitCode: 0, message: names.map(name => name + '=' + value.counts[name]).join(' ') + ' receipt=' + value.imported_at };
  } catch (_) { return { exitCode: 1, message: 'Upload result unavailable; no retry made.' }; }
  finally { key = ''; clearTimeout(timer); }
}
function argumentsFor(args) {
  const result = {}, seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--key-file', '--snapshot-dir'].includes(args[i]) || !args[i + 1] || seen.has(args[i])) throw Error();
    seen.add(args[i]); result[args[i] === '--key-file' ? 'keyFile' : 'snapshotDir'] = args[i + 1];
  }
  return result;
}
if (require.main === module) {
  (async () => { let options; try { options = argumentsFor(process.argv.slice(2)); } catch (_) { console.error('Invalid uploader options.'); process.exitCode = 1; return; }
    const result = await uploadLatest(options); console[result.exitCode ? 'error' : 'log'](result.message); process.exitCode = result.exitCode;
  })().catch(() => { console.error('Upload result unavailable; no retry made.'); process.exitCode = 1; });
}
module.exports = { uploadLatest, argumentsFor };
