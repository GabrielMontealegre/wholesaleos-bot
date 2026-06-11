'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const aiDealAnalyzerJobs = require('./ai-deal-analyzer-jobs');
const findMeScoutJobs = require('./findme-scout-jobs');
const leadEvidence = require('./lead-evidence');
const propertyIdentity = require('./property-identity');

const DB_PATH = process.env.DB_PATH || './data/db.json';
const DB_FILE = path.resolve(DB_PATH);
const STORE_FILE = path.resolve(
  process.env.DEAL_CALL_DOSSIERS_PATH ||
  path.join(path.dirname(DB_FILE), 'deal-call-dossiers.json')
);

const OUTCOMES = new Set([
  'Call Today',
  'Called - No Answer',
  'Called - Interested',
  'Called - Not Interested',
  'Left Voicemail',
  'Needs Follow-Up',
  'Research More',
  'Bad Lead',
  'Send To Analyzer',
  'Need Contact Lookup',
  'Offer Later'
]);

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function safeLower(value) {
  return cleanText(value).toLowerCase();
}

function hashId(prefix, text) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(text)).digest('hex').slice(0, 16)}`;
}

function pick(obj, keys) {
  obj = obj || {};
  for (const key of keys) {
    const parts = String(key).split('.');
    let cursor = obj;
    for (const part of parts) {
      if (!cursor || typeof cursor !== 'object') {
        cursor = undefined;
        break;
      }
      cursor = cursor[part];
    }
    if (cursor !== undefined && cursor !== null && String(cursor).trim() !== '') return cursor;
  }
  return '';
}

function ensureDir(filePath = STORE_FILE) {
  const dir = path.dirname(path.resolve(filePath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeList(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.dossier_id && !seen.has(item.dossier_id) && seen.add(item.dossier_id))
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
    .slice(0, 500);
}

function readStore(storePath) {
  const file = path.resolve(storePath || STORE_FILE);
  ensureDir(file);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) return normalizeList(parsed);
    if (parsed && Array.isArray(parsed.dossiers)) return normalizeList(parsed.dossiers);
  } catch (_) {}
  return [];
}

function writeStore(dossiers, storePath) {
  const file = path.resolve(storePath || STORE_FILE);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const canonical = normalizeList(dossiers);
  const tmp = `${file}.tmp`;
  const payload = { version: 1, updated_at: nowIso(), dossiers: canonical };
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_) {}
    throw err;
  }
  return canonical;
}

function sourcePackFromJob(job) {
  const sourceEvidence = Array.isArray(job && job.source_evidence) ? job.source_evidence : [];
  return sourceEvidence.find((item) => item && item.type === 'source_evidence_pack') || null;
}

function normalizeAddress(value) {
  return propertyIdentity.canonicalAddress(value);
}

function decodeURIComponentSafe(value) {
  const text = cleanText(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

function hostAndPath(url) {
  try {
    const parsed = new URL(cleanText(url));
    return { host: parsed.hostname.replace(/^www\./i, '').toLowerCase(), path: parsed.pathname || '' };
  } catch (_) {
    return { host: '', path: '' };
  }
}

function titleCaseWord(word) {
  const text = cleanText(word);
  if (!text) return '';
  const lower = text.toLowerCase();
  const specials = {
    tx: 'TX',
    st: 'St',
    ave: 'Ave',
    blvd: 'Blvd',
    rd: 'Rd',
    dr: 'Dr',
    ln: 'Ln',
    ct: 'Ct',
    cir: 'Cir',
    pkwy: 'Pkwy',
    hwy: 'Hwy',
    ter: 'Ter',
    trl: 'Trl',
    way: 'Way'
  };
  if (specials[lower]) return specials[lower];
  if (/^\d+$/.test(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCaseText(value) {
  return cleanText(value).split(/\s+/).map(titleCaseWord).filter(Boolean).join(' ');
}

function normalizeSourceSlug(value) {
  return decodeURIComponentSafe(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addressFromKnownPropertyUrl(url, title) {
  const parsedIdentity = propertyIdentity.addressFromPropertyUrl(url, title);
  if (parsedIdentity.full_address) {
    return {
      address: parsedIdentity.street,
      city: parsedIdentity.city,
      state: parsedIdentity.state,
      zip: parsedIdentity.zip,
      full_address: parsedIdentity.full_address,
      address_extracted_from_source_url: true,
      basis: parsedIdentity.basis
    };
  }
  const hp = hostAndPath(url);
  const pathText = decodeURIComponentSafe(hp.path);
  let rawAddress = '';
  let rawCity = '';
  let rawState = '';
  let rawZip = '';

  if (/realtor\.com$/i.test(hp.host)) {
    const match = pathText.match(/realestateandhomes-detail\/([^/?#]+)/i);
    const slug = normalizeSourceSlug(match && match[1] || '');
    const details = slug.match(/^(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
    if (details && details.groups) {
      rawAddress = details.groups.address;
      rawCity = details.groups.city;
      rawState = details.groups.state;
      rawZip = details.groups.zip;
    }
  } else if (/redfin\.com$/i.test(hp.host)) {
    const match = pathText.match(/\/(?<state>[A-Za-z]{2})\/(?<city>[A-Za-z][A-Za-z-]*)\/(?<street>[^/?#]+?)\/home\//i);
    if (match && match.groups) {
      rawState = match.groups.state;
      rawCity = match.groups.city;
      rawAddress = normalizeSourceSlug(match.groups.street).replace(/\b\d{5}(?:-\d{4})?$/i, '').trim();
      const zipMatch = cleanText(match.groups.street).match(/\b(\d{5})(?:-\d{4})?$/);
      rawZip = zipMatch ? zipMatch[1] : '';
    }
  } else if (/zillow\.com$/i.test(hp.host)) {
    const match = pathText.match(/homedetails\/([^/?#]+)/i);
    const slug = normalizeSourceSlug(match && match[1] || '');
    const details = slug.match(/^(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
    if (details && details.groups) {
      rawAddress = details.groups.address;
      rawCity = details.groups.city;
      rawState = details.groups.state;
      rawZip = details.groups.zip;
    }
  } else if (/har\.com$/i.test(hp.host)) {
    const match = pathText.match(/\/homedetail\/([^/?#]+)(?:\/\d+)?/i);
    const parts = decodeURIComponentSafe(match && match[1] || '').split('-').map(cleanText).filter(Boolean);
    if (parts.length >= 4) {
      const zipPart = parts[parts.length - 1];
      const statePart = parts[parts.length - 2];
      const cityPart = parts[parts.length - 3];
      const addressParts = parts.slice(0, -3);
      if (/^\d{5}(?:-\d{4})?$/.test(zipPart) && /^[A-Za-z]{2}$/.test(statePart) && cityPart) {
        rawAddress = normalizeSourceSlug(addressParts.join('-'));
        rawCity = normalizeSourceSlug(cityPart);
        rawState = statePart;
        rawZip = zipPart.slice(0, 5);
      }
    }
  } else if (/auction\.com$|hubzu\.com$/i.test(hp.host)) {
    const slug = normalizeSourceSlug((pathText.split('/').filter(Boolean).pop()) || '');
    const details = slug.match(/(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
    if (details && details.groups) {
      rawAddress = details.groups.address;
      rawCity = details.groups.city;
      rawState = details.groups.state;
      rawZip = details.groups.zip;
    }
  }

  if (!rawAddress && title) {
    const titleMatch = normalizeSourceSlug(title).match(/^(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
    if (titleMatch && titleMatch.groups) {
      rawAddress = titleMatch.groups.address;
      rawCity = titleMatch.groups.city;
      rawState = titleMatch.groups.state;
      rawZip = titleMatch.groups.zip;
    }
  }

  const address = titleCaseText(rawAddress);
  const city = titleCaseText(rawCity);
  const state = rawState ? rawState.toUpperCase() : '';
  const zip = rawZip ? rawZip.slice(0, 5) : '';
  const full = [address, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    address,
    city,
    state,
    zip,
    full_address: full,
    address_extracted_from_source_url: !!full,
    basis: full ? 'Address extracted from property URL - verify before offer.' : ''
  };
}

function addressKey(address) {
  return propertyIdentity.canonicalPropertyKey({ normalized_address: address });
}

function callBatchAddressKey(dossier) {
  return propertyIdentity.canonicalPropertyKey(identityInputForDossier(dossier));
}

function identityInputForDossier(dossier) {
  const property = dossier && dossier.property || {};
  const evidence = dossier && dossier.lead_evidence || {};
  return {
    normalized_address: cleanText(property.full_address || evidence.normalized_address),
    address: cleanText(property.full_address || evidence.normalized_address),
    city: cleanText(property.city),
    state: cleanText(property.state),
    zip: cleanText(property.zip),
    source_url: cleanText(property.canonical_source_url || property.source_url || evidence.canonical_source_url),
    canonical_source_url: cleanText(property.canonical_source_url || evidence.canonical_source_url),
    source_title: cleanText(property.source_title)
  };
}

function supportingSourceFor(dossier) {
  const property = dossier && dossier.property || {};
  const workflow = dossier && dossier.workflow || {};
  const sourceUrl = cleanText(property.source_url || property.canonical_source_url);
  return {
    dossier_id: cleanText(dossier && dossier.dossier_id),
    source_url: sourceUrl,
    canonical_source_url: cleanText(property.canonical_source_url),
    original_source_url: cleanText(property.original_source_url),
    source_type: cleanText(property.source_type),
    source_proof_status: cleanText(property.source_proof_status),
    property_identity_status: cleanText(property.property_identity_status),
    market_match_status: cleanText(property.market_match_status),
    outcome: cleanText(workflow.outcome),
    updated_at: cleanText(dossier && dossier.updated_at)
  };
}

function sourceRank(dossier) {
  const property = dossier && dossier.property || {};
  const workflow = dossier && dossier.workflow || {};
  const intel = dossier && dossier.deal_intelligence || {};
  let score = Number(dossier && dossier.priority_score || 0) || 0;
  if (property.source_proof_status === 'Source Proof Present') score += 1000;
  if (property.address_extracted_from_source_url) score += 80;
  if (/^A:/.test(cleanText(intel.wholesale_priority))) score += 70;
  if (/^B:/.test(cleanText(intel.wholesale_priority))) score += 50;
  if (/^C:/.test(cleanText(intel.wholesale_priority))) score += 15;
  if (/Auction|Bank-Owned|REO/i.test(cleanText(intel.deal_type))) score -= 120;
  if (/Recent Sale|Low-Value/i.test(cleanText(intel.deal_type))) score -= 160;
  if (workflow.outcome === 'Bad Lead') score -= 1000;
  return score;
}

function groupDossiersByCallAddress(dossiers) {
  const groups = new Map();
  (Array.isArray(dossiers) ? dossiers : []).forEach((dossier) => {
    const key = callBatchAddressKey(dossier);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(dossier);
  });
  return Array.from(groups.values()).map((group) => {
    const sorted = group.slice().sort((a, b) => sourceRank(b) - sourceRank(a) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    const primary = Object.assign({}, sorted[0]);
    const seenSources = new Set();
    primary.supporting_sources = sorted.map(supportingSourceFor).filter((source) => {
      const key = safeLower(source.source_url || source.canonical_source_url || source.dossier_id);
      if (!key || seenSources.has(key)) return false;
      seenSources.add(key);
      return true;
    });
    primary.call_batch_dedupe_key = callBatchAddressKey(primary);
    return primary;
  });
}

function sourceProofStatus(job, sourcePack) {
  const status = cleanText(job && job.comp_research_status);
  if (status === 'blocked_source_address_conflict') return 'Source/Address Conflict';
  if (!cleanText(job && (job.normalized_address || job.input_value))) return 'Needs Address Repair';
  if (!sourcePack || !sourcePack.source_url) return 'Needs Source Proof';
  if (/list|search|category|homepage|portal|generic/i.test(cleanText(sourcePack.source_url_type))) return 'Needs Source Proof';
  if (sourcePack.evidence_role === 'source_proof' || sourcePack.source_url_type === 'exact_property_record') return 'Source Proof Present';
  if (sourcePack.source_status === 'Found' || sourcePack.source_url) return 'Source Context Only';
  return 'Needs Source Proof';
}

function propertyIdentityStatus(sourcePack, ctx) {
  return cleanText((sourcePack && sourcePack.property_identity_status) || (ctx && ctx.property_identity_status) || 'unresolved');
}

function marketMatchStatus(sourcePack, ctx, address) {
  const basis = cleanText((ctx && ctx.market_match) || (ctx && ctx.market_match_basis) || '');
  if (basis) return basis;
  if (/\bDallas\b/i.test(address) && /\bTX\b/i.test(address)) return 'Likely in market';
  return 'Not verified';
}

function propertyUrlType(sourceUrl, sourceTitle) {
  const repaired = addressFromKnownPropertyUrl(sourceUrl, sourceTitle);
  const hp = hostAndPath(sourceUrl);
  if (!hp.host) return 'unknown';
  if (/\/(search|for-sale|homes-for-sale|foreclosure-bank-owned-auctions|county|category|results)\b/i.test(hp.path)) return 'list_page';
  if (repaired.address_extracted_from_source_url) return 'exact_property_record';
  if (/\/(realestateandhomes-detail|homedetail|homedetails)\//i.test(hp.path)) return 'exact_property_record';
  if (/redfin\.com$/i.test(hp.host) && /\/home\/\d+/i.test(hp.path)) return 'exact_property_record';
  if (/auction\.com$|hubzu\.com$/i.test(hp.host) && /\/(details|detail|property|auction)\//i.test(hp.path)) return 'exact_property_record';
  return 'unknown';
}

function buildSignals(source, sourceUrl) {
  const signals = [];
  const add = (name, confidence, url, missing, verified) => {
    if (!name) return;
    const key = safeLower(name);
    if (signals.some((signal) => safeLower(signal.name) === key)) return;
    signals.push({
      name,
      confidence: confidence || 'candidate',
      source_url: isHttpUrl(url) ? cleanText(url) : '',
      missing_evidence: Array.isArray(missing) ? missing.map(cleanText).filter(Boolean) : [],
      evidence_status: verified ? 'verified' : 'candidate only'
    });
  };
  const ctx = source && source.scout_context;
  (Array.isArray(ctx && ctx.distress_signals) ? ctx.distress_signals : []).forEach((signal) => add(cleanText(signal), 'candidate', sourceUrl, ctx.missing_evidence, false));
  (Array.isArray(ctx && ctx.strategy_tags) ? ctx.strategy_tags : []).forEach((tag) => add(cleanText(tag), 'candidate', sourceUrl, ctx.missing_evidence, false));
  const text = [
    source && source.input_value,
    source && source.result_summary,
    source && source.source_page_text,
    source && source.source_text,
    source && source.page_text,
    source && source.source_type,
    source && source.comp_research_summary
  ].map(cleanText).join(' ');
  [
    ['fixer/as-is', /\b(fixer|as[- ]is|needs tlc|cash only|investor)\b/i],
    ['cash-only buyer/listing signal', /\bcash only|cash buyer\b/i],
    ['FSBO signal', /\bfsbo|for sale by owner\b/i],
    ['failed/relisted/back-on-market signal', /\bfailed listing|expired listing|relisted|back on market\b/i],
    ['auction', /\bauction\b/i],
    ['foreclosure/pre-foreclosure', /\bforeclosure|pre[- ]foreclosure|trustee\b/i],
    ['price cut', /\bprice cut|price reduced|reduced\b/i]
  ].forEach(([name, pattern]) => {
    if (pattern.test(text)) add(name, 'candidate', sourceUrl, ['Verify source evidence before offer'], false);
  });
  return signals;
}

function firstHttpUrl(items) {
  for (const item of items) {
    const url = cleanText(item);
    if (isHttpUrl(url)) return url;
  }
  return '';
}

function contactFrom(source, lead, sourceBackedFacts) {
  const evidence = source && source.lead_evidence || {};
  if (cleanText(evidence.public_contact_route) && evidence.public_contact_route !== 'Manual Lookup Needed') {
    return {
      target: cleanText(evidence.public_contact_route),
      name: '',
      phone: '',
      email: '',
      source_url: isHttpUrl(evidence.canonical_source_url) ? cleanText(evidence.canonical_source_url) : '',
      confidence: cleanText(evidence.contact_verification_status) || 'Public contact route from source.',
      warning: 'Phone/email not invented. Open source to contact or verify listing agent.'
    };
  }
  const name = cleanText(pick(source, ['contact_name', 'agent_name', 'listing_agent', 'public_contact_name']) || pick(lead, ['contact_name', 'agent_name', 'listing_agent']));
  const phone = cleanText(pick(source, ['phone', 'contact_phone', 'agent_phone', 'listing_agent_phone']) || pick(lead, ['phone', 'contact_phone', 'agent_phone']));
  const email = cleanText(pick(source, ['email', 'contact_email', 'agent_email', 'listing_agent_email']) || pick(lead, ['email', 'contact_email', 'agent_email']));
  const sourceUrl = cleanText(pick(source, ['contact_source_url', 'source_url']) || pick(lead, ['contact_source_url', 'source_url']));
  if (name || phone || email) {
    const listingAgent = /\bagent|listing\b/i.test([name, pick(source, ['source_type']), pick(lead, ['source_type'])].map(cleanText).join(' '));
    return {
      target: listingAgent ? 'Listing Agent' : 'Public Source Contact',
      name,
      phone,
      email,
      source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
      confidence: sourceUrl ? 'verified from source field' : 'present but source not verified',
      warning: sourceUrl ? '' : 'Contact not verified. Manual lookup needed.'
    };
  }
  if (sourceBackedFacts && sourceBackedFacts.source_contact_path) {
    return {
      target: 'Public Contact Form',
      name: '',
      phone: '',
      email: '',
      source_url: cleanText((sourceBackedFacts.source_contact_path || {}).source_url),
      confidence: 'public contact path visible',
      warning: 'Public contact form/button visible. Phone/email not verified.'
    };
  }
  return {
    target: 'Manual Lookup Needed',
    name: '',
    phone: '',
    email: '',
    source_url: '',
    confidence: 'not verified',
    warning: 'Contact not verified. Manual lookup needed.'
  };
}

function valuationFrom(source) {
  const verified = Array.isArray(source && source.verified_sold_comps) ? source.verified_sold_comps : [];
  const candidates = Array.isArray(source && source.candidate_sold_comps) ? source.candidate_sold_comps : [];
  const market = Array.isArray(source && source.market_support) ? source.market_support : [];
  const subject = Array.isArray(source && source.subject_sale_evidence) ? source.subject_sale_evidence : [];
  const verifiedCount = Number(source && source.verified_comp_count || verified.length) || 0;
  const repairEvidence = !!(source && (source.repair_estimate || source.repairs || source.manual_repair_estimate));
  const hasArv = !!(source && source.arv_range && verifiedCount >= 3);
  const hasMao = !!(hasArv && repairEvidence && source.mao_range);
  const lockedReason = hasArv
    ? (hasMao ? '' : 'MAO locked until repair evidence/manual repair estimate exists.')
    : verifiedCount
      ? 'Valuation locked. Need at least 3 verified sold comps from different properties.'
      : 'Valuation locked. No verified sold comps found yet.';
  return {
    valuation_status: hasArv ? 'Preliminary ARV Available' : 'Locked',
    verified_sold_comps_count: verifiedCount,
    candidate_sold_comps_count: Number(source && source.candidate_comp_count || candidates.length) || 0,
    market_support_count: Number(source && source.market_support_count || market.length) || 0,
    subject_sale_evidence_count: Number(source && source.subject_sale_evidence_count || subject.length) || 0,
    arv_range: hasArv ? source.arv_range : null,
    mao_range: hasMao ? source.mao_range : null,
    repair_evidence_status: repairEvidence ? 'Repair evidence present' : 'No repair evidence',
    valuation_locked_reason: lockedReason,
    groups: {
      subject_sale_evidence: subject,
      verified_sold_comps: verified,
      candidate_sold_comps: candidates,
      market_support: market,
      not_usable: Array.isArray(source && source.not_usable_comp_results) ? source.not_usable_comp_results : []
    }
  };
}

function compactFact(facts, key) {
  const item = facts && facts[key];
  return {
    value: cleanText(item && item.value),
    source_url: cleanText(item && item.source_url),
    evidence: cleanText(item && item.evidence)
  };
}

function factPresent(facts, key) {
  return !!compactFact(facts, key).value;
}

function evidenceTextForDossier(dossier, source) {
  const property = dossier && dossier.property || {};
  const facts = dossier && dossier.source_backed_facts || {};
  const signals = Array.isArray(dossier && dossier.signals) ? dossier.signals : [];
  return [
    property.full_address,
    property.source_url,
    property.source_type,
    property.source_proof_status,
    property.property_identity_status,
    property.market_match_status,
    cleanText(source && source.source_page_text),
    cleanText(source && source.result_summary),
    cleanText(source && source.comp_research_summary),
    cleanText(source && source.input_value),
    cleanText(dossier && dossier.workflow && dossier.workflow.notes),
    signals.map((signal) => signal.name).join(' '),
    compactFact(facts, 'listing_status').value,
    compactFact(facts, 'auction_status').value,
    compactFact(facts, 'source_contact_path').value
  ].join(' ');
}

function hasContactRoute(dossier) {
  const contact = dossier && dossier.contact || {};
  const facts = dossier && dossier.source_backed_facts || {};
  return !!(contact.phone || contact.email || contact.target === 'Public Contact Form' || factPresent(facts, 'source_contact_path'));
}

function hasSourceProof(dossier) {
  return cleanText(dossier && dossier.property && dossier.property.source_proof_status) === 'Source Proof Present';
}

function hasDistressSignal(text, signals) {
  if (/\b(as[- ]is|fixer|needs tlc|investor special|cash only|major repair|distressed|price reduced|price cut|long dom|days on market|foreclosure|trustee|auction|reo|bank[- ]owned)\b/i.test(text)) return true;
  return (Array.isArray(signals) ? signals : []).some((signal) => /\b(as[- ]is|fixer|tlc|investor|cash|price|dom|foreclosure|auction|reo|bank)\b/i.test(signal.name || ''));
}

function isAuctionOrBankOwned(text, dossier) {
  const source = cleanText(dossier && dossier.property && dossier.property.source_url);
  return /\b(auction|bank[- ]owned|reo|opening bid|buyer premium|hubzu)\b/i.test(`${text} ${source}`);
}

function isRecentSaleCandidate(text, dossier) {
  const valuation = dossier && dossier.valuation || {};
  return Number(valuation.subject_sale_evidence_count || 0) > 0 || /\b(last sold|recent sale|sold)\b/i.test(text) && !/\bfor sale|active|listing\b/i.test(text);
}

function repairEvidenceFrom(text, facts) {
  const hits = [];
  [
    ['as-is', /\bas[- ]is\b/i],
    ['fixer', /\bfixer\b/i],
    ['investor special', /\binvestor special\b/i],
    ['needs TLC', /\bneeds tlc\b/i],
    ['cash only', /\bcash only\b/i],
    ['no interior photos', /\bno interior photos\b/i],
    ['tenant occupied', /\btenant occupied|occupied\b/i],
    ['auction as-is terms', /\bauction\b.*\bas[- ]is\b|\bas[- ]is\b.*\bauction\b/i]
  ].forEach(([label, pattern]) => {
    if (pattern.test(text)) hits.push(label);
  });
  let tier = 'Unknown';
  if (hits.some((hit) => /fixer|tlc|major|cash only/i.test(hit))) tier = 'Medium';
  if (/\b(foundation|fire damage|full rehab|gut|structural|major repair)\b/i.test(text)) tier = 'Heavy';
  if (hits.length && tier === 'Unknown') tier = 'Light';
  return {
    repair_discussion_assumption: tier,
    basis: hits.length ? hits.join(', ') : '',
    warning: 'Not a repair estimate. Verify on call/inspection.',
    repair_estimate_locked: true,
    evidence_items: hits.map((hit) => ({
      signal: hit,
      source_url: cleanText((facts.evidence_source_url || {}).source_url || '')
    }))
  };
}

function numbersToVerify(dossier) {
  const facts = dossier && dossier.source_backed_facts || {};
  const valuation = dossier && dossier.valuation || {};
  const rows = [
    ['asking_price', 'Asking price', 'Source list/ask price drives seller flexibility and offer discussion.'],
    ['last_sold_price', 'Last sold price', 'Helps separate subject sale evidence from comp evidence.'],
    ['last_sold_date', 'Last sold date', 'Recent subject sale is not a comparable sale.'],
    ['estimated_value', 'Source estimate', 'Useful context only; not ARV.'],
    ['auction_opening_bid', 'Opening/current bid', 'Auction bid is not ARV or offer price.'],
    ['auction_status', 'Auction status', 'Auction terms decide whether this can be assigned.'],
    ['tax_history', 'Taxes/assessment', 'Tax evidence can support research but not ARV.'],
    ['source_contact_path', 'Contact path', 'Shows whether Gabriel can call now or needs lookup.']
  ].map(([key, label, why]) => {
    const fact = compactFact(facts, key);
    return {
      key,
      label,
      value: fact.value || '',
      source_url: fact.source_url,
      status: fact.value ? 'verified' : (key === 'source_contact_path' ? 'ask on call' : 'missing'),
      why_it_matters: why
    };
  });
  rows.push({
    key: 'verified_sold_comps',
    label: 'Verified sold comp prices/dates',
    value: Number(valuation.verified_sold_comps_count || 0) ? `${valuation.verified_sold_comps_count} verified` : '',
    source_url: '',
    status: Number(valuation.verified_sold_comps_count || 0) ? 'verified' : 'missing',
    why_it_matters: 'ARV stays locked until at least 3 verified different sold comps.'
  });
  ['buyer_premium', 'deposit', 'closing_timeline', 'HOA', 'liens/title', 'occupancy', 'repair_estimate', 'seller_target_price', 'ARV', 'MAO', 'buyer_assignment_fee_target'].forEach((label) => {
    rows.push({
      key: safeLower(label).replace(/[^a-z0-9]+/g, '_'),
      label,
      value: '',
      source_url: '',
      status: /ARV|MAO|repair/i.test(label) ? 'missing' : 'ask on call',
      why_it_matters: label === 'MAO' ? 'MAO locked until ARV and repair evidence exist.' : 'Needed before offer or assignment.'
    });
  });
  return rows;
}

function compBuckets(valuation) {
  const groups = valuation && valuation.groups || {};
  return {
    verified_sold_comps: Array.isArray(groups.verified_sold_comps) ? groups.verified_sold_comps : [],
    candidate_sold_comps: Array.isArray(groups.candidate_sold_comps) ? groups.candidate_sold_comps : [],
    active_pending_market_support: Array.isArray(groups.market_support) ? groups.market_support : [],
    nearby_value_indicators_not_comps: [],
    tax_assessment_evidence_not_arv: [],
    subject_sale_evidence: Array.isArray(groups.subject_sale_evidence) ? groups.subject_sale_evidence : [],
    not_usable_excluded: Array.isArray(groups.not_usable) ? groups.not_usable : []
  };
}

function wholesaleScoreFor(ctx) {
  ctx = ctx || {};
  let score = 0;
  if (ctx.sourceProof) score += 20;
  if (ctx.distressed) score += 18;
  if (ctx.contactRoute) score += 14;
  if (ctx.active || ctx.priceOrDom) score += 10;
  score += Math.min(Number(ctx.verifiedComps || 0), 3) * 8;
  if (ctx.repairTier && ctx.repairTier !== 'Unknown') score += 8;
  if (ctx.marketMatched) score += 8;
  if (ctx.addressGood) score += 8;
  if (ctx.auction) score -= 24;
  if (ctx.sourcePoor) score -= 22;
  if (ctx.recentSale) score -= 35;
  if (ctx.badLead) score -= 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function classifyDeal(dossier, source) {
  const facts = dossier.source_backed_facts || {};
  const valuation = dossier.valuation || {};
  const signals = Array.isArray(dossier.signals) ? dossier.signals : [];
  const text = evidenceTextForDossier(dossier, source);
  const sourceProof = hasSourceProof(dossier);
  const contactRoute = hasContactRoute(dossier);
  const auction = isAuctionOrBankOwned(text, dossier);
  const distressed = hasDistressSignal(text, signals);
  const active = /\b(active|for sale|listed|listing|available)\b/i.test(text);
  const priceOrDom = /\b(price reduced|price cut|reduced|long dom|days on market|stale listing)\b/i.test(text) || factPresent(facts, 'DOM');
  const sourcePoor = !sourceProof || /Needs Source Proof|Needs Address Repair|Source Context Only/i.test(cleanText(dossier.property.source_proof_status));
  const verifiedComps = Number(valuation.verified_sold_comps_count || 0) || 0;
  const repairEvidence = repairEvidenceFrom(text, facts);
  const recentSale = isRecentSaleCandidate(text, dossier);
  let dealType = 'Unknown';

  if (auction) dealType = /\breo|bank[- ]owned\b/i.test(text) ? 'Investor Opportunity - REO' : 'Investor Opportunity - Auction / Bank-Owned';
  else if (sourcePoor) dealType = contactRoute ? 'Contact Lookup Needed' : 'Research More - Need Better Source';
  else if (recentSale) dealType = 'Recent Sale / Comp Candidate';
  else if (distressed && active) dealType = 'Wholesale Candidate - Active Distressed Listing';
  else if (/\b(as[- ]is|fixer|needs tlc|investor special|cash only)\b/i.test(text)) dealType = 'Wholesale Candidate - As-Is / Fixer / Investor Special';
  else if (priceOrDom) dealType = 'Wholesale Candidate - Price Reduction / Long DOM';
  else if (!contactRoute) dealType = 'Contact Lookup Needed';
  else if (!verifiedComps) dealType = 'Research More - Need Comps';

  if (/record|code_violation|public_web|raw/i.test(cleanText(dossier.property.source_type)) && !distressed && !auction && !contactRoute) {
    dealType = 'Low-Value Research';
  }

  let priority = 'C: Research/Comps First';
  if (dealType.indexOf('Investor Opportunity') === 0) priority = 'D: Investor/Auction Only';
  else if (dealType.indexOf('Wholesale Candidate') === 0 && contactRoute && sourceProof) priority = 'A: Call First';
  else if (dealType.indexOf('Wholesale Candidate') === 0 && sourceProof) priority = 'B: Contact Lookup First';
  else if (/Contact Lookup/.test(dealType)) priority = 'B: Contact Lookup First';
  else if (/Low-Value|Not Wholesaleable|Recent Sale/.test(dealType)) priority = 'F: Skip/Bad Lead';
  if (dossier.workflow && dossier.workflow.outcome === 'Bad Lead') priority = 'F: Skip/Bad Lead';

  const feasibility = dealType.indexOf('Wholesale Candidate') === 0 ? 'Maybe' : (dealType.indexOf('Investor Opportunity') === 0 ? 'Unknown' : 'Unknown');
  const blockers = [];
  if (!sourceProof) blockers.push('Need better property-specific source proof.');
  if (!contactRoute) blockers.push('Contact path not verified.');
  if (verifiedComps < 3) blockers.push('Verified comps missing; ARV locked.');
  if (auction) blockers.push('Assignment/auction terms not verified.');
  if (!distressed && dealType.indexOf('Wholesale Candidate') === 0) blockers.push('Distress/motivation signal not verified.');

  const compBucketState = compBuckets(valuation);
  if (facts.nearby_value_indicators) compBucketState.nearby_value_indicators_not_comps = [facts.nearby_value_indicators];
  if (facts.tax_history || facts.assessment_history) compBucketState.tax_assessment_evidence_not_arv = [facts.tax_history || facts.assessment_history].filter(Boolean);
  const wholesaleDealScore = wholesaleScoreFor({
    sourceProof,
    distressed,
    contactRoute,
    active,
    priceOrDom,
    verifiedComps,
    repairTier: repairEvidence.repair_discussion_assumption,
    marketMatched: /Dallas|TX|market/i.test(cleanText(dossier.property && dossier.property.market_match_status)),
    addressGood: !!cleanText(dossier.property && dossier.property.full_address),
    auction,
    sourcePoor,
    recentSale,
    badLead: dossier.workflow && dossier.workflow.outcome === 'Bad Lead'
  });

  return {
    deal_type: dealType,
    wholesale_priority: priority,
    wholesale_deal_score: wholesaleDealScore,
    wholesale_feasibility: feasibility,
    why_it_may_be_wholesale: dealType.indexOf('Wholesale Candidate') === 0 ? 'Source-backed listing or distress signals may support a wholesale conversation.' : '',
    why_it_may_not_be_wholesaleable: blockers.join(' '),
    assignment_risk: auction ? 'High until auction or bank-owned assignment terms are verified.' : 'Unknown until seller path, title, buyer demand, and assignment terms are verified.',
    must_verify_before_offer: ['seller authority/contact path', 'condition', 'seller target price', 'verified sold comps', 'repair scope'],
    must_verify_before_assignment: auction ? ['assignability', 'buyer premium', 'deposit', 'closing timeline', 'occupancy', 'title/lien/HOA/tax issues', 'access/inspection', 'cash-only terms'] : ['assignability', 'clear buyer demand', 'title issues', 'closing timeline'],
    must_verify_before_buyer_blast: ['verified source facts', 'real comps', 'repair evidence', 'photos/access', 'assignment terms'],
    best_next_action: priority === 'A: Call First' ? 'Call first, then document answers before offer.' : priority === 'B: Contact Lookup First' ? 'Do contact lookup before calling.' : priority === 'D: Investor/Auction Only' ? 'Verify auction/assignment terms before treating as wholesale.' : 'Research source proof and comps first.',
    comp_buckets: compBucketState,
    repair_evidence: repairEvidence,
    numbers_to_verify: numbersToVerify(dossier),
    spread_status: verifiedComps >= 3
      ? (repairEvidence.repair_discussion_assumption !== 'Unknown' ? 'Scenario only - verify before offer.' : 'Spread unknown - repair estimate required.')
      : 'Spread unknown - verified comps and repair estimate required.'
  };
}

function scriptForDealType(dossier) {
  const intel = dossier.deal_intelligence || {};
  const facts = dossier.source_backed_facts || {};
  const evidence = dossier.lead_evidence || {};
  const address = dossier.property.full_address || 'the property';
  const ask = compactFact(facts, 'asking_price').value;
  const status = compactFact(facts, 'listing_status').value || compactFact(facts, 'auction_status').value;
  const phrase = cleanText(evidence.exact_source_phrase || compactFact(facts, 'exact_source_phrase').value);
  const sourceFacts = [
    phrase ? `source phrase: ${phrase}` : '',
    ask ? `source shows asking/list price ${ask}` : '',
    status ? `source status: ${status}` : '',
    compactFact(facts, 'beds').value || compactFact(facts, 'sqft').value
      ? `source facts: ${compactFact(facts, 'beds').value || '?'} bed / ${compactFact(facts, 'baths').value || '?'} bath / ${compactFact(facts, 'sqft').value || '?'} sqft`
      : ''
    ].filter(Boolean);
  if (phrase) {
    const lower = phrase.toLowerCase();
    const supported = [];
    if (/investor special|investor opportunity/.test(lower)) supported.push('marketed as an investor opportunity');
    if (/cash only|hard money only|traditional financing unavailable/.test(lower)) supported.push('cash or non-traditional financing language');
    if (/as[- ]?is|as is sale/.test(lower)) supported.push('as-is language');
    if (/back on (?:the )?market|relisted/.test(lower)) supported.push('back-on-market or relisted language');
    if (/price (cut|reduced|drop|reduction)/.test(lower)) supported.push('price-reduction language');
    if (/estate sale/.test(lower)) supported.push('estate-sale language');
    if (/fixer|needs\s+(tlc|work|repair)|rehab/.test(lower)) supported.push('condition/repair language');
    if (/fsbo|for sale by owner/.test(lower)) supported.push('FSBO language');
    const questions = [];
    if (/back on (?:the )?market|relisted/.test(lower)) questions.push('What happened with the prior buyer or listing attempt?');
    if (/fixer|needs\s+(tlc|work|repair)|rehab|as[- ]?is|as is sale/.test(lower)) questions.push('What condition issues should a cash buyer know before underwriting?');
    else questions.push('What property condition details should a buyer verify first?');
    if (/cash only|hard money only|traditional financing unavailable/.test(lower)) questions.push('What financing or condition issue is driving the cash-only requirement?');
    else questions.push('Would the seller consider a clean cash/as-is offer?');
    if (/price (cut|reduced|drop|reduction)/.test(lower)) questions.push('What price would get serious attention after the reduction?');
    else questions.push('How flexible is the seller for a clean as-is closing?');
    questions.push('Is the property vacant or occupied?');
    questions.push('Are utilities on and is access available for photos or walkthrough?');
    return {
      opening_line: `Hi, I am calling about ${address}.`,
      why_calling: `I saw it described as "${phrase}"${ask ? ` with an asking price of ${ask}` : ''}. I wanted to confirm what is current and whether a clean cash/as-is offer would be considered.`,
      condition_questions: questions.slice(0, 2),
      timeline_questions: [questions[3]],
      price_questions: [questions[2]],
      motivation_questions: [questions[0]],
      source_confirmation_questions: ['Can you confirm that exact source description is still current?', 'Who is the best public contact for offer questions?'],
      role_specific_questions: questions.slice(0, 5),
      close_next_step: ['Ask for current status.', 'Ask for photos/access.', 'Document price, condition, and timeline before comp research.'],
      source_backed_facts: supported.concat(sourceFacts)
    };
  }
  if (/Auction|Bank-Owned|REO/i.test(intel.deal_type || '')) {
    return {
      opening_line: `Hi, I am calling about the auction/bank-owned property at ${address}.`,
      why_calling: `I saw ${status || 'the public auction/listing source'}. I am not treating this as a normal listing; I need to verify auction and assignment terms before considering it.`,
      condition_questions: ['What condition information is available?', 'Is it occupied?', 'Is inspection or access available?'],
      timeline_questions: ['Is the auction still active?', 'What is the deposit?', 'What is the closing timeline?'],
      price_questions: ['What is the opening/current bid if visible?', 'Is there a buyer premium?', 'Is financing allowed or cash-only?'],
      motivation_questions: ['Is this bank-owned, foreclosure, or another sale type?', 'Are title, lien, HOA, or tax issues disclosed?'],
      source_confirmation_questions: ['Can you confirm this exact property and source details are current?', 'Are assignments allowed?'],
      role_specific_questions: ['Is assignment allowed?', 'What buyer premium applies?', 'What deposit is required?', 'What is the closing timeline?', 'Is it occupied?', 'Are title/lien/HOA/tax issues known?', 'Is access or inspection available?', 'Is it cash-only?'],
      close_next_step: ['Verify assignability.', 'Verify fees/timeline.', 'Verify condition/access before offer.'],
      source_backed_facts: sourceFacts
    };
  }
  if (/Price Reduction|Long DOM/i.test(intel.deal_type || '')) {
    return {
      opening_line: `Hi, I am calling about ${address}.`,
      why_calling: `I saw ${address} may have pricing or stale-listing signals. I wanted to understand what has kept it from selling and whether a cash/as-is solution could make sense.`,
      condition_questions: ['What feedback have showings given?', 'Any repairs buyers are objecting to?', 'Are interior photos or access available?'],
      timeline_questions: ['How long has it been marketed?', 'What timeline would work for the seller?'],
      price_questions: ['Has price been reduced?', 'What number would actually get attention?', 'Would a clean cash/as-is offer be considered?'],
      motivation_questions: ['Why do you think it has not sold yet?', 'Is the seller flexible for a fast closing?'],
      source_confirmation_questions: ['Can you confirm the public source details are current?', 'Can you confirm the property is still available?'],
      role_specific_questions: ['Why has it not sold?', 'What repair feedback has come up?', 'How flexible is the seller?', 'What price would get attention?'],
      close_next_step: ['Ask for condition details.', 'Ask for seller flexibility.', 'Ask for next step access/photos.'],
      source_backed_facts: sourceFacts
    };
  }
  if (/As-Is|Fixer|Investor|Active Distressed/i.test(intel.deal_type || '')) {
    return {
      opening_line: `Hi, I am calling about ${address}.`,
      why_calling: `I saw it listed${ask ? ` around ${ask}` : ''} and noticed source-backed investment/condition signals. I work with investors who can buy cash/as-is when the numbers make sense.`,
      condition_questions: ['Is it still available?', 'What condition issues are known?', 'Any roof, HVAC, foundation, plumbing, or electrical issues?', 'Are there interior photos or access?'],
      timeline_questions: ['What timeline would work best?', 'Is there any deadline I should know about?'],
      price_questions: ['Would the seller consider a clean cash/as-is offer?', 'What number would actually get attention?'],
      motivation_questions: ['Why is the seller considering selling now?', 'Has price been reduced?'],
      source_confirmation_questions: ['Can you confirm source details are current?', 'Can you confirm this is the right property?'],
      role_specific_questions: ['Is it still available?', 'What condition issues are known?', 'Would seller consider cash/as-is?', 'What number would get attention?'],
      close_next_step: ['Ask for photos/access.', 'Ask for realistic price.', 'Ask permission to follow up.'],
      source_backed_facts: sourceFacts
    };
  }
  if (/Recent Sale|Comp Candidate/i.test(intel.deal_type || '')) {
    return {
      opening_line: `Do not call ${address} as a seller lead unless there is a current listing/contact path.`,
      why_calling: 'Use mainly as comp or market evidence until a current sale/contact path is verified.',
      condition_questions: ['Is there a current sale path?', 'Is the property currently listed or available?'],
      timeline_questions: ['Is there any current seller timeline?'],
      price_questions: ['Is any current asking price verified?'],
      motivation_questions: ['Is there any current owner/seller motivation evidence?'],
      source_confirmation_questions: ['Confirm source date and whether this is only sale evidence.'],
      role_specific_questions: ['Who is the right current contact?', 'Is there a current sale path?', 'Do not treat prior sale as seller motivation.'],
      close_next_step: ['Use as market evidence unless current contact path exists.'],
      source_backed_facts: sourceFacts
    };
  }
  return {
    opening_line: `Hi, I am calling about ${address}.`,
    why_calling: `This appears to be a public property source. I am trying to verify whether there is a current sale/contact path before treating it as a lead.`,
    condition_questions: ['What condition is the property in right now?', 'Are there any known repairs?', 'Is it occupied?'],
    timeline_questions: ['Is the property currently for sale?', 'What timeline would matter?'],
    price_questions: ['Is there an asking price or seller target price?', 'Would a cash/as-is offer be considered?'],
    motivation_questions: ['Is the owner open to selling?', 'What is driving the decision right now?'],
    source_confirmation_questions: ['Can you confirm this is the right property?', 'Who is the right contact?'],
    role_specific_questions: ['Is property currently for sale?', 'Who is right contact?', 'Owner open to selling?', 'Condition?', 'Occupancy?', 'Timeline?', 'Price?'],
    close_next_step: ['Verify contact path.', 'Verify condition.', 'Verify price/timeline.'],
    source_backed_facts: sourceFacts
  };
}

function whyThisMatters(source, signals, valuation, sourceProof) {
  const lines = [];
  if (signals.length) lines.push(`Evidence signals found: ${signals.map((signal) => signal.name).slice(0, 4).join(', ')}.`);
  if (valuation.market_support_count || valuation.subject_sale_evidence_count || valuation.verified_sold_comps_count) {
    lines.push('Analyzer has public property/market evidence to review.');
  }
  if (sourceProof === 'Source Proof Present') lines.push('Property-specific source proof is present.');
  if (!signals.length) lines.push('Motivation not verified yet.');
  if (sourceProof === 'Needs Source Proof') lines.push('Research source proof before calling.');
  if (sourceProof === 'Needs Address Repair') lines.push('Repair address before calling.');
  if (sourceProof === 'Source/Address Conflict') lines.push('Source URL address conflicts with Analyzer address. Verify before calling.');
  return {
    why_now: lines.join(' '),
    why_motivated: signals.length ? 'Candidate opportunity signals exist; verify before making claims.' : 'Motivation not verified yet.',
    why_valuable: valuation.valuation_status === 'Preliminary ARV Available' ? 'Preliminary ARV exists from verified sold comps.' : 'Value not verified yet.',
    why_urgent: signals.some((signal) => /auction|foreclosure|price cut/i.test(signal.name)) ? 'Time-sensitive source signal may exist; verify details before calling.' : 'Urgency not verified yet.',
    recommendation: sourceProof === 'Source Proof Present' ? 'Call or research contact.' : 'Research more before calling.'
  };
}

function scriptFor(dossier) {
  const address = dossier.property.full_address || 'the property';
  const contact = dossier.contact.target;
  const listingAgent = contact === 'Listing Agent';
  const sourcePrompt = dossier.property.source_url ? `I saw the public source for ${address} and wanted to confirm a few details.` : `I am researching ${address} and wanted to confirm a few details.`;
  return {
    opening_line: listingAgent
      ? `Hi, I am calling about ${address}.`
      : `Hi, I am calling about ${address}.`,
    why_calling: sourcePrompt,
    condition_questions: [
      'What condition is the property in right now?',
      'Are there any major repairs needed?',
      'Do you have photos or access for a quick review?'
    ],
    timeline_questions: [
      'What timeline would work best?',
      'Is there any deadline I should know about?'
    ],
    price_questions: [
      'Would a cash/as-is offer be considered?',
      'What offer range would be realistic?'
    ],
    motivation_questions: [
      'What is driving the decision right now?',
      'Is there anything about the property or timing that would make a simple sale helpful?'
    ],
    source_confirmation_questions: [
      'Can you confirm this is the right property?',
      'Can you confirm the public source details are current?'
    ],
    role_specific_questions: listingAgent ? [
      'Would the seller consider a cash/as-is offer?',
      'What repairs or condition issues should I know about?',
      'How does showing/access work?',
      'What is the seller timeline?',
      'What are the offer expectations?'
    ] : [
      'Are you open to selling?',
      'What condition is it in?',
      'What timeline would you prefer?',
      'Are taxes, mortgage, or occupancy details something you are comfortable discussing?'
    ],
    close_next_step: [
      'Ask for photos or access.',
      'Ask for best realistic price.',
      'Ask permission to follow up.'
    ]
  };
}

function compactComp(comp) {
  comp = comp || {};
  return {
    address: cleanText(comp.comp_address || comp.address),
    sold_price: comp.sold_price || null,
    sold_date: cleanText(comp.sold_date),
    source_url: isHttpUrl(comp.source_url) ? cleanText(comp.source_url) : '',
    why_similar: cleanText(comp.why_included || comp.reason),
    why_not_verified: cleanText(comp.why_not_verified),
    missing_evidence: Array.isArray(comp.missing_fields) ? comp.missing_fields.map(cleanText).filter(Boolean) : [],
    confidence: comp.comp_confidence_score || comp.confidence || '',
    distance: comp.distance_miles ? `${comp.distance_miles} miles` : 'Distance not verified.'
  };
}

function sourceFact(value, sourceUrl, label, evidenceText) {
  const text = cleanText(value);
  if (!text) return null;
  return {
    value: text,
    label: cleanText(label),
    source_url: isHttpUrl(sourceUrl) ? cleanText(sourceUrl) : '',
    evidence: cleanText(evidenceText).slice(0, 260)
  };
}

function addFact(out, key, value, sourceUrl, label, evidenceText) {
  if (out[key]) return;
  const fact = sourceFact(value, sourceUrl, label || key, evidenceText);
  if (fact) out[key] = fact;
}

function extractMoneyNear(text, patterns) {
  const body = cleanText(text);
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && (match[1] || match[2])) return match[1] || match[2];
  }
  return '';
}

function extractNumberNear(text, patterns) {
  const body = cleanText(text);
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match && (match[1] || match[2])) return match[1] || match[2];
  }
  return '';
}

function extractJsonLdTexts(text) {
  const body = String(text || '');
  const chunks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(body)) !== null) {
    const raw = cleanText(match[1]);
    if (raw) chunks.push(raw);
  }
  return chunks;
}

function collectSourceText(source, sourcePack) {
  const ctx = source && source.scout_context || {};
  const lead = source && source.lead || {};
  const pieces = [
    source && source.source_page_text,
    source && source.page_text,
    source && source.source_text,
    source && source.html,
    source && source.raw_text,
    source && source.result_summary,
    source && source.comp_research_summary,
    source && source.input_value,
    sourcePack && sourcePack.source_text,
    sourcePack && sourcePack.evidence_text,
    sourcePack && sourcePack.snippet,
    sourcePack && sourcePack.address_candidate,
    ctx.scout_reason,
    ctx.call_angle,
    Array.isArray(ctx.distress_signals) ? ctx.distress_signals.join(' ') : '',
    Array.isArray(ctx.missing_evidence) ? ctx.missing_evidence.join(' ') : '',
    lead.notes,
    lead.description,
    lead.source_text
  ].map(cleanText).filter(Boolean);
  const jsonLd = pieces.flatMap(extractJsonLdTexts);
  return pieces.concat(jsonLd).join(' ');
}

function structuredSourceValue(source, sourcePack, keys) {
  const objects = [source, sourcePack, source && source.lead_evidence, source && source.lead, source && source.scout_context, source && source.scout_context && source.scout_context.lead_evidence].filter(Boolean);
  for (const obj of objects) {
    const value = pick(obj, keys);
    if (cleanText(value)) return value;
  }
  return '';
}

function buildSourceBackedFacts(source, sourcePack, sourceUrl) {
  const text = collectSourceText(source, sourcePack);
  const evidence = leadEvidence.normalizeLeadEvidence(source && (source.lead_evidence || source.scout_context && source.scout_context.lead_evidence || source) || {});
  const facts = {
    evidence_source_url: sourceFact(sourceUrl, sourceUrl, 'Evidence source URL', sourceUrl),
    extracted_at: nowIso(),
    missing_fields: []
  };
  addFact(facts, 'exact_source_phrase', evidence.exact_source_phrase, sourceUrl, 'Exact source-backed wholesale phrase', evidence.exact_source_phrase);
  addFact(facts, 'matched_criterion', evidence.matched_criterion, sourceUrl, 'Matched wholesale criterion', evidence.exact_source_phrase);
  addFact(facts, 'source_contact_path', evidence.public_contact_route !== 'Manual Lookup Needed' ? evidence.public_contact_route : '', sourceUrl, 'Public contact route', evidence.contact_verification_status);
  addFact(facts, 'asking_price', structuredSourceValue(source, sourcePack, ['asking_price', 'list_price', 'price', 'listing_price']), sourceUrl, 'Asking/list price');
  addFact(facts, 'estimated_value', structuredSourceValue(source, sourcePack, ['estimated_value', 'source_estimate', 'estimate', 'realtor_estimate', 'redfin_estimate', 'zestimate']), sourceUrl, 'Source estimate - not verified ARV');
  addFact(facts, 'beds', structuredSourceValue(source, sourcePack, ['beds', 'bedrooms']), sourceUrl, 'Beds');
  addFact(facts, 'baths', structuredSourceValue(source, sourcePack, ['baths', 'bathrooms']), sourceUrl, 'Baths');
  addFact(facts, 'sqft', structuredSourceValue(source, sourcePack, ['sqft', 'square_feet', 'living_area']), sourceUrl, 'Sqft');
  addFact(facts, 'year_built', structuredSourceValue(source, sourcePack, ['year_built', 'yearBuilt']), sourceUrl, 'Year built');
  addFact(facts, 'lot_size', structuredSourceValue(source, sourcePack, ['lot_size', 'lotSize', 'lot_acres']), sourceUrl, 'Lot size');
  addFact(facts, 'property_type', structuredSourceValue(source, sourcePack, ['property_type', 'home_type', 'source_type']), sourceUrl, 'Property type');
  addFact(facts, 'listing_status', structuredSourceValue(source, sourcePack, ['listing_status', 'status']), sourceUrl, 'Listing/auction status');
  addFact(facts, 'DOM', structuredSourceValue(source, sourcePack, ['DOM', 'dom', 'days_on_market']), sourceUrl, 'Days on market');
  addFact(facts, 'last_sold_price', structuredSourceValue(source, sourcePack, ['last_sold_price', 'last_sale_price', 'sold_price']), sourceUrl, 'Last sold price');
  addFact(facts, 'last_sold_date', structuredSourceValue(source, sourcePack, ['last_sold_date', 'last_sale_date', 'sold_date']), sourceUrl, 'Last sold date');
  addFact(facts, 'auction_opening_bid', structuredSourceValue(source, sourcePack, ['auction_opening_bid', 'opening_bid', 'minimum_bid']), sourceUrl, 'Auction opening bid');
  addFact(facts, 'auction_status', structuredSourceValue(source, sourcePack, ['auction_status']), sourceUrl, 'Auction status');

  if (text) {
    addFact(facts, 'asking_price', extractMoneyNear(text, [/(?:list(?:ed|ing)? price|asking price|price)\D{0,40}(\$[\d,]+)/i, /(\$[\d,]+)\s*(?:list(?:ed|ing)? price|asking)/i]), sourceUrl, 'Asking/list price', text);
    addFact(facts, 'estimated_value', extractMoneyNear(text, [/(?:estimate|estimated value|realtor estimate|redfin estimate|zestimate)\D{0,60}(\$[\d,]+)/i]), sourceUrl, 'Source estimate - not verified ARV', text);
    addFact(facts, 'beds', extractNumberNear(text, [/\b(\d+(?:\.\d+)?)\s*(?:bed|beds|bedrooms)\b/i, /(?:bedrooms?|beds?)\D{0,25}(\d+(?:\.\d+)?)/i]), sourceUrl, 'Beds', text);
    addFact(facts, 'baths', extractNumberNear(text, [/\b(\d+(?:\.\d+)?)\s*(?:bath|baths|bathrooms)\b/i, /(?:bathrooms?|baths?)\D{0,25}(\d+(?:\.\d+)?)/i]), sourceUrl, 'Baths', text);
    addFact(facts, 'sqft', extractNumberNear(text, [/\b([\d,]+)\s*(?:sq\.?\s*ft|sqft|square feet)\b/i]), sourceUrl, 'Sqft', text);
    addFact(facts, 'lot_size', extractNumberNear(text, [/\b([\d.]+)\s*(?:acre|acres)\s*(?:lot)?\b/i, /lot(?: size)?\D{0,40}([\d.]+\s*acre[s]?|[\d,]+\s*sq\.?\s*ft)/i]), sourceUrl, 'Lot size', text);
    addFact(facts, 'year_built', extractNumberNear(text, [/(?:year built|built in)\D{0,25}(\d{4})/i]), sourceUrl, 'Year built', text);
    addFact(facts, 'last_sold_price', extractMoneyNear(text, [/(?:sold|last sold|last sale)\D{0,80}(\$[\d,]+)/i]), sourceUrl, 'Last sold price', text);
    addFact(facts, 'last_sold_date', extractNumberNear(text, [/(?:sold|last sold|last sale)\D{0,80}((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i]), sourceUrl, 'Last sold date', text);
    addFact(facts, 'DOM', extractNumberNear(text, [/(?:days on market|DOM)\D{0,25}(\d{1,4})/i]), sourceUrl, 'Days on market', text);
    if (/contact agent|contact listing agent|request a tour|ask a question/i.test(text)) {
      addFact(facts, 'source_contact_path', 'Public contact form/button visible', sourceUrl, 'Contact path', 'Contact agent/form button visible in source text.');
      facts.source_contact_button_visible = sourceFact('Yes', sourceUrl, 'Public contact button/form visible', 'Contact agent/form button visible in source text.');
    }
    if (/tax|assessment|assessed value|property tax/i.test(text)) {
      facts.tax_history = sourceFact('Tax/assessment evidence visible in source text. Verify before use.', sourceUrl, 'Tax/assessment evidence - not ARV', text);
    }
    if (/nearby home|nearby value|home value|similar homes/i.test(text)) {
      facts.nearby_value_indicators = sourceFact('Nearby value indicators visible - not verified sold comps.', sourceUrl, 'Nearby value indicators - not verified sold comps', text);
    }
  }

  ['asking_price','estimated_value','beds','baths','sqft','year_built','lot_size','property_type','listing_status','DOM','last_sold_price','last_sold_date','tax_history','assessment_history','nearby_value_indicators','auction_opening_bid','auction_status','source_contact_path','listing_agent_name','brokerage','agent_phone','agent_email']
    .forEach((key) => { if (!facts[key]) facts.missing_fields.push(key); });
  return facts;
}

function resolveAnalyzerJob(id) {
  return id && aiDealAnalyzerJobs.getJob ? aiDealAnalyzerJobs.getJob(id) : null;
}

function resolveScoutCard(jobId, cardId) {
  if (!jobId || !cardId || !findMeScoutJobs.getJob) return null;
  const job = findMeScoutJobs.getJob(jobId);
  const card = job && Array.isArray(job.cards) ? job.cards.find((item) => item.card_id === cardId) : null;
  return card ? { job, card } : null;
}

function resolveLead(leadId) {
  if (!leadId) return null;
  const leads = db.getLeads ? db.getLeads() : [];
  return (Array.isArray(leads) ? leads : []).find((lead) => String(lead.id) === String(leadId)) || null;
}

function sourceFromInput(input) {
  input = input || {};
  const analyzerId = cleanText(input.analyzer_job_id || input.analyzerJobId || input.job_id || input.jobId);
  const scoutJobId = cleanText(input.scout_job_id || input.scoutJobId);
  const scoutCardId = cleanText(input.scout_card_id || input.scoutCardId || input.card_id || input.cardId);
  const leadId = cleanText(input.lead_id || input.leadId);
  const scout = resolveScoutCard(scoutJobId, scoutCardId);
  if (scout) {
    const card = scout.card;
    const evidence = leadEvidence.normalizeLeadEvidence(card || {});
    return {
      source_kind: 'findme_scout_card',
      scout_job_id: scoutJobId,
      scout_card_id: scoutCardId,
      input_value: cleanText(card.address_or_source_text),
      normalized_address: cleanText(evidence.normalized_address || card.display_address || card.address_or_source_text),
      source_url: cleanText(card.canonical_source_url || card.source_url),
      source_url_original: cleanText(card.original_source_url || card.source_url_original),
      canonical_source_url: cleanText(card.canonical_source_url),
      source_title: cleanText(card.source_title || card.candidate_title),
      lead_evidence: evidence,
      asking_price: evidence.asking_price,
      beds: evidence.beds,
      baths: evidence.baths,
      sqft: evidence.sqft,
      year_built: evidence.year_built,
      listing_status: evidence.listing_status,
      source_page_text: [
        card.source_title,
        evidence.exact_source_phrase,
        card.evidence_snippet,
        card.signal_summary,
        card.why_it_matters,
        card.why_this_might_be_a_deal,
        Array.isArray(card.missing_evidence) ? card.missing_evidence.join(' ') : '',
        Array.isArray(card.distress_motivation_signals) ? card.distress_motivation_signals.join(' ') : ''
      ].map(cleanText).filter(Boolean).join(' '),
      source_type: cleanText(card.source_type || card.lead_source_type || card.source_classification),
      scout_context: {
        scout_status: cleanText(card.status),
        scout_reason: cleanText(card.why_this_might_be_a_deal || card.why_it_matters),
        distress_signals: Array.isArray(card.distress_motivation_signals) ? card.distress_motivation_signals : [],
        strategy_tags: Array.isArray(card.strategy_tags) ? card.strategy_tags : [],
        missing_evidence: Array.isArray(card.missing_evidence) ? card.missing_evidence : [],
        call_angle: cleanText(card.call_angle),
        market_match: cleanText(card.market_match),
        source_classification: cleanText(card.source_classification),
        property_identity_status: cleanText(card.property_identity_status),
        source_url: cleanText(card.source_url),
        source_url_original: cleanText(card.original_source_url || card.source_url_original),
        canonical_source_url: cleanText(card.canonical_source_url),
        lead_evidence: evidence
      },
      source_evidence: [{
        type: 'source_evidence_pack',
        source_url: cleanText(card.canonical_source_url || card.source_url),
        source_url_type: card.source_classification === 'listing_search_page' || card.source_classification === 'auction_search_page' ? 'list_page' : propertyUrlType(cleanText(card.canonical_source_url || card.source_url), cleanText(card.source_title || card.candidate_title)),
        source_status: card.source_url ? 'Found' : 'Missing',
        evidence_role: card.can_send_to_analyzer ? 'source_proof' : 'source_context',
        property_identity_status: cleanText(card.property_identity_status) || (card.status === 'Needs Address Repair' ? 'unresolved' : 'partial'),
        address_candidate: cleanText(evidence.normalized_address || card.display_address || card.address_or_source_text),
        source_url_address_candidate: cleanText(evidence.normalized_address || card.display_address || card.address_or_source_text),
        city_candidate: cleanText(card.city),
        state_candidate: cleanText(card.state),
        zip_candidate: cleanText(card.zip),
        county: cleanText(card.county),
        next_action: cleanText(card.next_best_action),
        missing_fields: Array.isArray(card.missing_evidence) ? card.missing_evidence : []
      }]
    };
  }
  const analyzer = resolveAnalyzerJob(analyzerId);
  if (analyzer) return Object.assign({ source_kind: 'ai_deal_analyzer_job', analyzer_job_id: analyzerId }, analyzer);
  const lead = resolveLead(leadId);
  if (lead) {
    const address = cleanText(pick(lead, ['address', 'property_address', 'situs_address']));
    return {
      source_kind: 'existing_lead',
      lead_id: leadId,
      input_value: address,
      normalized_address: address,
      source_url: cleanText(pick(lead, ['source_url', 'sourceUrl', 'record_url', 'source_record_url'])),
      source_type: cleanText(pick(lead, ['source_type', 'source'])),
      lead
    };
  }
  const address = cleanText(input.address || input.input_value || input.inputValue || input.value);
  const sourceUrl = cleanText(input.source_url || input.sourceUrl || input.source_proof_url || input.sourceProofUrl);
  if (!address) {
    const err = new Error('Address is required to create Deal Details.');
    err.status = 400;
    throw err;
  }
  if (sourceUrl && !isHttpUrl(sourceUrl)) {
    const err = new Error('Source URL must be a valid public http(s) link.');
    err.status = 400;
    throw err;
  }
  return {
    source_kind: 'pasted_property',
    input_value: address,
    normalized_address: normalizeAddress(address),
    source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    source_title: cleanText(input.source_title || input.sourceTitle || input.title),
    lead_evidence: leadEvidence.normalizeLeadEvidence(input || {}),
    source_page_text: cleanText(input.source_page_text || input.sourcePageText || input.source_text || input.sourceText || input.page_text || input.pageText || input.html || input.description || input.notes),
    asking_price: cleanText(input.asking_price || input.askingPrice || input.list_price || input.listPrice),
    estimated_value: cleanText(input.estimated_value || input.estimatedValue || input.source_estimate || input.sourceEstimate),
    beds: cleanText(input.beds || input.bedrooms),
    baths: cleanText(input.baths || input.bathrooms),
    sqft: cleanText(input.sqft || input.square_feet || input.squareFeet),
    lot_size: cleanText(input.lot_size || input.lotSize),
    year_built: cleanText(input.year_built || input.yearBuilt),
    listing_status: cleanText(input.listing_status || input.listingStatus),
    source_type: cleanText(input.source_type || input.sourceType),
    source_evidence: sourceUrl ? [{
      type: 'source_evidence_pack',
      source_url: sourceUrl,
      source_url_type: propertyUrlType(sourceUrl, cleanText(input.source_title || input.sourceTitle || input.title)),
      source_status: 'Needs review',
      evidence_role: propertyUrlType(sourceUrl, cleanText(input.source_title || input.sourceTitle || input.title)) === 'exact_property_record' ? 'source_proof' : 'source_context',
      property_identity_status: propertyUrlType(sourceUrl, cleanText(input.source_title || input.sourceTitle || input.title)) === 'exact_property_record' ? 'partial' : 'unresolved',
      address_candidate: address,
      next_action: 'Verify source proof before calling.',
      missing_fields: propertyUrlType(sourceUrl, cleanText(input.source_title || input.sourceTitle || input.title)) === 'exact_property_record' ? ['Verify property facts before offer'] : ['Source proof']
    }] : []
  };
}

function buildDossier(input) {
  const source = sourceFromInput(input);
  const sourcePack = sourcePackFromJob(source);
  const ctx = source.scout_context || {};
  const sourceUrl = firstHttpUrl([
    source.source_url,
    sourcePack && sourcePack.source_url,
    ctx.canonical_source_url,
    ctx.source_url
  ]);
  const originalSourceUrl = cleanText(ctx.source_url_original || source.source_url_original);
  const canonicalSourceUrl = cleanText(ctx.canonical_source_url || source.canonical_source_url || sourceUrl);
  const urlIdentity = addressFromKnownPropertyUrl(canonicalSourceUrl || sourceUrl, cleanText(source.source_title || (sourcePack && sourcePack.source_title)));
  const address = propertyIdentity.canonicalAddress(Object.assign({}, source.lead_evidence || {}, source, {
    normalized_address: source.normalized_address || source.input_value || (sourcePack && sourcePack.address_candidate),
    source_url: canonicalSourceUrl || sourceUrl,
    source_url_address_candidate: sourcePack && (sourcePack.source_url_address_candidate || sourcePack.address_candidate),
    city: (sourcePack && sourcePack.city_candidate) || source.city || urlIdentity.city,
    state: (sourcePack && sourcePack.state_candidate) || source.state || urlIdentity.state,
    zip: (sourcePack && sourcePack.zip_candidate) || source.zip || urlIdentity.zip,
    source_title: source.source_title || (sourcePack && sourcePack.source_title)
  }));
  if (!address) {
    const err = new Error('Address is required to create Deal Details.');
    err.status = 400;
    throw err;
  }
  const repairedAddress = propertyIdentity.canonicalAddress(Object.assign({}, source.lead_evidence || {}, source, {
    normalized_address: address,
    source_url: canonicalSourceUrl || sourceUrl,
    source_url_address_candidate: sourcePack && (sourcePack.source_url_address_candidate || sourcePack.address_candidate),
    city: (sourcePack && sourcePack.city_candidate) || source.city || urlIdentity.city,
    state: (sourcePack && sourcePack.state_candidate) || source.state || urlIdentity.state,
    zip: (sourcePack && sourcePack.zip_candidate) || source.zip || urlIdentity.zip,
    source_title: source.source_title || (sourcePack && sourcePack.source_title)
  }));
  const addressParts = propertyIdentity.canonicalParts({
    normalized_address: repairedAddress,
    source_url: canonicalSourceUrl || sourceUrl
  });
  const baseLeadEvidence = leadEvidence.normalizeLeadEvidence(Object.assign({}, source.lead_evidence || {}, source, {
    source_url: canonicalSourceUrl || sourceUrl,
    normalized_address: repairedAddress
  }), {
    normalized_address: repairedAddress,
    canonical_source_url: canonicalSourceUrl || sourceUrl
  });
  const proofStatus = sourceProofStatus(source, sourcePack);
  const signals = buildSignals(source, sourceUrl);
  const valuation = valuationFrom(source);
  const sourceBackedFacts = buildSourceBackedFacts(source, sourcePack, canonicalSourceUrl || sourceUrl);
  const contact = contactFrom(source, source.lead || null, sourceBackedFacts);
  const why = whyThisMatters(source, signals, valuation, proofStatus);
  const created = nowIso();
  const dossier = {
    dossier_id: hashId('dcd', `${repairedAddress}|${sourceUrl}|${source.source_kind || ''}`),
    created_at: created,
    updated_at: created,
    source_kind: source.source_kind || 'unknown',
    refs: {
      analyzer_job_id: cleanText(source.analyzer_job_id || source.job_id),
      scout_job_id: cleanText(source.scout_job_id),
      scout_card_id: cleanText(source.scout_card_id),
      lead_id: cleanText(source.lead_id)
    },
    property: {
      full_address: repairedAddress,
      city: cleanText(addressParts.city || (sourcePack && sourcePack.city_candidate) || pick(source, ['city']) || urlIdentity.city),
      state: cleanText(addressParts.state || (sourcePack && sourcePack.state_candidate) || pick(source, ['state']) || urlIdentity.state),
      zip: cleanText(addressParts.zip || (sourcePack && sourcePack.zip_candidate) || pick(source, ['zip']) || urlIdentity.zip),
      county: cleanText((sourcePack && sourcePack.county) || pick(source, ['county'])),
      source_url: sourceUrl,
      canonical_source_url: canonicalSourceUrl && canonicalSourceUrl !== sourceUrl ? canonicalSourceUrl : '',
      original_source_url: originalSourceUrl && originalSourceUrl !== sourceUrl ? originalSourceUrl : '',
      source_type: cleanText(source.source_type || (sourcePack && sourcePack.source_url_type) || ctx.source_classification),
      source_proof_status: proofStatus,
      property_identity_status: urlIdentity.address_extracted_from_source_url ? (urlIdentity.address && urlIdentity.city && urlIdentity.state && urlIdentity.zip ? 'resolved_from_source_url' : 'partial_from_source_url') : propertyIdentityStatus(sourcePack, ctx),
      property_identity_basis: urlIdentity.basis,
      address_extracted_from_source_url: urlIdentity.address_extracted_from_source_url,
      market_match_status: marketMatchStatus(sourcePack, ctx, repairedAddress),
      market_match_basis: urlIdentity.city && urlIdentity.state ? `${urlIdentity.city}, ${urlIdentity.state} from source URL` : '',
      source_address_conflict_warning: proofStatus === 'Source/Address Conflict'
        ? 'Source URL address conflicts with Analyzer address. Verify before calling.'
        : ''
    },
    why_this_property_matters: why,
    signals,
    valuation,
    source_backed_facts: sourceBackedFacts,
    lead_evidence: baseLeadEvidence,
    contact,
    call_script: null,
    workflow: {
      outcome: proofStatus === 'Source Proof Present'
        ? (contact.target === 'Manual Lookup Needed' ? 'Need Contact Lookup' : 'Call Today')
        : 'Research More',
      notes: '',
      next_follow_up_at: '',
      last_contacted_at: '',
      call_attempts: 0,
      outcome_history: []
    },
    preview_only: true,
    should_ingest: false
  };
  dossier.lead_evidence = leadEvidence.normalizeLeadEvidence(Object.assign({}, baseLeadEvidence, {
    contact_route: contact.target,
    public_contact_route: contact.target,
    comp_status: baseLeadEvidence.comp_status
  }), {
    dossier_id: dossier.dossier_id,
    analyzer_job_id: dossier.refs.analyzer_job_id,
    normalized_address: repairedAddress,
    canonical_source_url: canonicalSourceUrl || sourceUrl
  });
  dossier.deal_intelligence = classifyDeal(dossier, source);
  dossier.call_script = scriptForDealType(dossier);
  dossier.priority_score = priorityScore(dossier);
  return dossier;
}

function priorityScore(dossier) {
  let score = 0;
  const intel = dossier.deal_intelligence || {};
  if (/^A:/.test(intel.wholesale_priority || '')) score += 120;
  if (/^B:/.test(intel.wholesale_priority || '')) score += 80;
  if (/^C:/.test(intel.wholesale_priority || '')) score += 30;
  if (/^D:/.test(intel.wholesale_priority || '')) score -= 30;
  if (/^F:/.test(intel.wholesale_priority || '')) score -= 250;
  if (dossier.contact.target !== 'Manual Lookup Needed') score += 100;
  if (dossier.property.source_proof_status === 'Source Proof Present') score += 80;
  if (dossier.property.source_url) score += 40;
  if (dossier.signals.length) score += 30;
  if (dossier.valuation.subject_sale_evidence_count || dossier.valuation.market_support_count || dossier.valuation.verified_sold_comps_count) score += 20;
  if (dossier.workflow.outcome === 'Call Today') score += 15;
  if (dossier.contact.target === 'Manual Lookup Needed') score -= 25;
  if (/search|category|portal/i.test(dossier.property.source_type)) score -= 35;
  if (dossier.property.source_proof_status === 'Source/Address Conflict') score -= 100;
  if (dossier.workflow.outcome === 'Bad Lead') score -= 500;
  return score;
}

function mergeDossier(existing, incoming) {
  if (!existing) return incoming;
  const workflow = existing.workflow || {};
  const existingProperty = existing.property || {};
  const incomingProperty = incoming.property || {};
  const sourceUrl = cleanText(existingProperty.canonical_source_url || existingProperty.source_url || incomingProperty.canonical_source_url || incomingProperty.source_url);
  const canonicalAddress = propertyIdentity.canonicalAddress(Object.assign({}, existing.lead_evidence || {}, incoming.lead_evidence || {}, {
    normalized_address: existingProperty.full_address || incomingProperty.full_address,
    source_url: sourceUrl,
    city: existingProperty.city || incomingProperty.city,
    state: existingProperty.state || incomingProperty.state,
    zip: existingProperty.zip || incomingProperty.zip
  }));
  const addressParts = propertyIdentity.canonicalParts({ normalized_address: canonicalAddress, source_url: sourceUrl });
  const mergedLeadEvidence = leadEvidence.normalizeLeadEvidence(Object.assign({}, incoming.lead_evidence || {}, existing.lead_evidence || {}, {
    normalized_address: canonicalAddress,
    source_url: sourceUrl,
    contact_route: cleanText((existing.contact || {}).target || (incoming.contact || {}).target)
  }), {
    dossier_id: existing.dossier_id,
    analyzer_job_id: cleanText((existing.refs || {}).analyzer_job_id || (incoming.refs || {}).analyzer_job_id),
    normalized_address: canonicalAddress,
    canonical_source_url: sourceUrl
  });
  return Object.assign({}, incoming, {
    dossier_id: existing.dossier_id,
    created_at: existing.created_at,
    updated_at: nowIso(),
    refs: Object.assign({}, incoming.refs || {}, existing.refs || {}, {
      analyzer_job_id: cleanText((existing.refs || {}).analyzer_job_id || (incoming.refs || {}).analyzer_job_id),
      scout_job_id: cleanText((existing.refs || {}).scout_job_id || (incoming.refs || {}).scout_job_id),
      scout_card_id: cleanText((existing.refs || {}).scout_card_id || (incoming.refs || {}).scout_card_id),
      lead_id: cleanText((existing.refs || {}).lead_id || (incoming.refs || {}).lead_id)
    }),
    property: Object.assign({}, incomingProperty, existingProperty, {
      full_address: canonicalAddress,
      city: cleanText(existingProperty.city || incomingProperty.city || addressParts.city),
      state: cleanText(existingProperty.state || incomingProperty.state || addressParts.state),
      zip: cleanText(existingProperty.zip || incomingProperty.zip || addressParts.zip),
      source_url: cleanText(existingProperty.source_url || incomingProperty.source_url || sourceUrl),
      canonical_source_url: cleanText(existingProperty.canonical_source_url || incomingProperty.canonical_source_url),
      original_source_url: cleanText(existingProperty.original_source_url || incomingProperty.original_source_url)
    }),
    source_backed_facts: Object.assign({}, incoming.source_backed_facts || {}, existing.source_backed_facts || {}),
    lead_evidence: mergedLeadEvidence,
    contact: Object.assign({}, incoming.contact || {}, existing.contact || {}),
    workflow: {
      outcome: workflow.outcome || incoming.workflow.outcome,
      notes: cleanText(workflow.notes),
      next_follow_up_at: cleanText(workflow.next_follow_up_at),
      last_contacted_at: cleanText(workflow.last_contacted_at),
      call_attempts: Number(workflow.call_attempts || 0) || 0,
      outcome_history: Array.isArray(workflow.outcome_history) ? workflow.outcome_history : []
    }
  });
}

function createDossier(input, options = {}) {
  const dossiers = readStore(options.storePath);
  const incoming = buildDossier(input || {});
  const matches = [];
  dossiers.forEach((item, index) => {
    if (propertyIdentity.sameProperty(identityInputForDossier(item), identityInputForDossier(incoming))) matches.push({ item, index });
  });
  let saved = incoming;
  let canonicalIndex = -1;
  if (matches.length) {
    const primary = matches.map((match) => match.item).concat(incoming)
      .sort((a, b) => sourceRank(b) - sourceRank(a) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
    const primaryMatch = matches.find((match) => match.item.dossier_id === primary.dossier_id) || matches[0];
    canonicalIndex = primaryMatch.index;
    saved = mergeDossier(primaryMatch.item, incoming);
    dossiers[canonicalIndex] = saved;
    matches.forEach((match) => {
      if (match.index === canonicalIndex) return;
      dossiers[match.index] = Object.assign({}, match.item, {
        updated_at: nowIso(),
        parked_duplicate: true,
        duplicate_of_dossier_id: saved.dossier_id
      });
    });
  } else {
    dossiers.unshift(saved);
  }
  writeStore(dossiers, options.storePath);
  return {
    dossier: publicDossier(saved),
    created: !matches.length,
    reused: !!matches.length,
    merged: !!matches.length,
    deduped: !!matches.length,
    canonical_dossier_id: saved.dossier_id
  };
}

function publicDossier(dossier) {
  dossier = dossier || {};
  const property = dossier.property || {};
  const sourceUrl = cleanText(property.canonical_source_url || property.source_url);
  const urlIdentity = addressFromKnownPropertyUrl(sourceUrl, cleanText(property.source_title));
  const repairedProperty = Object.assign({}, property);
  const viewAddress = propertyIdentity.canonicalAddress({
    normalized_address: repairedProperty.full_address,
    source_url: sourceUrl,
    city: repairedProperty.city || urlIdentity.city,
    state: repairedProperty.state || urlIdentity.state,
    zip: repairedProperty.zip || urlIdentity.zip
  });
  if (viewAddress && viewAddress !== cleanText(repairedProperty.full_address)) {
    repairedProperty.full_address = viewAddress;
    repairedProperty.city = repairedProperty.city || urlIdentity.city;
    repairedProperty.state = repairedProperty.state || urlIdentity.state;
    repairedProperty.zip = repairedProperty.zip || urlIdentity.zip;
    repairedProperty.property_identity_status = 'resolved_from_source_url';
    repairedProperty.property_identity_basis = urlIdentity.basis;
    repairedProperty.address_extracted_from_source_url = true;
    repairedProperty.market_match_status = marketMatchStatus(null, null, repairedProperty.full_address);
    repairedProperty.market_match_basis = urlIdentity.city && urlIdentity.state ? `${urlIdentity.city}, ${urlIdentity.state} from source URL` : '';
  }
  const existingFacts = dossier.source_backed_facts && typeof dossier.source_backed_facts === 'object' ? dossier.source_backed_facts : null;
  const viewFacts = existingFacts || buildSourceBackedFacts({
    source_url: sourceUrl,
    source_page_text: cleanText(dossier.workflow && dossier.workflow.notes),
    input_value: cleanText(repairedProperty.full_address),
    source_type: cleanText(repairedProperty.source_type)
  }, {
    source_url: sourceUrl,
    source_url_type: cleanText(repairedProperty.source_type),
    address_candidate: cleanText(repairedProperty.full_address)
  }, sourceUrl);
  const repairedContact = Object.assign({}, dossier.contact || {});
  if ((!repairedContact.phone && !repairedContact.email) && viewFacts.source_contact_path) {
    repairedContact.target = 'Public Contact Form';
    repairedContact.source_url = cleanText((viewFacts.source_contact_path || {}).source_url);
    repairedContact.confidence = 'public contact path visible';
    repairedContact.warning = 'Public contact form/button visible. Phone/email not verified.';
  }
  const valuation = dossier.valuation || {};
  const groups = valuation.groups || {};
  const viewLeadEvidence = leadEvidence.normalizeLeadEvidence(Object.assign({}, dossier.lead_evidence || {}, {
    normalized_address: repairedProperty.full_address,
    source_url: sourceUrl,
    listing_status: (viewFacts.listing_status || viewFacts.auction_status || {}).value,
    asking_price: (viewFacts.asking_price || {}).value,
    beds: (viewFacts.beds || {}).value,
    baths: (viewFacts.baths || {}).value,
    sqft: (viewFacts.sqft || {}).value,
    year_built: (viewFacts.year_built || {}).value,
    exact_source_phrase: (viewFacts.exact_source_phrase || {}).value,
    matched_criterion: (viewFacts.matched_criterion || {}).value,
    public_contact_route: repairedContact.target || ''
  }), {
    dossier_id: dossier.dossier_id,
    analyzer_job_id: dossier.refs && dossier.refs.analyzer_job_id || '',
    normalized_address: repairedProperty.full_address,
    canonical_source_url: sourceUrl,
    comp_status: Number(valuation.verified_sold_comps_count || 0) >= 3
      ? '3+ verified sold comps present; ARV gate can open.'
      : 'Needs Comps'
  });
  const viewDossier = Object.assign({}, dossier, {
    property: repairedProperty,
    source_backed_facts: viewFacts,
    lead_evidence: viewLeadEvidence,
    contact: repairedContact,
    valuation: Object.assign({}, valuation, {
      groups: {
        subject_sale_evidence: (Array.isArray(groups.subject_sale_evidence) ? groups.subject_sale_evidence : []).map(compactComp),
        verified_sold_comps: (Array.isArray(groups.verified_sold_comps) ? groups.verified_sold_comps : []).map(compactComp),
        candidate_sold_comps: (Array.isArray(groups.candidate_sold_comps) ? groups.candidate_sold_comps : []).map(compactComp),
        market_support: (Array.isArray(groups.market_support) ? groups.market_support : []).map(compactComp),
        not_usable: (Array.isArray(groups.not_usable) ? groups.not_usable : []).map(compactComp)
      }
    }),
    preview_only: true,
    should_ingest: false
  });
  viewDossier.deal_intelligence = Object.assign({}, dossier.deal_intelligence || {}, classifyDeal(viewDossier, null));
  viewDossier.call_script = dossier.call_script && dossier.call_script.opening_line ? dossier.call_script : scriptForDealType(viewDossier);
  if (viewDossier.workflow && viewDossier.workflow.outcome === 'Call Today' && viewDossier.contact && viewDossier.contact.target === 'Manual Lookup Needed') {
    viewDossier.workflow = Object.assign({}, viewDossier.workflow, { outcome: 'Need Contact Lookup' });
  }
  viewDossier.priority_score = priorityScore(viewDossier);
  return viewDossier;
}

function matchesFilter(dossier, filter) {
  filter = cleanText(filter);
  if (!filter) return true;
  if (filter === 'Call Today') return dossier.workflow && dossier.workflow.outcome === 'Call Today';
  if (filter === 'Contact Verified') return dossier.contact && dossier.contact.target !== 'Manual Lookup Needed';
  if (filter === 'Manual Lookup Needed') return dossier.contact && dossier.contact.target === 'Manual Lookup Needed';
  if (filter === 'Source Proof Present') return dossier.property && dossier.property.source_proof_status === 'Source Proof Present';
  if (filter === 'Needs Source Proof') return dossier.property && dossier.property.source_proof_status === 'Needs Source Proof';
  if (filter === 'Needs Address Repair') return dossier.property && dossier.property.source_proof_status === 'Needs Address Repair';
  if (filter === 'Verified Sold Comps Present') return Number(dossier.valuation && dossier.valuation.verified_sold_comps_count || 0) > 0;
  if (filter === 'ARV Locked') return dossier.valuation && dossier.valuation.valuation_status === 'Locked';
  if (filter === 'Distress Signal Present') return Array.isArray(dossier.signals) && dossier.signals.length > 0;
  if (filter === 'Follow-Up Due') return !!(dossier.workflow && dossier.workflow.next_follow_up_at);
  if (filter === 'Wholesale Candidates') return /^Wholesale Candidate/i.test(cleanText(dossier.deal_intelligence && dossier.deal_intelligence.deal_type));
  if (filter === 'Auction/Bank-Owned') return /Auction|Bank-Owned|REO/i.test(cleanText(dossier.deal_intelligence && dossier.deal_intelligence.deal_type));
  return true;
}

function listDossiers(options = {}) {
  const limit = Math.min(Math.max(parseInt(options.limit || 20, 10) || 20, 1), 100);
  let dossiers = readStore(options.storePath)
    .filter((dossier) => dossier && dossier.parked_duplicate !== true)
    .filter((dossier) => !(dossier.workflow && dossier.workflow.outcome === 'Bad Lead') || options.includeBad === true)
    .filter((dossier) => matchesFilter(dossier, options.filter))
    .map(publicDossier);
  if (options.dallasOnly === true) {
    dossiers = dossiers.filter((dossier) => /\bDallas\b/i.test(evidenceTextForDossier(dossier, null)) || /\b752\d{2}\b/.test(evidenceTextForDossier(dossier, null)));
  }
  if (options.texasOnly === true) {
    dossiers = dossiers.filter((dossier) => /\bTX\b|\bTexas\b|\bDallas\b/i.test(evidenceTextForDossier(dossier, null)));
  }
  if (options.hideAuction === true) {
    dossiers = dossiers.filter((dossier) => !/Auction|Bank-Owned|REO/i.test(cleanText(dossier.deal_intelligence && dossier.deal_intelligence.deal_type)));
  }
  if (options.hideResearch === true) {
    dossiers = dossiers.filter((dossier) => !/^Research More/i.test(cleanText(dossier.workflow && dossier.workflow.outcome)));
  }
  if (options.hideLowValue === true) {
    dossiers = dossiers.filter((dossier) => !/Low-Value|Recent Sale|Comp Candidate/i.test(cleanText(dossier.deal_intelligence && dossier.deal_intelligence.deal_type)));
  }
  if (options.prioritizeWholesale === true) {
    dossiers = dossiers.filter((dossier) => !/^F:/.test(cleanText(dossier.deal_intelligence && dossier.deal_intelligence.wholesale_priority)));
  }
  dossiers = groupDossiersByCallAddress(dossiers);
  const seen = new Set();
  dossiers = dossiers.filter((dossier) => {
    const key = callBatchAddressKey(dossier);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return !!cleanText(dossier.property && dossier.property.full_address) && !/^public source result/i.test(cleanText(dossier.property && dossier.property.full_address));
  });
  return dossiers
    .sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0) || String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, limit);
}

function getDossier(dossierId, options = {}) {
  const dossier = readStore(options.storePath).find((item) => item.dossier_id === dossierId);
  return dossier ? publicDossier(dossier) : null;
}

function updateOutcome(dossierId, body, options = {}) {
  const dossiers = readStore(options.storePath);
  const idx = dossiers.findIndex((item) => item.dossier_id === dossierId);
  if (idx < 0) {
    const err = new Error('Deal Details not found.');
    err.status = 404;
    throw err;
  }
  const now = nowIso();
  const dossier = dossiers[idx];
  const workflow = dossier.workflow || {};
  const outcome = cleanText(body && body.outcome);
  if (outcome && !OUTCOMES.has(outcome)) {
    const err = new Error('Unsupported call outcome.');
    err.status = 400;
    throw err;
  }
  const history = Array.isArray(workflow.outcome_history) ? workflow.outcome_history.slice(0, 50) : [];
  if (outcome) history.unshift({ outcome, at: now, note: cleanText(body && body.note) });
  dossier.workflow = {
    outcome: outcome || workflow.outcome || 'Research More',
    notes: cleanText(body && body.notes !== undefined ? body.notes : workflow.notes),
    next_follow_up_at: cleanText(body && (body.next_follow_up_at || body.nextFollowUpAt) || workflow.next_follow_up_at),
    last_contacted_at: /^Called|Left Voicemail/i.test(outcome) ? now : cleanText(workflow.last_contacted_at),
    call_attempts: /^Called|Left Voicemail/i.test(outcome) ? (Number(workflow.call_attempts || 0) || 0) + 1 : (Number(workflow.call_attempts || 0) || 0),
    outcome_history: history
  };
  dossier.updated_at = now;
  dossier.priority_score = priorityScore(dossier);
  dossiers[idx] = dossier;
  writeStore(dossiers, options.storePath);
  return publicDossier(dossier);
}

function factValue(facts, key) {
  const item = facts && facts[key];
  return cleanText(item && item.value) || 'Not verified yet.';
}

function sourceFactsSummary(facts) {
  facts = facts || {};
  return [
    `Asking/list price: ${factValue(facts, 'asking_price')}`,
    `Source estimate: ${factValue(facts, 'estimated_value')} (not verified ARV)`,
    `Beds/Baths/Sqft: ${factValue(facts, 'beds')} bed / ${factValue(facts, 'baths')} bath / ${factValue(facts, 'sqft')} sqft`,
    `Year/Lot: ${factValue(facts, 'year_built')} / ${factValue(facts, 'lot_size')}`,
    `Listing/Auction status: ${factValue(facts, 'listing_status') || factValue(facts, 'auction_status')}`,
    `Tax/assessment: ${factValue(facts, 'tax_history')} (not ARV)`,
    `Nearby value indicators: ${factValue(facts, 'nearby_value_indicators')} (not verified sold comps)`,
    `Contact path: ${factValue(facts, 'source_contact_path')}`
  ].join('\n');
}

function callSheetText(dossiers) {
  return (Array.isArray(dossiers) ? dossiers : []).map((dossier, index) => {
    const signals = (Array.isArray(dossier.signals) ? dossier.signals : []).map((signal) => signal.name).join(', ') || 'Motivation not verified yet.';
    const script = dossier.call_script || {};
    const facts = dossier.source_backed_facts || {};
    const valuationLocked = dossier.valuation.valuation_status !== 'Preliminary ARV Available';
    const intel = dossier.deal_intelligence || {};
    const nums = Array.isArray(intel.numbers_to_verify) ? intel.numbers_to_verify.slice(0, 8).map((row) => `${row.label}: ${row.value || row.status}`).join(' | ') : '';
    const supportingSources = (Array.isArray(dossier.supporting_sources) ? dossier.supporting_sources : [])
      .map((source) => cleanText(source.source_url || source.canonical_source_url))
      .filter(isHttpUrl)
      .filter((url, idx, arr) => arr.indexOf(url) === idx);
    return [
      `${index + 1}. ${dossier.property.full_address}`,
      `Deal type: ${intel.deal_type || 'Unknown'}`,
      `Wholesale priority: ${intel.wholesale_priority || 'C: Research/Comps First'}`,
      `Wholesale deal score: ${Number(intel.wholesale_deal_score || 0) || 0}/100`,
      `Wholesale feasibility: ${intel.wholesale_feasibility || 'Unknown'}`,
      `Source: ${dossier.property.source_url || 'Needs source proof'}`,
      `Supporting sources: ${supportingSources.length ? supportingSources.join(' | ') : 'None listed'}`,
      `Contact: ${dossier.contact.target}${dossier.contact.phone ? ' | ' + dossier.contact.phone : ''}${dossier.contact.email ? ' | ' + dossier.contact.email : ''}${!dossier.contact.phone && !dossier.contact.email ? ' | Contact not verified. Manual lookup needed.' : ''}`,
      `Why call: ${dossier.why_this_property_matters.recommendation}. ${dossier.why_this_property_matters.why_now}`,
      `Wholesale check: ${intel.why_it_may_be_wholesale || 'Not proven as wholesale lead.'} ${intel.why_it_may_not_be_wholesaleable || ''}`.trim(),
      `Assignment risk: ${intel.assignment_risk || 'Unknown until verified.'}`,
      `Before assignment: ${Array.isArray(intel.must_verify_before_assignment) ? intel.must_verify_before_assignment.join(', ') : 'assignability, title, timeline, buyer demand'}`,
      `Signals: ${signals}`,
      `Source-backed facts:\n${sourceFactsSummary(facts)}`,
      `Repair/condition: ${intel.repair_evidence && intel.repair_evidence.repair_discussion_assumption || 'Unknown'} | ${intel.repair_evidence && intel.repair_evidence.warning || 'Not a repair estimate. Verify on call/inspection.'}`,
      `Numbers to verify: ${nums || 'Ask on call: price, condition, contact path, comps, repairs.'}`,
      `Next action: ${dossier.why_this_property_matters.recommendation || 'Research more before calling.'}`,
      `Valuation: ${dossier.valuation.valuation_status}. ${dossier.valuation.valuation_locked_reason || ''}`,
      `ARV gate: ${valuationLocked ? 'ARV locked unless 3 verified sold comps exist. Source estimates/nearby values do not unlock ARV.' : 'Preliminary ARV available from verified sold comps.'}`,
      `MAO gate: ${dossier.valuation.mao_range ? 'MAO evidence present.' : 'MAO locked unless ARV plus repair evidence/manual estimate exists.'}`,
      `Comps: ${dossier.valuation.verified_sold_comps_count} verified, ${dossier.valuation.candidate_sold_comps_count} candidate, ${dossier.valuation.market_support_count} market support.`,
      `Spread: ${intel.spread_status || 'Spread unknown - verified comps required.'}`,
      `Missing: ${([].concat(facts.missing_fields || [], dossier.signals.flatMap((signal) => signal.missing_evidence || []))).slice(0, 8).join(', ') || dossier.valuation.valuation_locked_reason || 'None listed'}`,
      `Opening: ${script.opening_line || ''} ${script.why_calling || ''}`.trim(),
      `Key questions: ${[].concat(script.condition_questions || [], script.timeline_questions || [], script.price_questions || [], script.role_specific_questions || []).slice(0, 8).join(' | ')}`,
      'Notes:',
      'Follow-up:'
    ].join('\n');
  }).join('\n\n');
}

function copyCallSheet(body, options = {}) {
  const ids = Array.isArray(body && body.dossier_ids) ? body.dossier_ids.map(cleanText).filter(Boolean) : [];
  const dossiers = ids.length
    ? groupDossiersByCallAddress(ids.map((id) => getDossier(id, options)).filter(Boolean))
    : listDossiers({
      limit: body && body.limit || 20,
      filter: body && body.filter,
      storePath: options.storePath,
      dallasOnly: body && body.dallas_only === true,
      texasOnly: body && body.texas_only === true,
      hideAuction: body && body.hide_auction === true,
      hideResearch: body && body.hide_research === true,
      hideLowValue: body && body.hide_low_value === true,
      prioritizeWholesale: body && body.prioritize_wholesale === true
    });
  return { text: callSheetText(dossiers), count: dossiers.length };
}

module.exports = {
  OUTCOMES,
  createDossier,
  listDossiers,
  getDossier,
  updateOutcome,
  copyCallSheet,
  buildDossier
};
