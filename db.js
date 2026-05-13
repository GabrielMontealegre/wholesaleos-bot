// db.js — JSON file database with full CRM support
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || './data/db.json';
const DB_FILE = path.resolve(DB_PATH);
const DB_DIR  = path.dirname(DB_FILE);

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function readDB() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return { leads:[], buyers:[], assignments:[], calendar:[], followups:[], contracts:[], settings:{} };
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { leads:[], buyers:[], assignments:[], calendar:[], followups:[], contracts:[], settings:{} }; }
}

function writeDB(data) {
  ensureDir();
  // Atomic write: .tmp then rename — prevents db.json corruption on crash/restart
  var tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ── Leads ──────────────────────────────────────────────
function getLeads() { return readDB().leads || []; }


// ── Distress type normalizer (Phase 1B.3 — improved) ────────────────────────
function normalizeDistressTypes(lead) {
  var types = [];

  // Gather all signal text into one lowercase string for broad matching
  var src  = ((lead.source || '') + ' ' +
              (lead.motivation || '') + ' ' +
              ((lead.source_details && lead.source_details.type) || '') + ' ' +
              ((lead.source_details && lead.source_details.source_name) || '')).toLowerCase();

  var viols = (lead.violations || []).map(function(v){ return (v||'').toLowerCase(); });
  var violStr = viols.join(' ');

  // ── Code violation ────────────────────────────────────────────────────────
  if (/l.?i violations?|code.?viol|code.?enforce|blight|property.?maint|unsafe|building.?permit|complaint/i.test(src) ||
      /code.?viol|code.?compliance|blight|property.?maint|unsafe|permit|hearing|overgrowth|rental.?reg|residential.?rental/i.test(violStr) ||
      lead.motivation === 'code_violation' || lead.motivation === 'Code Violation') {
    types.push('code_violation');
  }

  // ── Vacant ───────────────────────────────────────────────────────────────
  if (/vacant/i.test(src) || /vacant/i.test(violStr)) {
    types.push('vacant');
  }

  // ── Tax delinquency ───────────────────────────────────────────────────────
  if (/tax.?delin|delin.?tax|tax.?lien|treasurer|tax.?sale|delinquent/i.test(src) ||
      /tax/i.test(violStr) ||
      lead.motivation === 'tax_delinquency') {
    types.push('tax_delinquency');
  }

  // ── Foreclosure ───────────────────────────────────────────────────────────
  if (/foreclos|sheriff.?sale|lis.?pendens/i.test(src) ||
      lead.motivation === 'foreclosure') {
    types.push('foreclosure');
  }

  // ── Pre-foreclosure ───────────────────────────────────────────────────────
  if (/pre.?foreclos|notice.?default|nod/i.test(src) ||
      lead.motivation === 'pre_foreclosure') {
    types.push('pre_foreclosure');
  }

  // ── Auction ───────────────────────────────────────────────────────────────
  if (/auction|sheriff.?sale|tax.?sale/i.test(src) ||
      lead.motivation === 'auction') {
    types.push('auction');
  }

  // ── Probate ───────────────────────────────────────────────────────────────
  if (/probate|estate|deceased|heir/i.test(src) ||
      lead.motivation === 'probate') {
    types.push('probate');
  }

  // ── Absentee owner ────────────────────────────────────────────────────────
  if (/absentee|out.?of.?state|non.?owner/i.test(src) ||
      lead.motivation === 'absentee_owner') {
    types.push('absentee_owner');
  }

  // ── Lien ─────────────────────────────────────────────────────────────────
  if (/lien/i.test(src) || /lien/i.test(violStr)) {
    types.push('lien');
  }

  // ── Failed MLS ───────────────────────────────────────────────────────────
  if (/expired.?listing|failed.?mls|cancelled.?listing/i.test(src) ||
      lead.motivation === 'failed_mls') {
    types.push('failed_mls');
  }

  // ── Caller-provided override (preserve existing if set) ───────────────────
  if (lead.distress_types && Array.isArray(lead.distress_types) && lead.distress_types.length > 0) {
    lead.distress_types.forEach(function(dt) {
      if (types.indexOf(dt) === -1) types.push(dt);
    });
    return types;
  }

  // Fallback: if no type matched but motivation exists, store it normalized
  if (types.length === 0 && lead.motivation) {
    var m = (lead.motivation || '').toLowerCase().replace(/s+/g,'_');
    var valid = ['tax_delinquency','code_violation','foreclosure','pre_foreclosure',
                 'probate','auction','absentee_owner','failed_mls','vacant','lien'];
    if (valid.indexOf(m) > -1) types.push(m);
  }

  return types;
}

// ── Distress score calculator (Phase 1B.3 — improved) ────────────────────────
function computeDistressScore(lead) {
  var score = 0;

  // Use caller-provided distress_types OR compute fresh
  var types = (lead.distress_types && Array.isArray(lead.distress_types) && lead.distress_types.length > 0)
    ? lead.distress_types
    : normalizeDistressTypes(lead);

  // ── Code violation: base 15, +5 per additional violation (max +20) ────────
  if (types.indexOf('code_violation') > -1) {
    score += 15;
    var vcount = (lead.violations || []).length;
    if (vcount > 1) score += Math.min((vcount - 1) * 5, 20);
  }

  // ── Vacant bonus (often paired with code_violation) ───────────────────────
  if (types.indexOf('vacant') > -1) score += 10;

  // ── Tax delinquency: base 25, +5/yr (max +25) ────────────────────────────
  if (types.indexOf('tax_delinquency') > -1) {
    score += 25;
    var yrs = parseInt(lead.years_delinquent) || 0;
    score += Math.min(yrs * 5, 25);
  }

  // ── Foreclosure: base 30 ─────────────────────────────────────────────────
  if (types.indexOf('foreclosure') > -1) score += 30;

  // ── Pre-foreclosure: base 20 ─────────────────────────────────────────────
  if (types.indexOf('pre_foreclosure') > -1) score += 20;

  // ── Auction: base 20 if no foreclosure, +15 if within 30 days ────────────
  if (types.indexOf('auction') > -1) {
    if (types.indexOf('foreclosure') === -1) score += 20;
    if (lead.auction_date) {
      var daysOut = Math.ceil((new Date(lead.auction_date) - new Date()) / 86400000);
      if (daysOut >= 0 && daysOut <= 30) score += 15;
    }
  }

  // ── Probate: +20 ─────────────────────────────────────────────────────────
  if (types.indexOf('probate') > -1) score += 20;

  // ── Absentee owner: +10 ──────────────────────────────────────────────────
  if (types.indexOf('absentee_owner') > -1) score += 10;

  // ── Failed MLS: +10 ──────────────────────────────────────────────────────
  if (types.indexOf('failed_mls') > -1) score += 10;

  // ── Multi-distress stacking bonus: +15 if 2+ distinct types ──────────────
  if (types.length >= 2) score += 15;

  return Math.min(score, 100);
}


// ── Address normalizer (Phase 1C) ─────────────────────────────────────────────
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

function stringifySourceDetails(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return [
      value.type,
      value.source_name,
      value.label,
      value.name
    ].filter(Boolean).join(' ');
  }
  return String(value);
}

