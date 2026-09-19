'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function codedError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function fakeFs(options = {}) {
  const entries = new Map();
  const calls = [];
  const normalize = (value) => String(value).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const blockedWrites = (options.blocked_write_prefixes || []).map(normalize);
  const blockedMkdirs = (options.blocked_mkdir_prefixes || []).map(normalize);
  const blockedUnlinks = new Set((options.blocked_unlinks || []).map(normalize));
  let renameFailures = Number(options.rename_failures || 0);

  for (const [file, value] of Object.entries(options.files || {})) {
    entries.set(normalize(file), { type: 'file', contents: Buffer.from(String(value)), mode: 0o600 });
  }

  const api = {
    calls,
    entries,
    normalize,
    existsSync(target) { return entries.has(normalize(target)); },
    mkdirSync(target, callOptions = {}) {
      calls.push({ method: 'mkdirSync', path: target, options: callOptions });
      if (blockedMkdirs.some((prefix) => normalize(target).startsWith(prefix))) throw codedError('EPERM', 'blocked mkdir contains no credential');
      entries.set(normalize(target), { type: 'directory', mode: callOptions.mode });
    },
    writeFileSync(target, contents, callOptions = {}) {
      calls.push({ method: 'writeFileSync', path: target, options: callOptions });
      if (blockedWrites.some((prefix) => normalize(target).startsWith(prefix))) throw codedError('EPERM', 'blocked write contains no credential');
      if (callOptions.flag === 'wx' && entries.has(normalize(target))) throw codedError('EEXIST');
      entries.set(normalize(target), { type: 'file', contents: Buffer.isBuffer(contents) ? Buffer.from(contents) : Buffer.from(String(contents)), mode: callOptions.mode });
    },
    chmodSync(target, mode) {
      calls.push({ method: 'chmodSync', path: target, mode });
      if (options.chmod_error) throw codedError('EPERM');
      const entry = entries.get(normalize(target));
      if (entry) entry.mode = mode;
    },
    renameSync(from, to) {
      calls.push({ method: 'renameSync', from, to });
      if (renameFailures > 0) { renameFailures -= 1; throw codedError('EPERM'); }
      const entry = entries.get(normalize(from));
      if (!entry) throw codedError('ENOENT');
      entries.set(normalize(to), entry);
      entries.delete(normalize(from));
    },
    unlinkSync(target) {
      calls.push({ method: 'unlinkSync', path: target });
      if (blockedUnlinks.has(normalize(target))) throw codedError('EPERM');
      if (!entries.delete(normalize(target))) throw codedError('ENOENT');
    },
    readFileSync(target, encoding) {
      calls.push({ method: 'readFileSync', path: target });
      const entry = entries.get(normalize(target));
      if (!entry || entry.type !== 'file') throw codedError('ENOENT');
      return encoding ? entry.contents.toString(encoding) : Buffer.from(entry.contents);
    }
  };
  return api;
}

const resolverFile = require.resolve('../modules/security/local-config-path');
delete require.cache[resolverFile];
const importMethods = ['mkdirSync', 'writeFileSync', 'unlinkSync', 'renameSync', 'chmodSync'];
const originals = {};
let importSideEffects = 0;
for (const method of importMethods) {
  originals[method] = fs[method];
  fs[method] = function wrappedImportProbe(...args) { importSideEffects += 1; return originals[method].apply(this, args); };
}
const resolver = require('../modules/security/local-config-path');
for (const method of importMethods) fs[method] = originals[method];
assert.strictEqual(importSideEffects, 0, 'import must not touch the filesystem');

const agent = require('../scripts/wos-local-comp-agent');

function resolveWith(fake, options) {
  return resolver.resolveLocalConfigPath(Object.assign({
    fs_impl: fake,
    probe_path_factory: (directory) => `${directory}${String(directory).includes('\\') ? '\\' : '/'}probe`
  }, options));
}

