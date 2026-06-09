'use strict';

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function envEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function numberValue(value) {
  const n = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function sourcePackFromJob(job) {
  const sourceEvidence = Array.isArray(job && job.source_evidence) ? job.source_evidence : [];
  return sourceEvidence.find((item) => item && item.type === 'source_evidence_pack') || null;
}

function clampMaxResults(value) {
  return Math.min(Math.max(parseInt(value || '6', 10) || 6, 1), 10);
}

function providerLabel(id) {
  return ({
    gemini_web_research: 'Gemini',
    groq_research: 'Groq',
    openrouter_research: 'OpenRouter',
    openai_web_research: 'OpenAI',
    deterministic_fallback: 'Fallback'
  })[String(id || '').toLowerCase()] || cleanText(id || 'Research provider');
}

function providerConfig(id, env) {
  env = env || process.env;
  if (id === 'gemini_web_research') {
    const enabled = envEnabled(env.ENABLE_GEMINI_WEB_RESEARCH);
    const hasKey = !!cleanText(env.GEMINI_API_KEY);
    return {
      id,
      label: providerLabel(id),
      enabled,
      configured: enabled && hasKey,
      implemented: true,
      model: cleanText(env.GEMINI_RESEARCH_MODEL || 'gemini-1.5-flash'),
      max_results: clampMaxResults(env.GEMINI_RESEARCH_MAX_RESULTS || env.OPENAI_WEB_RESEARCH_MAX_RESULTS),
      source: 'ENABLE_GEMINI_WEB_RESEARCH'
    };
  }
  if (id === 'groq_research') {
    const enabled = envEnabled(env.ENABLE_GROQ_RESEARCH);
    const hasKey = !!cleanText(env.GROQ_API_KEY);
    return {
      id,
      label: providerLabel(id),
      enabled,
      configured: enabled && hasKey,
      implemented: true,
      model: cleanText(env.GROQ_RESEARCH_MODEL || 'llama-3.1-70b-versatile'),
      max_results: clampMaxResults(env.GROQ_RESEARCH_MAX_RESULTS || env.OPENAI_WEB_RESEARCH_MAX_RESULTS),
      source: 'ENABLE_GROQ_RESEARCH'
    };
  }
  if (id === 'openrouter_research') {
    const enabled = envEnabled(env.ENABLE_OPENROUTER_RESEARCH);
    const hasKey = !!cleanText(env.OPENROUTER_API_KEY);
    return {
      id,
      label: providerLabel(id),
      enabled,
      configured: enabled && hasKey,
      implemented: true,
      model: cleanText(env.OPENROUTER_RESEARCH_MODEL || 'meta-llama/llama-3.1-8b-instruct:free'),
      max_results: clampMaxResults(env.OPENROUTER_RESEARCH_MAX_RESULTS || env.OPENAI_WEB_RESEARCH_MAX_RESULTS),
      source: 'ENABLE_OPENROUTER_RESEARCH'
    };
  }
  if (id === 'openai_web_research') {
    const enabled = envEnabled(env.ENABLE_OPENAI_WEB_RESEARCH);
    const hasKey = !!cleanText(env.OPENAI_API_KEY);
    return {
      id,
      label: providerLabel(id),
      enabled,
      configured: enabled && hasKey,
      implemented: true,
      model: cleanText(env.OPENAI_WEB_RESEARCH_MODEL || 'gpt-4.1-mini'),
      max_results: clampMaxResults(env.OPENAI_WEB_RESEARCH_MAX_RESULTS),
      source: 'ENABLE_OPENAI_WEB_RESEARCH'
    };
  }
  if (id === 'deterministic_fallback') {
    const enabled = envEnabled(env.ENABLE_STATIC_RESEARCH_FALLBACK);
    return {
      id,
      label: providerLabel(id),
      enabled,
      configured: enabled,
      implemented: true,
      model: 'local-static',
      max_results: 0,
      source: 'ENABLE_STATIC_RESEARCH_FALLBACK'
    };
  }
  return {
    id,
    label: providerLabel(id),
    enabled: false,
    configured: false,
    implemented: false,
    model: '',
    max_results: 0,
    source: ''
  };
}

function parseGeminiFallbackModels(env) {
  env = env || process.env;
  return String(env.GEMINI_RESEARCH_FALLBACK_MODELS || '')
    .split(',')
    .map(cleanText)
    .filter(Boolean);
}

function geminiTransientStatus(error) {
  const message = cleanText(error && error.message ? error.message : '');
  const status = Number(error && (error.status || error.statusCode || error.code) || 0);
  if (status === 401 || status === 403 || /\b(api key not valid|permission denied|forbidden|unauthorized|auth)\b/i.test(message)) {
    return 'auth_error';
  }
  if (status === 429 || /\b(quota|rate limit|too many requests|resource exhausted)\b/i.test(message)) {
    return 'quota_or_rate_limited';
  }
  if (status === 408 || status === 504 || /\b(abort|aborted|timeout|timed out|deadline exceeded|operation was aborted)\b/i.test(message)) {
    return 'timed_out';
  }
  if (status === 503 || /\b(high demand|try again later|overloaded|temporarily unavailable|busy|unavailable)\b/i.test(message)) {
    return 'temporarily_unavailable';
  }
  return 'failed';
}

function geminiOperatorMessage(error) {
  const status = geminiTransientStatus(error);
  if (status === 'temporarily_unavailable' || status === 'quota_or_rate_limited') {
    return 'Gemini is temporarily unavailable/high demand. Try again later.';
  }
  if (status === 'timed_out') {
    return 'Gemini live comp research timed out before returning evidence. Try again later.';
  }
  if (status === 'auth_error') {
    return 'Gemini is configured but authentication or permission failed. Verify the Gemini API key and access.';
  }
  return cleanText(error && error.message ? error.message : 'Gemini comp research failed.');
}

function makeGeminiProviderError(error, modelTried, attemptedModels) {
  const err = new Error(geminiOperatorMessage(error));
  err.status = error && error.status;
  err.provider_status = geminiTransientStatus(error);
  err.provider_model = cleanText(modelTried);
  err.provider_models_attempted = Array.isArray(attemptedModels) ? attemptedModels.slice() : [];
  err.provider_raw_message = cleanText(error && error.message ? error.message : '');
  return err;
}

function getConfiguredResearchProviders(env) {
  env = env || process.env;
  return [
    providerConfig('gemini_web_research', env),
    providerConfig('groq_research', env),
    providerConfig('openrouter_research', env),
    providerConfig('openai_web_research', env),
    providerConfig('deterministic_fallback', env)
  ].filter((provider) => provider.configured);
}

function isResearchConfigured(options) {
  return getConfiguredResearchProviders(options && options.env).length > 0;
}

function buildPublicEvidenceResearchPrompt(job, options) {
  job = job || {};
  options = options || {};
  const pack = sourcePackFromJob(job) || {};
  const maxResults = options.max_results || options.maxResults || 6;
  return [
    'Research public sold-comp evidence for this real estate lead using public web sources only.',
    'Return JSON only. Do not include markdown or commentary outside JSON.',
    '',
    'Hard evidence rules:',
    '- Do not invent comps, ARV, MAO, owner, debt, DOM, listing history, sold price, auction amount, or source facts.',
    '- Every factual claim must include a citation/source_url.',
    '- A verified sold comp may be reported only when it is a different property from the subject and comp address, sold/closed status, sold price, sold date, and source URL are present.',
    '- Return the subject property only under subject_sale_evidence. Never return it as a comp.',
    '- Active, pending, list price, estimate, rent, auction, or unclear records must be marked as market support only, not verified sold comps.',
    '- Generic portals, homepages, search pages, and broad market pages are not sold-comp proof.',
    '- Candidate comps do not unlock ARV or MAO.',
    '- Do not estimate ARV or MAO.',
    '- If evidence is missing, list it in missing_evidence.',
    '- Prefer nearby, recent, similar residential sold records in the same city, neighborhood, or ZIP. If proximity, similarity, or recency is not visible, mark it missing.',
    '- Do not invent distance. If distance is not visible, say Distance not verified.',
    '- Do not use Foreclosure.com.',
    '',
    'Subject:',
    `job_id: ${cleanText(job.job_id)}`,
    `input_type: ${cleanText(job.input_type)}`,
    `input_value: ${cleanText(job.input_value)}`,
    `normalized_address: ${cleanText(job.normalized_address)}`,
    `lead_ref: ${cleanText(job.lead_ref)}`,
    `source_url: ${cleanText(pack.source_url)}`,
    `source_url_type: ${cleanText(pack.source_url_type)}`,
    `source_status: ${cleanText(pack.source_status)}`,
    `property_identity_status: ${cleanText(pack.property_identity_status)}`,
    `county: ${cleanText(pack.county)}`,
    `state: ${cleanText(pack.state)}`,
    `source_ref: ${cleanText(pack.source_ref)}`,
    '',
    'Search target:',
    '- Find different nearby public sold/closed comparable sales near the subject address.',
    '- Search multiple angles: nearby sold homes, recent sold homes, same ZIP sold homes, similar homes sold near the subject street/city, public Realtor/Redfin/Zillow/HAR sold pages if visible, sale-history pages if visible, and county/appraisal pages as support only.',
    '- Return market/listing support separately when sold evidence is not complete.',
    '- Rank exact sold records with address, sold price, sold date, and source URL first.',
    '- Exclude the subject property from verified_sold_comps and candidate_sold_comps even if it has sold evidence.',
    '',
    'Return this exact JSON shape:',
    JSON.stringify({
      status: 'candidates_found | no_candidates_found | failed',
      subject: { normalized_address: '', source_url: '', property_identity_status: '' },
      property_evidence: [{ label: '', value: '', source_url: '', confidence: 0 }],
      source_evidence: [{ label: '', value: '', source_url: '', confidence: 0 }],
      subject_sale_evidence: [{
        address: '',
        city: '',
        state: '',
        zip: '',
        sold_price: null,
        sold_date: '',
        status: 'sold | active | pending | unknown',
        source_url: '',
        source_title: '',
        source_type: 'subject_property_source',
        missing_evidence: [],
        confidence: 0,
        reason: 'Subject property evidence only, not a comparable sale'
      }],
      verified_sold_comps: [{
        address: '',
        city: '',
        state: '',
        zip: '',
        sold_price: null,
        sold_date: '',
        status: 'sold | closed',
        beds: null,
        baths: null,
        sqft: null,
        lot_size: '',
        source_url: '',
        source_title: '',
        source_type: 'sold_record | listing_sale_history | county_record | unknown',
        why_similar: '',
        missing_evidence: [],
        confidence: 0
      }],
      candidate_sold_comps: [{
        address: '',
        city: '',
        state: '',
        zip: '',
        sold_price: null,
        sold_date: '',
        status: 'sold | closed | unknown',
        source_url: '',
        source_title: '',
        source_type: '',
        why_similar: '',
        missing_evidence: [],
        why_not_verified: '',
        confidence: 0
      }],
      market_support: [{
        address: '',
        city: '',
        state: '',
        zip: '',
        listing_status: 'active | pending | estimate | market | unknown',
        price: null,
        source_url: '',
        source_title: '',
        source_type: '',
        reason: '',
        why_not_verified: '',
        missing_evidence: [],
        confidence: 0
      }],
      not_usable: [{
        address: '',
        source_url: '',
        source_title: '',
        source_type: '',
        reason_excluded: '',
        missing_evidence: [],
        confidence: 0
      }],
      missing_evidence: [],
      missing_evidence_summary: '',
      comp_search_strategy: '',
      next_action: '',
      warnings: [],
      citations: [{ title: '', url: '' }],
      raw_summary: ''
    }),
    '',
    `Return at most ${maxResults} comp candidates.`
  ].join('\n');
}

function extractJsonText(text) {
  text = String(text || '').trim();
  if (!text) return '';
  if (/^```/i.test(text)) return text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

function normalizeEvidenceList(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    label: cleanText(item && item.label),
    value: cleanText(item && item.value),
    source_url: cleanText(item && item.source_url),
    confidence: numberValue(item && item.confidence)
  })).filter((item) => item.label || item.value || item.source_url);
}

function normalizeCompCandidate(candidate) {
  candidate = candidate || {};
  const missingFields = Array.isArray(candidate.missing_fields)
    ? candidate.missing_fields
    : Array.isArray(candidate.missing_evidence)
      ? candidate.missing_evidence
      : [];
  return {
    comp_address: cleanText(candidate.comp_address || candidate.address),
    city: cleanText(candidate.city),
    state: cleanText(candidate.state),
    zip: cleanText(candidate.zip || candidate.postal_code),
    sold_status: cleanText(candidate.sold_status || candidate.status || 'candidate').toLowerCase(),
    sold_price: numberValue(candidate.sold_price || candidate.sale_price || candidate.price),
    sold_date: cleanText(candidate.sold_date || candidate.sale_date || candidate.closed_date),
    listing_status: cleanText(candidate.listing_status || candidate.list_status),
    beds: candidate.beds == null ? null : candidate.beds,
    baths: candidate.baths == null ? null : candidate.baths,
    sqft: candidate.sqft == null ? null : candidate.sqft,
    lot_size: cleanText(candidate.lot_size || candidate.lot),
    distance_miles: candidate.distance_miles == null ? null : candidate.distance_miles,
    source_url: cleanText(candidate.source_url || candidate.url),
    source_title: cleanText(candidate.source_title || candidate.title),
    source_type: cleanText(candidate.source_type || candidate.record_type || candidate.source_kind),
    source_label: cleanText(candidate.source_label || candidate.source || 'Public web evidence'),
    confidence: numberValue(candidate.confidence),
    verification_status: cleanText(candidate.verification_status || 'candidate').toLowerCase(),
    comp_group: cleanText(candidate.comp_group),
    why_included: cleanText(candidate.why_included || candidate.why_similar || candidate.notes_summary || candidate.reason || candidate.reason_included),
    why_not_verified: cleanText(candidate.why_not_verified || candidate.reason_excluded),
    missing_fields: missingFields.map(cleanText).filter(Boolean),
    notes: Array.isArray(candidate.notes) ? candidate.notes.map(cleanText).filter(Boolean) : []
  };
}

function normalizeCompCandidateArray(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw.map(normalizeCompCandidate).filter((candidate) => candidate.comp_address || candidate.source_url || candidate.sold_price || candidate.sold_date);
}

function normalizeCompCandidateBucket(value, defaults) {
  defaults = defaults || {};
  const raw = Array.isArray(value) ? value : [];
  return raw.map((candidate) => normalizeCompCandidate(Object.assign({}, candidate || {}, defaults)))
    .filter((candidate) => candidate.comp_address || candidate.source_url || candidate.sold_price || candidate.sold_date);
}

function normalizeResearchResult(result, provider) {
  result = result || {};
  provider = provider || {};
  const rawCandidates = []
    .concat(normalizeCompCandidateBucket(result.subject_sale_evidence, { verification_status: 'subject_sale_evidence', comp_group: 'subject_sale_evidence' }))
    .concat(normalizeCompCandidateBucket(result.verified_sold_comps, { verification_status: 'verified', comp_group: 'verified_sold' }))
    .concat(normalizeCompCandidateBucket(result.candidate_sold_comps, { verification_status: 'candidate', comp_group: 'candidate_sold' }))
    .concat(normalizeCompCandidateBucket(result.market_support, { verification_status: 'market_support', comp_group: 'market_support' }))
    .concat(normalizeCompCandidateBucket(result.not_usable, { verification_status: 'not_usable', comp_group: 'not_usable' }))
    .concat(normalizeCompCandidateArray(result.comp_results))
    .concat(normalizeCompCandidateArray(result.comp_candidates))
    .concat(normalizeCompCandidateArray(result.results))
    .concat(normalizeCompCandidateArray(result.comps))
    .concat(normalizeCompCandidateArray(result.sold_comps))
    .concat(normalizeCompCandidateArray(result.candidate_comps));
  const seen = new Set();
  const candidates = rawCandidates.filter((candidate) => {
    const key = [cleanText(candidate.comp_address).toLowerCase(), cleanText(candidate.source_url).toLowerCase(), cleanText(candidate.sold_price), cleanText(candidate.sold_date)].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const citations = (Array.isArray(result.citations) ? result.citations : [])
    .map((citation) => ({ title: cleanText(citation && citation.title), url: cleanText(citation && (citation.url || citation.source_url)) }))
    .filter((citation) => isHttpUrl(citation.url));
  return {
    provider: provider.id || cleanText(result.provider || 'research_provider'),
    provider_label: provider.label || providerLabel(provider.id),
    status: cleanText(result.status || (candidates.length ? 'candidates_found' : 'no_candidates_found')),
    subject: result.subject || {},
    property_evidence: normalizeEvidenceList(result.property_evidence),
    source_evidence: normalizeEvidenceList(result.source_evidence),
    comp_candidates: candidates,
    missing_evidence: Array.isArray(result.missing_evidence) ? result.missing_evidence.map(cleanText).filter(Boolean) : [],
    missing_evidence_summary: cleanText(result.missing_evidence_summary),
    comp_search_strategy: cleanText(result.comp_search_strategy || result.search_strategy_used),
    next_action: cleanText(result.next_action),
    warnings: Array.isArray(result.warnings) ? result.warnings.map(cleanText).filter(Boolean) : [],
    citations,
    raw_summary: cleanText(result.raw_summary),
    normalized_from_text: result.normalized_from_text === true,
    normalization_note: cleanText(result.normalization_note),
    created_at: cleanText(result.created_at) || new Date().toISOString()
  };
}

function extractUrlsFromText(text) {
  const urls = [];
  const seen = new Set();
  String(text || '').replace(/https?:\/\/[^\s<>"'`]+/gi, (url) => {
    const value = cleanText(url).replace(/[),.;!?]+$/, '');
    if (isHttpUrl(value) && !seen.has(value)) {
      seen.add(value);
      urls.push(value);
    }
    return url;
  });
  return urls;
}

