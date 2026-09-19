'use strict';

async function scraperFetch(url, options = {}) {
  const env = options.env || process.env;
  const credential = String(env.SCRAPERAPI_KEY || '').trim();
  if (!credential) return { ok: false, data: '', reason_code: 'SCRAPING_DISABLED_NO_CREDENTIAL' };
  const client = options.axios_impl || require('axios');
  let endpoint = `https://api.scraperapi.com?api_key=${encodeURIComponent(credential)}&url=${encodeURIComponent(url)}`;
  if (options.render) endpoint += '&render=true';
  try {
    const response = await client.get(endpoint, { timeout: 25000, headers: { Accept: 'text/html,application/json' } });
    return { ok: true, data: response.data || '', reason_code: '' };
  } catch (_) {
    return { ok: false, data: '', reason_code: 'SCRAPING_PROVIDER_REQUEST_FAILED' };
  }
}

module.exports = { scraperFetch };