(() => {
  const fake = fakeFs();
  const result = resolveWith(fake, {
    platform: 'win32', path_impl: path.win32, homedir: 'C:\\Users\\Gabriel', repository_root: 'C:\\repo',
    env: { WOS_HELPER_CONFIG: 'C:\\override\\exact.json', WOS_HELPER_HOME: 'C:\\home', LOCALAPPDATA: 'C:\\local', APPDATA: 'C:\\roaming' }
  });
  assert.strictEqual(result.path, 'C:\\override\\exact.json');
  assert.strictEqual(result.source, 'WOS_HELPER_CONFIG');
})();

(() => {
  const win = resolveWith(fakeFs(), {
    platform: 'win32', path_impl: path.win32, homedir: 'C:\\Users\\Gabriel', repository_root: 'C:\\repo',
    env: { LOCALAPPDATA: 'C:\\Local', APPDATA: 'C:\\Roaming' }
  });
  const darwin = resolveWith(fakeFs(), {
    platform: 'darwin', path_impl: path.posix, homedir: '/Users/gabriel', repository_root: '/repo', env: {}
  });
  const linux = resolveWith(fakeFs(), {
    platform: 'linux', path_impl: path.posix, homedir: '/home/gabriel', repository_root: '/repo',
    env: { XDG_STATE_HOME: '/state', XDG_CONFIG_HOME: '/config' }
  });
  assert.strictEqual(win.path, 'C:\\Local\\WholesaleOS\\helper.json');
  assert.strictEqual(darwin.path, '/Users/gabriel/Library/Application Support/WholesaleOS/helper.json');
  assert.strictEqual(linux.path, '/state/wholesaleos/helper.json');
})();

(() => {
  const fake = fakeFs({ blocked_write_prefixes: ['C:/blocked'] });
  const result = resolveWith(fake, {
    platform: 'win32', path_impl: path.win32, homedir: 'C:\\Users\\Gabriel', repository_root: 'C:\\repo',
    env: { WOS_HELPER_CONFIG: 'C:\\blocked\\helper.json', WOS_HELPER_HOME: 'C:\\allowed' }
  });
  assert.strictEqual(result.path, 'C:\\allowed\\helper.json');
  assert.deepStrictEqual(result.attempts, [{ path: 'C:\\blocked\\helper.json', reason: 'EPERM' }]);
})();

(() => {
  const fake = fakeFs({ blocked_write_prefixes: ['C:/blocked', 'C:/local', 'C:/roaming', 'C:/users/gabriel'] });
  assert.throws(() => resolveWith(fake, {
    platform: 'win32', path_impl: path.win32, homedir: 'C:\\Users\\Gabriel', repository_root: 'C:\\repo',
    env: { WOS_HELPER_CONFIG: 'C:\\repo\\helper.json', WOS_HELPER_HOME: 'C:\\blocked', LOCALAPPDATA: 'C:\\local', APPDATA: 'C:\\roaming' }
  }), (error) => {
    assert.ok(error instanceof resolver.LocalConfigPathError);
    assert.strictEqual(error.code, 'WOS_HELPER_CONFIG_PATH_UNWRITABLE');
    assert.ok(error.message.includes('Set WOS_HELPER_HOME to a folder you can write to'));
    assert.ok(!error.message.toLowerCase().includes(os.tmpdir().toLowerCase()));
    return true;
  });
  const repositoryWrites = fake.calls.filter((call) => call.method === 'writeFileSync' && fake.normalize(call.path).startsWith('c:/repo'));
  assert.strictEqual(repositoryWrites.length, 0, 'repository candidates must never be probed');
})();

(() => {
  const fake = fakeFs({ blocked_write_prefixes: ['/home/gabriel'] });
  assert.throws(() => resolveWith(fake, {
    platform: 'linux', path_impl: path.posix, homedir: '/home/gabriel', repository_root: '/repo', env: {}
  }), (error) => error.code === 'WOS_HELPER_CONFIG_PATH_UNWRITABLE');
})();

