'use strict';

// Tests must never depend on what a county website, the Census geocoder or any other
// live host returns today. CI runners have internet access, so a test that lets a
// production code path call global.fetch silently becomes a test of the live source.
// (B-25: the Bexar County foreclosure list changed and turned main red for a week.)
//
// installRefuseLiveNetwork() replaces global.fetch with a stub that records the URL and
// rejects, so code under test takes its normal "source unavailable" path. Tests that need
// a document or response must inject a fetch_impl fixture instead.
function installRefuseLiveNetwork() {
  const attempts = [];
  const previousFetch = global.fetch;
  global.fetch = async function refusedLiveFetch(url) {
    attempts.push(String(url && url.url ? url.url : url));
    throw new Error('live_network_disabled_in_test');
  };
  return {
    attempts,
    hosts() {
      return Array.from(new Set(attempts.map((value) => {
        try { return new URL(value).hostname.toLowerCase(); } catch (error) { return ''; }
      }).filter(Boolean)));
    },
    restore() { global.fetch = previousFetch; }
  };
}

module.exports = { installRefuseLiveNetwork };