function extractDateFromText(text) {
  const match = cleanText(text).match(/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/i);
  return match ? cleanText(match[1]) : '';
}

function extractMoneyFromText(text) {
  const raw = cleanText(text);
  const match = raw.match(/\$\s*([1-9][0-9,]{2,}(?:\.\d+)?)\b/);
  if (match) return Math.round(Number(match[1].replace(/,/g, '')));
  const kMatch = raw.match(/\b([1-9][0-9,]{2,}(?:\.\d+)?)\s*k\b/i);
  if (kMatch) return Math.round(Number(kMatch[1].replace(/,/g, '')) * 1000);
  return 0;
}

function addressCase(value) {
  return cleanText(value).replace(/\b([a-z])([a-z]*)\b/g, (match, first, rest) => first.toUpperCase() + rest.toLowerCase());
}

function titleCaseStreet(value) {
  return cleanText(value)
    .replace(/\b([nswe])\b/gi, (match) => match.toUpperCase())
    .replace(/\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|sq|square|run)\b/gi, (match) => ({
      st: 'St',
      street: 'Street',
      ave: 'Ave',
      avenue: 'Avenue',
      rd: 'Rd',
      road: 'Road',
      dr: 'Dr',
      drive: 'Drive',
      ln: 'Ln',
      lane: 'Lane',
      ct: 'Ct',
      court: 'Court',
      cir: 'Cir',
      circle: 'Circle',
      blvd: 'Blvd',
      boulevard: 'Boulevard',
      way: 'Way',
      pl: 'Pl',
      place: 'Place',
      pkwy: 'Pkwy',
      parkway: 'Parkway',
      hwy: 'Hwy',
      highway: 'Highway',
      ter: 'Ter',
      terrace: 'Terrace',
      trl: 'Trl',
      trail: 'Trail',
      loop: 'Loop',
      sq: 'Sq',
      square: 'Square',
      run: 'Run'
    })[match.toLowerCase()] || match)
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, (m, n, suf) => `${n}${suf.toLowerCase()}`);
}