function normalizeLeadIntelligenceCause(lead) {
  var types = asArray(lead && lead.distress_types).map(function(t) {
    return String(t || '').toLowerCase();
  });
  var signalText = [
    types.join(' '),
    lead && lead.source,
    stringifySourceDetails(lead && lead.source_details),
    lead && lead.motivation,
    asArray(lead && lead.violations).join(' '),
    asArray(lead && lead.good_deal_reasons).join(' '),
    lead && lead.why_good_deal,
    lead && lead.enrichment_notes
  ].join(' ').toLowerCase();

  if (/foreclos|pre.?foreclos|auction|sheriff.?sale|lis.?pendens/.test(signalText)) return 'foreclosure';
  if (/probate|estate|heir|letters testamentary/.test(signalText)) return 'probate';
  if (/tax.?delin|delin.?tax|tax.?lien|tax.?sale|tax.?deed|treasurer/.test(signalText)) return 'tax_delinquent';
  if (/code.?viol|code.?enforce|blight|complaint|unsafe|property.?maint/.test(signalText)) return 'code_violation';
  if (/\blien\b/.test(signalText)) return 'lien';
  if (/bankruptcy|chapter 7|chapter 13/.test(signalText)) return 'bankruptcy';
  if (/divorce|dissolution/.test(signalText)) return 'divorce';
  if (/vacant|abandoned|unoccupied/.test(signalText)) return 'vacant';
  return 'unknown';
}

