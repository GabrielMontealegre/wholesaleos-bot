'use strict';

const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');
const { normalizeSourceDate } = require('./normalize-source-date');
const { compHasProvenance } = require('./field-provenance');

const GLOSSARY = Object.freeze([
  ['Cash wholesale', 'Put a house under contract, then sell the contract to a cash investor for a fee. You do not buy the house. Often fits an owner with equity and a house needing work.'],
  ['Double close', 'Buy and resell the house on the same day instead of assigning the contract. Sometimes used when a fee is large or assignment is unavailable.'],
  ['Subject-to', 'A buyer makes payments on the existing mortgage while the loan stays in the seller\'s name. The loan balance, payment, arrears, and legal risks must be checked.'],
  ['Short sale', 'The lender agrees to accept less than the debt. It needs lender approval and may take months.'],
  ['Seller financing', 'The seller receives payments over time instead of all cash at closing. Ask whether the home is owned free and clear.'],
  ['Novation', 'An agreement to market a property openly and share proceeds above an agreed amount. Terms, repair costs, and local rules need review.'],
  ['Wholetail', 'Buy and resell a mostly move-in-ready house with little or no repair work.'],
  ['Fix and flip', 'An investor buys, renovates, and resells a property. Such an investor may buy a wholesale contract.'],
  ['Rental (buy and hold)', 'An investor buys a property to rent long term. Rent and expenses still need verification.'],
  ['Section 8', 'A housing voucher program that may pay part of an eligible tenant\'s rent to the landlord. Eligibility and rent limits vary.'],
  ['Pre-foreclosure', 'A foreclosure process has started, but the sale outcome must still be checked against the current official source.'],
  ['Tax foreclosure', 'A government sale process for unpaid property taxes. Verify the current deadline and legal status.'],
  ['Probate / inherited', 'A property may pass through an estate or to heirs. Authority to sell must be verified.'],
  ['ARV', 'An estimate of the price after repairs, supported by recent, nearby, similar sold properties.'],
  ['Comps', 'Nearby similar properties that actually sold recently. Listings and estimates are not sold comps.'],
  ['Equity', 'Value minus what is currently owed. Public records do not establish the current loan payoff; ask the owner or servicer.'],
  ['Lien', 'A legal claim tied to money owed. Its current amount and payoff terms must be verified.']
].map(([term, definition]) => Object.freeze({ term, definition })));

const LOAN_CAVEAT = 'Loan balance unknown - ask the owner.';