(() => {
  const fake = fakeFs({ chmod_error: true });
  const result = resolveWith(fake, {
    platform: 'linux', path_impl: path.posix, homedir: '/home/gabriel', repository_root: '/repo', env: { XDG_STATE_HOME: '/state' }
  });
  assert.strictEqual(result.path, '/state/wholesaleos/helper.json');
  assert.ok(result.warnings.some((warning) => warning.code === 'CHMOD_NOT_APPLIED'));
  assert.ok(fake.calls.some((call) => call.method === 'mkdirSync' && call.options.mode === 0o700));
  assert.ok(fake.calls.some((call) => call.method === 'writeFileSync' && call.options.mode === 0o600));
})();

(() => {
  const fake = fakeFs();
  agent.writeState('C:\\state\\rate.json', { page_times: [1] }, { fs_impl: fake });
  const write = fake.calls.find((call) => call.method === 'writeFileSync');
  assert.strictEqual(write.options.mode, 0o600);
})();

(() => {
  const fake = fakeFs({ rename_failures: 2 });
  const written = resolver.writeFileAtomic('C:\\safe\\helper.json', 'configuration', {
    fs_impl: fake, path_impl: path.win32, temporary_path: 'C:\\safe\\helper.tmp'
  });
  assert.strictEqual(written.rename_attempts, 3);
  assert.strictEqual(fake.calls.filter((call) => call.method === 'renameSync').length, 3);
  assert.strictEqual(fake.readFileSync('C:\\safe\\helper.json', 'utf8'), 'configuration');
})();

(() => {
  const legacy = 'C:\\Users\\Gabriel\\.wholesaleos\\helper.json';
  const selected = 'C:\\Local\\WholesaleOS\\helper.json';
  const firstSecret = 'first-sensitive-value';
  const secondSecret = 'second-sensitive-value';
  const fake = fakeFs({ files: { [legacy]: firstSecret }, blocked_unlinks: [legacy] });
  const first = resolveWith(fake, {
    platform: 'win32', path_impl: path.win32, homedir: 'C:\\Users\\Gabriel', repository_root: 'C:\\repo', env: { LOCALAPPDATA: 'C:\\Local' }
  });
  assert.strictEqual(first.migrated_legacy, true);
  assert.strictEqual(fake.readFileSync(selected, 'utf8'), firstSecret);
  assert.ok(first.warnings.some((warning) => warning.code === 'LEGACY_REMOVE_FAILED' && warning.path === legacy));
  fake.entries.set(fake.normalize(legacy), { type: 'file', contents: Buffer.from(secondSecret), mode: 0o600 });
  const second = resolveWith(fake, {
    platform: 'win32', path_impl: path.win32, homedir: 'C:\\Users\\Gabriel', repository_root: 'C:\\repo', env: { LOCALAPPDATA: 'C:\\Local' }
  });
  assert.strictEqual(second.migrated_legacy, false);
  assert.strictEqual(fake.readFileSync(selected, 'utf8'), firstSecret, 'an existing new config must never be overwritten by legacy');
  assert.ok(!JSON.stringify(first).includes(firstSecret));
  assert.ok(!JSON.stringify(second).includes(secondSecret));
})();

(() => {
  const secret = 'credential-must-never-appear';
  const fake = fakeFs({ blocked_write_prefixes: ['/blocked'] });
  let rendered = '';
  try {
    resolveWith(fake, {
      platform: 'linux', path_impl: path.posix, homedir: '/blocked/home', repository_root: '/repo',
      env: { WOS_HELPER_HOME: '/blocked/config', SECRET_FOR_TEST: secret }
    });
  } catch (error) { rendered = `${error.message}\n${JSON.stringify(error)}`; }
  assert.ok(rendered);
  assert.ok(!rendered.includes(secret));
})();

(() => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!serverSource.includes('local-config-path'));
})();

console.log('cycle-32-local-config-path: ok');
