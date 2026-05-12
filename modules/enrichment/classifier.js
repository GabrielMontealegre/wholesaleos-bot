// modules/enrichment/classifier.js — Phase 3C
// Deterministic owner type classifier. Rule-based only, no LLM.
'use strict';

function classifyOwnerType(name) {
  if (!name) return null;
  var n = name.toUpperCase().trim();
  if (/\b(LLC|L\.L\.C\.|LTD LIABILITY|LIMITED LIABILITY)\b/.test(n))       return 'LLC';
  if (/\b(INC\.?|INCORPORATED|CORP\.?|CORPORATION|CO\.)\b/.test(n))       return 'corporation';
  if (/\b(TRUST|TR\.|TRUSTEE|REVOCABLE|IRREVOCABLE)\b/.test(n))              return 'trust';
  if (/\b(ESTATE|EST\.|HEIR|HEIRS|EXECUTOR|EXECUTRIX)\b/.test(n))            return 'estate';
  if (/\b(BANK|SAVINGS|FEDERAL|NA\b|FSB\b|MORTGAGE|FINANCIAL|LENDING)\b/.test(n)) return 'bank';
  if (/\b(CITY OF|COUNTY OF|COMMONWEALTH|STATE OF|AUTHORITY|HOUSING|HUD|PHILA\b|GOVT|GOVERNMENT)\b/.test(n)) return 'government';
  if (/\b(ASSOC\.?|ASSO\b|ASSOCIATION|DEMOCRATIC|REPUBLICAN|CHURCH|COMMUNITY|CENTER|FOUNDATION|PARK ASSO)/.test(n)) return 'organization';
  if (/\b(PROPERTY|PROPERTIES|REALTY|REAL ESTATE|INVESTMENT|VENTURES|HOLDINGS|CAPITAL|GROUP|PARTNERS)\b/.test(n)) return 'investor';
  if (/^[A-Z][A-Z\s]+$/.test(n) && n.split(' ').length >= 2) return 'individual';
  return null;
}

module.exports = { classifyOwnerType };
