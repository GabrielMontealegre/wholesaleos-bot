'use strict';

// Exit-strategy engine (#402). Scores every way a deal can be sold and ranks them.
// Pure: no network, no clock (callers pass `today` as YYYY-MM-DD), no writes, inputs never mutated.
// Every input fact carries provenance; facts without a source, with a forbidden source, or too old are
// rejected and never used. Output numbers are derived estimates, never offers, comps or payoffs.
const profiles = require('../buyers/buyer-strategy-profile');

// Default assumptions. Each one is shown on the result so nothing hides inside a number.
const DEFAULT_ASSUMPTIONS = Object.freeze({
  target_fee: 10000, vacancy_pct: 8, maintenance_pct: 8, management_pct: 10, closing_cost_pct: 3,
  dscr_down_pct: 25, dscr_rate_pct: 7.5, dscr_term_years: 30, target_cap_rate_pct: 8, good_dscr: 1.25,
  brrrr_refi_ltv_pct: 75, wholetail_arv_pct: 80, light_repairs_per_sqft: 20, light_repairs_arv_pct: 10,
  selling_cost_pct: 10, subject_to_max_rate_pct: 5, lot_discount: 5000, pof_max_age_days: profiles.POF_MAX_AGE_DAYS
});
const ASSUMPTION_LABELS = Object.freeze({
  target_fee: 'Our target fee', vacancy_pct: 'Vacancy (% of rent)', maintenance_pct: 'Maintenance (% of rent)',
  management_pct: 'Property management (% of rent)', closing_cost_pct: 'Buyer closing costs (% of price)',
  dscr_down_pct: 'DSCR loan down payment', dscr_rate_pct: 'DSCR loan interest rate', dscr_term_years: 'DSCR loan term (years)',
  target_cap_rate_pct: 'Landlord target cap rate', good_dscr: 'Rent coverage lenders like (DSCR)',
  brrrr_refi_ltv_pct: 'BRRRR refinance (% of ARV)', wholetail_arv_pct: 'Wholetail buyer price (% of ARV)',
  light_repairs_per_sqft: 'Light repairs (per sq ft)', light_repairs_arv_pct: 'Light repairs (% of ARV, when sq ft unknown)',
  selling_cost_pct: 'Retail selling costs (% of ARV)', subject_to_max_rate_pct: 'Subject-to: loan rate worth keeping (at most)',
  lot_discount: 'Builders expect at least this much below lot sales', pof_max_age_days: 'Proof of funds counts as current (days)'
});
// Flip buyer price band (D-015, D-031; playbook section 1). Low end of each course range.
// B-08's single offer calculator should own this table once it exists.
const FLIP_BAND = Object.freeze([[120000, 70], [200000, 75], [250000, 80], [Infinity, 83]]);
// New-home value tiers for the land 10-15-20 rule (D-032): resale share of the finished home value.
const LAND_TIERS = Object.freeze([[350000, 15], [1000000, 20], [Infinity, 25]]);

const ARV_FORBIDDEN = new Set(['list_price', 'avm', 'zestimate', 'assessed_value', 'tax_value', 'auction_bid', 'claimed_arv', 'rent_estimate']);
const RENT_SOURCES = ['hud_small_area_fmr', 'rental_comps', 'agent_report', 'lease', 'rent_roll'];
// Fact rules: value type, allowed source kinds (null = any sourced kind) and the oldest usable capture.
const FACTS = Object.freeze({
  arv: { type: 'money', sources: ['comp_grid'], max_age_days: 183 },
  repairs: { type: 'money', max_age_days: 365, zero: true },
  asking_price: { type: 'money', max_age_days: 183 },
  property_type: { type: 'text' },
  units: { type: 'count' },
  sqft: { type: 'count' },
  monthly_rent: { type: 'money', sources: RENT_SOURCES, max_age_days: 365 },
  annual_taxes: { type: 'money', max_age_days: 730, zero: true },
  annual_insurance: { type: 'money', max_age_days: 730, zero: true },
  free_and_clear: { type: 'boolean', sources: ['county_record', 'title_report', 'owner_stated'] },
  inherited: { type: 'boolean' },
  seller_open_to_terms: { type: 'boolean', sources: ['owner_stated'] },
  loan_rate_pct: { type: 'percent', sources: ['owner_stated', 'loan_statement'] },
  loan_payoff: { type: 'money', sources: ['owner_stated', 'payoff_statement'], secret_on_reject: true },
  builder_price: { type: 'money', max_age_days: 365 },
  lot_comps_value: { type: 'money', max_age_days: 730 },
  new_home_value: { type: 'money', max_age_days: 365 },
  splittable_lot: { type: 'boolean' },
  builder_activity: { type: 'count', max_age_days: 365, zero: true },
  assessed_land_value: { type: 'money', sources: ['county_record'] },
  assessed_total_value: { type: 'money', sources: ['county_record'] }
});
const CERTAINTY = Object.freeze({ verified: 3, preliminary: 2, rough: 1 });
const RENT_CERTAINTY = Object.freeze({ lease: 3, rent_roll: 3, rental_comps: 2, agent_report: 2, hud_small_area_fmr: 2 });
const EXITS = Object.freeze([
  ['flip', 'Fix and flip', 2], ['rental', 'Buy and hold rental', 2], ['brrrr', 'BRRRR', 2], ['wholetail', 'Wholetail', 2],
  ['creative', 'Creative terms', 3], ['novation', 'Novation / list', 4], ['land', 'Land / builder', 2],
  ['multifamily', 'Small multifamily', 2], ['wholesale_jv', 'Wholesale / JV', 1]
]);
const VERDICT_LABELS = Object.freeze({ strong: 'Strong', possible: 'Possible', needs_data: 'Needs data', no: 'No' });
const VERDICT_ORDER = Object.freeze({ strong: 0, possible: 1, needs_data: 2, no: 3 });

