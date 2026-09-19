'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_FILENAME = 'helper.json';
const PROBE_PREFIX = '.wos-helper-write-probe';
const RENAME_ATTEMPTS = 3;

class LocalConfigPathError extends Error {
  constructor(attempts) {
    const detail = attempts.length
      ? attempts.map((attempt) => `- ${attempt.path} (${attempt.reason})`).join('\n')
      : '- no platform config directory was available';
    super(`WholesaleOS could not find a writable helper config location. Tried:\n${detail}\nSet WOS_HELPER_HOME to a folder you can write to.`);
    this.name = 'LocalConfigPathError';
    this.code = 'WOS_HELPER_CONFIG_PATH_UNWRITABLE';
    this.attempts = attempts.map((attempt) => ({ path: attempt.path, reason: attempt.reason }));
  }
}

function clean(value) { return String(value == null ? '' : value).trim(); }

function pathApiFor(platform, supplied) {
  if (supplied) return supplied;
  return platform === 'win32' ? path.win32 : path.posix;
}

function errorReason(error) {
  const code = clean(error && error.code);
  if (/^[A-Z0-9_:-]{1,80}$/i.test(code)) return code;
  return 'WRITE_PROBE_FAILED';
}

function candidateList(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const homedir = clean(options.homedir != null ? options.homedir : os.homedir());
  const pathApi = pathApiFor(platform, options.path_impl);
  const candidates = [];
  const seen = new Set();
  const addFile = (source, file) => {
    const value = clean(file);
    if (!value) return;
    const resolved = pathApi.resolve(value);
    const key = platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ source, path: resolved, directory: pathApi.dirname(resolved) });
  };
  const addDirectory = (source, directory) => {
    const value = clean(directory);
    if (value) addFile(source, pathApi.join(value, CONFIG_FILENAME));
  };

  addFile('WOS_HELPER_CONFIG', env.WOS_HELPER_CONFIG);
  addDirectory('WOS_HELPER_HOME', env.WOS_HELPER_HOME);
  if (platform === 'win32') {
    addDirectory('LOCALAPPDATA', clean(env.LOCALAPPDATA) && pathApi.join(env.LOCALAPPDATA, 'WholesaleOS'));
    addDirectory('APPDATA', clean(env.APPDATA) && pathApi.join(env.APPDATA, 'WholesaleOS'));
  } else if (platform === 'darwin') {
    addDirectory('DARWIN_APPLICATION_SUPPORT', homedir && pathApi.join(homedir, 'Library', 'Application Support', 'WholesaleOS'));
  } else {
    addDirectory('XDG_STATE_HOME', clean(env.XDG_STATE_HOME) && pathApi.join(env.XDG_STATE_HOME, 'wholesaleos'));
    addDirectory('XDG_CONFIG_HOME', clean(env.XDG_CONFIG_HOME) && pathApi.join(env.XDG_CONFIG_HOME, 'wholesaleos'));
    addDirectory('LINUX_USER_CONFIG', homedir && pathApi.join(homedir, '.config', 'wholesaleos'));
  }

  const legacyPath = homedir ? pathApi.resolve(pathApi.join(homedir, '.wholesaleos', CONFIG_FILENAME)) : '';
  return { candidates, legacyPath, pathApi, platform };
}

function insideDirectory(file, directory, pathApi, platform) {
  if (!directory) return false;
  const relative = pathApi.relative(pathApi.resolve(directory), pathApi.resolve(file));
  if (!relative || relative === '.') return true;
  const normalized = platform === 'win32' ? relative.toLowerCase() : relative;
  return normalized !== '..' && !normalized.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative);
}

function chmodNonFatal(fsImpl, target, mode, warnings) {
  if (typeof fsImpl.chmodSync !== 'function') return;
  try { fsImpl.chmodSync(target, mode); }
  catch (_) { warnings.push({ code: 'CHMOD_NOT_APPLIED', path: target }); }
}

function ensureDirectory(fsImpl, directory, warnings) {
  fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodNonFatal(fsImpl, directory, 0o700, warnings);
}