function computeDaysToAuction(auctionDate) {
  if (!auctionDate) return null;
  var d = new Date(auctionDate);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function computeLeadIntelligence(lead) {
  lead = lead || {};
  var cause = normalizeLeadIntelligenceCause(lead);
  var score = typeof lead.distress_score === 'number'
    ? lead.distress_score
    : (typeof lead.motivation_score === 'number' ? lead.motivation_score : 0);
  var daysToAuction = computeDaysToAuction(lead.auction_date);
  var reasons = asArray(lead.good_deal_reasons).filter(Boolean).map(function(r) { return String(r); });
  var summary = lead.why_good_deal || reasons.join('. ');
  if (!summary) {
    summary = cause !== 'unknown'
      ? 'Distress signal: ' + cause
      : 'No confirmed distress summary available';
  }

  var urgencyLevel = 'low';
  var urgencyReason = 'insufficient_urgent_signal';
  if (daysToAuction != null && daysToAuction >= 0 && daysToAuction <= 30) {
    urgencyLevel = 'high';
    urgencyReason = 'auction_date_within_30_days';
  } else if (score >= 70 || cause === 'foreclosure') {
    urgencyLevel = 'high';
    urgencyReason = score >= 70 ? 'high_distress_score' : 'foreclosure_signal';
  } else if (score >= 35 || cause !== 'unknown' || reasons.length > 0) {
    urgencyLevel = 'medium';
    urgencyReason = score >= 35 ? 'moderate_distress_score' : 'distress_signal_present';
  }

  var hasContact = !!(lead.owner_phone || lead.phone || lead.owner_email || lead.email);
  var recommended = 'monitor';
  if (!lead.owner_name && !hasContact) recommended = 'enrich_first';
  else if (cause === 'probate') recommended = 'reach_estate_contact';
  else if (urgencyLevel === 'high' && hasContact) recommended = 'call_now';
  else if (urgencyLevel === 'medium' && hasContact) recommended = 'send_offer';

  var urls = {
    source_url: lead.source_url || null,
    source_query_url: lead.source_query_url || null,
    source_record_url: lead.source_record_url || null
  };
  var hasUrl = !!(urls.source_url || urls.source_query_url || urls.source_record_url);
  var signalCount = 0;
  if (cause !== 'unknown') signalCount++;
  if (score > 0) signalCount++;
  if (daysToAuction != null) signalCount++;
  if (reasons.length > 0) signalCount++;
  if (lead.enrichment_notes) signalCount++;

  var confidence = 'low';
  if (hasUrl && signalCount >= 2 && (lead.owner_name || hasContact)) confidence = 'high';
  else if (signalCount >= 2 || (hasUrl && signalCount >= 1)) confidence = 'medium';

  return {
    intelligence_version: 'v1',
    summary: summary,
    distress_cause: cause,
    urgency_level: urgencyLevel,
    urgency_reason: urgencyReason,
    timeline: {
      auction_date: lead.auction_date || null,
      days_to_auction: daysToAuction,
      years_delinquent: lead.years_delinquent || null,
      last_activity: lead.last_activity || null,
      last_contact_attempt: lead.last_contact_attempt || null,
      last_status_change: lead.last_status_change || null
    },
    evidence: {
      distress_types: asArray(lead.distress_types).filter(Boolean),
      distress_score: typeof lead.distress_score === 'number' ? lead.distress_score : null,
      source: lead.source || null,
      source_details: lead.source_details || null,
      urls: urls,
      violations: asArray(lead.violations).filter(Boolean),
      motivation: lead.motivation || null,
      good_deal_reasons: reasons,
      enrichment_notes: lead.enrichment_notes || null
    },
    owner_context: {
      owner_name: lead.owner_name || null,
      owner_type: lead.owner_type || null,
      owner_phone: lead.owner_phone || lead.phone || null,
      owner_email: lead.owner_email || lead.email || null
    },
    recommended_next_action: recommended,
    confidence: confidence
  };
}

function normalizeAddress(addr) {
  if (!addr) return '';
  return addr
    .toUpperCase()
    .replace(/\bAPT\.?\s*#?\w+/gi, '')
    .replace(/\bUNIT\.?\s*#?\w+/gi, '')
    .replace(/\b(STE|SUITE)\.?\s*#?\w+/gi, '')
    .replace(/\b#\w+/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function addLead(lead) {
  const db = readDB();
  if (!db.leads) db.leads = [];
  const newLead = {
    id:      'L' + Date.now() + Math.random().toString(36).slice(2,6),
    status:  'New Lead',
    created: new Date().toISOString().slice(0,10),
    ...lead,
    // Quality fields — only set if not already provided by caller
    id:             lead.id      || ('LEAD-' + Date.now() + '-' + Math.floor(Math.random()*10000)),
    ref_number:     lead.ref_number || ('WOS-' + String(Date.now()).slice(-5) + Math.floor(Math.random()*10).toString()),
    created_at:     lead.created_at     || new Date().toISOString(),
    county:         lead.county         !== undefined ? lead.county : null,
    source_details: lead.source_details || { type: lead.source || 'unknown', source_name: lead.source || 'unknown' },
    good_deal_reasons: lead.good_deal_reasons || [],
    motivation_score:  typeof lead.motivation_score === 'number' ? lead.motivation_score : (typeof lead.motivation === 'number' ? lead.motivation : 0),
    // Lead classification: raw = no real comp data, deal_ready = ARV confirmed
    lead_type:         lead.lead_type || ((lead.arv && lead.arv > 0) ? 'deal_ready' : 'raw'),
    // ── Phase 1B additive fields ── safe defaults, never overwrite if caller provides ──
    owner_name:        lead.owner_name        || lead.owner || null,
    owner_phone:       lead.owner_phone       || null,
    owner_email:       lead.owner_email       || null,
    owner_type:        lead.owner_type        || null,
    distress_types:    (lead.distress_types && lead.distress_types.length > 0)
                         ? lead.distress_types
                         : normalizeDistressTypes(lead),
    distress_score:    lead.distress_score    != null
                         ? lead.distress_score
                         : computeDistressScore(lead),
    distress_history:  lead.distress_history  || [],
    source_query_url:  lead.source_query_url  || null,
    source_record_url: lead.source_record_url || null,
    enrichment_status:          lead.enrichment_status          || 'none',
    enrichment_attempts:        lead.enrichment_attempts        != null ? lead.enrichment_attempts : 0,
    last_enrichment_attempt:    lead.last_enrichment_attempt    || null,
    enrichment_source:          lead.enrichment_source          || null,
    enrichment_notes:           lead.enrichment_notes           || null,
    enrichment_date:            lead.enrichment_date            || null,
    enrichment_history:         Array.isArray(lead.enrichment_history) ? lead.enrichment_history : [],
    archived:          lead.archived          === true ? true : false,
    archive_reason:    lead.archive_reason    || null,
    last_activity:          lead.last_activity          || new Date().toISOString(),
    normalized_address:     lead.normalized_address     || normalizeAddress(lead.address || ''),
    // Phase 2A — activity tracking
    contact_attempts:       lead.contact_attempts       != null ? lead.contact_attempts : 0,
    last_contact_attempt:   lead.last_contact_attempt   || null,
    last_status_change:     lead.last_status_change     || new Date().toISOString(),
    // Phase 2A — duplicate detection
    duplicate_group_id:     lead.duplicate_group_id     || null,
    duplicate_count:        lead.duplicate_count        != null ? lead.duplicate_count : 1,
  };
  // Phase 2B: dedup guard — check normalized_address + city + state before inserting
  var normNew  = newLead.normalized_address || normalizeAddress(newLead.address || '');
  var cityNew  = (newLead.city  || '').toLowerCase().trim();
  var stateNew = (newLead.state || '').toLowerCase().trim();
  if (normNew && cityNew) {
    var existIdx = -1;
    for (var _i = 0; _i < db.leads.length; _i++) {
      var _l = db.leads[_i];
      if (_l.archived) continue;
      var normEx  = _l.normalized_address || normalizeAddress(_l.address || '');
      var cityEx  = (_l.city  || '').toLowerCase().trim();
      var stateEx = (_l.state || '').toLowerCase().trim();
      if (normEx === normNew && cityEx === cityNew && stateEx === stateNew) {
        existIdx = _i; break;
      }
    }
    if (existIdx > -1) {
      var ex = db.leads[existIdx];
      ex.source_count     = (ex.source_count || 1) + 1;
      ex.merged_duplicate = true;
      ex.last_activity    = new Date().toISOString();
      if ((newLead.distress_score || 0) > (ex.distress_score || 0)) ex.distress_score = newLead.distress_score;
      if (!ex.distress_types) ex.distress_types = [];
      (newLead.distress_types || []).forEach(function(dt) {
        if (ex.distress_types.indexOf(dt) === -1) ex.distress_types.push(dt);
      });
      if (!ex.distress_history) ex.distress_history = [];
      ex.distress_history.push({ source: newLead.source, type: (newLead.distress_types||[])[0]||null, date: new Date().toISOString(), details: newLead.source_url||null });
      if (newLead.violations && newLead.violations.length) {
        if (!ex.violations) ex.violations = [];
        newLead.violations.forEach(function(v){ if (ex.violations.indexOf(v)===-1) ex.violations.push(v); });
      }
      if (!ex.owner_name  && newLead.owner_name)  ex.owner_name  = newLead.owner_name;
      if (!ex.owner_phone && newLead.owner_phone) ex.owner_phone = newLead.owner_phone;
      if (!ex.owner_email && newLead.owner_email) ex.owner_email = newLead.owner_email;
      if (newLead.source_url)        ex.source_url        = newLead.source_url;
      if (newLead.source_record_url) ex.source_record_url = newLead.source_record_url;
      db.leads[existIdx] = ex;
      writeDB(db);
      return { merged: true, id: ex.id };
    }
  }
  // No duplicate — insert normally
  db.leads.unshift(newLead);
  writeDB(db);
  return newLead;
}

function updateLead(id, updates) {
  const db = readDB();
  const idx = (db.leads||[]).findIndex(l => l.id === id);
  if (idx === -1) return null;
  db.leads[idx] = { ...db.leads[idx], ...updates };
  writeDB(db);
  return db.leads[idx];
}

function leadExists(address) {
  if (!address) return false;
  // Normalize: lowercase, remove extra spaces
  const norm = a => (a||'').toLowerCase().trim().replace(/\s+/g,' ');
  const newAddr = norm(address);
  return getLeads().some(l => norm(l.address) === newAddr);
}

function clearFakeLeads() {
  // Remove leads with obviously fake/generic addresses
  const db = readDB();
  const fakePatterns = [/^\d{3,4}\s+(oak|maple|elm|cedar|palm|pine|main|first|second)\s+(st|ave|blvd|dr)/i];
  const before = (db.leads||[]).length;
  db.leads = (db.leads||[]).filter(l => !fakePatterns.some(p => p.test(l.address||'')));
  if (db.leads.length < before) { writeDB(db); }
  return before - db.leads.length;
}

// ── Buyers ─────────────────────────────────────────────
function getBuyers() { return readDB().buyers || []; }

function addBuyer(buyer) {
  const db = readDB();
  if (!db.buyers) db.buyers = [];
  const newBuyer = {
    id:      'B' + Date.now(),
    status:  'Active',
    score:   75,
    closings: 0,
    created: new Date().toISOString().slice(0,10),
    ...buyer,
  };
  db.buyers.push(newBuyer);
  writeDB(db);
  return newBuyer;
}

function matchBuyersToLead(lead) {
  return getBuyers().filter(b => {
    if (b.status !== 'Active') return false;
    const priceOk = (!b.maxPrice || (lead.arv||0) * 0.85 <= b.maxPrice) &&
                    (!b.minARV   || (lead.arv||0) >= b.minARV);
    return priceOk;
  }).sort((a, b) => (b.score||0) - (a.score||0));
}

// ── Assignments ─────────────────────────────────────────
function getAssignments() { return readDB().assignments || []; }

// ── Calendar / Events ───────────────────────────────────
function getUpcomingEvents(days = 30) {
  const db = readDB();
  const today    = new Date();
  const cutoff   = new Date(); cutoff.setDate(cutoff.getDate() + days);
  return (db.calendar || [])
    .filter(e => { const d = new Date(e.date); return d >= today && d <= cutoff; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function addEvent(evt) {
  const db = readDB();
  if (!db.calendar) db.calendar = [];
  const newEvt = { id: 'E' + Date.now(), ...evt };
  db.calendar.push(newEvt);
  writeDB(db);
  return newEvt;
}

// ── Stats ───────────────────────────────────────────────
// Operational event log (additive audit spine, not a source of truth)
const MAX_OPERATIONAL_EVENTS = 5000;

function stableStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function hashEventSeed(seed) {
  return crypto.createHash('sha256').update(stableStringify(seed)).digest('hex').slice(0, 24);
}

function sanitizeEventPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};

  var blockedKeys = {
    html: true,
    raw_html: true,
    pdf: true,
    raw_pdf: true,
    pdf_text: true,
    full_lead: true,
    lead: true,
    leads: true
  };
  var clean = {};

  Object.keys(payload).forEach(function(key) {
    if (blockedKeys[key]) return;
    var value = payload[key];
    if (value === undefined || typeof value === 'function') return;
    if (typeof value === 'string' && value.length > 1000) {
      clean[key] = value.slice(0, 1000);
      return;
    }
    if (Array.isArray(value)) {
      clean[key] = value.slice(0, 50).map(function(item) {
        if (item && typeof item === 'object') return sanitizeEventPayload(item);
        if (typeof item === 'string' && item.length > 500) return item.slice(0, 500);
        return item;
      });
      return;
    }
    if (value && typeof value === 'object') {
      clean[key] = sanitizeEventPayload(value);
      return;
    }
    clean[key] = value;
  });

  return clean;
}

function normalizeEventEnvelope(event) {
  var input = event || {};
  var occurredAt = input.occurred_at || new Date().toISOString();
  var normalized = {
    event_id: input.event_id || null,
    event_version: 'v1',
    event_type: input.event_type || 'unknown_event',
    category: input.category || 'system',
    occurred_at: occurredAt,
    entity: input.entity && typeof input.entity === 'object' ? input.entity : {},
    actor: input.actor && typeof input.actor === 'object' ? input.actor : null,
    source: input.source && typeof input.source === 'object' ? input.source : { system: 'wholesaleos' },
    payload: sanitizeEventPayload(input.payload),
    correlation_id: input.correlation_id || null,
    causation_id: input.causation_id || null,
    dedupe_key: input.dedupe_key || null,
    severity: input.severity || 'info',
    confidence: input.confidence || 'medium'
  };

  if (!normalized.event_id) {
    normalized.event_id = 'evt_' + hashEventSeed({
      event_type: normalized.event_type,
      category: normalized.category,
      occurred_at: normalized.occurred_at,
      entity: normalized.entity,
      payload: normalized.payload,
      dedupe_key: normalized.dedupe_key
    });
  }

  return normalized;
}

function appendEvent(event) {
  var db = readDB();
  if (!db.events) db.events = [];

  var normalized = normalizeEventEnvelope(event);
  if (normalized.dedupe_key) {
    var existing = db.events.find(function(evt) {
      return evt && evt.dedupe_key === normalized.dedupe_key;
    });
    if (existing) return existing;
  }

  db.events.push(normalized);
  if (db.events.length > MAX_OPERATIONAL_EVENTS) {
    db.events = db.events.slice(db.events.length - MAX_OPERATIONAL_EVENTS);
  }
  writeDB(db);
  return normalized;
}

function getEvents(filters) {
  var opts = filters || {};
  var events = (readDB().events || []).slice();

  if (opts.event_type) events = events.filter(function(evt) { return evt.event_type === opts.event_type; });
  if (opts.category) events = events.filter(function(evt) { return evt.category === opts.category; });
  if (opts.correlation_id) events = events.filter(function(evt) { return evt.correlation_id === opts.correlation_id; });
  if (opts.entity_type) events = events.filter(function(evt) { return evt.entity && evt.entity.type === opts.entity_type; });
  if (opts.entity_id) events = events.filter(function(evt) { return evt.entity && String(evt.entity.id) === String(opts.entity_id); });
  if (opts.since) events = events.filter(function(evt) { return evt.occurred_at >= opts.since; });
  if (opts.until) events = events.filter(function(evt) { return evt.occurred_at <= opts.until; });

  events.sort(function(a, b) {
    return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
  });

  var limit = Math.max(0, Math.min(parseInt(opts.limit, 10) || 100, MAX_OPERATIONAL_EVENTS));
  return events.slice(0, limit);
}

function getStats() {
  const db = readDB();
  const allLeads    = db.leads || [];
  const leads       = allLeads.filter(l => l.archived !== true); // Phase 3A: exclude archived
  const assignments = db.assignments || [];
  const buyers      = db.buyers || [];
  const followups   = db.followups || [];
  return {
    total_leads:     leads.length,
    new_leads:       leads.filter(l => l.status === 'New Lead').length,
    contacted:       leads.filter(l => l.status === 'Contacted').length,
    under_contract:  leads.filter(l => l.status === 'Under Contract').length,
    closed_deals:    assignments.filter(a => a.status === 'Closed').length,
    fees_collected:  assignments.filter(a => a.status === 'Closed').reduce((s,a) => s+(a.fee||0), 0),
    fees_pipeline:   assignments.filter(a => a.status !== 'Closed').reduce((s,a) => s+(a.fee||0), 0),
    active_buyers:   buyers.filter(b => b.status === 'Active').length,
    followups_due:   followups.filter(f => f.status === 'pending' && f.nextDate <= new Date().toISOString().slice(0,10)).length,
  };
}

// ── Settings ─────────────────────────────────────────────
function getSetting(key) { return (readDB().settings || {})[key]; }
function setSetting(key, val) {
  const db = readDB();
  if (!db.settings) db.settings = {};
  db.settings[key] = val;
  writeDB(db);
}

// ── Notifications system ────────────────────────────────
function addNotification(type, title, message, data={}) {
  const db = readDB();
  if (!db.notifications) db.notifications = [];
  const notif = {
    id: 'N' + Date.now(),
    type, // 'deal','buyer','scan','match','warning','system'
    title, message,
    data,
    read: false,
    created: new Date().toISOString()
  };
  db.notifications.unshift(notif);
  if (db.notifications.length > 200) db.notifications = db.notifications.slice(0,200);
  writeDB(db);
  return notif;
}

function getNotifications(unreadOnly=false) {
  const db = readDB();
  const notifs = db.notifications || [];
  return unreadOnly ? notifs.filter(n => !n.read) : notifs;
}

function markNotificationsRead(ids=[]) {
  const db = readDB();
  if (!db.notifications) return;
  db.notifications.forEach(n => {
    if (ids.length === 0 || ids.includes(n.id)) n.read = true;
  });
  writeDB(db);
}

function getScannedMarkets() {
  return (readDB().scanned_markets || []);
}

function addScannedMarket(stateCode, county) {
  const db = readDB();
  if (!db.scanned_markets) db.scanned_markets = [];
  const key = stateCode + '_' + county;
  if (!db.scanned_markets.includes(key)) {
    db.scanned_markets.push(key);
    if (db.scanned_markets.length > 100) db.scanned_markets = db.scanned_markets.slice(-100);
    writeDB(db);
  }
}

// ── Lead hierarchy: State → County ─────────────────────
function getLeadsByStateCounty() {
  const leads = getLeads();
  const tree = {};
  leads.forEach(l => {
    const state = l.state || 'TX';
    const county = l.county || 'Unknown';
    if (!tree[state]) tree[state] = {};
    if (!tree[state][county]) tree[state][county] = [];
    tree[state][county].push(l);
  });
  // Sort each county's leads by spread desc
  Object.values(tree).forEach(counties =>
    Object.values(counties).forEach(leads =>
      leads.sort((a,b) => (b.spread||0)-(a.spread||0))
    )
  );
  return tree;
}

// ── Bulk add buyers (dedup by name+phone) ─────────────
function addBuyersBulk(buyers) {
  const db = readDB();
  if (!db.buyers) db.buyers = [];
  const existing = new Set(db.buyers.map(b => (b.name+b.phone).toLowerCase()));
  let added = 0;
  for (const buyer of buyers) {
    const key = ((buyer.name||'')+(buyer.phone||'')).toLowerCase();
    if (!key || existing.has(key)) continue;
    buyer.id = 'B' + Date.now() + Math.random().toString(36).slice(2,5);
    buyer.status = buyer.status || 'Active';
    buyer.created = new Date().toISOString().slice(0,10);
    db.buyers.push(buyer);
    existing.add(key);
    added++;
  }
  writeDB(db);
  return added;
}

// ══════════════════════════════════════════════════════════
//  USER MANAGEMENT SYSTEM
// ══════════════════════════════════════════════════════════

const DEFAULT_USERS = [
  { id:'admin', name:'Gabriel (Admin)', pin:'1234', role:'admin', color:'#1d1d1f', initials:'GA', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u2',  name:'User 2',  pin:'2001', role:'user', color:'#0071e3', initials:'U2', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u3',  name:'User 3',  pin:'2002', role:'user', color:'#34c759', initials:'U3', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u4',  name:'User 4',  pin:'2003', role:'user', color:'#ff9500', initials:'U4', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u5',  name:'User 5',  pin:'2004', role:'user', color:'#ff3b30', initials:'U5', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u6',  name:'User 6',  pin:'2005', role:'user', color:'#5e5ce6', initials:'U6', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u7',  name:'User 7',  pin:'2006', role:'user', color:'#ff6b35', initials:'U7', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u8',  name:'User 8',  pin:'2007', role:'user', color:'#30d158', initials:'U8', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u9',  name:'User 9',  pin:'2008', role:'user', color:'#64d2ff', initials:'U9', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u10', name:'User 10', pin:'2009', role:'user', color:'#bf5af2', initials:'U10', created: new Date().toISOString().slice(0,10), firstLogin: true },
];

function getUsers() {
  const db = readDB();
  if (!db.users || db.users.length === 0) {
    db.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
    writeDB(db);
  }
  return db.users;
}

function getUserByPin(pin) {
  return getUsers().find(u => u.pin === String(pin));
}

function getUserById(id) {
  return getUsers().find(u => u.id === id);
}

function updateUser(id, updates) {
  const db = readDB();
  if (!db.users) db.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
  const user = db.users.find(u => u.id === id);
  if (!user) return null;
  // PIN uniqueness check
  if (updates.pin && updates.pin !== user.pin) {
    const taken = db.users.find(u => u.pin === updates.pin && u.id !== id);
    if (taken) return { error: 'PIN already in use by another account' };
  }
  Object.assign(user, updates);
  writeDB(db);
  return user;
}

function addUser(data) {
  const db = readDB();
  if (!db.users) db.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
  // Check PIN uniqueness
  if (db.users.find(u => u.pin === data.pin)) return { error: 'PIN already in use' };
  const user = {
    id: 'u' + Date.now(),
    name: data.name || 'New User',
    pin: data.pin,
    role: data.role || 'user',
    color: data.color || '#86868b',
    initials: (data.name||'U').slice(0,2).toUpperCase(),
    created: new Date().toISOString().slice(0,10),
    firstLogin: true,
  };
  db.users.push(user);
  writeDB(db);
  return user;
}

// ── Lead filtering by user ────────────────────────────────
function getLeadsForUser(userId) {
  const leads = getLeads();
  if (userId === 'admin') return leads; // Admin sees all
  return leads.filter(l => l.userId === userId || !l.userId); // User sees own + untagged
}

function getLeadsByStateCountyForUser(userId) {
  const leads = getLeadsForUser(userId);
  const tree = {};
  leads.forEach(l => {
    const state = l.state || 'TX';
    const county = l.county || 'Unknown';
    if (!tree[state]) tree[state] = {};
    if (!tree[state][county]) tree[state][county] = [];
    tree[state][county].push(l);
  });
  Object.values(tree).forEach(counties =>
    Object.values(counties).forEach(arr =>
      arr.sort((a,b) => (b.spread||0)-(a.spread||0))
    )
  );
  return tree;
}

// ── Stats per user ────────────────────────────────────────
function getStatsForUser(userId) {
  const leads = getLeadsForUser(userId);
  const today = new Date().toISOString().slice(0,10);
  const buyers = getBuyers(); // shared
  const assignments = getAssignments();
  return {
    total_leads: leads.length,
    new_leads: leads.filter(l => l.status === 'New Lead').length,
    new_today: leads.filter(l => l.created === today).length,
    under_contract: leads.filter(l => l.status === 'Under Contract').length,
    closed_deals: leads.filter(l => l.status === 'Closed').length,
    fees_collected: assignments.filter(a => a.status === 'Closed' && (userId==='admin'||a.userId===userId)).reduce((s,a) => s+(a.fee||0), 0),
    fees_pipeline: leads.filter(l => ['Offer Sent','Negotiating','Under Contract'].includes(l.status)).reduce((s,l) => s+(l.fee_hi||0), 0),
    active_buyers: buyers.filter(b => b.status === 'Active').length,
  };
}

// ── Archived leads (90-day rule) ─────────────────────────
function archiveStaleLeads() {
  const db = readDB();
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0,10);
  if (!db.archived_leads) db.archived_leads = [];
  const toArchive = (db.leads||[]).filter(l =>
    l.status === 'New Lead' &&
    l.created <= cutoffStr &&
    !l.contacted_at
  );
  if (toArchive.length === 0) return 0;
  db.archived_leads.push(...toArchive.map(l => ({...l, archived_at: new Date().toISOString().slice(0,10)})));
  db.leads = (db.leads||[]).filter(l => !toArchive.find(a => a.id === l.id));
  writeDB(db);
  return toArchive.length;
}

function checkLeadLimit() {
  const count = (readDB().leads||[]).length;
  if (count >= 9500) {
    addNotification('warning', 'Lead limit approaching', count + '/10,000 leads stored. Archiving oldest uncontacted leads.');
    archiveStaleLeads();
  }
  return count;
}

// ── Pending buyers (user-submitted, needs admin approval) ─
function addPendingBuyer(buyerData, userId) {
  const db = readDB();
  if (!db.pending_buyers) db.pending_buyers = [];
  const pending = { ...buyerData, id: 'PB' + Date.now(), submittedBy: userId, submittedAt: new Date().toISOString(), status: 'pending' };
  db.pending_buyers.push(pending);
  writeDB(db);
  addNotification('buyer', 'Buyer pending approval', (buyerData.name||'Unknown') + ' submitted by ' + userId, { pendingId: pending.id });
  return pending;
}

function getPendingBuyers() {
  return (readDB().pending_buyers || []).filter(b => b.status === 'pending');
}

function approvePendingBuyer(pendingId) {
  const db = readDB();
  const pending = (db.pending_buyers||[]).find(b => b.id === pendingId);
  if (!pending) return null;
  pending.status = 'approved';
  const { submittedBy, submittedAt, status, ...buyerData } = pending;
  const buyer = addBuyer(buyerData);
  writeDB(db);
  return buyer;
}

function rejectPendingBuyer(pendingId) {
  const db = readDB();
  const pending = (db.pending_buyers||[]).find(b => b.id === pendingId);
  if (pending) { pending.status = 'rejected'; writeDB(db); }
}

// ── State population tracking ─────────────────────────────
function isStatePopulated(stateCode) {
  const db = readDB();
  return (db.populated_states || []).includes(stateCode);
}

function markStatePopulated(stateCode) {
  const db = readDB();
  if (!db.populated_states) db.populated_states = [];
  if (!db.populated_states.includes(stateCode)) {
    db.populated_states.push(stateCode);
    writeDB(db);
  }
}

// ── Backfill: distress fields (Phase 1C) ──────────────────────────────────────
function backfillDistress() {
  var db = readDB();
  var leads = db.leads || [];
  var scanned = 0, updated = 0, skipped = 0, errors = 0;
  leads.forEach(function(lead, idx) {
    scanned++;
    try {
      var needsTypes  = !lead.distress_types  || !Array.isArray(lead.distress_types) || lead.distress_types.length === 0;
      var needsScore  = lead.distress_score   == null || typeof lead.distress_score !== 'number';
      var needsAct    = !lead.last_activity;
      var needsArch   = lead.archived === undefined;
      if (!needsTypes && !needsScore && !needsAct && !needsArch) { skipped++; return; }
      if (needsTypes)  lead.distress_types  = normalizeDistressTypes(lead);
      if (needsScore)  lead.distress_score  = computeDistressScore(lead);
      if (needsAct)    lead.last_activity   = lead.created_at || lead.created || new Date().toISOString();
      if (needsArch)   lead.archived        = false;
      if (lead.archive_reason === undefined) lead.archive_reason = null;
      if (lead.enrichment_status === undefined) lead.enrichment_status = 'none';
      if (lead.enrichment_date   === undefined) lead.enrichment_date   = null;
      db.leads[idx] = lead;
      updated++;
    } catch(e) { errors++; }
  });
  if (updated > 0) writeDB(db);
  return { scanned: scanned, updated: updated, skipped: skipped, errors: errors };
}

// ── Backfill: normalized_address (Phase 1C) ───────────────────────────────────
function backfillNormalizedAddress() {
  var db = readDB();
  var leads = db.leads || [];
  var scanned = 0, updated = 0, skipped = 0, errors = 0;
  leads.forEach(function(lead, idx) {
    scanned++;
    try {
      if (lead.normalized_address && lead.normalized_address.length > 0) { skipped++; return; }
      lead.normalized_address = normalizeAddress(lead.address || '');
      db.leads[idx] = lead;
      updated++;
    } catch(e) { errors++; }
  });
  if (updated > 0) writeDB(db);
  return { scanned: scanned, updated: updated, skipped: skipped, errors: errors };
}


// ── Duplicate detection (Phase 2A — detection only, no merge) ────────────────
function detectDuplicates() {
  var db = readDB();
  var leads = db.leads || [];

  // Group by normalized_address + city + state (lowercase)
  var groups = {};
  leads.forEach(function(lead) {
    if (lead.archived) return; // Phase 3A: skip archived leads
    var norm  = (lead.normalized_address || normalizeAddress(lead.address || '')).trim();
    var city  = (lead.city  || '').toLowerCase().trim();
    var state = (lead.state || '').toLowerCase().trim();
    if (!norm) return;
    var key = norm + '|' + city + '|' + state;
    if (!groups[key]) groups[key] = [];
    groups[key].push(lead.id);
  });

  // Build result — only groups with duplicates
  var dupGroups = [];
  var totalDuplicates = 0;
  Object.keys(groups).forEach(function(key) {
    var ids = groups[key];
    if (ids.length < 2) return;
    totalDuplicates += ids.length;
    dupGroups.push({
      key: key,
      count: ids.length,
      lead_ids: ids,
      sample_address: key.split('|')[0]
    });
  });

  // Sort by count desc
  dupGroups.sort(function(a,b){ return b.count - a.count; });

  return {
    groups: dupGroups.length,
    total_duplicates: totalDuplicates,
    samples: dupGroups.slice(0, 20)
  };
}

// ── Backfill: activity tracking fields (Phase 2A) ─────────────────────────────
function backfillActivityFields() {
  var db = readDB();
  var leads = db.leads || [];
  var scanned = 0, updated = 0, skipped = 0;
  leads.forEach(function(lead, idx) {
    scanned++;
    var changed = false;
    if (lead.contact_attempts     == null)      { lead.contact_attempts     = 0;               changed = true; }
    if (!lead.last_contact_attempt)             { lead.last_contact_attempt = null;             changed = true; }
    if (!lead.last_status_change)               { lead.last_status_change   = lead.created_at || lead.created || new Date().toISOString(); changed = true; }
    if (lead.duplicate_group_id   === undefined){ lead.duplicate_group_id   = null;             changed = true; }
    if (lead.duplicate_count      == null)      { lead.duplicate_count      = 1;                changed = true; }
    if (changed) { db.leads[idx] = lead; updated++; } else { skipped++; }
  });
  if (updated > 0) writeDB(db);
  return { scanned: scanned, updated: updated, skipped: skipped };
}

// ── Backfill: duplicate group IDs (Phase 2A — stamp only, no merge) ───────────
function backfillDuplicateGroups() {
  var db = readDB();
  var leads = db.leads || [];

  // Build groups by normalized_address + city + state
  var groups = {};
  leads.forEach(function(lead) {
    var norm  = (lead.normalized_address || normalizeAddress(lead.address || '')).trim();
    var city  = (lead.city  || '').toLowerCase().trim();
    var state = (lead.state || '').toLowerCase().trim();
    if (!norm) return;
    var key = norm + '|' + city + '|' + state;
    if (!groups[key]) groups[key] = [];
    groups[key].push(lead.id);
  });

  // Stamp duplicate_group_id and duplicate_count
  var updated = 0;
  leads.forEach(function(lead, idx) {
    var norm  = (lead.normalized_address || normalizeAddress(lead.address || '')).trim();
    var city  = (lead.city  || '').toLowerCase().trim();
    var state = (lead.state || '').toLowerCase().trim();
    var key   = norm + '|' + city + '|' + state;
    var group = groups[key] || [];
    var isDup = group.length > 1;
    var groupId = isDup ? 'DG-' + key.replace(/[^A-Z0-9]/gi,'').slice(0,20) : null;
    var count   = group.length;
    if (lead.duplicate_group_id !== groupId || lead.duplicate_count !== count) {
      lead.duplicate_group_id = groupId;
      lead.duplicate_count    = count;
      db.leads[idx] = lead;
      updated++;
    }
  });

  if (updated > 0) writeDB(db);
  return { total_leads: leads.length, updated: updated, duplicate_groups: Object.keys(groups).filter(function(k){return groups[k].length>1;}).length };
}


// ── Consolidate duplicates (Phase 2B — archive duplicates, merge data) ────────
function consolidateDuplicates() {
  var db = readDB();
  var leads = db.leads || [];
  var groups_processed = 0, leads_archived = 0, survivors = 0, errors = 0;
  var mergedHistoryCount = 0;

  // Build groups by normalized_address + city + state
  var groups = {};
  leads.forEach(function(lead, idx) {
    if (lead.archived) return;
    var norm  = (lead.normalized_address || normalizeAddress(lead.address || '')).trim();
    var city  = (lead.city  || '').toLowerCase().trim();
    var state = (lead.state || '').toLowerCase().trim();
    if (!norm) return;
    var key = norm + '|' + city + '|' + state;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ idx: idx, lead: lead });
  });

  Object.keys(groups).forEach(function(key) {
    var group = groups[key];
    if (group.length < 2) return;
    groups_processed++;

    try {
      // Select primary lead:
      // 1) has owner info  2) highest distress_score  3) newest last_activity  4) newest created_at
      group.sort(function(a, b) {
        var aOwner = (a.lead.owner_name || a.lead.owner_phone) ? 1 : 0;
        var bOwner = (b.lead.owner_name || b.lead.owner_phone) ? 1 : 0;
        if (bOwner !== aOwner) return bOwner - aOwner;
        var aScore = a.lead.distress_score || 0;
        var bScore = b.lead.distress_score || 0;
        if (bScore !== aScore) return bScore - aScore;
        var aAct = new Date(a.lead.last_activity || a.lead.created_at || 0).getTime();
        var bAct = new Date(b.lead.last_activity || b.lead.created_at || 0).getTime();
        return bAct - aAct;
      });

      var primary = group[0];
      var duplicates = group.slice(1);

      // Merge data from duplicates into primary
      duplicates.forEach(function(dup) {
        var d = dup.lead;
        // Merge violations
        if (d.violations && d.violations.length) {
          if (!primary.lead.violations) primary.lead.violations = [];
          d.violations.forEach(function(v) {
            if (primary.lead.violations.indexOf(v) === -1) primary.lead.violations.push(v);
          });
        }
        // Merge distress_types
        if (d.distress_types && d.distress_types.length) {
          if (!primary.lead.distress_types) primary.lead.distress_types = [];
          d.distress_types.forEach(function(dt) {
            if (primary.lead.distress_types.indexOf(dt) === -1) primary.lead.distress_types.push(dt);
          });
        }
        // Merge distress_history
        if (d.distress_history && d.distress_history.length) {
          if (!primary.lead.distress_history) primary.lead.distress_history = [];
          d.distress_history.forEach(function(h) { primary.lead.distress_history.push(h); mergedHistoryCount++; });
        }
        // Merge source_count
        primary.lead.source_count = (primary.lead.source_count || 1) + (d.source_count || 1);
        // Best owner info
        if (!primary.lead.owner_name  && d.owner_name)  primary.lead.owner_name  = d.owner_name;
        if (!primary.lead.owner_phone && d.owner_phone) primary.lead.owner_phone = d.owner_phone;
        if (!primary.lead.owner_email && d.owner_email) primary.lead.owner_email = d.owner_email;
        // Record original count
        primary.lead.consolidated_from = (primary.lead.consolidated_from || 1) + 1;
        // Archive duplicate
        db.leads[dup.idx].archived       = true;
        db.leads[dup.idx].archive_reason = 'duplicate_merge';
        db.leads[dup.idx].archived_at    = new Date().toISOString();
        leads_archived++;
      });

      // Update primary with merged data + recalculate score
      primary.lead.distress_score = computeDistressScore(primary.lead);
      primary.lead.last_activity  = new Date().toISOString();
      db.leads[primary.idx] = primary.lead;
      survivors++;

    } catch(e) { errors++; }
  });

  if (leads_archived > 0) writeDB(db);
  return { groups_processed: groups_processed, leads_archived: leads_archived, survivors: survivors, errors: errors, merged_history_entries: mergedHistoryCount };
}


// ── Update enrichment status on a lead (Phase 3A) ─────────────────────────────
function updateEnrichmentStatus(id, updates) {
  var db = readDB();
  var idx = (db.leads || []).findIndex(function(l) { return l.id === id; });
  if (idx === -1) return null;
  var lead = db.leads[idx];
  var allowed = ['none','queued','in_progress','complete','failed'];
  if (updates.enrichment_status && allowed.indexOf(updates.enrichment_status) === -1) {
    throw new Error('Invalid enrichment_status: ' + updates.enrichment_status);
  }
  Object.assign(lead, updates);
  db.leads[idx] = lead;
  writeDB(db);
  return lead;
}

// ── Backfill: enrichment fields on existing leads (Phase 3A) ─────────────────
function backfillEnrichmentFields() {
  var db = readDB();
  var leads = db.leads || [];
  var scanned = 0, updated = 0, skipped = 0;
  leads.forEach(function(lead, idx) {
    scanned++;
    var changed = false;
    if (lead.enrichment_attempts     == null) { lead.enrichment_attempts     = 0;      changed = true; }
    if (!lead.last_enrichment_attempt)        { lead.last_enrichment_attempt = null;   changed = true; }
    if (lead.enrichment_source       === undefined) { lead.enrichment_source = null;   changed = true; }
    if (lead.enrichment_notes        === undefined) { lead.enrichment_notes  = null;   changed = true; }
    if (!lead.enrichment_status)              { lead.enrichment_status       = 'none'; changed = true; }
    if (changed) { db.leads[idx] = lead; updated++; } else { skipped++; }
  });
  if (updated > 0) writeDB(db);
  return { scanned: scanned, updated: updated, skipped: skipped };
}


// ── Add enrichment history entry (Phase 3B) ────────────────────────────────────
function addEnrichmentHistory(leadId, entry) {
  var db = readDB();
  var idx = (db.leads || []).findIndex(function(l) { return l.id === leadId; });
  if (idx === -1) return null;
  if (!db.leads[idx].enrichment_history) db.leads[idx].enrichment_history = [];
  db.leads[idx].enrichment_history.push({
    timestamp:     entry.timestamp     || new Date().toISOString(),
    source:        entry.source        || null,
    status:        entry.status        || null,
    fields_updated:entry.fields_updated|| [],
    notes:         entry.notes         || null
  });
  writeDB(db);
  return db.leads[idx];
}


module.exports = {
  readDB, writeDB,
  getLeads, addLead, updateLead, leadExists, clearFakeLeads,
  getUsers, getUserByPin, getUserById, updateUser, addUser,
  getLeadsForUser, getLeadsByStateCountyForUser, getStatsForUser,
  archiveStaleLeads, checkLeadLimit,
  addPendingBuyer, getPendingBuyers, approvePendingBuyer, rejectPendingBuyer,
  isStatePopulated, markStatePopulated,
  getLeadsByStateCounty, addBuyersBulk,
  addNotification, getNotifications, markNotificationsRead,
  getScannedMarkets, addScannedMarket,
  getBuyers, addBuyer, matchBuyersToLead,
  getAssignments,
  getUpcomingEvents, addEvent, appendEvent, getEvents,
  getStats,
  getSetting, setSetting,
  backfillDistress, backfillNormalizedAddress, normalizeAddress,
  computeLeadIntelligence,
  detectDuplicates, backfillActivityFields, backfillDuplicateGroups,
  consolidateDuplicates,
  updateEnrichmentStatus, backfillEnrichmentFields, addEnrichmentHistory,
};
