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
    '- A verified sold comp may be reported only when comp address, sold/closed status, sold price, sold date, and source URL are present.',
    '- Active, pending, list price, estimate, rent, auction, or unclear records must be marked as market support only, not verified sold comps.',
    '- Generic portals, homepages, search pages, and broad market pages are not sold-comp proof.',
    '- Candidate comps do not unlock ARV or MAO.',
    '- Do not estimate ARV or MAO.',
    '- If evidence is missing, list it in missing_evidence.',
    '- Prefer nearby, recent, similar residential sold records. If proximity, similarity, or recency is not visible, mark it missing.',
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
    '- Find public sold/closed comparable sales near the subject address.',
    '- Return market/listing support separately when sold evidence is not complete.',
    '- Rank exact sold records with address, sold price, sold date, and source URL first.',
    '',
    'Return this exact JSON shape:',
    JSON.stringify({
      status: 'candidates_found | no_candidates_found | failed',
      subject: { normalized_address: '', source_url: '', property_identity_status: '' },
      property_evidence: [{ label: '', value: '', source_url: '', confidence: 0 }],
      source_evidence: [{ label: '', value: '', source_url: '', confidence: 0 }],
      comp_results: [{
        comp_address: '',
        sold_status: 'sold | active | pending | unknown',
        sold_price: null,
        sold_date: '',
        listing_status: '',
        beds: null,
        baths: null,
        sqft: null,
        distance_miles: null,
        source_url: '',
        source_title: '',
        source_type: 'sold_record | listing_page | market_page | estimate | unknown',
        source_label: '',
        confidence: 0,
        verification_status: 'candidate | market_support | not_usable',
        why_included: '',
        missing_fields: [],
        notes: []
      }],
      missing_evidence: [],
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
  return {
    comp_address: cleanText(candidate.comp_address || candidate.address),
    sold_status: cleanText(candidate.sold_status || candidate.status || 'candidate').toLowerCase(),
    sold_price: numberValue(candidate.sold_price || candidate.sale_price),
    sold_date: cleanText(candidate.sold_date || candidate.sale_date || candidate.closed_date),
    listing_status: cleanText(candidate.listing_status || candidate.list_status),
    beds: candidate.beds == null ? null : candidate.beds,
    baths: candidate.baths == null ? null : candidate.baths,
    sqft: candidate.sqft == null ? null : candidate.sqft,
    distance_miles: candidate.distance_miles == null ? null : candidate.distance_miles,
    source_url: cleanText(candidate.source_url || candidate.url),
    source_title: cleanText(candidate.source_title || candidate.title),
    source_type: cleanText(candidate.source_type || candidate.record_type || candidate.source_kind),
    source_label: cleanText(candidate.source_label || candidate.source || 'Public web evidence'),
    confidence: numberValue(candidate.confidence),
    verification_status: cleanText(candidate.verification_status || 'candidate').toLowerCase(),
    why_included: cleanText(candidate.why_included || candidate.notes_summary || candidate.reason),
    missing_fields: Array.isArray(candidate.missing_fields) ? candidate.missing_fields.map(cleanText).filter(Boolean) : [],
    notes: Array.isArray(candidate.notes) ? candidate.notes.map(cleanText).filter(Boolean) : []
  };
}

function normalizeResearchResult(result, provider) {
  result = result || {};
  provider = provider || {};
  const rawCandidates = Array.isArray(result.comp_results)
    ? result.comp_results
    : Array.isArray(result.comp_candidates)
      ? result.comp_candidates
      : [];
  const candidates = rawCandidates
    .map(normalizeCompCandidate)
    .filter((candidate) => candidate.comp_address || candidate.source_url || candidate.sold_price || candidate.sold_date);
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
    warnings: Array.isArray(result.warnings) ? result.warnings.map(cleanText).filter(Boolean) : [],
    citations,
    raw_summary: cleanText(result.raw_summary),
    created_at: cleanText(result.created_at) || new Date().toISOString()
  };
}

function parseStructuredOutput(text, provider) {
  if (!cleanText(text)) {
    return normalizeResearchResult({
      status: 'failed',
      missing_evidence: ['Structured research output'],
      warnings: ['Research provider returned no structured output.']
    }, provider);
  }
  try {
    return normalizeResearchResult(JSON.parse(extractJsonText(text)), provider);
  } catch (error) {
    return normalizeResearchResult({
      status: 'failed',
      missing_evidence: ['Structured research output'],
      warnings: ['Research provider output could not be parsed as JSON.'],
      raw_summary: String(text || '').slice(0, 1200)
    }, provider);
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`;
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
  return mergeCitations(parseStructuredOutput(extractGeminiText(data), provider), extractGeminiCitations(data));
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