function probeWritable(candidate, options = {}) {
  const fsImpl = options.fs_impl || fs;
  const pathImpl = options.path_impl || path;
  const warnings = [];
  const probe = (options.probe_path_factory || ((directory) => pathImpl.join(directory, `${PROBE_PREFIX}-${process.pid}-${Date.now()}`)))(candidate.directory);
  ensureDirectory(fsImpl, candidate.directory, warnings);
  try {
    fsImpl.writeFileSync(probe, 'ok', { flag: 'wx', mode: 0o600 });
    chmodNonFatal(fsImpl, probe, 0o600, warnings);
  } finally {
    try { fsImpl.unlinkSync(probe); } catch (_) { /* The probe may not have been created. */ }
  }
  return warnings;
}

function writeFileAtomic(file, contents, options = {}) {
  const fsImpl = options.fs_impl || fs;
  const pathImpl = options.path_impl || path;
  const warnings = [];
  const directory = pathImpl.dirname(file);
  ensureDirectory(fsImpl, directory, warnings);
  const temporary = options.temporary_path || `${file}.${process.pid}.tmp`;
  fsImpl.writeFileSync(temporary, contents, { mode: 0o600 });
  chmodNonFatal(fsImpl, temporary, 0o600, warnings);
  let renamed = false;
  let lastError;
  let renameAttempts = 0;
  for (let attempt = 1; attempt <= RENAME_ATTEMPTS; attempt += 1) {
    renameAttempts = attempt;
    try {
      fsImpl.renameSync(temporary, file);
      renamed = true;
      break;
    } catch (error) { lastError = error; }
  }
  if (!renamed) {
    try { fsImpl.unlinkSync(temporary); } catch (_) { /* Best-effort cleanup. */ }
    throw lastError;
  }
  chmodNonFatal(fsImpl, file, 0o600, warnings);
  return { path: file, warnings, rename_attempts: renameAttempts };
}

function migrateLegacy(legacyPath, selectedPath, options = {}) {
  const fsImpl = options.fs_impl || fs;
  const pathImpl = options.path_impl || path;
  const warnings = [];
  if (!legacyPath || legacyPath === selectedPath || !fsImpl.existsSync(legacyPath) || fsImpl.existsSync(selectedPath)) {
    return { migrated: false, warnings };
  }
  const contents = fsImpl.readFileSync(legacyPath);
  const written = writeFileAtomic(selectedPath, contents, { fs_impl: fsImpl, path_impl: pathImpl });
  warnings.push(...written.warnings);
  try { fsImpl.unlinkSync(legacyPath); }
  catch (_) { warnings.push({ code: 'LEGACY_REMOVE_FAILED', path: legacyPath }); }
  return { migrated: true, warnings };
}

function resolveLocalConfigPath(options = {}) {
  const fsImpl = options.fs_impl || fs;
  const built = candidateList(options);
  const attempts = [];
  const repositoryRoot = clean(options.repository_root != null
    ? options.repository_root
    : built.platform === process.platform ? path.resolve(__dirname, '..', '..') : '');

  for (const candidate of built.candidates) {
    if (insideDirectory(candidate.path, repositoryRoot, built.pathApi, built.platform)) {
      attempts.push({ path: candidate.path, reason: 'REPOSITORY_PATH_FORBIDDEN' });
      continue;
    }
    try {
      const warnings = probeWritable(candidate, {
        fs_impl: fsImpl,
        path_impl: built.pathApi,
        probe_path_factory: options.probe_path_factory
      });
      const migration = migrateLegacy(built.legacyPath, candidate.path, {
        fs_impl: fsImpl,
        path_impl: built.pathApi
      });
      return {
        path: candidate.path,
        directory: candidate.directory,
        source: candidate.source,
        read_only: false,
        migrated_legacy: migration.migrated,
        warnings: warnings.concat(migration.warnings),
        attempts
      };
    } catch (error) {
      attempts.push({ path: candidate.path, reason: errorReason(error) });
    }
  }

  if (built.legacyPath && fsImpl.existsSync(built.legacyPath)) {
    return {
      path: built.legacyPath,
      directory: built.pathApi.dirname(built.legacyPath),
      source: 'LEGACY_READ_ONLY',
      read_only: true,
      migrated_legacy: false,
      warnings: [],
      attempts
    };
  }
  throw new LocalConfigPathError(attempts);
}

module.exports = {
  CONFIG_FILENAME,
  LocalConfigPathError,
  RENAME_ATTEMPTS,
  candidateList,
  resolveLocalConfigPath,
  writeFileAtomic
};
