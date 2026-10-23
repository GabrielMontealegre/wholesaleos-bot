'use strict';

// Negotiation planner (#432, sizing from #400 part 3). Pure: no network, no clock
// (callers pass `today`), no writes, inputs never mutated. Every number it returns
// is derived from sourced inputs and labeled; it is never an agreed price.

const { canonicalizeAddress } = require('../../scripts/lib/address-canonical');

const DAY_MS = 86400000;
const STALE_DAYS = 30;
const COMP_MONTHS = 6;
const ROUND = 500;
const MIN_FEE = 10000;
const BUYER_NUMBER_MARGIN = 10000;
const BUYER_MAX_MARGIN = 15000;
const LOW_DISTRESS_TARGET_MARGIN = 20000;
const COUNTER_STEP = 0.05;
const COUNTER_STEP_COMPETING = 0.10;
const MAX_STEP = 0.10;
const FAST_ANSWER_HOURS = 24;

const MOVES = Object.freeze(['ask_seller_number', 'send_to_buyers_first', 'open_offer', 'counter',
  'renegotiate_down_for_defects', 'hold_backup', 'walk']);

// #400 part 3 signal list. One signal per kind, each with a source.
const DISTRESS_KINDS = Object.freeze({
  inherited_estate: 'Inherited or estate property',
  owner_out_of_state: 'Owner lives out of state',
  code_case: 'Code case, repair order or hearing',
  taxes_owed: 'Taxes owed',
  vacant: 'Vacant',
  long_ownership: 'Owned 20+ years',
  notices_returned: 'Notices returned or published',
  foreclosure_or_lien: 'Foreclosure or lien'
});

// Values that are never an after-repair value (AGENTS §5 Value).
const NOT_ARV = Object.freeze(['list_price', 'listing_price', 'asking_price', 'avm', 'zestimate',
  'public_estimate', 'assessed_value', 'appraised_value', 'tax_value', 'auction_bid', 'opening_bid', 'minimum_bid']);

const REPAIR_SOURCES = Object.freeze({
  inspection: 'inspection report', contractor_bid: 'contractor bid', operator_walkthrough: 'walkthrough',
  photo_review: 'photo review', estimate_per_sqft: 'per-square-foot estimate'
});

const NO_DEPOSIT = 'No deposit from Gabriel. Any deposit is paid by the end buyer when the contract is assigned.';

const text = v => typeof v === 'string' && v.trim() ? v.trim() : '';
const money = v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e9 ? v : null;
const down = v => Math.floor(v / ROUND) * ROUND;
const up = v => Math.ceil(v / ROUND) * ROUND;
const usd = v => '$' + Math.round(v).toLocaleString('en-US');

// ISO day or ISO UTC instant only. Numeric dates like 10/06/2026 are ambiguous and refused.
function instant(value) {
  if (typeof value !== 'string') return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!day && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return ms;
}

// -1 / 1 when one moment is clearly earlier / later; 0 when they share a day and either is date-only (ambiguous).
function order(a, b) {
  if (a.length > 10 && b.length > 10) return Math.sign(Date.parse(a) - Date.parse(b));
  return a.slice(0, 10) < b.slice(0, 10) ? -1 : a.slice(0, 10) > b.slice(0, 10) ? 1 : 0;
}

function softPhrase(amount) {
  const k = Math.round(amount / 1000), tens = Math.floor(k / 10) * 10, d = k % 10;
  const band = d <= 3 ? 'low' : d <= 6 ? 'mid' : 'high';
  return k >= 10 && k < 1000 ? `around $${k}k (${band} ${tens}s)` : `around $${k}k`;
}

function derived(value, basis, inputs, arv) {
  return { value, label: 'derived', preliminary: arv.status === 'preliminary', basis, inputs };
}