function fail(code) { const error = new Error(code); error.code = code; throw error; }
const round = (value) => Math.round(value);
const pct = (value) => Math.round(value * 10) / 10;
const usd = (value) => (value < 0 ? '-$' : '$') + Math.abs(Math.round(value)).toLocaleString('en-US');

// Divisors and loan terms; zero would divide by zero or describe no loan at all.
const POSITIVE = new Set(['target_cap_rate_pct', 'dscr_term_years', 'brrrr_refi_ltv_pct', 'wholetail_arv_pct', 'good_dscr']);
function checkAssumptions(overrides) {
  if (overrides == null) return { ...DEFAULT_ASSUMPTIONS };
  if (typeof overrides !== 'object' || Array.isArray(overrides)) fail('exit_assumptions_invalid');
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(DEFAULT_ASSUMPTIONS, key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
        (key.endsWith('_pct') && value > 100) || value > 1e9 || POSITIVE.has(key) && value === 0) fail('exit_assumptions_invalid');
  }
  return { ...DEFAULT_ASSUMPTIONS, ...overrides };
}

function validValue(rule, value) {
  if (rule.type === 'money') return typeof value === 'number' && Number.isFinite(value) && value <= 1e9 && (value > 0 || rule.zero && value === 0);
  if (rule.type === 'count') return Number.isInteger(value) && value <= 100000 && (value > 0 || rule.zero && value === 0);
  if (rule.type === 'percent') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  if (rule.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 80;
}

function httpsUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch (_) { return false; }
}

// Accepts one fact or returns the reason it cannot be used. Rejected values are never echoed.
function acceptFact(name, fact, today) {
  const rule = FACTS[name];
  if (!rule) return { reason: 'unknown_fact' };
  if (!fact || typeof fact !== 'object' || Array.isArray(fact) || !validValue(rule, fact.value)) return { reason: 'invalid_value' };
  if (typeof fact.source_kind !== 'string' || !fact.source_kind.trim()) return { reason: 'no_source' };
  const url = typeof fact.source_url === 'string' && fact.source_url ? fact.source_url : '';
  const evidence = typeof fact.evidence_text === 'string' ? fact.evidence_text.trim() : '';
  if (!url && !evidence) return { reason: 'no_source' };
  if (url && !httpsUrl(url)) return { reason: 'invalid_source_url' };
  const captured = profiles.dayNumber(typeof fact.captured_at === 'string' ? fact.captured_at.slice(0, 10) : null);
  if (captured == null) return { reason: 'no_capture_date' };
  if (captured > today) return { reason: 'future_capture' };
  if (rule.max_age_days != null && today - captured > rule.max_age_days) return { reason: 'stale' };
  if (name === 'arv' && ARV_FORBIDDEN.has(fact.source_kind)) return { reason: 'arv_needs_comparable_sales' };
  if (name === 'loan_payoff' && !rule.sources.includes(fact.source_kind)) return { reason: 'payoff_not_stated_by_owner_or_lender' };
  if (rule.sources && !rule.sources.includes(fact.source_kind)) return { reason: 'source_not_allowed' };
  const accepted = { value: rule.type === 'text' ? fact.value.trim() : fact.value, source_kind: fact.source_kind,
    source_url: url || null, evidence_text: evidence.slice(0, 300), captured_at: fact.captured_at.slice(0, 10) };
  if (name === 'arv') {
    // D-005: 3 comps = verified, 2 = preliminary, fewer = no ARV. A claimed tier never beats the count.
    const count = fact.comp_count;
    if (!Number.isInteger(count) || count < 2 || !Object.hasOwn(CERTAINTY, fact.tier)) return { reason: 'arv_needs_comparable_sales' };
    accepted.comp_count = count;
    accepted.tier = fact.tier === 'verified' && count < 3 ? 'preliminary' : fact.tier;
  }
  return { fact: accepted };
}

