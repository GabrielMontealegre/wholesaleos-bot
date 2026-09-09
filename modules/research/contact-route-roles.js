'use strict';

const ROLES = Object.freeze([
  'owner',
  'taxpayer',
  'occupant',
  'trustee',
  'attorney',
  'lender',
  'servicer',
  'escrow',
  'auction_company',
  'government_office',
  'unknown',
  'other_source_stated_role'
]);

const SELLER_CONTACT_ELIGIBLE = 'SELLER_CONTACT_ELIGIBLE';
const RESEARCH_ONLY = 'RESEARCH_ONLY';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function descriptiveEvidence(route) {
  return [
    route && route.evidence_text,
    route && route.source_label,
    route && route.source_kind,
    route && route.source_url
  ].map(cleanText).filter(Boolean).join(' | ');
}

function statedMatch(text, pattern) {
  const match = cleanText(text).match(pattern);
  return match ? cleanText(match[0]) : '';
}

function classified(role, basis, sourceText) {
  return {
    role,
    role_basis: basis,
    role_source_stated_text: cleanText(sourceText)
  };
}

function classifyRoute(route) {
  const descriptive = descriptiveEvidence(route);
  const routeType = cleanText(route && route.route_type);
  const normalizedType = routeType.toLowerCase();

  if (normalizedType === 'operator_confirmed_owner_or_seller_contact') {
    return classified('owner', 'route_type_operator_confirmed_owner', routeType);
  }
  if (/^(owner|owner_contact|owner_phone|owner_email|owner_of_record)$/.test(normalizedType)) {
    return classified('owner', 'source_stated_route_type', routeType);
  }
  if (/^(occupant|occupant_contact|resident_contact)$/.test(normalizedType)) {
    return classified('occupant', 'source_stated_route_type', routeType);
  }

  const mappings = [
    ['trustee', /\b(?:substitute\s+trustee|trustee)\b/i],
    ['attorney', /\b(?:attorney(?:\s+at\s+law)?|law\s+firm|legal\s+counsel)\b/i],
    ['servicer', /\b(?:mortgage\s+servicer|loan\s+servicer|servicing\s+agent|servicer|service\s+link|servicelink)\b/i],
    ['escrow', /\b(?:tax\s+service\s+escrow|escrow(?:\s+agent|\s+department)?)\b/i],
    ['lender', /\b(?:mortgagee|beneficiary|secured\s+lender|lender)\b/i],
    ['auction_company', /\b(?:auction(?:eer|\s+company)?|xome|sale\s+information\s+line)\b/i],
    ['government_office', /\b(?:county\s+clerk|court\s+clerk|tax\s+assessor|county\s+appraisal|government\s+office|sheriff(?:'s)?\s+office|marshal(?:'s)?\s+office)\b/i],
    ['taxpayer', /\btaxpayer(?:\s+of\s+record)?\b/i],
    ['occupant', /\b(?:property\s+occupant|current\s+occupant|occupant|resident)\b/i],
    ['owner', /\b(?:property\s+owner|owner\s+of\s+record|record\s+owner|seller\s+contact)\b/i]
  ];
  for (const [role, pattern] of mappings) {
    const sourceText = statedMatch(descriptive, pattern);
    if (sourceText) return classified(role, 'source_stated_evidence', sourceText);
  }

  if (normalizedType === 'listing_agent_or_poster' || /(?:agent|poster|broker|realtor)/i.test(normalizedType)) {
    return classified('other_source_stated_role', 'unmapped_source_stated_route_type', routeType);
  }
  const otherStatedRole = statedMatch(descriptive, /\b(?:listing\s+agent|registered\s+agent|contact\s+agent|poster|broker|realtor|borrower|mortgagor|debtor|grantor)\b/i);
  if (otherStatedRole) {
    return classified('other_source_stated_role', 'unmapped_source_stated_evidence', otherStatedRole);
  }
  if (normalizedType && !/^(unclassified_public_contact|trustee_servicer_or_official|official_public_contact|unknown)$/.test(normalizedType)) {
    return classified('other_source_stated_role', 'unmapped_source_stated_route_type', routeType);
  }
  return classified('unknown', 'role_not_supported_by_route_evidence', '');
}

function sellerContactEligibility(route) {
  const classification = classifyRoute(route);
  if (classification.role !== 'owner' && classification.role !== 'occupant') {
    return {
      status: RESEARCH_ONLY,
      reason: classification.role === 'unknown'
        ? 'The source does not identify this contact as the owner or occupant.'
        : `The source identifies this route as ${classification.role.replace(/_/g, ' ')}, not the seller.`
    };
  }

  const sourceKind = cleanText(route && route.source_kind);
  const provenancePresent = cleanText(route && route.source_url) && cleanText(route && route.evidence_text);
  const official = provenancePresent && (sourceKind === 'official_public_record' || sourceKind === 'public_source_document');
  const operatorScreenshot = sourceKind === 'operator_supplied_screenshot' &&
    provenancePresent && route && route.operator_confirmed === true && route.seller_owner_confirmed === true;
  if (!official && !operatorScreenshot) {
    return {
      status: RESEARCH_ONLY,
      reason: 'The owner or occupant role is not supported by an official record or an operator-confirmed screenshot.'
    };
  }

  return {
    status: SELLER_CONTACT_ELIGIBLE,
    reason: classification.role === 'owner'
      ? 'The source supports this route as an owner contact.'
      : 'The source supports this route as an occupant contact.'
  };
}

function withContactRouteRole(route) {
  const classification = classifyRoute(route);
  const eligibility = sellerContactEligibility(route);
  return Object.assign({}, route || {}, classification, {
    seller_contact_eligibility: eligibility.status,
    seller_contact_eligibility_reason: eligibility.reason
  });
}

module.exports = {
  ROLES,
  SELLER_CONTACT_ELIGIBLE,
  RESEARCH_ONLY,
  classifyRoute,
  sellerContactEligibility,
  withContactRouteRole
};
