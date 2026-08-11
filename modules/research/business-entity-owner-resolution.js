'use strict';

const fetchDefault = require('node-fetch');
const publicParcelOwnerLookup = require('./public-parcel-owner-lookup');

const DEFAULT_CAPS = Object.freeze({
  max_rows: 6,
  timeout_ms: 8000
});

const BLOCKED_TEXT_RE = /\b(captcha|verify you are human|access denied|forbidden|login required|sign in|subscription required|paywall|account required)\b/i;

const REGISTRY_PROFILES = Object.freeze({
  TX: {
    state: 'TX',
    source_name: 'Texas SOSDirect',
    source_url: 'https://direct.sos.state.tx.us/acct/acct-login.asp',
    requires_account: true,
    blocked_reason: 'tx_sosdirect_account_required_no_free_public_search'
  },
  MI: {
    state: 'MI',
    source_name: 'Michigan LARA Business Entity Search',
    source_url: 'https://cofs.lara.state.mi.us/SearchApi/Search/Search',
    requires_account: false
  },
  CA: {
    state: 'CA',
    source_name: 'California Bizfile Business Search',
    source_url: 'https://bizfileonline.sos.ca.gov/search/business',
    requires_account: false
  }
});

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeCaps(caps) {
  const merged = Object.assign({}, DEFAULT_CAPS, caps || {});
  merged.max_rows = Math.max(1, Math.min(Number(merged.max_rows) || DEFAULT_CAPS.max_rows, 6));
  merged.timeout_ms = Math.max(1000, Math.min(Number(merged.timeout_ms) || DEFAULT_CAPS.timeout_ms, 12000));
  return merged;
}

function entityNameFromRow(row) {
  const owner = row && row.owner_record && cleanText(row.owner_record.owner_name) ||
    cleanText(row && row.owner_clue).replace(/\s+\[entity\]$/i, '') ||
    cleanText(row && row.owner_name_if_visible);
  return publicParcelOwnerLookup.isEntityName(owner) ? owner : '';
}

