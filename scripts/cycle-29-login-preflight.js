'use strict';

const fs = require('fs');
const path = require('path');
const dashboardAuth = require('../modules/security/dashboard-auth');

const repoRoot = path.resolve(__dirname, '..');
const defaultOutputPath = path.join(repoRoot, 'exports', 'cycle-29-login-preflight', 'preflight.json');

function guardedUserRoutes(serverSource) {
  return (
    /app\.get\('\/api\/users',\s*requireAdmin/.test(serverSource) &&
    /app\.put\('\/api\/users\/:id',\s*requireAdminOrOwnFirstLoginPinUpdate/.test(serverSource) &&
    /app\.post\('\/api\/users',\s*requireAdmin/.test(serverSource) &&
    /app\.post\('\/api\/users\/:id\/credentials',\s*requireAdmin/.test(serverSource)
  );
}

function unreachable(reason, routesGuarded) {
  return {
    generated_at: new Date().toISOString(),
    production_contacted: false,
    verdict: 'UNREACHABLE',
    reason: reason,
    admin_user_exists: null,
    admin_pin_configured: null,
    admin_pin_is_a_seeded_default: null,
    any_user_still_has_seeded_default_pin: null,
    login_would_succeed_for_configured_admin: null,
    user_write_routes_guarded: routesGuarded
  };
}

function buildPreflight(options) {
  const input = options || {};
  const databasePath = path.resolve(input.database_path || path.join(repoRoot, 'data', 'db.json'));
  const serverSource = input.server_source == null
    ? fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8')
    : String(input.server_source);
  const routesGuarded = guardedUserRoutes(serverSource);

  if (!fs.existsSync(databasePath)) return unreachable('local_database_not_found', routesGuarded);

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  } catch (error) {
    return unreachable('local_database_unreadable', routesGuarded);
  }

  const users = Array.isArray(parsed.users) ? parsed.users : [];
  const admin = users.find((user) => user && user.id === 'admin' && user.role === 'admin');
  const configuredPin = dashboardAuth.configuredAdminPin(input.env || process.env);
  const seededUserCount = users.filter((user) => dashboardAuth.isSeededDefaultPin(user && user.pin)).length;
  const authentication = dashboardAuth.authenticatePin({ pin: configuredPin, users: users, env: input.env || process.env });
  const loginWorks = Boolean(authentication.ok && authentication.user && authentication.user.id === 'admin');
  const safe = Boolean(admin && configuredPin && !dashboardAuth.isSeededDefaultPin(configuredPin) && seededUserCount === 0 && loginWorks && routesGuarded);

  return {
    generated_at: new Date().toISOString(),
    production_contacted: false,
    verdict: safe ? 'SAFE_TO_REMOVE_FALLBACK' : 'UNSAFE',
    reason: safe ? 'configured_admin_login_is_fail_closed_and_user_writes_are_guarded' : 'one_or_more_login_preflight_checks_failed',
    admin_user_exists: Boolean(admin),
    admin_pin_configured: Boolean(configuredPin),
    admin_pin_is_a_seeded_default: configuredPin ? dashboardAuth.isSeededDefaultPin(configuredPin) : false,
    any_user_still_has_seeded_default_pin: seededUserCount,
    login_would_succeed_for_configured_admin: loginWorks,
    user_write_routes_guarded: routesGuarded
  };
}

function writePreflight(result, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  const databasePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(repoRoot, 'data', 'db.json');
  const outputPath = process.env.CYCLE_29_PREFLIGHT_OUTPUT
    ? path.resolve(process.env.CYCLE_29_PREFLIGHT_OUTPUT)
    : defaultOutputPath;
  const result = buildPreflight({ database_path: databasePath, env: process.env });
  writePreflight(result, outputPath);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

module.exports = { buildPreflight, guardedUserRoutes, writePreflight };
