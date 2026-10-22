'use strict';

// Maps a reviewed deal and its evaluation (reviewed-deals.evaluate) into exit-engine facts (#402).
// Pure. ARV comes only from the reviewed comp grid; the holder's claimed ARV and claimed rehab are
// never used. Reviewed deals carry no rent, taxes or loan facts yet, so those exits show missing data.
const TIERS = Object.freeze({ Verified: 'verified', Preliminary: 'preliminary', 'Texas list-price': 'preliminary' });
const UNITS = Object.freeze({ house: 1, sfr: 1, 'single family': 1, townhome: 1, condo: 1, duplex: 2, triplex: 3, fourplex: 4, quadplex: 4, '4-plex': 4, '3-plex': 3 });

function fromReviewedDeal(deal, evaluation) {
  const facts = {};
  const source = { source_kind: 'public_web_page', source_url: deal.source_url || null, captured_at: deal.captured_at || '' };
  const value = evaluation && evaluation.value;
  const tier = value && value.range && TIERS[value.tier];
  if (tier) {
    const comps = value.comps || [];
    facts.arv = { value: value.range.low, tier, comp_count: comps.length, source_kind: 'comp_grid', source_url: comps[0] ? comps[0].source_url : null,
      evidence_text: comps.length + ' reviewed comparable sales; low end of the range used.', captured_at: deal.evidence_reviewed_at || deal.captured_at || '' };
  }
  if (deal.repair_estimate != null) facts.repairs = { value: deal.repair_estimate, ...source, source_kind: 'reviewed_repair_estimate', evidence_text: 'Repair estimate on the reviewed deal.' };
  const asking = evaluation && evaluation.asking;
  if (asking != null) facts.asking_price = { value: asking, ...source, evidence_text: deal.asking_price > 0 ? 'Asking price on the source page.' : 'Starting bid on the source page.' };
  if (deal.property_type) facts.property_type = { value: deal.property_type, ...source, evidence_text: 'Property type on the source page.' };
  const units = UNITS[String(deal.property_type || '').trim().toLowerCase()];
  if (units) facts.units = { value: units, ...source, evidence_text: 'Units implied by the stated property type.' };
  if (deal.sqft > 0) facts.sqft = { value: Math.round(deal.sqft), ...source, evidence_text: 'Living area on the source page.' };
  return facts;
}

// Buyer profiles for the buyers reviewed-deals already matched on approval, area and type.
function buyersFor(evaluation, buyers) {
  const byId = new Map((buyers || []).map((buyer) => [buyer.id, buyer]));
  return ((evaluation && evaluation.matches) || []).map((match) => {
    const buyer = byId.get(match.id);
    return { id: match.id, buyer_ref: match.buyer_ref || null, name: match.name || '',
      strategy_profile: buyer && buyer.assistant_find && buyer.assistant_find.strategy_profile || null };
  });
}

module.exports = { fromReviewedDeal, buyersFor };
