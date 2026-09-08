'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'exports/cycle-18-proof');
fs.mkdirSync(output, { recursive: true });
const files = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.js')).sort();
const report = { started_at: new Date().toISOString(), timeout_seconds_per_file: 300, node: process.version, results: [] };
for (const file of files) {
  const started = performance.now();
  const run = spawnSync(process.execPath, [path.join('tests', file)], { cwd: root, timeout: 300000, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const result = { file, status: run.status === 0 && !run.error ? 'PASS' : run.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'FAIL', duration_seconds: +( (performance.now() - started) / 1000).toFixed(3), exit_code: run.status, error: run.error?.message || null };
  fs.writeFileSync(path.join(output, file + '.log'), (run.stdout || '') + (run.stderr || ''));
  report.results.push(result);
  fs.writeFileSync(path.join(output, 'test-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${result.status} ${file} ${result.duration_seconds}s`);
}
report.completed_at = new Date().toISOString();
report.passed = report.results.filter((r) => r.status === 'PASS').length;
report.total = files.length;
fs.writeFileSync(path.join(output, 'test-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`FINAL ${report.passed}/${report.total}`);
if (report.passed !== report.total) process.exitCode = 1;
