'use strict';

// B-23 / AGENTS section 5 Network: public government sources only, allowlisted hosts per
// profile, at most one request per second per host, stop on 401/403/429 and mark the source
// unavailable for the rest of the run. Never follows a redirect off the allowlist.
// fetch, sleep and the clock are injected, so tests never touch the network or real time.

const { urlAllowedForProfile } = require('./distress-list-profiles');

const BLOCKING_STATUSES = Object.freeze([401, 403, 429]);
const DEFAULT_MIN_INTERVAL_MS = 1000;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function createPoliteFetcher(options = {}) {
  const fetchImpl = options.fetch_impl;
  const sleep = options.sleep;
  const now = options.now;
  if (typeof fetchImpl !== 'function' || typeof sleep !== 'function' || typeof now !== 'function') {
    throw new TypeError('fetch_impl, sleep and now must be injected');
  }
  const minInterval = Math.max(DEFAULT_MIN_INTERVAL_MS, Number(options.min_interval_ms) || 0);
  const maxBytes = Number(options.max_bytes) || DEFAULT_MAX_BYTES;
  const lastRequestAt = new Map();
  const unavailable = new Map();

  async function pace(host) {
    const last = lastRequestAt.get(host);
    if (last != null) {
      const wait = last + minInterval - now();
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt.set(host, now());
  }

  async function fetchForProfile(profile, url, request = {}, redirectsLeft = 1) {
    if (!profile || !profile.runnable) {
      return { status: 'manual', reason: (profile && profile.manual_reason) || 'Profile is not runnable.' };
    }
    if (unavailable.has(profile.source_id)) {
      return { status: 'blocked', reason: 'Source marked unavailable earlier in this run.', http_status: unavailable.get(profile.source_id) };
    }
    if (!urlAllowedForProfile(profile, url)) {
      return { status: 'refused', reason: 'Address is not on this source\'s allowlist.' };
    }
    const host = new URL(url).hostname.toLowerCase();
    await pace(host);
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: request.accept || '*/*', 'user-agent': 'WholesaleOS public records reader' }
    });
    const status = Number(response && response.status) || 0;
    if (BLOCKING_STATUSES.includes(status)) {
      unavailable.set(profile.source_id, status);
      return { status: 'blocked', reason: `Host answered HTTP ${status}. Source marked unavailable.`, http_status: status };
    }
    if (status >= 300 && status < 400) {
      const location = response.headers && typeof response.headers.get === 'function' ? response.headers.get('location') : '';
      let next = '';
      try { next = new URL(location, url).href; } catch (_) { next = ''; }
      if (!next || redirectsLeft < 1 || !urlAllowedForProfile(profile, next)) {
        return { status: 'refused', reason: 'Redirect leaves the allowlist.', http_status: status };
      }
      return fetchForProfile(profile, next, request, redirectsLeft - 1);
    }
    if (status < 200 || status >= 300) {
      return { status: 'failed', reason: `Host answered HTTP ${status || 'error'}.`, http_status: status };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) return { status: 'failed', reason: 'Response is larger than the size cap.', http_status: status };
    const contentType = response.headers && typeof response.headers.get === 'function' ? String(response.headers.get('content-type') || '') : '';
    return { status: 'ok', http_status: status, url, content_type: contentType, buffer, text: () => buffer.toString('utf8') };
  }

  return {
    fetchForProfile,
    unavailableSources: () => Array.from(unavailable.entries()).map(([source_id, http_status]) => ({ source_id, http_status }))
  };
}

module.exports = { BLOCKING_STATUSES, DEFAULT_MIN_INTERVAL_MS, createPoliteFetcher };