function readArv(input, todayMs, ignored, subjectAddress) {
  const arv = input && typeof input === 'object' ? input : {};
  const kind = text(arv.source_kind).toLowerCase();
  if (NOT_ARV.includes(kind)) { ignored.push({ field: 'arv', reason: `${kind} is never a value from sold comps` }); return null; }
  if (kind !== 'sold_comps') { ignored.push({ field: 'arv', reason: 'value is not backed by sold comps' }); return null; }
  const value = money(arv.value);
  if (!value) { ignored.push({ field: 'arv', reason: 'value missing or not a number' }); return null; }
  // Only comps the strict comp grid accepted count, each proven by its own address, price, date and source.
  if (!Array.isArray(arv.comps)) { ignored.push({ field: 'arv', reason: 'value has no sold comps attached' }); return null; }
  const subject = canonicalizeAddress(text(subjectAddress));
  if (!subject.number || !subject.street) { ignored.push({ field: 'subject_address', reason: "needed to keep the subject's own sale out of the comps" }); return null; }
  const cutoff = new Date(todayMs); cutoff.setUTCMonth(cutoff.getUTCMonth() - COMP_MONTHS);
  const seen = new Set();
  const count = arv.comps.filter((c, i) => {
    const a = text(c?.comp_address) ? canonicalizeAddress(text(c.comp_address)) : null, sold = instant(c?.sold_date);
    const key = a && [a.number, a.street, a.suffix, a.city, a.state].join('|');
    const isSubject = a && a.number === subject.number && a.street === subject.street && a.suffix === subject.suffix &&
      (!a.city || !subject.city || a.city === subject.city) && (!a.state || !subject.state || a.state === subject.state);
    const reason = !a?.number || !a.street ? 'comp address missing or incomplete'
      : isSubject ? "the subject's own sale is never its own comp"
      : seen.has(key) ? 'duplicate comp'
      : !money(c?.sold_price) ? 'sold price missing'
      : sold === null || sold > todayMs + DAY_MS - 1 ? 'sold date missing, ambiguous or in the future'
      : sold < cutoff.getTime() ? `sold more than ${COMP_MONTHS} months ago`
      : !/^https?:\/\/\S+$/.test(text(c?.source_url)) ? 'source link missing'
      : c?.comp_grid?.accepted !== true ? 'not accepted by the strict comp grid' : '';
    if (reason) { ignored.push({ field: `arv.comps[${i}]`, reason }); return false; }
    seen.add(key);
    return true;
  }).length;
  if (Number.isInteger(arv.comp_count) && arv.comp_count > count)
    ignored.push({ field: 'arv.comp_count', reason: `claimed ${arv.comp_count} comps, only ${count} qualify` });
  if (count < 2) { ignored.push({ field: 'arv', reason: 'fewer than 2 verified sold comps; no value' }); return null; }
  const status = count >= 3 ? 'verified' : 'preliminary';
  if (arv.status && arv.status !== status) ignored.push({ field: 'arv.status', reason: `stated ${arv.status}, ${count} comps make it ${status}` });
  return { value, comp_count: count, status, source_url: text(arv.source_url) || null,
    label: status === 'preliminary' ? 'Preliminary value — based on 2 sold comps' : `Value from ${count} sold comps` };
}

function readRepairs(input, ignored) {
  const value = input?.value === 0 ? 0 : money(input?.value), kind = text(input?.source_kind);
  if (value === null || !kind) { ignored.push({ field: 'repairs', reason: 'repair amount or its source missing' }); return null; }
  return { value, source_kind: kind, source_label: REPAIR_SOURCES[kind] || 'repair estimate',
    label: kind === 'inspection' || kind === 'contractor_bid' ? 'reported' : 'estimate' };
}

function readDefects(list, todayMs, ignored) {
  return (Array.isArray(list) ? list : []).filter((d, i) => {
    const at = instant(d?.captured_at);
    const ok = text(d?.item) && money(d?.cost) && text(d?.source_kind) && (text(d?.evidence) || text(d?.source_url)) &&
      at !== null && at <= todayMs + DAY_MS - 1;
    if (!ok) ignored.push({ field: `new_defects[${i}]`, reason: 'defect needs an item, a cost, a source and a valid past date' });
    return ok;
  }).map(d => ({ item: text(d.item), cost: d.cost, source_kind: text(d.source_kind), captured_at: d.captured_at }));
}

function readSignals(list, ignored) {
  const kinds = new Map();
  (Array.isArray(list) ? list : []).forEach((s, i) => {
    const kind = text(s?.kind);
    if (!Object.hasOwn(DISTRESS_KINDS, kind)) return ignored.push({ field: `distress_signals[${i}]`, reason: 'unknown signal kind' });
    if (!text(s?.source_kind) || !(text(s?.source_url) || text(s?.evidence)))
      return ignored.push({ field: `distress_signals[${i}]`, reason: 'signal has no source' });
    if (!kinds.has(kind)) kinds.set(kind, { kind, label: DISTRESS_KINDS[kind], source_kind: text(s.source_kind) });
  });
  return [...kinds.values()];
}

