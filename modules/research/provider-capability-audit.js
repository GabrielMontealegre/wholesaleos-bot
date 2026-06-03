'use strict';

const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';
const GROQ_DEFAULT_MODEL = 'llama-3.1-70b-versatile';
const OPENROUTER_DEFAULT_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';
const OPENAI_DEFAULT_MODEL = 'gpt-4.1-mini';

const PROBE_QUERY = 'Find 3 public Dallas TX fixer upper or foreclosure property source pages with URLs. Return only source URLs and titles. Do not invent addresses.';

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function envEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function keyPresent(value) {
  return cleanText(value).length > 0;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function safeModel(value, fallback) {
  return cleanText(value || fallback);
}

function recognizedEnvNames() {
  return {
    gemini: ['ENABLE_GEMINI_WEB_RESEARCH', 'GEMINI_API_KEY', 'GEMINI_RESEARCH_MODEL', 'GEMINI_RESEARCH_MAX_RESULTS'],
    groq: ['ENABLE_GROQ_RESEARCH', 'GROQ_API_KEY', 'GROQ_RESEARCH_MODEL', 'GROQ_RESEARCH_MAX_RESULTS'],
    openrouter: ['ENABLE_OPENROUTER_RESEARCH', 'OPENROUTER_API_KEY', 'OPENROUTER_RESEARCH_MODEL', 'OPENROUTER_RESEARCH_MAX_RESULTS'],
    openai: ['ENABLE_OPENAI_WEB_RESEARCH', 'OPENAI_API_KEY', 'OPENAI_WEB_RESEARCH_MODEL', 'OPENAI_WEB_RESEARCH_MAX_RESULTS'],
    firecrawl: ['FIRECRAWL_API_KEY', 'ENABLE_FIRECRAWL_SEARCH', 'AI_DEAL_ANALYZER_FIRECRAWL_ENABLED'],
    brave: ['BRAVE_SEARCH_API_KEY', 'ENABLE_BRAVE_SEARCH'],
    fallback: ['ENABLE_STATIC_RESEARCH_FALLBACK']
  };
}

function extractGeminiGroundingUrls(response) {
  const candidates = Array.isArray(response && response.candidates) ? response.candidates : [];
  const urls = new Set();
  candidates.forEach((candidate) => {
    const metadata = candidate && candidate.groundingMetadata || candidate && candidate.grounding_metadata || {};
    const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
    chunks.forEach((chunk) => {
      const url = chunk && chunk.web && chunk.web.uri || chunk && chunk.retrievedContext && chunk.retrievedContext.uri || '';
      if (isHttpUrl(url)) urls.add(cleanText(url));
    });
    const supports = Array.isArray(metadata.groundingSupports) ? metadata.groundingSupports : [];
    supports.forEach((support) => {
      (Array.isArray(support && support.groundingChunkIndices) ? support.groundingChunkIndices : []).forEach((idx) => {
        const chunk = chunks[idx];
        const url = chunk && chunk.web && chunk.web.uri || '';
        if (isHttpUrl(url)) urls.add(cleanText(url));
      });
    });
  });
  return Array.from(urls);
}

async function fetchJson(url, body, headers, options) {
  options = options || {};
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Provider probe requires fetch support.');
  const timeoutMs = Math.min(Math.max(parseInt(options.timeout_ms || options.timeoutMs || 12000, 10) || 12000, 1000), 20000);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
    if (!response.ok) {
      const message = data && data.error && data.error.message ? data.error.message : `Provider probe failed with HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeGeminiGrounding(env, options) {
  env = env || process.env;
  options = options || {};
  const model = safeModel(env.GEMINI_RESEARCH_MODEL, GEMINI_DEFAULT_MODEL);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchJson(url, {
    contents: [{ parts: [{ text: PROBE_QUERY }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0, maxOutputTokens: 512 }
  }, {
    'x-goog-api-key': options.apiKey || env.GEMINI_API_KEY
  }, options);
  const urls = extractGeminiGroundingUrls(response);
  return {
    attempted: true,
    success: urls.length > 0,
    grounding_metadata_present: urls.length > 0 || !!(response && response.candidates && response.candidates[0] && response.candidates[0].groundingMetadata),
    source_urls_returned_count: urls.length
  };
}

function baseAudit(env) {
  env = env || process.env;
  const geminiKey = keyPresent(env.GEMINI_API_KEY);
  const geminiEnabled = envEnabled(env.ENABLE_GEMINI_WEB_RESEARCH);
  const groqKey = keyPresent(env.GROQ_API_KEY);
  const groqEnabled = envEnabled(env.ENABLE_GROQ_RESEARCH);
  const openrouterKey = keyPresent(env.OPENROUTER_API_KEY);
  const openrouterEnabled = envEnabled(env.ENABLE_OPENROUTER_RESEARCH);
  const openaiKey = keyPresent(env.OPENAI_API_KEY);
  const openaiEnabled = envEnabled(env.ENABLE_OPENAI_WEB_RESEARCH);
  const firecrawlKey = keyPresent(env.FIRECRAWL_API_KEY);
  const firecrawlEnabled = envEnabled(env.ENABLE_FIRECRAWL_SEARCH) || envEnabled(env.AI_DEAL_ANALYZER_FIRECRAWL_ENABLED);
  const braveKey = keyPresent(env.BRAVE_SEARCH_API_KEY);
  const braveEnabled = envEnabled(env.ENABLE_BRAVE_SEARCH);

  return {
    ok: true,
    safety: 'Provider capability diagnostics only; no API keys returned, no leads created, no analyzer jobs created.',
    recognized_env_names: recognizedEnvNames(),
    gemini_key_present: geminiKey,
    gemini_enabled: geminiEnabled,
    gemini_model: safeModel(env.GEMINI_RESEARCH_MODEL, GEMINI_DEFAULT_MODEL),
    gemini_google_search_supported_by_code: true,
    gemini_router_google_search_supported_by_code: false,
    gemini_live_probe_attempted: false,
    gemini_live_probe_success: false,
    gemini_grounding_metadata_present: false,
    gemini_source_urls_returned_count: 0,
    groq_key_present: groqKey,
    groq_enabled: groqEnabled,
    groq_model: safeModel(env.GROQ_RESEARCH_MODEL, GROQ_DEFAULT_MODEL),
    groq_has_native_web_search_by_code: false,
    openrouter_key_present: openrouterKey,
    openrouter_enabled: openrouterEnabled,
    openrouter_model: safeModel(env.OPENROUTER_RESEARCH_MODEL, OPENROUTER_DEFAULT_MODEL),
    openrouter_web_plugin_supported_by_code: false,
    openai_key_present: openaiKey,
    openai_enabled: openaiEnabled,
    openai_model: safeModel(env.OPENAI_WEB_RESEARCH_MODEL, OPENAI_DEFAULT_MODEL),
    openai_web_search_supported_by_code: true,
    firecrawl_key_present: firecrawlKey,
    firecrawl_enabled: firecrawlEnabled,
    firecrawl_search_layer_available: firecrawlKey && firecrawlEnabled,
    firecrawl_search_layer_supported_by_code: false,
    brave_key_present: braveKey,
    brave_enabled: braveEnabled,
    brave_search_layer_available: braveKey && braveEnabled,
    brave_search_layer_supported_by_code: false,
    recommended_provider_path: 'no_live_provider_configured',
    reason: ''
  };
}

function chooseRecommendation(audit) {
  if (audit.gemini_live_probe_success && audit.gemini_grounding_metadata_present && audit.gemini_source_urls_returned_count > 0) {
    return {
      recommended_provider_path: 'gemini_grounding_first',
      reason: 'Gemini Google Search grounding is usable for FindMe Scout public web discovery.'
    };
  }
  if (audit.gemini_key_present && !audit.gemini_enabled) {
    return {
      recommended_provider_path: 'no_live_provider_configured',
      reason: 'Gemini key may exist, but live Gemini research is disabled until ENABLE_GEMINI_WEB_RESEARCH=true.'
    };
  }
  if (audit.gemini_enabled && audit.gemini_key_present && !audit.gemini_live_probe_attempted) {
    return {
      recommended_provider_path: 'no_live_provider_configured',
      reason: 'Gemini appears enabled, but Google Search grounding has not been proven yet. Run the explicit provider capability probe before using it for Scout discovery.'
    };
  }
  if (audit.gemini_enabled && audit.gemini_key_present && audit.gemini_live_probe_attempted && !audit.gemini_live_probe_success) {
    return {
      recommended_provider_path: 'no_live_provider_configured',
      reason: 'Gemini is configured but Google Search grounding did not return usable source URLs.'
    };
  }
  if (audit.brave_key_present && audit.brave_enabled) {
    return {
      recommended_provider_path: 'brave_search_plus_groq_or_gemini',
      reason: 'Brave Search appears enabled by env, but the current repo does not yet have a direct Brave search execution layer.'
    };
  }
  if (audit.firecrawl_key_present && audit.firecrawl_enabled) {
    return {
      recommended_provider_path: 'firecrawl_plus_groq_or_gemini',
      reason: 'Firecrawl appears enabled by env, but the current repo does not yet have a direct Firecrawl search/extraction execution layer.'
    };
  }
  if (audit.openrouter_key_present && audit.openrouter_enabled && audit.openrouter_web_plugin_supported_by_code) {
    return {
      recommended_provider_path: 'openrouter_web_search',
      reason: 'OpenRouter web search is enabled and supported by code.'
    };
  }
  if (audit.openai_key_present && audit.openai_enabled) {
    return {
      recommended_provider_path: 'no_live_provider_configured',
      reason: 'OpenAI web research is supported for Analyzer comp research, but the requested Scout provider path still needs Gemini grounding or a search layer such as Brave/Firecrawl.'
    };
  }
  if (audit.groq_key_present && audit.groq_enabled) {
    return {
      recommended_provider_path: 'no_live_provider_configured',
      reason: 'Groq/Llama can analyze provided evidence, but the repo has no native Groq web search layer.'
    };
  }
  return {
    recommended_provider_path: 'no_live_provider_configured',
    reason: 'No live public web discovery provider is configured and enabled.'
  };
}

async function auditProviderCapabilities(options) {
  options = options || {};
  const env = options.env || process.env;
  const audit = baseAudit(env);
  if (options.probe === true && audit.gemini_enabled && audit.gemini_key_present) {
    try {
      const geminiProbe = await probeGeminiGrounding(env, options);
      audit.gemini_live_probe_attempted = geminiProbe.attempted;
      audit.gemini_live_probe_success = geminiProbe.success;
      audit.gemini_grounding_metadata_present = geminiProbe.grounding_metadata_present;
      audit.gemini_source_urls_returned_count = geminiProbe.source_urls_returned_count;
    } catch (error) {
      audit.gemini_live_probe_attempted = true;
      audit.gemini_live_probe_success = false;
      audit.gemini_grounding_metadata_present = false;
      audit.gemini_source_urls_returned_count = 0;
      audit.gemini_probe_error = cleanText(error && error.message ? error.message : 'Gemini probe failed.');
    }
  }
  return Object.assign(audit, chooseRecommendation(audit));
}

module.exports = {
  PROBE_QUERY,
  recognizedEnvNames,
  extractGeminiGroundingUrls,
  auditProviderCapabilities,
  probeGeminiGrounding
};
