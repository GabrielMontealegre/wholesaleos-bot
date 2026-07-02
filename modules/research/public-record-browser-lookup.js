'use strict';

// Official public record browser lookup.
// Reusable core: drives a real (Playwright) browser against PUBLIC official
// county/property pages to recover owner-of-record, mailing route, and
// property facts. County navigation lives in county profiles.
//
// Hard rules:
// - public pages only; stop and report on captcha/login/paywall/403/429
// - only visible evidence; every field carries source_url + evidence_text
// - trustee/servicer/agent names are never labeled as the owner
// - appraised/assessed values are clues, never ARV and never comps
// - preview-only, no mutations, nobody is contacted

const DEFAULT_CAPS = Object.freeze({
  max_rows: 6,
  max_pages_per_row: 4,
  timeout_ms: 10000,
  total_budget_ms: 60000
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeCaps(caps) {
  const merged = Object.assign({}, DEFAULT_CAPS, caps || {});
  merged.max_rows = Math.max(1, Math.min(Number(merged.max_rows) || DEFAULT_CAPS.max_rows, 6));
  merged.max_pages_per_row = Math.max(1, Math.min(Number(merged.max_pages_per_row) || DEFAULT_CAPS.max_pages_per_row, 4));
  merged.timeout_ms = Math.max(2000, Math.min(Number(merged.timeout_ms) || DEFAULT_CAPS.timeout_ms, 10000));
  return merged;
}

function addressParts(address) {
  const text = cleanText(address);
  const match = text.match(/^(\d{1,7})\s+(.+?),/);
  const street = match ? match[2] : '';
  return {
    full_address: text,
    street_number: match ? match[1] : '',
    street_name: street.replace(/\b(rd|road|st|street|ave|avenue|dr|drive|ln|lane|ct|court|blvd|boulevard|pkwy|parkway|way|pl|place|trl|trail|cir|circle|ter|terrace|loop|hwy|highway)\.?$/i, '').trim(),
    city: cleanText((text.split(',')[1] || ''))
  };
}

function statusForFindings(findings) {
  if (findings.blocked && !findings.owner_record) return 'OFFICIAL_LOOKUP_BLOCKED';
  if (findings.owner_record && findings.mailing_route && findings.property_facts.length) return 'OFFICIAL_LOOKUP_READY';
  if (findings.owner_record && findings.mailing_route) return 'MAILING_READY';
  if (findings.owner_record) return 'OWNER_CLUE_ONLY';
  if (findings.blocked) return 'OFFICIAL_LOOKUP_BLOCKED';
  return 'OFFICIAL_LOOKUP_NOT_FOUND';
}

function nextActionForStatus(status) {
  if (status === 'OFFICIAL_LOOKUP_READY' || status === 'MAILING_READY') return 'SEND_LETTER_TO_OWNER_MAILING_ADDRESS';
  if (status === 'OWNER_CLUE_ONLY') return 'SEARCH_OWNER_ENTITY_FOR_PUBLIC_CONTACT';
  if (status === 'OFFICIAL_LOOKUP_BLOCKED') return 'RETRY_BLOCKED_OFFICIAL_SOURCE_MANUALLY';
  return 'VERIFY_ADDRESS_AND_RETRY_OFFICIAL_LOOKUP';
}

async function lookupRow(row, page, profile, caps) {
  const address = cleanText(row && row.normalized_address);
  const sourcesChecked = [];
  const blockedSources = [];
  const findings = {
    owner_record: null,
    mailing_route: null,
    property_facts: [],
    appraisal_clues: [],
    record_url: '',
    blocked: false
  };

  sourcesChecked.push({ source: profile.appraisal_source_name || 'county appraisal search', target: profile.appraisal_source_url || '' });
  let result;
  try {
    result = await profile.browserAppraisalSearch(page, addressParts(address), { timeout_ms: caps.timeout_ms });
  } catch (error) {
    result = { status: 'failed', blocked_reason: cleanText(error && error.message).slice(0, 80) || 'browser_lookup_failed' };
  }
  if (result && result.status === 'owner_found') {
    const ownerName = cleanText(result.owner_name);
    const entity = /\b(llc|l\.l\.c\.|inc|corp|company|partners|lp|llp|trust|holdings|capital|properties|investments)\b/i.test(ownerName);
    findings.record_url = cleanText(result.record_url);
    findings.owner_record = {
      owner_name: ownerName,
      owner_role: 'owner_of_record_per_appraisal_search',
      is_entity: entity,
      account_reference: cleanText(result.account_reference),
      source_url: cleanText(result.record_url || profile.appraisal_source_url),
      evidence_text: cleanText(result.evidence_text).slice(0, 300),
      confidence: 'High',
      risk_flags: ['owner_of_record_may_differ_from_notice_borrower'].concat(result.address_suffix_mismatch ? ['address_suffix_mismatch_verify_property'] : [])
    };
    if (cleanText(result.mailing_address)) {
      findings.mailing_route = {
        route_kind: 'mailing_address',
        value: cleanText(result.mailing_address),
        source_url: cleanText(result.record_url || profile.appraisal_source_url),
        evidence_text: cleanText(result.evidence_text).slice(0, 300),
        confidence: 'High',
        risk_flags: ['mail_only_route']
      };
    }
    if (cleanText(result.property_type)) {
      findings.property_facts.push({
        fact_kind: 'property_type',
        value: cleanText(result.property_type),
        source_url: cleanText(result.record_url || profile.appraisal_source_url),
        evidence_text: cleanText(result.evidence_text).slice(0, 200),
        confidence: 'High',
        risk_flags: []
      });
    }
    for (const fact of Array.isArray(result.property_facts) ? result.property_facts : []) {
      if (!cleanText(fact && fact.value)) continue;
      findings.property_facts.push(Object.assign({ confidence: 'Medium', risk_flags: [] }, fact));
    }
    if (result.appraised_value) {
      findings.appraisal_clues.push({
        clue_kind: 'county_appraised_value',
        value: cleanText(String(result.appraised_value)),
        source_url: cleanText(result.record_url || profile.appraisal_source_url),
        evidence_text: cleanText(result.evidence_text).slice(0, 200),
        confidence: 'High',
        risk_flags: ['assessed_value_is_not_arv', 'not_a_sold_comp']
      });
    }
    for (const blocked of Array.isArray(result.blocked_sources) ? result.blocked_sources : []) {
      blockedSources.push(blocked);
    }
  } else if (result && (result.status === 'blocked' || result.status === 'failed')) {
    findings.blocked = true;
    blockedSources.push({
      source: profile.appraisal_source_name || 'county appraisal search',
      url: cleanText(result.source_url || profile.appraisal_source_url),
      reason: cleanText(result.blocked_reason) || result.status
    });
  }

  const status = statusForFindings(findings);
  return {
    official_lookup_status: status,
    official_property_record_url: findings.record_url,
    owner_record: findings.owner_record,
    mailing_route: findings.mailing_route,
    property_facts: findings.property_facts.slice(0, 8),
    appraisal_clues: findings.appraisal_clues.slice(0, 4),
    browser_sources_checked: sourcesChecked,
    browser_blocked_sources: blockedSources,
    next_official_lookup_action: nextActionForStatus(status),
    preview_only: true
  };
}

function blockedResultForAll(rows, reason) {
  const results = new Map();
  for (const row of rows) {
    results.set(cleanText(row.normalized_address).toLowerCase(), {
      official_lookup_status: 'OFFICIAL_LOOKUP_BLOCKED',
      official_property_record_url: '',
      owner_record: null,
      mailing_route: null,
      property_facts: [],
      appraisal_clues: [],
      browser_sources_checked: [],
      browser_blocked_sources: [{ source: 'browser_runtime', url: '', reason }],
      next_official_lookup_action: 'INSTALL_BROWSER_RUNTIME_OR_RETRY_MANUALLY',
      preview_only: true
    });
  }
  return results;
}

async function runPublicRecordBrowserLookup(input = {}, options = {}) {
  const caps = normalizeCaps(input.caps || options.caps);
  const profile = options.county_profile;
  const rows = (Array.isArray(input.rows) ? input.rows : []).filter((row) => cleanText(row && row.normalized_address));
  const distinct = [];
  const seen = new Set();
  for (const row of rows) {
    const key = cleanText(row.normalized_address).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(row);
    if (distinct.length >= caps.max_rows) break;
  }
  const base = { rows_hunted: distinct.length, preview_only: true, should_ingest: false, no_global_mutation: true };
  if (!distinct.length) return Object.assign({ results: new Map(), browser_runtime_available: false }, base);
  if (!profile || typeof profile.browserAppraisalSearch !== 'function') {
    return Object.assign({ results: blockedResultForAll(distinct, 'no_county_browser_profile'), browser_runtime_available: false }, base);
  }

  let playwright = options.playwright_impl;
  if (!playwright) {
    try {
      playwright = require('playwright');
    } catch (error) {
      return Object.assign({ results: blockedResultForAll(distinct, 'browser_runtime_unavailable'), browser_runtime_available: false }, base);
    }
  }

  let browser = null;
  const results = new Map();
  const started = Date.now();
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    });
    const cache = new Map();
    for (const row of distinct) {
      const key = cleanText(row.normalized_address).toLowerCase();
      if (Date.now() - started > (Number(caps.total_budget_ms) || DEFAULT_CAPS.total_budget_ms)) {
        results.set(key, blockedResultForAll([row], 'lookup_budget_exhausted').get(key));
        continue;
      }
      if (cache.has(key)) {
        results.set(key, cache.get(key));
        continue;
      }
      const page = await context.newPage();
      page.setDefaultTimeout(caps.timeout_ms);
      try {
        const rowResult = await lookupRow(row, page, profile, caps);
        cache.set(key, rowResult);
        results.set(key, rowResult);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } catch (error) {
    const reason = `browser_launch_failed:${cleanText(error && error.message).slice(0, 60)}`;
    return Object.assign({ results: blockedResultForAll(distinct, reason), browser_runtime_available: false }, base);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return Object.assign({ results, browser_runtime_available: true }, base);
}

module.exports = {
  DEFAULT_CAPS,
  runPublicRecordBrowserLookup
};