// Fresh, attributed buyer facts only: an id, a source, a valid date within 30 days, not in the future.
function fresh(row, field, at, todayMs, ignored, i) {
  if (!text(row?.buyer_id)) { ignored.push({ field: `${field}[${i}]`, reason: 'no buyer id' }); return false; }
  const ms = instant(at);
  if (ms === null || ms > todayMs + DAY_MS - 1) { ignored.push({ field: `${field}[${i}]`, reason: 'date missing, ambiguous or in the future' }); return false; }
  if ((todayMs - ms) / DAY_MS > STALE_DAYS) { ignored.push({ field: `${field}[${i}]`, reason: `older than ${STALE_DAYS} days` }); return false; }
  return true;
}

function readBuyerNumbers(list, todayMs, ignored) {
  const best = new Map();
  (Array.isArray(list) ? list : []).forEach((n, i) => {
    if (!fresh(n, 'buyer_numbers', n?.captured_at, todayMs, ignored, i)) return;
    if (!money(n.amount) || !text(n.source_kind)) return ignored.push({ field: `buyer_numbers[${i}]`, reason: 'amount or source missing' });
    const row = { buyer_id: text(n.buyer_id), amount: n.amount, captured_at: n.captured_at, at: instant(n.captured_at),
      proof_of_funds: n.proof_of_funds === true, answered_fast: typeof n.response_hours === 'number' &&
        n.response_hours >= 0 && n.response_hours <= FAST_ANSWER_HOURS };
    const prior = best.get(row.buyer_id);
    if (!prior || row.at > prior.at) best.set(row.buyer_id, row);
  });
  return [...best.values()].map(({ at, ...row }) => row).sort((a, b) => b.amount - a.amount);
}

function readOffers(list, todayMs, ignored) {
  return (Array.isArray(list) ? list : []).filter((o, i) => {
    const at = instant(o?.date);
    const ok = money(o?.amount) && at !== null && at <= todayMs + DAY_MS - 1;
    if (!ok) ignored.push({ field: `offers[${i}]`, reason: 'offer needs an amount and a valid past date' });
    return ok;
  }).map(o => ({ amount: o.amount, date: o.date, at: instant(o.date) })).sort((a, b) => a.at - b.at);
}

function readSeller(seller, todayMs, ignored) {
  const s = seller && typeof seller === 'object' ? seller : {};
  let stated = null;
  if (s.stated_number != null) {
    const n = s.stated_number, at = instant(n?.captured_at);
    if (money(n?.value) && text(n?.source_kind) && at !== null && at <= todayMs + DAY_MS - 1) stated = { value: n.value, captured_at: n.captured_at };
    else ignored.push({ field: 'seller.stated_number', reason: 'needs an amount, a source and a valid past date' });
  }
  return { asked: s.number_asked === true || stated !== null, stated };
}

function sizing(arv, repairs, distressCount, buyerMax) {
  const at = pct => arv.value * pct - repairs;
  if (distressCount >= 3) return { tier: '3+ signals', opening: at(0.40), target: at(0.50),
    basis: { opening: '40% of value minus repairs', target: '50% of value minus repairs' } };
  if (distressCount === 2) return { tier: '2 signals', opening: at(0.50), target: at(0.55),
    basis: { opening: '50% of value minus repairs', target: '55% of value minus repairs (low end of 55-60%)' } };
  return { tier: '0-1 signals', opening: at(0.60), target: buyerMax - LOW_DISTRESS_TARGET_MARGIN,
    basis: { opening: '60% of value minus repairs', target: 'typical buyer price minus $20,000' } };
}

