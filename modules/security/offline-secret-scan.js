'use strict';

// Pure detection: callers own Git/file enumeration; diagnostics never carry values.
const rules = [
  ['private-key', /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/g],
  ['cloud-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['google-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['provider-token', /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{20,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,})\b/g],
  ['twilio-sid', /\b(?:AC|SK)[a-fA-F0-9]{32}\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/g],
  ['url-credentials', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/gi],
  ['sentry-dsn', /https?:\/\/[a-f0-9]{16,}@[a-z0-9.-]*sentry\.[a-z.]+\/[0-9]+/gi],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}/gi]
];
function entropy(value) {
  const counts = new Map();
  for (const c of value) counts.set(c, (counts.get(c) || 0) + 1);
  return [...counts.values()].reduce((sum, n) => sum - n / value.length * Math.log2(n / value.length), 0);
}
function wordLike(value) {
  return /^[a-z]+(?:[-_ .][a-z]+)*$/i.test(value) ||
    /^(?:synthetic|dummy|fake|fixture|test|private|sentinel|redacted|placeholder|example)[-_][a-z0-9_. -]+$/i.test(value);
}
function fixtureWords(rule, value) {
  if (rule === 'url-credentials') {
    try { const url = new URL(value); return wordLike(url.username) && wordLike(url.password); } catch (_) { return false; }
  }
  return rule === 'bearer-token' && wordLike(value.replace(/^Bearer\s+/i, ''));
}
function quotedAt(line, end) {
  let quote = null, escape = false;
  for (let i = 0; i < end; i++) {
    const c = line[i];
    if (escape) { escape = false; continue; }
    if (quote && c === '\\') { escape = true; continue; }
    if (quote) { if (c === quote) quote = null; }
    else if (c === '"' || c === "'" || c === '`') quote = c;
  }
  return quote !== null;
}
function scanText(filename, text) {
  const name = filename.replace(/\\/g, '/');
  const served = name.startsWith('dashboard/') || name === 'courthouse-addon/courthouse-tab.js';
  const fixture = name.startsWith('tests/');
  const findings = [];
  if (served) {
    const environment = /\bprocess\s*(?:\.\s*env|\[\s*['"]env['"]\s*\])/g;
    for (const match of String(text).matchAll(environment)) findings.push({ file: name, line: String(text).slice(0, match.index).split('\n').length, rule: 'client-process-env' });
  }
  String(text).split(/\r?\n/).forEach((line, index) => {
    const allow = !served && fixture && /\bsynthetic-secret-fixture\b/.test(line);
    const report = rule => findings.push({ file: name, line: index + 1, rule });
    for (const [rule, pattern] of rules) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        if (!allow && !(fixture && fixtureWords(rule, match[0]))) report(rule);
      }
    }
    const assignment = /(?:['"]\b([a-zA-Z_$][\w$]*)['"]|\b([a-zA-Z_$][\w$]*))\s*[:=]\s*(['"])([^'"\r\n]+)\3/g;
    for (const match of line.matchAll(assignment)) {
      const identifier = match[1] || match[2], value = match[4];
      if (!/(?:key|secret|token|password|pin)/i.test(identifier) || quotedAt(line, match.index)) continue;
      // These are public storage/record coordinates, not authentication material.
      const coordinate = /^(?:ledger_key|queue_key|AI_DEAL_ANALYZER_STORAGE_KEY)$/i.test(identifier);
      if (!coordinate && value.length >= 24 && entropy(value) >= 3.5 && !wordLike(value) && !allow) report('entropy-assignment');
    }
  });
  return findings.filter((row, i, all) => all.findIndex(other => other.file === row.file && other.line === row.line && other.rule === row.rule) === i);
}
function formatFindings(findings) { return findings.map(row => `${row.file}:${row.line} ${row.rule}`).join('\n'); }
module.exports = { scanText, formatFindings };
