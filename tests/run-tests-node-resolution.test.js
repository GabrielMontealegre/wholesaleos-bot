'use strict';

// scripts/run-tests.ps1 must be runnable on a machine without Node on PATH, and when it
// cannot find a runtime it must name EVERY location it tried - including a WOS_NODE that
// was set but does not exist, so a typo in that variable is visible rather than silent.

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { processSpawnDenied, probeProcessSpawn } = require('./helpers/process-capability');

const runnerPath = path.resolve(__dirname, '..', 'scripts', 'run-tests.ps1');

function extractResolver() {
  const source = fs.readFileSync(runnerPath, 'utf8');
  const match = source.match(/function Resolve-NodeExecutable \{[\s\S]*?\n\}/);
  assert.ok(match, 'run-tests.ps1 must define Resolve-NodeExecutable');
  return match[0];
}

// Resolved absolutely: these cases clobber PATH, so powershell must not be looked up on it.
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function runResolver(env) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    extractResolver(),
    'try { Resolve-NodeExecutable } catch { "THREW: " + $_.Exception.Message }'
  ].join('\n');
  const scriptFile = path.join(require('os').tmpdir(), `wos-resolver-${process.pid}-${Date.now()}.ps1`);
  fs.writeFileSync(scriptFile, script, 'utf8');
  try {
    const result = childProcess.spawnSync(POWERSHELL,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile],
      { encoding: 'utf8', env: Object.assign({}, process.env, env), windowsHide: true });
    if (result.error) throw result.error;
    return String(result.stdout || '') + String(result.stderr || '');
  } finally {
    try { fs.unlinkSync(scriptFile); } catch (_) { /* best effort */ }
  }
}

(async () => {
  if (!(await probeProcessSpawn()).available) {
    console.log('SKIPPED: process spawn not permitted in this runner');
    return;
  }
  if (process.platform !== 'win32') {
    console.log('SKIPPED: run-tests.ps1 resolution is a Windows PowerShell path');
    return;
  }

  // The source itself must not hard-fail on a missing PATH entry.
  const source = fs.readFileSync(runnerPath, 'utf8');
  assert.ok(!/Get-Command node -ErrorAction Stop/.test(source),
    'the runner must not abort when node is absent from PATH');

  const nowhere = {
    WOS_NODE: 'C:\\does\\not\\exist\\node.exe',
    LOCALAPPDATA: 'C:\\wos-test-nope',
    ProgramFiles: 'C:\\wos-test-nope',
    'ProgramFiles(x86)': 'C:\\wos-test-nope',
    PATH: 'C:\\wos-test-nope'
  };

  const failed = runResolver(nowhere);
  assert.match(failed, /node_executable_not_found/, 'failure must be explicit');
  assert.match(failed, /C:\\\\does\\\\not\\\\exist\\\\node\.exe|C:\\does\\not\\exist\\node\.exe/,
    'a set-but-invalid WOS_NODE must appear in the attempted list');
  assert.match(failed, /PATH/, 'PATH must appear in the attempted list');
  assert.match(failed, /cursor/i, 'the Cursor runtime candidate must appear in the attempted list');
  assert.match(failed, /nodejs/i, 'the standard install candidate must appear in the attempted list');

  // An unset WOS_NODE is reported as unset rather than omitted.
  const unset = runResolver(Object.assign({}, nowhere, { WOS_NODE: '' }));
  assert.match(unset, /WOS_NODE=\(not set\)/, 'an unset WOS_NODE must still be reported');

  // Fallback order is preserved: a valid WOS_NODE wins over everything else.
  const realNode = process.execPath;
  const resolved = runResolver(Object.assign({}, nowhere, { WOS_NODE: realNode }));
  assert.ok(resolved.includes(realNode),
    'a valid WOS_NODE must be returned ahead of PATH and the install candidates');
  assert.ok(!/node_executable_not_found/.test(resolved), 'a valid WOS_NODE must not throw');

  console.log('run-tests-node-resolution: all assertions passed');
})().catch((error) => {
  if (processSpawnDenied(error)) {
    console.log('SKIPPED: process spawn not permitted in this runner');
    return;
  }
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