function extractAddressFromUrl(url) {
  const clean = cleanText(url);
  if (!isHttpUrl(clean)) return '';
  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const path = decodeURIComponent(parsed.pathname || '');
    let address = '';
    let city = '';
    let state = '';
    let zip = '';

    if (/realtor\.com$/i.test(host)) {
      const match = path.match(/realestateandhomes-detail\/([^/?#]+)/i);
      if (match) {
        const slug = cleanText(match[1]).replace(/_/g, ' ');
        const details = slug.match(/^(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
        if (details && details.groups) {
          address = details.groups.address;
          city = details.groups.city;
          state = details.groups.state;
          zip = details.groups.zip;
        }
      }
    } else if (/redfin\.com$/i.test(host)) {
      const match = path.match(/\/(?<state>[A-Za-z]{2})\/(?<city>[A-Za-z][A-Za-z-]*)\/(?<street>[^/?#]+?)\/home\//i);
      if (match && match.groups) {
        state = match.groups.state;
        city = match.groups.city;
        const street = cleanText(match.groups.street);
        const zipMatch = street.match(/\b(\d{5})(?:-\d{4})?$/);
        zip = zipMatch ? zipMatch[1] : '';
        address = street.replace(/\b\d{5}(?:-\d{4})?$/i, '').replace(/-/g, ' ').trim();
      }
    } else if (/zillow\.com$/i.test(host)) {
      const match = path.match(/homedetails\/([^/?#]+)/i);
      if (match) {
        const slug = cleanText(match[1]).replace(/_/g, ' ');
        const details = slug.match(/^(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
        if (details && details.groups) {
          address = details.groups.address;
          city = details.groups.city;
          state = details.groups.state;
          zip = details.groups.zip;
        }
      }
    } else if (/har\.com$/i.test(host)) {
      const match = path.match(/\/homedetail\/([^/?#]+)(?:\/\d+)?/i);
      if (match) {
        const slug = cleanText(match[1]).replace(/_/g, ' ');
        const parts = slug.split('-').map(cleanText).filter(Boolean);
        if (parts.length >= 4) {
          const zipPart = parts[parts.length - 1];
          const statePart = parts[parts.length - 2];
          const cityPart = parts[parts.length - 3];
          const addressParts = parts.slice(0, -3);
          if (/^\d{5}(?:-\d{4})?$/.test(zipPart) && /^[A-Za-z]{2}$/.test(statePart) && cityPart) {
            address = addressParts.join('-').replace(/-/g, ' ').trim();
            city = cityPart;
            state = statePart;
            zip = zipPart.slice(0, 5);
          }
        }
      }
    } else if (/auction\.com$/i.test(host)) {
      const parts = path.split('/').filter(Boolean).map((segment) => cleanText(segment));
      const slug = parts[parts.length - 1] || '';
      const normalizedSlug = slug.replace(/_/g, ' ');
      const details = normalizedSlug.match(/^(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
      if (details && details.groups) {
        address = details.groups.address;
        city = details.groups.city;
        state = details.groups.state;
        zip = details.groups.zip;
      }
    }

    const normalizedParts = [
      addressCase(titleCaseStreet(address)),
      addressCase(city),
      [state ? state.toUpperCase() : '', zip].filter(Boolean).join(' ')
    ].filter(Boolean);
    return normalizedParts.join(', ');
  } catch (error) {
    return '';
  }
}

function extractAddressFromText(text, urls) {
  const raw = cleanText(text);
  const patterns = [
    /\b\d{1,6}\s+[A-Za-z0-9#.'-]+(?:\s+[A-Za-z0-9#.'-]+){0,8}\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Circle|Cir|Place|Pl|Terrace|Ter|Trail|Trl|Loop|Parkway|Pkwy|Highway|Hwy|Way|Crescent|Cres|Square|Sq|Run|Row|Plaza|Pz|Driveway|Drwy)\b(?:,\s*[A-Za-z][A-Za-z .'-]+)?(?:,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/i,
    /\b\d{1,6}\s+[A-Za-z0-9#.'-]+(?:\s+[A-Za-z0-9#.'-]+){0,8},\s*[A-Za-z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match && match[0]) return cleanText(match[0]);
  }
  const sourceUrls = Array.isArray(urls) ? urls : extractUrlsFromText(raw);
  for (const url of sourceUrls) {
    const extracted = extractAddressFromUrl(url);
    if (extracted) return extracted;
  }
  return '';
}

function extractStatusFromText(text) {
  const raw = cleanText(text).toLowerCase();
  if (/\b(sold|closed)\b/.test(raw)) return 'sold';
  if (/\b(active|for sale|listed|listing)\b/.test(raw)) return 'active';
  if (/\b(pending|contingent)\b/.test(raw)) return 'pending';
  if (/\b(price cut|price reduced|reduced)\b/.test(raw)) return 'active';
  if (/\b(rent|estimate|zestimate|market support)\b/.test(raw)) return 'market_support';
  return '';
}

function extractCompSourceLine(text, startIndex) {
  const raw = String(text || '');
  const start = Math.max(0, startIndex || 0);
  const before = raw.lastIndexOf('\n', start);
  const after = raw.indexOf('\n', start);
  return cleanText(raw.slice(before >= 0 ? before + 1 : 0, after >= 0 ? after : raw.length));
}

function parseResearchBlock(text, citations) {
  const raw = cleanText(text);
  const urls = extractUrlsFromText(raw);
  const address = extractAddressFromText(raw, urls);
  const status = extractStatusFromText(raw);
  const price = extractMoneyFromText(raw);
  const date = extractDateFromText(raw);
  const sourceUrl = urls[0] || (Array.isArray(citations) && citations.length === 1 ? citations[0].url : '');
  const sourceTitle = Array.isArray(citations) && citations.length === 1 ? citations[0].title : '';
  const candidate = {
    comp_address: address,
    sold_status: status || (/\b(sold|closed)\b/i.test(raw) ? 'sold' : /\b(active|listed|for sale)\b/i.test(raw) ? 'active' : /\b(pending)\b/i.test(raw) ? 'pending' : 'candidate'),
    sold_price: price,
    sold_date: date,
    listing_status: /\b(active|listed|for sale)\b/i.test(raw) ? 'active' : /\b(pending)\b/i.test(raw) ? 'pending' : '',
    source_url: sourceUrl,
    source_title: sourceTitle,
    source_type: sourceUrl ? (/\b(auction\.com)\b/i.test(sourceUrl) ? 'auction_property_page' : /\/(homedetail|homedetails|realestateandhomes-detail|home\/)/i.test(sourceUrl) ? 'listing_property_page' : 'public_web') : '',
    source_label: sourceTitle || 'Gemini grounded summary',
    confidence: sourceUrl ? 55 : 30,
    why_included: raw.slice(0, 240),
    missing_fields: [],
    notes: []
  };
  const evidenceFlags = [];
  if (candidate.comp_address) evidenceFlags.push('address');
  if (candidate.sold_price > 0) evidenceFlags.push('price');
  if (candidate.sold_date) evidenceFlags.push('date');
  if (candidate.source_url) evidenceFlags.push('source');
  if (candidate.sold_status) evidenceFlags.push('status');
  const visible = new Set();
  if (!candidate.comp_address) visible.add('Comp address');
  if (!candidate.sold_price) visible.add('Sold price');
  if (!candidate.sold_date && candidate.sold_status === 'sold') visible.add('Sold date');
  if (!candidate.source_url) visible.add('Source URL');
  if (!/\b(sold|closed|active|listed|pending)\b/i.test(raw)) visible.add('Sale/list status');
  candidate.missing_fields = Array.from(visible);
  const usable = evidenceFlags.length >= 2;
  return {
    candidate: usable ? candidate : null,
    source_urls: urls,
    evidence_text: raw
  };
}

function textFallbackResearchResult(text, provider, citations) {
  const raw = cleanText(text);
  const chunks = raw.split(/\n+/).map((line) => cleanText(line)).filter(Boolean);
  const sourceLines = chunks.filter((line) => /https?:\/\//i.test(line) || /\b(sold|closed|active|pending|listed|for sale|price reduced|rent|estimate|zestimate)\b/i.test(line));
  const parsed = [];
  const seen = new Set();
  sourceLines.forEach((line) => {
    const block = parseResearchBlock(line, citations);
    if (!block || !block.candidate) return;
    const candidate = normalizeCompCandidate(block.candidate);
    const key = [cleanText(candidate.comp_address).toLowerCase(), cleanText(candidate.source_url).toLowerCase(), cleanText(candidate.sold_price), cleanText(candidate.sold_date)].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    parsed.push(candidate);
  });

  const sourceEvidence = (Array.isArray(citations) ? citations : []).map((citation) => ({
    label: citation.title || 'Grounding source',
    value: citation.title || citation.url,
    source_url: citation.url,
    confidence: 50
  })).filter((item) => item.source_url);

  const hasUsableEvidence = parsed.length > 0 || sourceEvidence.length > 0;
  return normalizeResearchResult({
    status: parsed.length ? 'partial_results' : (hasUsableEvidence ? 'completed' : 'no_usable_comp_evidence'),
    comp_results: parsed,
    source_evidence: sourceEvidence,
    citations,
    missing_evidence: parsed.length ? ['Review sources before using'] : ['No usable comp evidence found'],
    warnings: [parsed.length ? 'Provider response was normalized from text; verify sources before using.' : 'Provider response was normalized from text but did not contain usable comp evidence.'],
    raw_summary: raw.slice(0, 4000),
    normalized_from_text: true,
    normalization_note: parsed.length
      ? 'Provider response was normalized from text; verify sources before using.'
      : 'Provider response was normalized from text but did not contain usable comp evidence.'
  }, provider);
}

function parseStructuredOutput(text, provider, citations) {
  if (!cleanText(text)) {
    return normalizeResearchResult({
      status: 'no_usable_comp_evidence',
      missing_evidence: ['Structured research output'],
      warnings: ['Research provider returned no structured output.'],
      raw_summary: '',
      normalized_from_text: true,
      normalization_note: 'Provider response was empty.'
    }, provider);
  }
  try {
    const parsed = JSON.parse(extractJsonText(text));
    return normalizeResearchResult(Array.isArray(parsed) ? { comp_results: parsed } : parsed, provider);
  } catch (error) {
    return textFallbackResearchResult(text, provider, citations);
  }
}

function extractOpenAICompatibleText(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string') return response.output_text;
  if (Array.isArray(response.choices) && response.choices[0] && response.choices[0].message) {
    return cleanText(response.choices[0].message.content);
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const chunks = [];
  output.forEach((item) => {
    (Array.isArray(item && item.content) ? item.content : []).forEach((part) => {
      if (typeof part.text === 'string') chunks.push(part.text);
      if (typeof part.output_text === 'string') chunks.push(part.output_text);
    });
  });
  return chunks.join('\n').trim();
}

function extractGeminiText(response) {
  const parts = response && response.candidates && response.candidates[0] &&
    response.candidates[0].content && Array.isArray(response.candidates[0].content.parts)
    ? response.candidates[0].content.parts
    : [];
  return parts.map((part) => cleanText(part && part.text)).filter(Boolean).join('\n');
}

function extractGeminiCitations(response) {
  const grounding = response && response.candidates && response.candidates[0]
    ? response.candidates[0].groundingMetadata || response.candidates[0].grounding_metadata
    : null;
  const chunks = Array.isArray(grounding && grounding.groundingChunks)
    ? grounding.groundingChunks
    : Array.isArray(grounding && grounding.grounding_chunks)
      ? grounding.grounding_chunks
      : [];
  return chunks.map((chunk) => {
    const web = chunk && (chunk.web || chunk.retrievedContext || chunk.retrieved_context);
    return {
      title: cleanText(web && (web.title || web.name)),
      url: cleanText(web && (web.uri || web.url))
    };
  }).filter((citation) => isHttpUrl(citation.url));
}

function mergeCitations(result, citations) {
  result = result || {};
  const seen = new Set();
  const merged = [];
  (Array.isArray(result.citations) ? result.citations : []).concat(Array.isArray(citations) ? citations : []).forEach((citation) => {
    const url = cleanText(citation && (citation.url || citation.source_url));
    if (!isHttpUrl(url) || seen.has(url)) return;
    seen.add(url);
    merged.push({ title: cleanText(citation && citation.title), url });
  });
  return Object.assign({}, result, { citations: merged });
}

async function fetchJson(url, body, headers, options) {
  options = options || {};
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Research provider requires a runtime with fetch support.');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : `Research provider failed with HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function runGeminiResearch(job, provider, options) {
  const env = options.env || process.env;
  const prompt = buildPublicEvidenceResearchPrompt(job, provider);
  const fallbackModels = parseGeminiFallbackModels(env);
  const modelsToTry = [cleanText(provider.model)].concat(fallbackModels).filter(Boolean)
    .filter((model, index, arr) => arr.indexOf(model) === index);
  let lastError = null;
  const attemptedModels = [];
  for (const model of modelsToTry) {
    attemptedModels.push(model);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const data = await fetchJson(url, {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096
        }
      }, {
        'x-goog-api-key': options.apiKey || env.GEMINI_API_KEY
      }, options);
      const merged = mergeCitations(parseStructuredOutput(extractGeminiText(data), provider, extractGeminiCitations(data)), extractGeminiCitations(data));
      merged.provider_model_used = model;
      merged.provider_models_attempted = attemptedModels.slice();
      if (model !== cleanText(provider.model)) {
        merged.warnings = (Array.isArray(merged.warnings) ? merged.warnings : []).concat(`Gemini fallback model used: ${model}`);
      }
      return merged;
    } catch (error) {
      lastError = makeGeminiProviderError(error, model, attemptedModels);
      if (!['temporarily_unavailable', 'timed_out', 'quota_or_rate_limited'].includes(lastError.provider_status)) {
        throw lastError;
      }
    }
  }
  throw lastError || makeGeminiProviderError(new Error('Gemini comp research failed.'), cleanText(provider.model), attemptedModels);
}

async function runGroqResearch(job, provider, options) {
  const env = options.env || process.env;
  const prompt = buildPublicEvidenceResearchPrompt(job, provider);
  const data = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
    model: provider.model,
    messages: [
      { role: 'system', content: 'Return only cited, structured real estate research JSON. Never invent missing facts.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0
  }, { Authorization: `Bearer ${options.apiKey || env.GROQ_API_KEY}` }, options);
  return parseStructuredOutput(extractOpenAICompatibleText(data), provider);
}

async function runOpenRouterResearch(job, provider, options) {
  const env = options.env || process.env;
  const prompt = buildPublicEvidenceResearchPrompt(job, provider);
  const data = await fetchJson('https://openrouter.ai/api/v1/chat/completions', {
    model: provider.model,
    messages: [
      { role: 'system', content: 'Return only cited, structured real estate research JSON. Never invent missing facts.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0
  }, { Authorization: `Bearer ${options.apiKey || env.OPENROUTER_API_KEY}` }, options);
  return parseStructuredOutput(extractOpenAICompatibleText(data), provider);
}

function runDeterministicFallback(job, provider) {
  const pack = sourcePackFromJob(job) || {};
  return normalizeResearchResult({
    status: 'no_candidates_found',
    missing_evidence: ['Configured live research provider', '3 verified sold comps'],
    warnings: ['Fallback made no live calls and did not find comp evidence.'],
    source_evidence: pack.source_url ? [{
      label: 'Existing source context',
      value: cleanText(pack.source_status || pack.source_url_type),
      source_url: cleanText(pack.source_url),
      confidence: numberValue(pack.confidence)
    }] : [],
    raw_summary: 'Static fallback only. No external research was run.'
  }, provider);
}

async function runResearchProvider(job, options) {
  options = options || {};
  const providers = getConfiguredResearchProviders(options.env);
  const provider = options.provider
    ? providers.find((candidate) => candidate.id === options.provider)
    : providers[0];
  if (!provider) {
    return normalizeResearchResult({
      status: 'not_configured',
      missing_evidence: ['Configured research provider'],
      raw_summary: 'Research provider not configured.'
    }, { id: 'none', label: 'Not configured' });
  }
  if (options.mockResponse) return normalizeResearchResult(options.mockResponse, provider);
  if (provider.id === 'gemini_web_research') return runGeminiResearch(job, provider, options);
  if (provider.id === 'groq_research') return runGroqResearch(job, provider, options);
  if (provider.id === 'openrouter_research') return runOpenRouterResearch(job, provider, options);
  if (provider.id === 'openai_web_research') {
    const openaiWebResearch = require('./openai-web-research-provider');
    return openaiWebResearch.runOpenAIWebResearch(job, options);
  }
  if (provider.id === 'deterministic_fallback') return runDeterministicFallback(job, provider);
  return normalizeResearchResult({
    status: 'failed',
    missing_evidence: ['Implemented research provider'],
    warnings: ['Configured research provider is not implemented yet.']
  }, provider);
}

module.exports = {
  getConfiguredResearchProviders,
  isResearchConfigured,
  buildPublicEvidenceResearchPrompt,
  normalizeResearchResult,
  parseStructuredOutput,
  runResearchProvider,
  providerLabel
};
