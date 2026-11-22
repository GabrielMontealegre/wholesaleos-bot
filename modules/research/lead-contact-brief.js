'use strict';

const operational = require('./operational-lead-eligibility');
const roles = require('./contact-route-roles');
const provenance = require('./field-provenance');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function digits(value) { return text(value).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); }
function status(value) { return text(value).toLowerCase().replace(/[ -]+/g, '_'); }
function sourceUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch (_) { return ''; }
}
function blockedRoute(row, route) {
  if (route.risk_flags != null && !Array.isArray(route.risk_flags)) return true;
  for (const key of ['do_not_call', 'do_not_contact', 'dnc', 'litigator', 'operator_disproved']) {
    if (route[key] != null && typeof route[key] !== 'boolean') return true;
  }
  const flags = Array.isArray(route.risk_flags) ? route.risk_flags.map(status) : [];
  const rejected = ['wrong', 'wrong_number', 'rejected', 'disconnected', 'do_not_call', 'do_not_contact'];
  const invalidated = Array.isArray(row.contact_workflow_invalidated_routes) ? row.contact_workflow_invalidated_routes : [];
  return route.operator_disproved === true || route.do_not_call === true || route.do_not_contact === true ||
    route.dnc === true || route.litigator === true || rejected.includes(status(route.status)) ||
    flags.some(flag => rejected.includes(flag) || flag === 'operator_wrong_number_reported') ||
    invalidated.some(item => digits(item && item.value) === digits(route.value));
}
function institution(row) {
  return [row.owner_type, row.owner_record && row.owner_record.owner_type, row.seller_type]
    .some(value => /^(bank|bank_owned|government|government_owned|government_office)$/.test(status(value)));
}
function owner(row) {
  for (const [origin, value] of [
    ['owner_record.owner_name', row.owner_record && row.owner_record.owner_name],
    ['owner_name_if_visible', row.owner_name_if_visible], ['owner_clue', row.owner_clue]
  ]) if (text(value)) return { name: text(value), origin };
  return { name: null, origin: null };
}

// Presentation only: recompute from canonical evidence, never trust cached readiness.
function buildLeadContactBrief(input) {
  const row = input || {};
  const routes = (Array.isArray(row.free_contact_routes) ? row.free_contact_routes : []).filter(route =>
    route && typeof route === 'object' && /phone/i.test(text(route.route_kind)) &&
    /^[+\d().\s-]+$/.test(text(route.value)) && digits(route.value).length === 10 &&
    provenance.routeHasProvenance(route) && sourceUrl(route.source_url) && !blockedRoute(row, route));
  const confirmed = routes.filter(route => roles.sellerContactEligibility(route).status === roles.SELLER_CONTACT_ELIGIBLE &&
    text(route.evidence_text).replace(/\D/g, '').includes(digits(route.value)));
  const selected = confirmed[0] || routes[0] || null;
  const eligibility = operational.classify({ ...row, free_contact_routes: confirmed });
  const lifecycle = row.lifecycle_status || {};
  const uncertainRestrictions = ['do_not_call', 'do_not_contact'].some(key => row[key] != null && typeof row[key] !== 'boolean') ||
    (lifecycle.quarantined != null && typeof lifecycle.quarantined !== 'boolean');
  const allowed = Boolean(confirmed[0] && eligibility.callable && !institution(row) && lifecycle.quarantined !== true && !uncertainRestrictions);
  const identity = owner(row);
  const number = selected ? '+1' + digits(selected.value) : null;
  return {
    source_kind: 'derived_contact_brief', owner: identity,
    phone: selected ? {
      number, confirmed: confirmed.includes(selected),
      label: confirmed.includes(selected) ? 'Source-backed owner or occupant number' : 'Possible number - not confirmed',
      source_kind: selected.source_kind, source_url: sourceUrl(selected.source_url), evidence_text: text(selected.evidence_text)
    } : null,
    call_allowed: allowed, text_allowed: allowed,
    call_href: allowed ? 'tel:' + number : null, text_href: allowed ? 'sms:' + number : null,
    local_action_only: true,
    reason: allowed ? 'Review the linked source before contacting this person.' :
      institution(row) ? 'Bank or government owner: no seller outreach.' :
      lifecycle.quarantined === true ? 'Verify the lead date and current status before contacting anyone.' :
      !selected ? 'Find the owner\'s phone in the source record.' :
      !confirmed.length ? 'The source does not confirm that this number reaches the owner or occupant.' :
      'Review the property, owner and contact restrictions before contacting anyone.'
  };
}

module.exports = { buildLeadContactBrief };