function readFacts(input, today) {
  const facts = {};
  const rejected = [];
  if (input == null) return { facts, rejected };
  if (typeof input !== 'object' || Array.isArray(input)) fail('exit_facts_invalid');
  for (const name of Object.keys(input).sort()) {
    const result = acceptFact(name, input[name], today);
    if (result.fact) facts[name] = result.fact; else rejected.push({ fact: name, reason: result.reason });
  }
  return { facts, rejected };
}

function payment(principal, annualRatePct, years) {
  const rate = annualRatePct / 1200, count = years * 12;
  if (!principal) return 0;
  return rate === 0 ? principal / count : principal * rate / (1 - Math.pow(1 + rate, -count));
}

function band(table, value) { return table.find(([limit]) => value < limit)[1]; }

// One rule for every price-based exit: the end buyer's maximum against what the deal costs us.
function feeVerdict(buyerMax, asking, a, certainty) {
  if (buyerMax == null) return { verdict: 'needs_data', fee: null };
  if (buyerMax <= 0) return { verdict: 'no', fee: null, reason: 'Repairs and costs use up the buyer\'s whole price.' };
  if (asking == null) return { verdict: 'possible', fee: null, reason: 'Asking price unknown, so our fee is not known yet.' };
  const fee = round(buyerMax - asking);
  let verdict = fee >= a.target_fee ? 'strong' : fee >= -0.1 * buyerMax ? 'possible' : 'no';
  if (verdict === 'strong' && certainty < 2) verdict = 'possible';
  const reason = verdict === 'no' ? 'Asking is ' + usd(-fee) + ' above what this buyer can pay.' :
    fee >= a.target_fee ? 'Leaves ' + usd(fee) + ' for us at the asking price.' :
    fee > 0 ? 'Leaves ' + usd(fee) + ', below our ' + usd(a.target_fee) + ' target.' : 'Needs ' + usd(-fee) + ' off the asking price to work.';
  return { verdict, fee, reason };
}

function number(key, label, value, unit, kind, sources = []) { return { key, label, value, unit, kind, sources }; }

function factNumber(facts, key, label, unit = 'usd') {
  const fact = facts[key];
  const tier = key === 'arv' ? ' (' + fact.tier + ', ' + fact.comp_count + ' sales)' : '';
  return number(key, label + tier, fact.value, unit, 'fact', [key]);
}