async function fetchRegistryText(url, options = {}, caps = DEFAULT_CAPS) {
  const fetchImpl = options.fetch_impl || options.fetchImpl || fetchDefault;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), caps.timeout_ms);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/json,text/plain,*/*',
        'User-Agent': 'WholesaleOS Public Entity Lookup/1.0'
      }
    });
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return { status: 'blocked', blocked_reason: `http_${response.status}`, text: '' };
    }
    if (!response.ok) return { status: 'failed', blocked_reason: `http_${response.status}`, text: '' };
    const text = await response.text();
    if (BLOCKED_TEXT_RE.test(text)) return { status: 'blocked', blocked_reason: 'captcha_or_login_wall', text: '' };
    return { status: 'ok', text };
  } catch (error) {
    return { status: 'failed', blocked_reason: cleanText(error && error.message).slice(0, 100) || 'fetch_failed', text: '' };
  } finally {
    clearTimeout(timer);
  }
}

function parseLabeledValue(text, labels) {
  const body = String(text || '');
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:#-]?\\s*([^\\n\\r|<]{3,120})`, 'i');
    const match = body.match(re);
    if (match) return cleanText(match[1]).replace(/\s{2,}/g, ' ');
  }
  return '';
}

function parseRegistryEvidence(text, profile, entityName) {
  const agentName = parseLabeledValue(text, ['registered agent', 'agent name', 'resident agent', 'agent']);
  const agentAddress = parseLabeledValue(text, ['registered office', 'agent address', 'resident agent address', 'office address']);
  const status = parseLabeledValue(text, ['entity status', 'status']);
  const officer = parseLabeledValue(text, ['manager', 'member', 'officer', 'principal']);
  const phoneMatch = String(text || '').match(/\(\d{3}\)\s?\d{3}[ .-]\d{4}\b|\b\d{3}([.-])\d{3}\1\d{4}\b/);
  const contacts = [];
  if (agentName || agentAddress) {
    contacts.push({
      route_kind: agentAddress ? 'mailing_address' : 'registered_agent_name',
      route_type: 'registered_agent_not_owner',
      value: agentAddress || agentName,
      name: agentName,
      source_kind: 'official_public_record',
      source_url: profile.source_url,
      evidence_text: cleanText([
        entityName ? `Entity: ${entityName}` : '',
        agentName ? `Registered agent: ${agentName}` : '',
        agentAddress ? `Agent address: ${agentAddress}` : ''
      ].filter(Boolean).join(' | ')),
      confidence: 'Medium',
      risk_flags: ['registered_agent_not_owner', 'verify_before_contacting']
    });
  }
  if (phoneMatch) {
    contacts.push({
      route_kind: 'phone',
      route_type: 'registered_agent_or_filing_phone_not_owner',
      value: cleanText(phoneMatch[0]),
      source_kind: 'official_public_record',
      source_url: profile.source_url,
      evidence_text: cleanText(contextAround(text, phoneMatch.index, phoneMatch[0].length)),
      confidence: 'Low',
      risk_flags: ['registered_agent_not_owner', 'verify_before_dialing']
    });
  }
  return {
    entity_status: status,
    registered_agent_name: agentName,
    registered_agent_address: agentAddress,
    officers_or_managers: officer ? [officer] : [],
    entity_contacts: contacts.slice(0, 4)
  };
}

function contextAround(text, index, length) {
  const source = String(text || '');
  return cleanText(source.slice(Math.max(0, index - 120), index + length + 120));
}

async function resolveEntityForRow(row, options = {}) {
  const entityName = cleanText(options.entity_name) || entityNameFromRow(row);
  if (!entityName) {
    return { status: 'no_entity', blocked_reason: '', source_url: '', evidence_text: 'Owner record is not a detectable entity.' };
  }
  const state = cleanText(row && row.state || options.state || (options.market && options.market.state)).toUpperCase();
  const profile = options.profile || REGISTRY_PROFILES[state];
  if (!profile) {
    return { status: 'blocked', blocked_reason: 'no_free_business_registry_profile_for_market', source_url: '', entity_name: entityName };
  }
  if (profile.requires_account) {
    return {
      status: 'blocked',
      blocked_reason: profile.blocked_reason || 'registry_requires_account',
      source_url: profile.source_url,
      entity_name: entityName,
      evidence_text: `${profile.source_name} requires an account or paid transaction; no bypass attempted.`
    };
  }
  if (options.mock_registry_text) {
    const parsed = parseRegistryEvidence(options.mock_registry_text, profile, entityName);
    return Object.assign({
      status: parsed.entity_contacts.length ? 'agent_found' : 'not_found',
      entity_name: entityName,
      source_kind: 'official_public_record',
      source_url: profile.source_url,
      evidence_text: cleanText(options.mock_registry_text).slice(0, 300)
    }, parsed);
  }
  const caps = normalizeCaps(options.caps);
  const url = profile.search_url ? profile.search_url(entityName) : profile.source_url;
  const fetched = await fetchRegistryText(url, options, caps);
  if (fetched.status !== 'ok') {
    return {
      status: fetched.status === 'blocked' ? 'blocked' : 'failed',
      blocked_reason: fetched.blocked_reason,
      source_url: url,
      entity_name: entityName
    };
  }
  const parsed = parseRegistryEvidence(fetched.text, profile, entityName);
  return Object.assign({
    status: parsed.entity_contacts.length ? 'agent_found' : 'not_found',
    entity_name: entityName,
    source_kind: 'official_public_record',
    source_url: url,
    evidence_text: cleanText(fetched.text).slice(0, 300)
  }, parsed);
}

function attemptForRow(row, result, nowIso) {
  const status = cleanText(result && result.status);
  const found = status === 'agent_found';
  const blocked = status === 'blocked' || status === 'failed';
  return {
    lane: 'business_entity_registry',
    attempted_at: nowIso,
    outcome: found ? 'FOUND' : blocked ? (status === 'blocked' ? 'BLOCKED' : 'FAILED') : 'NOT_FOUND',
    reason_code: found ? 'REGISTERED_AGENT_RECORD_FOUND' : blocked ? cleanText(result.blocked_reason || status).toUpperCase() : (status || 'NO_ENTITY_REGISTRY_RESULT').toUpperCase(),
    reason_text: found
      ? 'Business registry published a registered-agent or officer route; it is not the seller.'
      : cleanText(result && (result.evidence_text || result.blocked_reason)) || 'No free business entity registry route found.',
    source_url: cleanText(result && result.source_url) || cleanText(row && (row.source_document_url || row.source_url)),
    cost_usd: 0,
    next_eligible_at: ''
  };
}

async function runBusinessEntityOwnerResolution(input = {}, options = {}) {
  const caps = normalizeCaps(input.caps || options.caps);
  const rows = (Array.isArray(input.rows) ? input.rows : [])
    .filter((row) => entityNameFromRow(row))
    .slice(0, caps.max_rows);
  const results = new Map();
  const attempt_records = [];
  const now = new Date().toISOString();
  for (const row of rows) {
    const result = await resolveEntityForRow(row, Object.assign({}, options, { caps, market: input.market || options.market || row }));
    const key = cleanText(row.queue_key || row.normalized_address || row.source_row_reference).toLowerCase();
    results.set(key, result);
    if (row.normalized_address) results.set(cleanText(row.normalized_address).toLowerCase(), result);
    attempt_records.push(Object.assign({ row_key: key }, attemptForRow(row, result, now)));
  }
  return {
    results,
    attempt_records,
    rows_hunted: rows.length,
    preview_only: true,
    should_ingest: false,
    no_global_mutation: true
  };
}

module.exports = {
  DEFAULT_CAPS,
  REGISTRY_PROFILES,
  resolveEntityForRow,
  runBusinessEntityOwnerResolution,
  parseRegistryEvidence
};
