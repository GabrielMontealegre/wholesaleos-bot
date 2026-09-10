'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const databaseArg = process.argv[2];
const databasePath = databaseArg ? path.resolve(databaseArg) : path.join(repoRoot, 'data', 'db.json');
const outputPath = path.join(repoRoot, 'exports', 'cycle-23-auth-preflight', 'preflight.json');

function writeResult(result) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function unreachable(reason) {
  writeResult({
    generated_at: new Date().toISOString(),
    production_contacted: false,
    database_path: path.relative(repoRoot, databasePath).replace(/\\/g, '/'),
    lockout_risk: 'UNREACHABLE',
    reason,
    user_count: null,
    admin_count: null,
    admin_pin_resolves_server_side: null,
    current_pin_would_authenticate_server_side: null,
    c3_step_3_allowed: false,
    c3_step_3_status: 'WITHHELD',
    required_confirmation: 'Confirm that a real admin user and PIN exist in the deployed database and that /api/auth/login authenticates that PIN before removing the client fallback.'
  });
}

if (!fs.existsSync(databasePath)) {
  unreachable('local_database_not_found');
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
} catch (error) {
  unreachable(`local_database_unreadable: ${error.message}`);
  process.exit(0);
}

if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
  writeResult({
    generated_at: new Date().toISOString(),
    production_contacted: false,
    database_path: path.relative(repoRoot, databasePath).replace(/\\/g, '/'),
    lockout_risk: 'UNSAFE',
    reason: 'local_database_has_no_users',
    user_count: Array.isArray(parsed.users) ? parsed.users.length : 0,
    admin_count: 0,
    admin_pin_resolves_server_side: false,
    current_pin_would_authenticate_server_side: false,
    c3_step_3_allowed: false,
    c3_step_3_status: 'WITHHELD',
    required_confirmation: 'Create or verify a real admin user and PIN in the server database, then rerun this preflight against a local copy before removing the client fallback.'
  });
  process.exit(0);
}

process.env.DB_PATH = databasePath;
const db = require('../db');
const admins = parsed.users.filter((user) => user && user.role === 'admin');
const resolvableAdmins = admins.filter((user) => {
  if (!user.pin) return false;
  const resolved = db.getUserByPin(user.pin);
  return Boolean(resolved && resolved.id === user.id && resolved.role === 'admin');
});
const safe = admins.length > 0 && resolvableAdmins.length === admins.length;

writeResult({
  generated_at: new Date().toISOString(),
  production_contacted: false,
  database_path: path.relative(repoRoot, databasePath).replace(/\\/g, '/'),
  lockout_risk: safe ? 'SAFE' : 'UNSAFE',
  reason: safe ? 'all_local_admin_pins_resolve_server_side' : 'one_or_more_local_admin_pins_do_not_resolve_server_side',
  user_count: parsed.users.length,
  admin_count: admins.length,
  admin_pin_resolves_server_side: safe,
  current_pin_would_authenticate_server_side: safe,
  c3_step_3_allowed: safe,
  c3_step_3_status: safe ? 'ALLOWED' : 'WITHHELD',
  required_confirmation: safe ? '' : 'Verify that every local admin PIN resolves through db.getUserByPin before removing the client fallback.'
});