function evaluate(inputFacts, options = {}) {
  const today = profiles.dayNumber(options.today);
  if (today == null) fail('exit_today_required');
  const a = checkAssumptions(options.assumptions);
  if (options.buyers != null && !Array.isArray(options.buyers)) fail('exit_buyers_invalid');
  const { facts, rejected } = readFacts(inputFacts, today);
  const value = (key) => facts[key] ? facts[key].value : null;
  const arv = value('arv'), repairs = value('repairs'), asking = value('asking_price'), sqft = value('sqft');
  const propertyType = String(value('property_type') || '').toLowerCase();
  const land = /\b(land|lot|acre)/.test(propertyType);
  const units = value('units');
  const arvCertainty = facts.arv ? CERTAINTY[facts.arv.tier] : 0;
  const exits = {};
  const make = (key) => {
    const [, label, speed] = EXITS.find(([name]) => name === key);
    return exits[key] = { key, label, verdict: 'needs_data', verdict_label: '', applicable: true, reason: '', buyer_max: null, fee: null,
      numbers: [], missing: [], questions: [], speed, certainty: 0, metrics: {}, matching_buyers: [], pitch: '' };
  };
  const need = (exit, keys) => { exit.missing.push(...keys.filter((key) => !facts[key])); return !exit.missing.length; };
  const applyFee = (exit, buyerMax, certainty) => {
    exit.buyer_max = buyerMax == null ? null : round(buyerMax);
    exit.certainty = certainty;
    Object.assign(exit, feeVerdict(exit.buyer_max, asking, a, certainty));
    if (asking == null && buyerMax != null && buyerMax > 0) exit.missing.push('asking_price');
  };

  // 1. Fix and flip: ARV x course band - repairs (D-015).
  const flip = make('flip');
  if (land) Object.assign(flip, { applicable: false, verdict: 'no', reason: 'Land has no house to flip.' });
  else if (need(flip, ['arv', 'repairs'])) {
    const share = band(FLIP_BAND, arv);
    flip.numbers.push(factNumber(facts, 'arv', 'After-repair value'), factNumber(facts, 'repairs', 'Repairs (estimate)'),
      number('flip_band', 'Flipper price band (course chart)', share, 'percent', 'assumption'));
    applyFee(flip, arv * share / 100 - repairs, arvCertainty);
    flip.numbers.push(number('buyer_max', 'Most a flipper pays', flip.buyer_max, 'usd', 'derived', ['arv', 'repairs']));
    flip.pitch = 'Flip: after-repair value ' + usd(arv) + ' (' + facts.arv.tier + ', ' + facts.arv.comp_count + ' sales), repairs about ' + usd(repairs) + ' (estimate).';
  }

  // Rental math is shared by rental, multifamily and the "at the flipper price" check.
  const rent = value('monthly_rent');
  const opexPct = a.vacancy_pct + a.maintenance_pct + a.management_pct;
  const noi = rent != null && facts.annual_taxes && facts.annual_insurance ? rent * 12 * (1 - opexPct / 100) - value('annual_taxes') - value('annual_insurance') : null;
  const rentalMax = noi != null && repairs != null ? noi / (a.target_cap_rate_pct / 100) - repairs : null;
  const rentCertainty = facts.monthly_rent ? RENT_CERTAINTY[facts.monthly_rent.source_kind] : 0;
  const priceBasis = asking != null ? asking + a.target_fee : null;
  function rentAt(price) {
    if (price == null || price <= 0 || rent == null || repairs == null) return null;
    const allIn = price + repairs;
    const result = { price: round(price), one_percent_rule: rent >= allIn / 100 };
    if (noi == null) return result;
    const closing = price * a.closing_cost_pct / 100;
    const debt = 12 * payment(price * (1 - a.dscr_down_pct / 100), a.dscr_rate_pct, a.dscr_term_years);
    const cashIn = price * a.dscr_down_pct / 100 + closing + repairs;
    return Object.assign(result, { noi: round(noi), cap_rate: pct(noi / allIn * 100), dscr: debt ? Math.round(noi / debt * 100) / 100 : null,
      cash_on_cash_dscr: pct((noi - debt) / cashIn * 100), cash_on_cash_cash: pct(noi / (allIn + closing) * 100),
      monthly_cash_flow: round((noi - debt) / 12) });
  }
  const flipperPrice = flip.buyer_max != null && flip.buyer_max > 0 ? flip.buyer_max : null;
  const rentalNumbers = (exit, metrics) => {
    exit.numbers.push(factNumber(facts, 'monthly_rent', 'Monthly rent'), factNumber(facts, 'annual_taxes', 'Property taxes a year'),
      factNumber(facts, 'annual_insurance', 'Insurance a year'),
      number('operating_costs', 'Vacancy, maintenance and management', opexPct, 'percent', 'assumption'),
      number('noi', 'Net operating income a year', round(noi), 'usd', 'derived', ['monthly_rent', 'annual_taxes', 'annual_insurance']));
    if (metrics) exit.numbers.push(number('price_basis', asking != null ? 'Price tested (asking + our fee)' : 'Price tested (what a flipper pays)', metrics.price, 'usd', 'derived'),
      number('cap_rate', 'Cap rate at that price', metrics.cap_rate, 'percent', 'derived', ['monthly_rent', 'repairs']),
      number('cash_on_cash_dscr', 'Cash-on-cash with a DSCR loan', metrics.cash_on_cash_dscr, 'percent', 'derived', ['monthly_rent']),
      number('dscr', 'Rent coverage of the loan (DSCR)', metrics.dscr, 'ratio', 'derived', ['monthly_rent']),
      number('monthly_cash_flow', 'Cash flow a month after the loan', metrics.monthly_cash_flow, 'usd', 'derived', ['monthly_rent']));
  };
  const rentalVerdict = (exit) => {
    applyFee(exit, rentalMax, rentCertainty);
    const metrics = rentAt(priceBasis != null ? priceBasis : flipperPrice);
    exit.metrics = metrics || {};
    // A strong rental also needs the rent to cover a DSCR loan comfortably.
    if (exit.verdict === 'strong' && !(metrics && metrics.dscr >= a.good_dscr)) {
      exit.verdict = 'possible';
      exit.reason += ' Rent covers a DSCR loan less than ' + a.good_dscr + ' times.';
    }
    rentalNumbers(exit, metrics);
    exit.numbers.push(number('buyer_max', 'Most a landlord pays at a ' + a.target_cap_rate_pct + '% cap rate', exit.buyer_max, 'usd', 'derived', ['monthly_rent', 'repairs']));
  };
  const flipperCheck = (exit) => {
    const check = rentAt(flipperPrice);
    if (!check || check.cap_rate == null) return;
    exit.metrics.at_flipper_price = Object.assign(check, { works: check.cap_rate >= a.target_cap_rate_pct && check.one_percent_rule });
  };

  // 2. Buy and hold rental.
  const rental = make('rental');
  if (land) Object.assign(rental, { applicable: false, verdict: 'no', reason: 'Vacant land has no rent.' });
  else if (need(rental, ['monthly_rent', 'annual_taxes', 'annual_insurance', 'repairs'])) {
    rentalVerdict(rental);
    flipperCheck(rental);
    const m = rental.metrics;
    rental.pitch = 'Rental: rents for ' + usd(rent) + '/month (' + facts.monthly_rent.source_kind.replace(/_/g, ' ') + ').' +
      (m.cap_rate != null ? ' About ' + m.cap_rate + '% cap rate and ' + m.cash_on_cash_dscr + '% cash-on-cash with a DSCR loan at ' + a.dscr_down_pct + '% down, ' + usd(m.monthly_cash_flow) + '/month cash flow at ' + usd(m.price) + '.' : '') +
      ' Estimates, not guarantees.';
  } else if (rental.missing.includes('monthly_rent')) rental.questions.push('What does it rent for? Use HUD fair market rent, rental comps or a local agent.');

  // 3. BRRRR: the refinance (75% of ARV) has to cover the whole cost.
  const brrrr = make('brrrr');
  if (land) Object.assign(brrrr, { applicable: false, verdict: 'no', reason: 'Land cannot be refinanced as a rental.' });
  else if (need(brrrr, ['arv', 'repairs'])) {
    const refinance = arv * a.brrrr_refi_ltv_pct / 100;
    brrrr.numbers.push(factNumber(facts, 'arv', 'After-repair value'), factNumber(facts, 'repairs', 'Repairs (estimate)'),
      number('refinance', 'Refinance at ' + a.brrrr_refi_ltv_pct + '% of ARV', round(refinance), 'usd', 'derived', ['arv']));
    applyFee(brrrr, (refinance - repairs) / (1 + a.closing_cost_pct / 100), arvCertainty);
    brrrr.numbers.push(number('buyer_max', 'Most a BRRRR buyer pays and still gets all cash back', brrrr.buyer_max, 'usd', 'derived', ['arv', 'repairs']));
    if (!facts.monthly_rent) brrrr.questions.push('Confirm the rent covers the new loan before pitching BRRRR.');
    brrrr.pitch = 'BRRRR: buy, fix for about ' + usd(repairs) + ', refinance at ' + a.brrrr_refi_ltv_pct + '% of a ' + usd(arv) + ' value.';
  }

  // 4. Wholetail: light repairs only; buyer pays about 80% of ARV.
  const wholetail = make('wholetail');
  if (land) Object.assign(wholetail, { applicable: false, verdict: 'no', reason: 'Land is not a wholetail.' });
  else if (need(wholetail, ['arv', 'repairs'])) {
    const light = sqft != null ? repairs <= a.light_repairs_per_sqft * sqft : repairs <= arv * a.light_repairs_arv_pct / 100;
    wholetail.numbers.push(factNumber(facts, 'arv', 'After-repair value'), factNumber(facts, 'repairs', 'Repairs (estimate)'));
    if (!light) Object.assign(wholetail, { verdict: 'no', certainty: arvCertainty, reason: 'Repairs are more than light, so it is not a wholetail.' });
    else {
      applyFee(wholetail, arv * a.wholetail_arv_pct / 100 - repairs, arvCertainty);
      wholetail.numbers.push(number('buyer_max', 'Most a wholetail buyer pays', wholetail.buyer_max, 'usd', 'derived', ['arv', 'repairs']));
      wholetail.pitch = 'Wholetail: light repairs (about ' + usd(repairs) + '), resell near retail.';
    }
  }

  // 5. Creative: seller financing, subject-to, lease option. No dollar figure is invented here.
  const creative = make('creative');
  const creativeOptions = [];
  const freeClear = facts.free_and_clear && facts.free_and_clear.value === true;
  const openToTerms = facts.seller_open_to_terms && facts.seller_open_to_terms.value === true;
  creativeOptions.push(freeClear ? { kind: 'seller_financing', label: 'Seller financing', verdict: openToTerms ? 'strong' : 'possible',
    reason: 'Free and clear signal (' + facts.free_and_clear.source_kind.replace(/_/g, ' ') + '); confirm with title.' + (openToTerms ? ' The owner said they are open to terms.' : '') }
    : { kind: 'seller_financing', label: 'Seller financing', verdict: 'needs_data', reason: 'No free and clear signal recorded.' });
  const rate = value('loan_rate_pct'), payoff = value('loan_payoff');
  if (freeClear) creativeOptions.push({ kind: 'subject_to', label: 'Subject-to', verdict: 'no', reason: 'Free and clear: there is no loan to take over.' });
  else if (rate == null || payoff == null) {
    creativeOptions.push({ kind: 'subject_to', label: 'Subject-to', verdict: 'needs_data', reason: 'Needs the loan rate and payoff stated by the owner or the lender. Never estimated.' });
    creative.questions.push('Ask the owner: what is the loan rate, the payoff and the monthly payment? Are payments current?');
  } else {
    const keep = rate <= a.subject_to_max_rate_pct;
    const room = arv != null && payoff < arv;
    creativeOptions.push({ kind: 'subject_to', label: 'Subject-to', verdict: keep && (room || arv == null) ? 'possible' : 'no',
      reason: !keep ? 'The owner-stated rate (' + rate + '%) is not low enough to keep.' : arv == null ? 'Low owner-stated rate; equity unknown without an ARV.' :
        room ? 'Low owner-stated rate (' + rate + '%) with room under the ARV.' : 'The stated payoff is not below the ARV.' });
    creative.numbers.push(number('loan_rate_pct', 'Loan rate (owner-stated)', rate, 'percent', 'fact', ['loan_rate_pct']),
      number('loan_payoff', 'Loan payoff (' + facts.loan_payoff.source_kind.replace(/_/g, ' ') + ')', payoff, 'usd', 'fact', ['loan_payoff']));
  }
  creativeOptions.push(rent != null && openToTerms ? { kind: 'lease_option', label: 'Lease option', verdict: 'possible', reason: 'Sourced rent and an owner open to terms.' }
    : { kind: 'lease_option', label: 'Lease option', verdict: 'needs_data', reason: 'Needs a sourced rent and the owner\'s openness to terms.' });
  creative.options = creativeOptions;
  const bestOption = creativeOptions.slice().sort((x, y) => VERDICT_ORDER[x.verdict] - VERDICT_ORDER[y.verdict])[0];
  Object.assign(creative, { verdict: bestOption.verdict, reason: bestOption.label + ': ' + bestOption.reason, certainty: bestOption.verdict === 'needs_data' ? 0 : 2 });
  if (freeClear) creative.questions.push('Would the owner take payments over time instead of all cash? Ask about down payment, rate and term.');
  creative.pitch = bestOption.verdict === 'needs_data' ? '' : 'Creative: ' + bestOption.label.toLowerCase() + ' - ' + bestOption.reason +
    (facts.inherited && facts.inherited.value === true ? ' Inherited property; heirs often prefer steady payments.' : '');

  // 6. Novation / list: retail buyer price after selling costs, minus repairs. Slowest exit.
  const novation = make('novation');
  if (land) Object.assign(novation, { applicable: false, verdict: 'no', reason: 'Land goes to builders, not retail buyers.' });
  else if (need(novation, ['arv', 'repairs'])) {
    novation.numbers.push(factNumber(facts, 'arv', 'After-repair value'), factNumber(facts, 'repairs', 'Repairs (estimate)'),
      number('selling_costs', 'Retail selling costs', a.selling_cost_pct, 'percent', 'assumption'));
    applyFee(novation, arv * (1 - a.selling_cost_pct / 100) - repairs, arvCertainty);
    // Listing at retail relies on the value; only a verified ARV makes it strong.
    if (novation.verdict === 'strong' && arvCertainty < 3) novation.verdict = 'possible';
    novation.numbers.push(number('buyer_max', 'Retail price after selling costs and repairs', novation.buyer_max, 'usd', 'derived', ['arv', 'repairs']));
    novation.pitch = 'Novation: list it at retail for the owner; slower, often nets the seller more.';
  }

  // 7. Land / builder (A-018 order: builder price, then lot sales, then the 10-15-20 rule).
  const landExit = make('land');
  const share = facts.assessed_land_value && facts.assessed_total_value ? value('assessed_land_value') / value('assessed_total_value') : null;
  const signals = [];
  if (share != null && share >= 0.5) signals.push('land is ' + Math.round(share * 100) + '% of the county assessed value');
  if (facts.splittable_lot && facts.splittable_lot.value === true) signals.push('the lot may split');
  if (value('builder_activity') > 0) signals.push(value('builder_activity') + ' new builds nearby');
  if (share != null) landExit.numbers.push(number('land_share', 'Land share of county assessed value (a signal, not a price)', pct(share * 100), 'percent', 'derived', ['assessed_land_value', 'assessed_total_value']));
  let landMax = null, landCertainty = 0;
  if (facts.builder_price) { landMax = value('builder_price'); landCertainty = 3; landExit.numbers.push(factNumber(facts, 'builder_price', 'Builder\'s stated price')); }
  else if (facts.lot_comps_value) { landMax = value('lot_comps_value') - a.lot_discount; landCertainty = 2; landExit.numbers.push(factNumber(facts, 'lot_comps_value', 'Recent lot sales')); }
  else if (facts.new_home_value) {
    const sell = band(LAND_TIERS, value('new_home_value'));
    landMax = value('new_home_value') * sell / 100; landCertainty = 1;
    landExit.numbers.push(factNumber(facts, 'new_home_value', 'Nearby new-home value'), number('land_rule', '10-15-20 rule resale share (D-032)', sell, 'percent', 'assumption'));
  }
  if (landMax != null) {
    applyFee(landExit, landMax, landCertainty);
    landExit.numbers.push(number('buyer_max', 'Most a builder or land buyer pays', landExit.buyer_max, 'usd', 'derived'));
    landExit.pitch = 'Land: ' + (signals.length ? signals.join(', ') + '. ' : '') + 'Builder price about ' + usd(landExit.buyer_max) + ' (estimate).';
  } else if (signals.length) Object.assign(landExit, { verdict: 'possible', certainty: 1, reason: 'Land signals: ' + signals.join(', ') + '. Needs a builder price or lot sales.',
    pitch: 'Land: ' + signals.join(', ') + '.' });
  else if (!land) Object.assign(landExit, { verdict: 'no', reason: 'No land or builder signal recorded.' });
  else landExit.missing.push('builder_price');

  // 8. Small multifamily: price per door and cap rate, for 2+ units.
  const multifamily = make('multifamily');
  if (units == null || units < 2) Object.assign(multifamily, { applicable: false, verdict: 'no', reason: units == null ? 'Number of units unknown.' : 'Not a multifamily property.' });
  else if (need(multifamily, ['monthly_rent', 'annual_taxes', 'annual_insurance', 'repairs'])) {
    rentalVerdict(multifamily);
    const price = multifamily.metrics.price;
    if (price != null) multifamily.numbers.push(number('price_per_door', 'Price per unit', round(price / units), 'usd', 'derived'));
    multifamily.pitch = units + ' units' + (price != null ? ' at about ' + usd(price / units) + ' a door, ' + multifamily.metrics.cap_rate + '% cap rate' : '') + '. Estimates, not guarantees.';
  }

  // Buyers: strategy plus target return. Only approved, in-area buyers should be passed in.
  const buyers = (options.buyers || []).map((buyer) => ({ buyer, profile: buyer && buyer.strategy_profile })).filter(({ profile }) => profile && Array.isArray(profile.strategy));
  for (const exit of Object.values(exits)) {
    if (!exit.applicable || !['strong', 'possible'].includes(exit.verdict) || !profiles.STRATEGIES.includes(exit.key)) continue;
    for (const { buyer, profile } of buyers) {
      if (!profile.strategy.includes(exit.key)) continue;
      const check = targetCheck(profile, exit, { arv, repairs, asking });
      if (check.result === 'below') { exit.below_target_buyers = (exit.below_target_buyers || 0) + 1; continue; }
      const pof = profiles.pofCurrent(profile, options.today, a.pof_max_age_days);
      exit.matching_buyers.push({ id: buyer.id, buyer_ref: buyer.buyer_ref || null, name: buyer.name || '', return_check: check.result, return_note: check.note,
        buyer_price: check.buyer_price == null ? null : round(check.buyer_price), pof_current: pof, deals_per_year: profile.deals_per_year ?? null,
        rank: check.result === 'meets' ? (pof ? 3 : 2) : 1 });
    }
    exit.matching_buyers.sort((x, y) => y.rank - x.rank || (y.deals_per_year ?? -1) - (x.deals_per_year ?? -1) || String(x.id).localeCompare(String(y.id)));
  }

  // 9. Wholesale / JV: how we sell whichever exit wins. Not ranked against the others.
  const viable = Object.values(exits).filter((exit) => exit.key !== 'wholesale_jv' && exit.applicable && ['strong', 'possible'].includes(exit.verdict));
  const ranked = viable.sort(compare(a));
  const dispo = make('wholesale_jv');
  const withBuyer = ranked.find((exit) => exit.matching_buyers.some((buyer) => buyer.rank >= 2));
  if (withBuyer) Object.assign(dispo, { verdict: withBuyer.verdict, fee: withBuyer.fee, certainty: withBuyer.certainty,
    reason: 'Assign the contract to a matched ' + withBuyer.label.toLowerCase() + ' buyer.' });
  else if (ranked.length) Object.assign(dispo, { verdict: 'possible', fee: ranked[0].fee, certainty: ranked[0].certainty,
    reason: 'No matched buyer yet: find a ' + ranked[0].label.toLowerCase() + ' buyer or offer a 50/50 JV to a partner wholesaler.' });
  else dispo.reason = 'No exit works yet with the recorded facts.';

  for (const exit of Object.values(exits)) {
    exit.verdict_label = VERDICT_LABELS[exit.verdict];
    exit.missing = [...new Set(exit.missing)];
    if (!exit.reason && exit.verdict === 'needs_data') exit.reason = 'Missing: ' + exit.missing.map((key) => key.replace(/_/g, ' ')).join(', ') + '.';
  }
  return {
    label: 'Ways to sell this deal - derived estimates, not offers', derived: true, is_offer: false, today: options.today,
    exits: EXITS.map(([key]) => exits[key]), ranked: ranked.map((exit) => exit.key), best: ranked.length ? ranked[0].key : null,
    also_works: ranked.slice(1).map((exit) => exit.key), dispo: 'wholesale_jv',
    facts_used: facts, rejected_facts: rejected,
    assumptions: Object.keys(a).map((key) => ({ key, label: ASSUMPTION_LABELS[key], value: a[key], changed: a[key] !== DEFAULT_ASSUMPTIONS[key] }))
  };
}

