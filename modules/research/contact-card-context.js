'use strict';
const provenance = require('./field-provenance');
const dates = require('./normalize-source-date');
const origins = require('./sale-date-origin');
const resolver = require('./resolve-source-sale-date');
const money = require('./distress-evidence-model');
const text = value => typeof value === 'string' ? value.trim() : '';
function proofFor(row, evidence) {
  let url = '';
  try { const u = new URL(row.source_document_url || row.source_url); if (['https:', 'http:'].includes(u.protocol) && !u.username && !u.password) url = u.href; } catch (_) {}
  const result = { source_kind: text(row.source_kind), source_url: url, evidence_text: text(evidence).slice(0, 1000),
    source_reference: text(row.source_row_reference || row.source_reference || row.source_record_id) || null,
    captured_at: text(row.captured_at || row.source_captured_at) || null };
  return provenance.hasProvenance(result) && ['official_public_record', 'public_source_document', 'public_web_page'].includes(result.source_kind) ? result : null;
}
function buildContactCardContext(row = {}) {
  const sourceText = text(row.source_proof_text), why = text(row.motivation_evidence_text).slice(0, 600);
  const whyProof = why && sourceText.includes(why) ? proofFor(row, why) : null;
  const sourceId = row.source_adapter_id || row.source_id;
  let sale = null;
  for (const field of [...origins.GENERIC_DATE_FIELDS, ...origins.SALE_DATE_ORIGINS]) {
    const origin = field === 'event_date' ? row.event_date_origin || row.sale_date_or_event_date_origin :
      field === 'sale_date_or_event_date' ? row.sale_date_or_event_date_origin : field === 'sale_date' ? row.sale_date_origin || field : field;
    const raw = text(row[field]), proof = proofFor(row, sourceText);
    if (!raw || !origins.isSaleDateOrigin(origin, sourceId) || !proof || !sourceText.includes(raw)) continue;
    const normalized = dates.normalizeSourceDate(raw);
    const resolved = normalized.iso || resolver.resolveSourceSaleDate({ raw_text: raw, raw_field: field,
      source_adapter_id: sourceId, source_url: proof.source_url, document_text: sourceText, index_sale_date_text: row.index_sale_date_text }).resolved_iso;
    if (resolved) sale = { raw, iso: resolved, origin: field, ...proof };
    break;
  }
  const debt = money.moneyFactsForRow(row).filter(fact => fact.semantic_role === 'debt' && fact.verification_state === 'source_labeled' &&
      /\d/.test(text(fact.exact_amount)) && text(fact.evidence_text).replace(/\D/g, '').includes(text(fact.exact_amount).replace(/\D/g, '')) &&
      proofFor({ ...row, source_document_url: '', source_url: fact.official_source_url }, fact.evidence_text))
    .map(fact => ({ label: fact.operator_label, amount: fact.exact_amount, source_url: fact.official_source_url,
      source_reference: fact.source_document_or_page || null, evidence_text: text(fact.evidence_text).slice(0, 1000) }));
  const loan = row.original_loan_amount ?? row.original_principal_amount;
  const loanText = typeof loan === 'number' && Number.isFinite(loan) ? String(loan) : text(loan);
  const loanProof = proofFor(row, row.original_loan_amount_evidence_text || row.original_principal_amount_evidence_text);
  if (/^\$?\d[\d,]*(?:\.\d{1,2})?$/.test(loanText) && Number(loanText.replace(/[$,]/g, '')) > 0 && loanProof &&
      loanProof.evidence_text.replace(/\D/g, '').includes(loanText.replace(/\D/g, ''))) {
    debt.unshift({ label: 'Original loan amount - not the current payoff', amount: loanText, ...loanProof });
  }
  return { source_kind: 'derived_contact_context', why: whyProof ? { text: why, ...whyProof } : null,
    sale_date: sale, debt_clues: debt, equity_band: 'unknown' };
}
module.exports = { buildContactCardContext };
