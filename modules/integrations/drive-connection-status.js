'use strict';

const REQUIRED = Object.freeze(['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN']);
const REASONS = Object.freeze({
  CONNECTED: 'Google accepted the saved Drive authorization. File sync and backups have not been checked.',
  DRIVE_CONFIGURATION_MISSING: 'Drive authorization is not configured on this server.',
  DRIVE_AUTHORIZATION_EXPIRED: 'Google rejected the saved authorization (invalid_grant). It may have expired or been revoked.',
  DRIVE_CLIENT_REJECTED: 'Google rejected the app credentials (invalid_client).',
  DRIVE_SCOPE_MISSING: 'Google reported insufficient Drive permissions (insufficientPermissions).',
  DRIVE_API_DISABLED: 'Google reported that the Drive API is disabled for this project (accessNotConfigured).',
  DRIVE_AUTHORIZATION_REQUIRED: 'Google returned 401. The saved authorization did not authenticate.',
  DRIVE_FORBIDDEN: 'Google returned 403. Access was denied; a missing scope is not proven.',
  DRIVE_RATE_LIMITED: 'Google returned a rate limit. No retry was made.',
  DRIVE_TIMEOUT: 'The Drive connection check timed out. No retry was made.',
  DRIVE_UNAVAILABLE: 'The Drive connection check failed. No safe, specific provider reason was available.'
});
function result(code, extra = {}) {
  return { connected: code === 'CONNECTED', status: code === 'CONNECTED' ? 'connected' : code === 'DRIVE_CONFIGURATION_MISSING' ? 'not_connected' : 'error', code, reason: REASONS[code], ...extra };
}
function missingConfiguration(env) {
  return REQUIRED.filter(key => typeof env[key] !== 'string' || !env[key].trim());
}
function classifyError(error) {
  const data = error?.response?.data, detail = data?.error;
  const codes = [typeof detail === 'string' ? detail : detail?.status, ...(Array.isArray(detail?.errors) ? detail.errors.map(item => item?.reason) : [])];
  // Inspect known tokens only; never return provider messages, URLs or request config.
  const message = typeof error?.message === 'string' ? error.message : '';
  const has = code => codes.includes(code) || new RegExp('\\b' + code + '\\b').test(message);
  const rawStatus = error?.response?.status ?? error?.code;
  const status = /^\d{3}$/.test(String(rawStatus)) ? Number(rawStatus) : null;
  const extra = { http_status: status };
  if (has('invalid_grant')) return result('DRIVE_AUTHORIZATION_EXPIRED', extra);
  if (has('invalid_client')) return result('DRIVE_CLIENT_REJECTED', extra);
  if (has('insufficientPermissions') || has('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) return result('DRIVE_SCOPE_MISSING', extra);
  if (has('accessNotConfigured') || has('SERVICE_DISABLED')) return result('DRIVE_API_DISABLED', extra);
  if (status === 429 || has('rateLimitExceeded') || has('userRateLimitExceeded')) return result('DRIVE_RATE_LIMITED', extra);
  if (['ETIMEDOUT', 'ECONNABORTED'].includes(error?.code)) return result('DRIVE_TIMEOUT', extra);
  if (status === 401) return result('DRIVE_AUTHORIZATION_REQUIRED', extra);
  if (status === 403) return result('DRIVE_FORBIDDEN', extra);
  return result('DRIVE_UNAVAILABLE', extra);
}
async function readDriveStatus({ env, createClient }) {
  const missing = missingConfiguration(env);
  if (missing.length) return result('DRIVE_CONFIGURATION_MISSING', { missing });
  try {
    const drive = createClient();
    await drive.about.get({ fields: 'user(permissionId)' }, { timeout: 8000, retry: false });
    return result('CONNECTED');
  } catch (error) { return classifyError(error); }
}
function registerDriveStatus(app, { requireAdmin, env, createClient }) {
  app.get('/api/drive/status', requireAdmin, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await readDriveStatus({ env, createClient }));
  });
}
module.exports = { REQUIRED, REASONS, missingConfiguration, classifyError, readDriveStatus, registerDriveStatus };