// Does the exit give this buyer the return they asked for? Unknown is never a pass.
function targetCheck(profile, exit, { arv, repairs, asking }) {
  const target = profile.target_return;
  if (!target) return { result: 'not_stated', note: 'Target return not stated - confirm with the buyer.' };
  if (target.basis === 'pct_arv') {
    if (arv == null || repairs == null) return { result: 'unknown', note: 'Needs a comps-based ARV to compare.' };
    const price = arv * target.percent / 100 - repairs;
    if (asking == null) return { result: 'unknown', buyer_price: price, note: 'Asking price unknown.' };
    return price > asking ? { result: 'meets', buyer_price: price, note: target.percent + '% of ARV minus repairs is above the asking price.' }
      : { result: 'below', buyer_price: price };
  }
  const metrics = exit.metrics || {};
  const leveraged = (profile.funding || []).includes('dscr');
  const actual = target.basis === 'cap_rate' ? metrics.cap_rate : leveraged ? metrics.cash_on_cash_dscr : metrics.cash_on_cash_cash;
  if (actual == null) return { result: 'unknown', note: 'This exit has no ' + profiles.LABELS[target.basis] + ' yet.' };
  return actual >= target.percent ? { result: 'meets', note: actual + '% ' + profiles.LABELS[target.basis] + ' meets the buyer\'s ' + target.percent + '%.' }
    : { result: 'below' };
}

