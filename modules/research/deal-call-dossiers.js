'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const aiDealAnalyzerJobs = require('./ai-deal-analyzer-jobs');
const findMeScoutJobs = require('./findme-scout-jobs');

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
  return cleanText(value)
    .replace(/\s*,\s*/g, ', ')
    .replace(/\bTX\b/i, 'TX')
    .replace(/\s+/g, ' ');
}

function addressKey(address) {
  return safeLower(address).replace(/[^a-z0-9]+/g, '');
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
    source && source.source_type,
    source && source.comp_research_summary
  ].map(cleanText).join(' ');
  [
    ['fixer/as-is', /\b(fixer|as[- ]is|needs tlc|cash only|investor)\b/i],
    ['auction', /\bauction\b/i],
    ['foreclosure/pre-foreclosure', /\bforeclosure|pre[- ]foreclosure|trustee\b/i],
    ['price cut', /\bprice cut|price reduced|reduced\b/i],
    ['public source signal', /https?:\/\//i]
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

function contactFrom(source, lead) {
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
    return {
      source_kind: 'findme_scout_card',
      scout_job_id: scoutJobId,
      scout_card_id: scoutCardId,
      input_value: cleanText(card.address_or_source_text),
      normalized_address: cleanText(card.display_address || card.address_or_source_text),
      source_url: cleanText(card.canonical_source_url || card.source_url),
      source_url_original: cleanText(card.original_source_url || card.source_url_original),
      canonical_source_url: cleanText(card.canonical_source_url),
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
        canonical_source_url: cleanText(card.canonical_source_url)
      },
      source_evidence: [{
        type: 'source_evidence_pack',
        source_url: cleanText(card.canonical_source_url || card.source_url),
        source_url_type: card.source_classification === 'listing_search_page' || card.source_classification === 'auction_search_page' ? 'list_page' : 'exact_property_record',
        source_status: card.source_url ? 'Found' : 'Missing',
        evidence_role: card.can_send_to_analyzer ? 'source_proof' : 'source_context',
        property_identity_status: card.status === 'Needs Address Repair' ? 'unresolved' : 'partial',
        address_candidate: cleanText(card.display_address || card.address_or_source_text),
        source_url_address_candidate: cleanText(card.display_address || card.address_or_source_text),
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
    const err = new Error('Address is required to create a Deal Call Dossier.');
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
    source_type: cleanText(input.source_type || input.sourceType),
    source_evidence: sourceUrl ? [{
      type: 'source_evidence_pack',
      source_url: sourceUrl,
      source_url_type: 'unknown',
      source_status: 'Needs review',
      evidence_role: 'source_context',
      property_identity_status: 'partial',
      address_candidate: address,
      next_action: 'Verify source proof before calling.',
      missing_fields: ['Source proof']
    }] : []
  };
}

function buildDossier(input) {
  const source = sourceFromInput(input);
  const sourcePack = sourcePackFromJob(source);
  const ctx = source.scout_context || {};
  const address = normalizeAddress(source.normalized_address || source.input_value || (sourcePack && sourcePack.address_candidate));
  if (!address) {
    const err = new Error('Address is required to create a Deal Call Dossier.');
    err.status = 400;
    throw err;
  }
  const sourceUrl = firstHttpUrl([
    source.source_url,
    sourcePack && sourcePack.source_url,
    ctx.canonical_source_url,
    ctx.source_url
  ]);
  const originalSourceUrl = cleanText(ctx.source_url_original || source.source_url_original);
  const canonicalSourceUrl = cleanText(ctx.canonical_source_url || source.canonical_source_url || sourceUrl);
  const proofStatus = sourceProofStatus(source, sourcePack);
  const signals = buildSignals(source, sourceUrl);
  const valuation = valuationFrom(source);
  const contact = contactFrom(source, source.lead || null);
  const why = whyThisMatters(source, signals, valuation, proofStatus);
  const created = nowIso();
  const dossier = {
    dossier_id: hashId('dcd', `${address}|${sourceUrl}|${source.source_kind || ''}`),
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
      full_address: address,
      city: cleanText((sourcePack && sourcePack.city_candidate) || pick(source, ['city'])),
      state: cleanText((sourcePack && sourcePack.state_candidate) || pick(source, ['state'])),
      zip: cleanText((sourcePack && sourcePack.zip_candidate) || pick(source, ['zip'])),
      county: cleanText((sourcePack && sourcePack.county) || pick(source, ['county'])),
      source_url: sourceUrl,
      canonical_source_url: canonicalSourceUrl && canonicalSourceUrl !== sourceUrl ? canonicalSourceUrl : '',
      original_source_url: originalSourceUrl && originalSourceUrl !== sourceUrl ? originalSourceUrl : '',
      source_type: cleanText(source.source_type || (sourcePack && sourcePack.source_url_type) || ctx.source_classification),
      source_proof_status: proofStatus,
      property_identity_status: propertyIdentityStatus(sourcePack, ctx),
      market_match_status: marketMatchStatus(sourcePack, ctx, address),
      source_address_conflict_warning: proofStatus === 'Source/Address Conflict'
        ? 'Source URL address conflicts with Analyzer address. Verify before calling.'
        : ''
    },
    why_this_property_matters: why,
    signals,
    valuation,
    contact,
    call_script: null,
    workflow: {
      outcome: proofStatus === 'Source Proof Present' ? 'Call Today' : 'Research More',
      notes: '',
      next_follow_up_at: '',
      last_contacted_at: '',
      call_attempts: 0,
      outcome_history: []
    },
    preview_only: true,
    should_ingest: false
  };
  dossier.call_script = scriptFor(dossier);
  dossier.priority_score = priorityScore(dossier);
  return dossier;
}

function priorityScore(dossier) {
  let score = 0;
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
  return Object.assign({}, incoming, {
    dossier_id: existing.dossier_id,
    created_at: existing.created_at,
    updated_at: nowIso(),
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
  const key = `${addressKey(incoming.property.full_address)}|${safeLower(incoming.property.source_url || incoming.property.canonical_source_url)}`;
  const idx = dossiers.findIndex((item) => `${addressKey(item.property && item.property.full_address)}|${safeLower(item.property && (item.property.source_url || item.property.canonical_source_url))}` === key);
  const saved = mergeDossier(idx >= 0 ? dossiers[idx] : null, incoming);
  if (idx >= 0) dossiers[idx] = saved;
  else dossiers.unshift(saved);
  writeStore(dossiers, options.storePath);
  return { dossier: publicDossier(saved), deduped: idx >= 0 };
}

function publicDossier(dossier) {
  const valuation = dossier.valuation || {};
  const groups = valuation.groups || {};
  return Object.assign({}, dossier, {
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
  return true;
}

function listDossiers(options = {}) {
  const limit = Math.min(Math.max(parseInt(options.limit || 20, 10) || 20, 1), 100);
  return readStore(options.storePath)
    .filter((dossier) => !(dossier.workflow && dossier.workflow.outcome === 'Bad Lead') || options.includeBad === true)
    .filter((dossier) => matchesFilter(dossier, options.filter))
    .sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0) || String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, limit)
    .map(publicDossier);
}

function getDossier(dossierId, options = {}) {
  const dossier = readStore(options.storePath).find((item) => item.dossier_id === dossierId);
  return dossier ? publicDossier(dossier) : null;
}

function updateOutcome(dossierId, body, options = {}) {
  const dossiers = readStore(options.storePath);
  const idx = dossiers.findIndex((item) => item.dossier_id === dossierId);
  if (idx < 0) {
    const err = new Error('Deal Call Dossier not found.');
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

function callSheetText(dossiers) {
  return (Array.isArray(dossiers) ? dossiers : []).map((dossier, index) => {
    const signals = (Array.isArray(dossier.signals) ? dossier.signals : []).map((signal) => signal.name).join(', ') || 'Motivation not verified yet.';
    const script = dossier.call_script || {};
    return [
      `${index + 1}. ${dossier.property.full_address}`,
      `Source: ${dossier.property.source_url || 'Needs source proof'}`,
      `Contact: ${dossier.contact.target}${dossier.contact.phone ? ' | ' + dossier.contact.phone : ''}${dossier.contact.email ? ' | ' + dossier.contact.email : ''}`,
      `Why call: ${dossier.why_this_property_matters.recommendation}. ${dossier.why_this_property_matters.why_now}`,
      `Signals: ${signals}`,
      `Valuation: ${dossier.valuation.valuation_status}. ${dossier.valuation.valuation_locked_reason || ''}`,
      `Comps: ${dossier.valuation.verified_sold_comps_count} verified, ${dossier.valuation.candidate_sold_comps_count} candidate, ${dossier.valuation.market_support_count} market support.`,
      `Missing: ${(dossier.signals.flatMap((signal) => signal.missing_evidence || [])).slice(0, 5).join(', ') || dossier.valuation.valuation_locked_reason || 'None listed'}`,
      `Opening: ${script.opening_line || ''} ${script.why_calling || ''}`.trim(),
      `Key questions: ${[].concat(script.condition_questions || [], script.timeline_questions || [], script.price_questions || []).slice(0, 5).join(' | ')}`,
      'Notes:',
      'Follow-up:'
    ].join('\n');
  }).join('\n\n');
}

function copyCallSheet(body, options = {}) {
  const ids = Array.isArray(body && body.dossier_ids) ? body.dossier_ids.map(cleanText).filter(Boolean) : [];
  const dossiers = ids.length
    ? ids.map((id) => getDossier(id, options)).filter(Boolean)
    : listDossiers({ limit: body && body.limit || 20, filter: body && body.filter, storePath: options.storePath });
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
