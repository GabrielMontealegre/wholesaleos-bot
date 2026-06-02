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

function getConfig(env) {
  env = env || process.env;
  const enabled = envEnabled(env.ENABLE_OPENAI_WEB_RESEARCH);
  const hasKey = !!cleanText(env.OPENAI_API_KEY);
  const model = cleanText(env.OPENAI_WEB_RESEARCH_MODEL || 'gpt-4.1-mini');
  const maxResults = Math.min(Math.max(parseInt(env.OPENAI_WEB_RESEARCH_MAX_RESULTS || '6', 10) || 6, 1), 10);
  return { enabled, configured: enabled && hasKey, has_key: hasKey, model, max_results: maxResults };
}

function sourcePackFromJob(job) {
  const sourceEvidence = Array.isArray(job && job.source_evidence) ? job.source_evidence : [];
  return sourceEvidence.find((item) => item && item.type === 'source_evidence_pack') || null;
}

function buildEvidenceOnlyPrompt(job, options) {
  job = job || {};
  options = options || {};
  const pack = sourcePackFromJob(job) || {};
  const maxResults = options.max_results || 6;
  return [
    'Research this real estate lead using public web evidence only.',
    'Return JSON only. Do not include markdown.',
    '',
    'Hard rules:',
    '- Do not invent comps, ARV, MAO, owner, debt, DOM, listing history, sold price, auction amount, or source facts.',
    '- Every factual claim must include a citation/source_url.',
    '- Candidate comps are candidate only unless sold status, sold price, sold date, comp address, and source URL are all present.',
    '- Do not estimate ARV or MAO.',
    '- If evidence is missing, list it in missing_evidence.',
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
    'Return this exact JSON shape:',
    JSON.stringify({
      status: 'candidates_found | no_candidates_found | failed',
      subject: { normalized_address: '', source_url: '', property_identity_status: '' },
      property_evidence: [{ label: '', value: '', source_url: '', confidence: 0 }],
      source_evidence: [{ label: '', value: '', source_url: '', confidence: 0 }],
      comp_candidates: [{
        comp_address: '',
        sold_status: 'sold',
        sold_price: null,
        sold_date: '',
        beds: null,
        baths: null,
        sqft: null,
        distance_miles: null,
        source_url: '',
        source_label: '',
        confidence: 0,
        verification_status: 'candidate',
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

function extractOutputText(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string') return response.output_text;
  const chunks = [];
  const output = Array.isArray(response.output) ? response.output : [];
  output.forEach((item) => {
    const content = Array.isArray(item && item.content) ? item.content : [];
    content.forEach((part) => {
      if (typeof part.text === 'string') chunks.push(part.text);
      if (typeof part.output_text === 'string') chunks.push(part.output_text);
    });
  });
  return chunks.join('\n').trim();
}

function stripJsonFence(text) {
  text = String(text || '').trim();
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
    beds: candidate.beds == null ? null : candidate.beds,
    baths: candidate.baths == null ? null : candidate.baths,
    sqft: candidate.sqft == null ? null : candidate.sqft,
    distance_miles: candidate.distance_miles == null ? null : candidate.distance_miles,
    source_url: cleanText(candidate.source_url || candidate.url),
    source_label: cleanText(candidate.source_label || candidate.source || 'Public web evidence'),
    confidence: numberValue(candidate.confidence),
    verification_status: cleanText(candidate.verification_status || 'candidate').toLowerCase(),
    missing_fields: Array.isArray(candidate.missing_fields) ? candidate.missing_fields.map(cleanText).filter(Boolean) : [],
    notes: Array.isArray(candidate.notes) ? candidate.notes.map(cleanText).filter(Boolean) : []
  };
}

function normalizeResearchResult(result) {
  result = result || {};
  const candidates = (Array.isArray(result.comp_candidates) ? result.comp_candidates : [])
    .map(normalizeCompCandidate)
    .filter((candidate) => candidate.comp_address || candidate.source_url || candidate.sold_price || candidate.sold_date);
  const citations = (Array.isArray(result.citations) ? result.citations : [])
    .map((citation) => ({ title: cleanText(citation && citation.title), url: cleanText(citation && (citation.url || citation.source_url)) }))
    .filter((citation) => isHttpUrl(citation.url));
  return {
    provider: 'openai_web_research',
    status: cleanText(result.status || (candidates.length ? 'candidates_found' : 'no_candidates_found')),
    subject: result.subject || {},
    property_evidence: normalizeEvidenceList(result.property_evidence),
    source_evidence: normalizeEvidenceList(result.source_evidence),
    comp_candidates: candidates,
    missing_evidence: Array.isArray(result.missing_evidence) ? result.missing_evidence.map(cleanText).filter(Boolean) : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.map(cleanText).filter(Boolean) : [],
    citations,
    raw_summary: cleanText(result.raw_summary)
  };
}

function parseStructuredOutput(text) {
  if (!cleanText(text)) {
    return normalizeResearchResult({
      status: 'failed',
      missing_evidence: ['Structured research output'],
      warnings: ['OpenAI web research returned no structured output.']
    });
  }
  try {
    return normalizeResearchResult(JSON.parse(stripJsonFence(text)));
  } catch (error) {
    return normalizeResearchResult({
      status: 'failed',
      missing_evidence: ['Structured research output'],
      warnings: ['OpenAI web research output could not be parsed as JSON.'],
      raw_summary: String(text || '').slice(0, 1200)
    });
  }
}

function extractAnnotations(response) {
  const citations = [];
  const output = Array.isArray(response && response.output) ? response.output : [];
  output.forEach((item) => {
    const content = Array.isArray(item && item.content) ? item.content : [];
    content.forEach((part) => {
      const annotations = Array.isArray(part && part.annotations) ? part.annotations : [];
      annotations.forEach((annotation) => {
        const url = cleanText(annotation && (annotation.url || annotation.uri));
        if (isHttpUrl(url)) citations.push({ title: cleanText(annotation.title), url });
      });
    });
  });
  return citations;
}

async function fetchResponsesApi(body, options) {
  options = options || {};
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('OpenAI web research requires a runtime with fetch support.');
  }
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey || process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : `OpenAI web research failed with HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function runOpenAIWebResearch(job, options) {
  options = options || {};
  const env = options.env || process.env;
  const config = getConfig(env);
  if (!config.enabled) {
    return normalizeResearchResult({
      status: 'not_configured',
      missing_evidence: ['Configured OpenAI web research provider'],
      raw_summary: 'OpenAI web research is disabled.'
    });
  }
  if (!config.has_key && !options.apiKey) {
    return normalizeResearchResult({
      status: 'failed',
      missing_evidence: ['OpenAI API key'],
      warnings: ['OpenAI web research is enabled but no API key is configured.']
    });
  }
  if (options.mockResponse) return normalizeResearchResult(options.mockResponse);

  const prompt = buildEvidenceOnlyPrompt(job, config);
  const body = {
    model: config.model,
    store: false,
    tools: [{ type: 'web_search_preview' }],
    input: [
      {
        role: 'system',
        content: 'You are an evidence-first real estate research assistant. Return only cited facts in the requested JSON shape. Never invent missing values.'
      },
      { role: 'user', content: prompt }
    ]
  };
  const response = await fetchResponsesApi(body, options);
  const parsed = parseStructuredOutput(extractOutputText(response));
  const seen = new Set(parsed.citations.map((citation) => citation.url));
  extractAnnotations(response).forEach((citation) => {
    if (!seen.has(citation.url)) {
      seen.add(citation.url);
      parsed.citations.push(citation);
    }
  });
  return parsed;
}

module.exports = {
  getConfig,
  buildEvidenceOnlyPrompt,
  runOpenAIWebResearch,
  parseStructuredOutput,
  normalizeResearchResult
};