// Ranking (#402): a real matching buyer (current proof of funds weighs most), then our fee at
// target, then speed, then data certainty (verified > preliminary > rough), then the verdict.
function compare(a) {
  const order = EXITS.map(([key]) => key);
  const buyerRank = (exit) => exit.matching_buyers.reduce((best, buyer) => Math.max(best, buyer.rank), 0);
  const atTarget = (exit) => exit.fee != null && exit.fee >= a.target_fee ? 1 : 0;
  return (x, y) => buyerRank(y) - buyerRank(x) || atTarget(y) - atTarget(x) || x.speed - y.speed || y.certainty - x.certainty ||
    VERDICT_ORDER[x.verdict] - VERDICT_ORDER[y.verdict] || (y.fee ?? -Infinity) - (x.fee ?? -Infinity) || order.indexOf(x.key) - order.indexOf(y.key);
}

// Plain-English lines for a deal card: "Best exit: ..." and "Also works: ...".
function cardLines(result) {
  const byKey = Object.fromEntries(result.exits.map((exit) => [exit.key, exit]));
  const describe = (exit) => exit.label + (exit.fee != null ? ' (' + (exit.fee >= 0 ? usd(exit.fee) + ' fee' : usd(-exit.fee) + ' short') + ', estimate)' : exit.buyer_max != null ? ' (buyer pays up to ' + usd(exit.buyer_max) + ', estimate)' : '');
  return { best: result.best ? 'Best exit: ' + describe(byKey[result.best]) : 'Best exit: not enough data yet',
    also_works: result.also_works.length ? 'Also works: ' + result.also_works.map((key) => describe(byKey[key])).join('; ') : '' };
}

module.exports = { DEFAULT_ASSUMPTIONS, FLIP_BAND, LAND_TIERS, FACTS, RENT_SOURCES, evaluate, cardLines, payment };