function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
function dateOnly(value) { return normalizeSourceDate(clean(value).slice(0, 10)).iso || normalizeSourceDate(value).iso || ''; }
function fit(path, verdict, why, need, equityRelated = false) {
  return { path, verdict, why: equityRelated ? `${why} ${LOAN_CAVEAT}` : why, seller_question: need };
}
function sourcedPriorSale(row) {
  const entry = row && row.leverage_dossier && row.leverage_dossier.ownership && row.leverage_dossier.ownership.prior_sale_date;
  if (!entry || entry.status !== 'VERIFIED' || !entry.provenance ||
      !clean(entry.provenance.source_url) || !clean(entry.provenance.evidence_text)) return '';
  return dateOnly(entry.value);
}
function yearsSince(iso, today) {
  const from = Date.parse(`${iso}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? (to - from) / 31556952000 : null;
}
function noticeKind(row) {
  if (!clean(row && (row.source_document_url || row.source_url))) return '';
  const text = [row && row.foreclosure_type, row && row.source_family,
    row && row.distress_evidence && row.distress_evidence.distress_reason,
    row && row.distress_evidence && row.distress_evidence.official_event_status].map(clean).join(' ').toLowerCase();
  if (/\b(?:tax foreclosure|tax sale|tax deed sale)\b/.test(text)) return 'tax';
  return /foreclos|notice of default|trustee sale/.test(text) ? 'mortgage' : '';
}
function completeAddress(value) {
  const parts = canonicalizeAddress(value);
  return ['number', 'street', 'suffix', 'city', 'state', 'zip'].every((key) => parts[key]) ? parts.canonical_string : '';
}
function ownerMailsElsewhere(row) {
  const owner = row && row.owner_record || {};
  const mail = row && row.mailing_route || {};
  if (owner.source_kind !== 'official_public_record' || mail.source_kind !== 'official_public_record') return false;
  const property = completeAddress(row.normalized_address);
  const mailing = completeAddress(mail.value);
  return !!(property && mailing && property !== mailing);
}
function verifiedArvUnder(row, ceiling) {
  const comps = Array.isArray(row && row.verified_comps) ? row.verified_comps : [];
  const seen = new Set();
  const prices = [];
  for (const comp of comps) {
    if (!comp || !comp.comp_grid || comp.comp_grid.accepted !== true || !compHasProvenance(comp)) continue;
    const identity = clean(comp.parcel_id || comp.apn || comp.pin) || completeAddress(comp.comp_address || comp.address);
    const price = Number(comp.sold_price);
    if (!identity || seen.has(identity) || !(price > 0)) continue;
    seen.add(identity);
    prices.push(price);
  }
  prices.sort((a, b) => a - b);
  if (prices.length < 3) return false;
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  return median < ceiling;
}
function builderSeller(row) {
  const story = row && row.property_story || {};
  return clean(story.last_sale_seller_kind).toLowerCase() === 'builder' &&
    !!clean(story.source_url) && !!clean(story.evidence_text);
}
function dealFits(row, options = {}) {
  const today = dateOnly(options.today_iso || new Date().toISOString().slice(0, 10));
  const held = yearsSince(sourcedPriorSale(row), today);
  const notice = noticeKind(row);
  const absentee = ownerMailsElsewhere(row);
  const lowVerifiedArv = verifiedArvUnder(row, 150000);
  const cashVerdict = held == null ? 'UNKNOWN' : held >= 10 ? 'LIKELY' : held < 3 ? 'UNLIKELY' : 'UNKNOWN';
  const cashWhy = held == null ? 'No sourced prior sale date establishes how long the owner has held the property.'
    : held >= 10 ? 'A sourced prior sale indicates the property has been held at least 10 years; equity is not established.'
      : held < 3 ? `A sourced prior sale is less than three years old${builderSeller(row) ? ' and the seller was recorded as a builder' : ''}; room for a cash assignment is uncertain.`
        : 'The sourced holding period alone does not establish cash-wholesale fit.';
  const subjectVerdict = notice === 'mortgage' && held != null && held < 7 ? 'LIKELY' : 'UNKNOWN';
  const shortVerdict = notice === 'mortgage' && held != null && held < 3 ? 'POSSIBLE' : 'UNKNOWN';
  const sellerVerdict = held != null && held >= 15 && absentee ? 'POSSIBLE' : 'UNKNOWN';
  const rentalVerdict = lowVerifiedArv ? 'POSSIBLE' : 'UNKNOWN';
  const result = [
    fit('Cash wholesale', cashVerdict, cashWhy, 'Ask what is owed now, the condition, and the price the owner needs.', true),
    fit('Subject-to', subjectVerdict, subjectVerdict === 'LIKELY'
      ? 'A sourced mortgage-foreclosure notice and a prior sale within seven years make a payment takeover worth discussing; the loan terms are unknown.'
      : 'A current mortgage notice and a sourced recent purchase are both needed before suggesting this path.',
    'Ask for the current loan balance, monthly payment, arrears, and whether the owner would consider this structure.', true),
    fit('Short sale', shortVerdict, shortVerdict === 'POSSIBLE'
      ? 'A mortgage-foreclosure notice and a prior sale within three years make lender approval worth investigating; debt is unverified.'
      : 'A foreclosure notice and sourced recent purchase are needed before considering lender approval.',
    'Ask what the lender says is owed and whether the owner would seek lender approval.', true),
    fit('Seller financing', sellerVerdict, sellerVerdict === 'POSSIBLE'
      ? 'A sourced sale at least 15 years ago and a different official mailing address make terms worth discussing; ownership free and clear is unverified.'
      : 'The sourced holding period and a different official mailing address are not both established.',
    'Ask whether they own it free and clear and whether monthly payments would work.', true),
    fit('Rental / Section 8', rentalVerdict, rentalVerdict === 'POSSIBLE'
      ? 'At least three grid-accepted sold comps support an ARV below $150,000; rent and program eligibility are unverified.'
      : 'No qualifying three-comp ARV below $150,000 is established.',
    'Ask about current rent, condition, occupancy, and any rental restrictions.', true)
  ];
  if (notice === 'tax') result.push(fit('Tax foreclosure', 'POSSIBLE',
    `An official tax-sale source is attached${dateOnly(row.sale_date_iso || row.sale_date_or_event_date) ? ` with a stated sale date of ${dateOnly(row.sale_date_iso || row.sale_date_or_event_date)}` : ', but its sale date still needs verification'}.`,
    'Ask whether the owner has resolved the taxes or received a current payoff statement.', true));
  return result;
}
function priorityForRow(row, fits, options = {}) {
  const lifecycle = row && row.lifecycle_status || {};
  const status = clean(lifecycle.status);
  const address = completeAddress(row && row.normalized_address);
  const distress = noticeKind(row);
  const today = dateOnly(options.today_iso || new Date().toISOString().slice(0, 10));
  const sale = dateOnly(row && (row.sale_date_iso || row.sale_date_or_event_date));
  const days = sale && today ? Math.round((Date.parse(`${sale}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
  const ranked = ['LIKELY', 'POSSIBLE', 'UNKNOWN', 'UNLIKELY'];
  const rankedBest = fits.slice().sort((a, b) => ranked.indexOf(a.verdict) - ranked.indexOf(b.verdict))[0];
  const best = rankedBest && ['LIKELY', 'POSSIBLE'].includes(rankedBest.verdict) ? rankedBest :
    fit('Not established', 'UNKNOWN', 'No transaction path is supported by enough evidence yet.',
      'Ask about the current balance, property condition, and the owner\'s goals.');
  let band = 'LOW';
  let why = 'No sourced urgent distress or qualifying value evidence is established.';
  let next = 'Review the official source and confirm this is the property to research.';
  if (['SALE_PASSED', 'SUPERSEDED_DUPLICATE', 'UNVERIFIABLE', 'SOURCE_NO_LONGER_LISTED'].includes(status)) {
    band = 'SKIP';
    why = 'The source status is passed, superseded, missing, or unverifiable; do not treat this as a current opportunity.';
    next = 'Verify whether a new official source has reactivated this property.';
  } else if (!address) {
    band = 'LOW';
    why = 'The property address is not complete and source-supported.';
    next = 'Verify the property address from its official source.';
  } else if (lifecycle.quarantined) {
    band = distress ? 'WORTH_A_LOOK' : 'LOW';
    why = 'There is a distress source, but its current date or status must be checked before contact.';
    next = 'Recheck the current official sale status and source date.';
  } else if (distress && status === 'FRESH' && days != null && days >= 0 && days <= 14) {
    band = 'WORK_NOW';
    why = `An official ${distress === 'tax' ? 'tax' : 'foreclosure'} source shows a sale in ${days} day${days === 1 ? '' : 's'}; the outcome still needs verification.`;
  } else if (distress || fits.some((item) => ['LIKELY', 'POSSIBLE'].includes(item.verdict))) {
    band = 'WORTH_A_LOOK';
    why = distress ? 'A sourced distress event merits research, but no immediate verified deadline is established.'
      : 'A sourced holding-period or value clue merits review, without a verified distress event.';
  }
  if (band !== 'SKIP' && !(lifecycle.quarantined) && address) {
    if (!(Number(row && row.confirmed_strict_comp_count) >= 3) && clean(row && row.state).toUpperCase() === 'TX') {
      next = 'Capture qualifying sold-property screenshots or ask a licensed agent for closed MLS comps.';
    } else if (!clean(row && row.best_contact) && !(Array.isArray(row && row.free_contact_routes) && row.free_contact_routes.length)) {
      next = 'Find a sourced seller contact route before any outreach.';
    } else if (Number(row && row.confirmed_strict_comp_count) >= 3) {
      next = 'Verify current title, sale status, condition, and payoff before considering an offer.';
    }
  }
  return { band, why, best_fit: best || fit('Unknown', 'UNKNOWN', 'No sourced fit is established.', 'Ask about the situation.'), next_step: next };
}
function explainRow(row, options = {}) {
  const fits = dealFits(row, options);
  return { priority: priorityForRow(row, fits, options), fits };
}

module.exports = { GLOSSARY, explainRow, dealFits, priorityForRow };