function plan(facts = {}, options = {}) {
  const todayMs = instant(options.today);
  if (todayMs === null || !/^\d{4}-\d{2}-\d{2}$/.test(options.today))
    return { ok: false, error: 'today_required', next_move: null };
  const f = facts && typeof facts === 'object' ? facts : {};
  const ignored = [], warnings = [];
  const minFee = typeof options.min_fee === 'number' && Number.isFinite(options.min_fee) && options.min_fee >= MIN_FEE ? options.min_fee : MIN_FEE;

  const arv = readArv(f.arv, todayMs, ignored, f.subject_address);
  const repairs = readRepairs(f.repairs, ignored);
  const defects = readDefects(f.new_defects, todayMs, ignored);
  const signals = readSignals(f.distress_signals, ignored);
  const buyerNumbers = readBuyerNumbers(f.buyer_numbers, todayMs, ignored);
  const offers = readOffers(f.offers, todayMs, ignored);
  const seller = readSeller(f.seller, todayMs, ignored);
  const teaser = new Set();
  (Array.isArray(f.buyers) ? f.buyers : []).forEach((b, i) => {
    if (b?.holding_teaser_at != null && fresh(b, 'buyers', b.holding_teaser_at, todayMs, ignored, i)) teaser.add(text(b.buyer_id));
  });
  const dom = Number.isInteger(f.days_on_market) && f.days_on_market >= 0 ? f.days_on_market : null;
  const lastOffer = offers.length ? offers[offers.length - 1] : null;

  const base = {
    ok: true, today: options.today, prices_withheld: false, deposit: NO_DEPOSIT,
    distress: { count: signals.length, signals },
    arv: arv ? { status: arv.status, comp_count: arv.comp_count, label: arv.label } : null,
    ignored_inputs: ignored, warnings
  };
  const move = (code, reason, extra = {}) => ({ code, amount: null, phrase: null, reason, talking_points: [], operator_note: '', ...extra });

  // Ask first, before any number exists in the output (seller- or buyer-facing).
  if (!seller.asked) {
    return { ...base, status: 'needs_seller_number', prices_withheld: true, seller_side: null, buyer_side: null,
      next_move: move('ask_seller_number', 'Ask what price they have in mind before we name any number. ' +
        'Learn why they are selling, the condition and their timeline.') };
  }
  if (!arv || !repairs) {
    const missing = [!arv && 'a value from at least 2 sold comps', !repairs && 'a sourced repair amount'].filter(Boolean).join(' and ');
    return { ...base, status: 'no_offer', seller_side: null, buyer_side: null,
      next_move: move('hold_backup', `No offer yet: we still need ${missing}. Do not name a price.`) };
  }
  if (arv.status === 'preliminary') warnings.push('Preliminary value — based on 2 sold comps. Get a third sold comp before a final number.');

  const defectTotal = defects.reduce((sum, d) => sum + d.cost, 0);
  const totalRepairs = repairs.value + defectTotal;
  const defaultPct = arv.value < 120000 ? 0.70 : 0.75;
  const maxFor = (pct, rep) => arv.value * pct - rep;
  const pctOf = new Map((Array.isArray(f.buyers) ? f.buyers : [])
    .filter(b => text(b?.buyer_id) && typeof b.arv_pct === 'number' && b.arv_pct >= 0.4 && b.arv_pct <= 0.9)
    .map(b => [text(b.buyer_id), b.arv_pct]));
  const best = buyerNumbers[0] || null;
  const sum = list => list.reduce((total, d) => total + d.cost, 0);

  // Walk-away per buyer number: their number less repairs found after it (same day counts as after), less our fee.
  // A number without proof of funds can never lift the limit above the typical buyer price minus $15,000.
  function ladder(rep, defectList) {
    const max = maxFor(defaultPct, rep), size = sizing(arv, rep, signals.length, max);
    const fallback = max - Math.max(BUYER_MAX_MARGIN, minFee);
    const caps = buyerNumbers.map(n => {
      const unpriced = sum(defectList.filter(d => order(d.captured_at, n.captured_at) >= 0));
      const own = n.amount - unpriced - Math.max(BUYER_NUMBER_MARGIN, minFee);
      return { n, unpriced, held: !n.proof_of_funds && fallback < own, value: n.proof_of_funds ? own : Math.min(own, fallback) };
    }).sort((a, b) => b.value - a.value);
    const cap = caps[0] || null, walkAway = cap ? cap.value : fallback;
    const walk = down(walkAway), target = down(Math.min(size.target, walkAway)), opening = down(Math.min(size.opening, size.target, walkAway));
    return { size, walk, target, opening, buyerMax: max, cap,
      walkBasis: cap ? `buyer ${cap.n.buyer_id}'s current number${cap.unpriced ? ' less repairs found after it' : ''} minus ${usd(Math.max(BUYER_NUMBER_MARGIN, minFee))}` +
          (cap.held ? `, held to the typical buyer price minus ${usd(Math.max(BUYER_MAX_MARGIN, minFee))} until proof of funds` : '')
        : `typical buyer price minus ${usd(Math.max(BUYER_MAX_MARGIN, minFee))} (no current buyer number)` };
  }
  const L = ladder(totalRepairs, defects);
  if (L.cap && !L.cap.n.proof_of_funds) warnings.push('The buyer number our limit rests on has no proof of funds yet.');
  if (L.cap && L.cap.unpriced) warnings.push('New repairs were found after that buyer number; confirm the buyer still stands at their number.');
  const inputs = { value: arv.value, comp_count: arv.comp_count, repairs: repairs.value, new_defects_total: defectTotal,
    distress_signals: signals.length, buyer_max: Math.round(L.buyerMax), best_buyer_number: best ? best.amount : null };
  const seller_side = {
    distress_tier: L.size.tier,
    opening: derived(L.opening, L.size.basis.opening, inputs, arv),
    target: derived(L.target, L.size.basis.target, inputs, arv),
    walk_away: derived(L.walk, L.walkBasis, inputs, arv),
    last_offer: lastOffer ? { value: lastOffer.amount, date: lastOffer.date, label: 'our offer history' } : null,
    seller_number: seller.stated ? { value: seller.stated.value, label: 'seller stated' } : null
  };

  const askingRaw = Math.max(L.buyerMax, L.target + minFee);
  const buyerRows = [...new Set([...pctOf.keys(), ...buyerNumbers.map(n => n.buyer_id), ...teaser])].sort().map(id => {
    const pct = pctOf.get(id) ?? defaultPct, number = buyerNumbers.find(n => n.buyer_id === id) || null;
    return { buyer_id: id, buyer_max: derived(down(maxFor(pct, totalRepairs)),
      `${Math.round(pct * 100)}% of value minus repairs (${pctOf.has(id) ? "buyer's own percentage" : 'default'})`, inputs, arv),
      current_number: number ? { value: number.amount, captured_at: number.captured_at, label: 'buyer stated' } : null,
      proof_of_funds: number ? number.proof_of_funds : false, holding_teaser: teaser.has(id) };
  });
  const pushFrom = buyerNumbers.find(n => n.answered_fast && n.amount > L.target) || null;
  const buyer_side = {
    default_buyer_max: derived(down(L.buyerMax), `${Math.round(defaultPct * 100)}% of value minus repairs`, inputs, arv),
    asking_price: derived(up(askingRaw), `higher of the typical buyer price and our target plus ${usd(minFee)} fee`, inputs, arv),
    push_a_little: pushFrom ? { low: derived(up(pushFrom.amount * 1.03), `3% above ${pushFrom.buyer_id}'s fast answer`, inputs, arv),
      high: derived(up(pushFrom.amount * 1.05), `5% above ${pushFrom.buyer_id}'s fast answer`, inputs, arv) } : null,
    buyers: buyerRows
  };
  const out = { ...base, status: 'planned', seller_side, buyer_side };

  const points = [];
  points.push(`Repairs run about ${usd(totalRepairs)} (${repairs.source_label}${defects.length ? ' plus new findings' : ''}).`);
  points.push(arv.status === 'verified' ? `${arv.comp_count} recent sold homes nearby put the fixed-up value near ${usd(arv.value)}.`
    : `Two recent sold homes nearby point to a fixed-up value near ${usd(arv.value)} (preliminary).`);
  points.push('Whoever buys it as-is takes on the repairs and the time to resell.');
  if (dom !== null && dom >= 30) points.push(`It has been on the market ${dom} days.`);
  const note = `Our limit is ${usd(L.walk)}. Never go above it.`;

  if (L.walk <= 0 || L.opening <= 0 || L.target <= 0) {
    out.next_move = move('walk', 'The value, repairs and buyer price leave no sensible price. Walk away politely and keep the contact.',
      { operator_note: 'No positive opening, target or limit.' });
    return out;
  }

  const sellerNumber = seller.stated ? seller.stated.value : null;
  // Only repairs found after our last offer reopen the price; a same-day record is ambiguous and is flagged, not acted on.
  const sinceOffer = lastOffer ? defects.filter(d => order(d.captured_at, lastOffer.date) > 0) : [];
  if (lastOffer && defects.some(d => order(d.captured_at, lastOffer.date) === 0))
    warnings.push('A repair item was recorded the same day as our last offer; confirm whether that offer already covered it.');
  if (lastOffer && sinceOffer.length) {
    const newTotal = sum(sinceOffer);
    const before = ladder(totalRepairs - newTotal, defects.filter(d => !sinceOffer.includes(d)));
    const proposed = down(Math.min(lastOffer.amount - newTotal, L.walk, sellerNumber ?? Infinity));
    if (proposed <= 0) {
      out.next_move = move('walk', 'The new repairs leave no room at any price. Walk away politely.', { operator_note: note });
      return out;
    }
    out.renegotiation = { previous_offer: lastOffer.amount, defects: sinceOffer.map(({ captured_at, ...d }) => d), defects_total: newTotal,
      previous_target: before.target, new_target: L.target,
      proposed: derived(proposed, "last offer minus new repair costs, capped at our limit and the seller's number", inputs, arv) };
    out.next_move = move('renegotiate_down_for_defects',
      'The inspection found work that was not priced in: ' + sinceOffer.map(d => `${d.item} (${usd(d.cost)})`).join(', ') +
      `. That is ${usd(newTotal)} more in repairs, so the price has to come down.`,
      { amount: proposed, phrase: softPhrase(proposed), talking_points: points, operator_note: note });
    return out;
  }

  if (lastOffer && lastOffer.amount > L.walk) {
    warnings.push(`Our last offer (${usd(lastOffer.amount)}) is above our current limit (${usd(L.walk)}).`);
    out.next_move = move('hold_backup', 'Our last offer is now above what the numbers support. Do not raise. Confirm a funded buyer ' +
      'at a higher number before signing, or withdraw the offer.', { operator_note: note });
    return out;
  }

  const buyersReady = best !== null || teaser.size >= 2;
  if (!buyersReady) {
    out.next_move = move('send_to_buyers_first', 'Send the teaser to buyers first. No offer until a buyer gives a current number ' +
      'or at least 2 buyers are holding the teaser.', { operator_note: `Ask buyers about ${usd(up(askingRaw))}.` });
    return out;
  }

  if (L.walk < L.size.opening && !(sellerNumber !== null && sellerNumber <= L.walk) && !lastOffer) {
    out.next_move = move('hold_backup', 'The current buyer number does not leave room for our opening. Do not make an offer; ' +
      'stay in touch as a backup and look for more buyers.', { operator_note: note });
    return out;
  }

  if (!lastOffer) {
    const amount = down(Math.min(L.opening, sellerNumber ?? Infinity, L.walk));
    out.next_move = move('open_offer', sellerNumber !== null && sellerNumber <= L.opening
      ? "The seller's number is at or under our opening. Put it in writing at their number."
      : 'Make a low opening offer and explain it with the repairs and the sold homes.',
      { amount, phrase: softPhrase(amount), talking_points: points, operator_note: note });
    return out;
  }

  const responded = seller.stated && order(seller.stated.captured_at, lastOffer.date) > 0;
  if (!responded) {
    out.next_move = move('hold_backup', `Wait for the seller's answer to our last offer (${usd(lastOffer.amount)}). ` +
      'Do not raise against ourselves.', { operator_note: note });
    return out;
  }
  if (sellerNumber <= lastOffer.amount) {
    const amount = down(Math.min(sellerNumber, L.walk));
    out.next_move = move('open_offer', "The seller's number is at or under our last offer. Put it in writing at their number.",
      { amount, phrase: softPhrase(amount), talking_points: points, operator_note: note });
    return out;
  }
  if (lastOffer.amount >= L.walk) {
    out.next_move = move('hold_backup', 'We are at our limit. Tell them this is as far as the numbers go and that we are ' +
      'still here if anything changes.', { talking_points: points, operator_note: note });
    return out;
  }
  // 5% (10% when another offer is on the table), rounded inside the 5-10% window, never past our limit or their number.
  const step = f.other_offer === true ? COUNTER_STEP_COMPETING : COUNTER_STEP;
  const raw = Math.round(lastOffer.amount * (1 + step) / ROUND) * ROUND;
  const windowed = Math.min(Math.max(raw, up(lastOffer.amount * (1 + COUNTER_STEP))), down(lastOffer.amount * (1 + MAX_STEP)));
  const amount = Math.min(windowed, L.walk, sellerNumber);
  if (amount <= lastOffer.amount) {
    out.next_move = move('hold_backup', 'There is no room left for a counter. Tell them this is as far as the numbers go.',
      { talking_points: points, operator_note: note });
    return out;
  }
  out.next_move = move('counter', `Move up a little — about ${Math.round(step * 100)}% — and keep the number soft. ` +
    'Explain it with the repairs, the sold homes and the risk.',
    { amount, phrase: softPhrase(amount), talking_points: points,
      operator_note: note + (f.other_offer === true ? ' Another offer is on the table; 10% is the most we move in one round.' : '') });
  return out;
}

module.exports = Object.freeze({ plan, MOVES, DISTRESS_KINDS, NOT_ARV, STALE_DAYS, MIN_FEE, NO_DEPOSIT, softPhrase });
