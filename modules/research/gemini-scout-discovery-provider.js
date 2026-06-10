'use strict';

const crypto = require('crypto');

const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';
const MAX_DISCOVERY_RESULTS = 50;
const GEMINI_TRANSIENT_PATTERN = /\b(high demand|try again later|overloaded|rate limit|resource exhausted|unavailable|temporarily unavailable|busy)\b/i;
const GEMINI_TIMEOUT_PATTERN = /\b(abort|aborted|aborterror|timed out|timeout|deadline exceeded|operation was aborted)\b/i;

function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

function safeLower(value) {
  return cleanText(value).toLowerCase();
}

function envEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function classifyGeminiError(error) {
  const message = cleanText(error && error.message ? error.message : '');
  const status = Number(error && (error.status || error.statusCode || error.code) || 0);
  const timedOut = status === 408 || status === 504 || GEMINI_TIMEOUT_PATTERN.test(message);
  const retryable = status === 429 || status === 503 || GEMINI_TRANSIENT_PATTERN.test(message);
  if (timedOut) {
    return {
      retryable: true,
      status: 'timed_out',
      message: 'Gemini live discovery timed out before returning candidates. Try again, reduce batch size, or use saved-leads mode.'
    };
  }
  return {
    retryable,
    status: retryable ? 'temporarily_unavailable' : 'failed',
    message: retryable
      ? 'Gemini live discovery is temporarily busy. Showing saved leads/candidates only. Try again in a few minutes.'
      : cleanText(error && error.message ? error.message : 'Gemini Live Discovery failed. Deal Finder used saved leads mode only.')
  };
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(cleanText(value));
}

function uniqueList(values) {
  const seen = new Set();
  const out = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const item = cleanText(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(cleanText(value)).digest('hex').slice(0, 16)}`;
}

function geminiConfig(env = process.env) {
  const keyPresent = !!cleanText(env.GEMINI_API_KEY);
  const enabled = envEnabled(env.ENABLE_GEMINI_WEB_RESEARCH);
  return {
    configured: keyPresent && enabled,
    key_present: keyPresent,
    enabled,
    model: cleanText(env.GEMINI_RESEARCH_MODEL || GEMINI_DEFAULT_MODEL),
    status: keyPresent && enabled ? 'available' : 'not_configured',
    message: keyPresent && !enabled
      ? 'Gemini key may exist, but live Gemini research is disabled until ENABLE_GEMINI_WEB_RESEARCH=true.'
      : keyPresent && enabled
        ? 'Gemini Live Discovery is available.'
        : 'Gemini Live Discovery is not configured.'
  };
}

function strategyLabels(strategies) {
  const labels = {
    fixer: 'ugly/as-is/fixer',
    ugly: 'ugly/as-is/fixer',
    as_is: 'ugly/as-is/fixer',
    pre_foreclosure: 'pre-foreclosure',
    foreclosure_notice: 'foreclosure/trustee notice',
    trustee_notice: 'foreclosure/trustee notice',
    tax_foreclosure: 'tax foreclosure/tax sale',
    tax_sale: 'tax foreclosure/tax sale',
    tax_delinquent: 'tax delinquent/tax lien',
    tax_lien: 'tax delinquent/tax lien',
    price_cut: 'price cut',
    long_dom: 'long DOM / stale listing',
    stale_listing: 'long DOM / stale listing',
    code_violation: 'code violation',
    auction_soon: 'auction soon',
    auction_public: 'auction/public auction listings',
    public_auction: 'auction/public auction listings',
    investor_special: 'investor special',
    cash_only: 'cash only',
    fsbo: 'FSBO',
    failed_listing: 'failed listing / relisted',
    relisted: 'failed listing / relisted',
    back_on_market: 'back on market',
    bank_owned: 'bank-owned / REO',
    reo: 'bank-owned / REO',
    vacant_absentee: 'vacant/absentee if evidence exists'
  };
  return uniqueList((Array.isArray(strategies) ? strategies : []).map((strategy) => labels[strategy] || cleanText(strategy).replace(/_/g, ' ')));
}

function marketSearchTerms(job) {
  const market = cleanText(job && job.market);
  const state = cleanText(job && job.state);
  const county = cleanText(job && job.county);
  const city = cleanText(job && job.city);
  const zip = cleanText(job && job.zip);
  const location = cleanText(job && job.location);
  const base = location || [city, county, state || market, zip].filter(Boolean).join(', ') || market || 'Dallas County, TX';
  const cityStateSeed = [city || base, state || (/\btexas\b|\btx\b/i.test(base) ? 'TX' : '')].filter(Boolean).join(' ');
  const cityState = /\bdallas\b/i.test(cityStateSeed) && !/\btx\b|\btexas\b/i.test(cityStateSeed)
    ? `${cityStateSeed} TX`
    : cityStateSeed;
  return {
    base,
    city_state: cityState,
    county: county || base,
    state,
    city,
    zip
  };
}

function isTexasMarket(job, terms) {
  const text = [job && job.market, job && job.location, job && job.state, terms && terms.base, terms && terms.city_state].map(cleanText).join(' ');
  return /\bTX\b|\bTexas\b|\bDallas\b/i.test(text);
}

function marketListingPath(job, site) {
  const location = cleanText(job && job.location) || cleanText(job && job.market);
  const lower = location.toLowerCase();
  if (/\bdallas\b/.test(lower)) {
    if (site === 'redfin') return 'site:redfin.com/TX/Dallas';
    if (site === 'realtor') return 'site:realtor.com/realestateandhomes-detail';
    if (site === 'zillow') return 'site:zillow.com/homedetails';
    if (site === 'auction') return 'site:auction.com/details';
    if (site === 'realauction') return 'site:realauction.com';
  }
  if (site === 'redfin') return 'site:redfin.com';
  if (site === 'realtor') return 'site:realtor.com/realestateandhomes-detail';
  if (site === 'zillow') return 'site:zillow.com/homedetails';
  if (site === 'auction') return 'site:auction.com/details';
  if (site === 'realauction') return 'site:realauction.com';
  return '';
}

function buildSearchQueryTemplates(job) {
  const terms = marketSearchTerms(job);
  const selected = new Set(Array.isArray(job && job.strategies) ? job.strategies : []);
  const texasMarket = isTexasMarket(job, terms);
  const queries = [];
  function add(query) {
    const text = cleanText(query);
    if (text) queries.push(text);
  }
  if (selected.has('fixer') || selected.has('ugly') || selected.has('as_is') || selected.has('investor_special') || selected.has('cash_only')) {
    add(`${marketListingPath(job, 'redfin')} ${terms.city_state} fixer upper house`);
    add(`${marketListingPath(job, 'realtor')} ${terms.city_state} as-is`);
    add(`${marketListingPath(job, 'zillow')} ${terms.city_state} fixer upper`);
    if (texasMarket) add(`site:har.com/homedetail ${terms.city_state} fixer upper house`);
    add(`site:redfin.com ${terms.city_state} fixer upper house`);
    add(`site:realtor.com ${terms.city_state} as is house for sale`);
    add(`site:zillow.com ${terms.city_state} fixer upper house`);
    add(`site:realtor.com/realestateandhomes-detail ${terms.city_state} investor special`);
    if (texasMarket) add(`site:har.com/homedetail ${terms.city_state} as-is house`);
    add(`${terms.city_state} "investor special" house for sale`);
    add(`${terms.city_state} "cash only" house for sale`);
    add(`${terms.city_state} "needs TLC" "for sale"`);
  }
  if (selected.has('fsbo')) {
    add(`${terms.city_state} "for sale by owner" house`);
    add(`${terms.city_state} FSBO fixer house`);
  }
  if (selected.has('failed_listing') || selected.has('relisted') || selected.has('back_on_market')) {
    add(`${terms.city_state} "back on market" house`);
    add(`${terms.city_state} "relisted" "for sale" house`);
    add(`${terms.city_state} "expired listing" house`);
  }
  if (selected.has('auction_public') || selected.has('public_auction') || selected.has('auction_soon') || selected.has('bank_owned') || selected.has('reo')) {
    add(`${marketListingPath(job, 'auction')} ${terms.city_state} auction property`);
    add(`site:auction.com ${terms.city_state} foreclosure auction property`);
    add(`site:auction.com/details ${terms.city_state} auction property`);
    add(`${marketListingPath(job, 'realauction')} ${terms.city_state} foreclosure auction property`);
    add(`site:realauction.com ${terms.county} auction property address`);
    add(`site:hubzu.com ${terms.city_state} auction property`);
    add(`${terms.city_state} foreclosure auction property`);
    add(`${terms.city_state} public auction house`);
    add(`${terms.city_state} bank owned REO house`);
  }
  if (selected.has('foreclosure_notice') || selected.has('trustee_notice') || selected.has('pre_foreclosure')) {
    add(`${terms.county} trustee sale notice property`);
    add(`${terms.county} foreclosure notice property address`);
    add(`${terms.county} sheriff sale property`);
  }
  if (selected.has('tax_foreclosure') || selected.has('tax_sale') || selected.has('tax_delinquent') || selected.has('tax_lien')) {
    add(`${terms.county} tax foreclosure property`);
    add(`${terms.county} struck off resale property`);
  }
  if (selected.has('price_cut') || selected.has('long_dom') || selected.has('stale_listing')) {
    add(`${terms.city_state} "as-is" "price reduced" house`);
    add(`${terms.city_state} "motivated seller" house for sale`);
  }
  if (!queries.length) {
    add(`${marketListingPath(job, 'redfin')} ${terms.city_state} fixer upper house`);
    add(`${marketListingPath(job, 'realtor')} ${terms.city_state} as-is`);
    add(`${marketListingPath(job, 'zillow')} ${terms.city_state} fixer upper`);
    if (texasMarket) add(`site:har.com/homedetail ${terms.city_state} as-is house`);
    add(`${marketListingPath(job, 'auction')} ${terms.city_state} auction property`);
    add(`${terms.county} trustee sale notice property`);
    add(`${terms.county} tax foreclosure property`);
  }
  return uniqueList(queries).slice(0, 12);
}

function buildDiscoveryPrompt(job, requestedCount) {
  const location = cleanText(job.location) || cleanText(job.market) || 'Dallas County, TX';
  const count = Math.max(1, Math.min(parseInt(requestedCount || job.batch_size || 10, 10) || 10, MAX_DISCOVERY_RESULTS));
  const strategies = strategyLabels(job.strategies);
  const queries = buildSearchQueryTemplates(job);
  return [
    'You are helping a real estate acquisition operator find public, source-cited candidate properties.',
    `Market/location: ${location}.`,
    `Strategies: ${strategies.join(', ') || 'distressed property opportunities'}.`,
    `Return up to ${count} candidates, ranked strongest to weakest.`,
    '',
    'Use these search query starting points as a two-pass search plan. Pass A: property/listing pages. Pass B: official/auction/distress sources. Prefer exact property pages over broad result pages:',
    queries.map((query) => `- ${query}`).join('\n'),
    '',
    'Prefer exact property pages, listing/property URLs, official property notices/documents, auction property detail pages, RealAuction public property pages, Realtor detail pages, Redfin /home pages, Zillow homedetails pages, and HAR homedetail pages only for Texas markets.',
    'Avoid homepages, generic search pages, category pages, broad city pages, blog posts, SEO pages, and pages with no visible address.',
    '',
    'Hard rules:',
    '- Return only candidate properties or property-specific source pages with source URLs.',
    '- Do not invent addresses, owner names, debt, DOM, auction amounts, tax amounts, sold prices, listing history, phone, email, ARV, or MAO.',
    '- If a field is not visible from the public source, set it to an empty string or say not verified.',
    '- Do not use Foreclosure.com as a source.',
    '- Do not use login, paywall, CAPTCHA, or subscription-only pages.',
    '- Auction.com, RealAuction, Hubzu, or marketplace pages are candidate discovery only, not official proof.',
    '- Equity, hedge fund demand, ARV, and MAO are not verified here.',
    '',
    'Respond as JSON only with this shape:',
    JSON.stringify({
      candidates: [{
        candidate_title: '',
        address: '',
        city: '',
        state: '',
        county: '',
        source_url: '',
        source_title: '',
        source_type: '',
        strategy_match: [],
        distress_signals: [],
        visible_price_or_bid: '',
        auction_date_or_timing: '',
        listing_status: '',
        evidence_snippet: '',
        why_it_might_be_deal: '',
        missing_evidence: [],
        risk_flags: [],
        confidence: '',
        suggested_next_action: '',
        call_angle: ''
      }],
      warnings: []
    }, null, 2)
  ].join('\n');
}

function extractGeminiText(response) {
  const parts = response && response.candidates && response.candidates[0] &&
    response.candidates[0].content && Array.isArray(response.candidates[0].content.parts)
    ? response.candidates[0].content.parts
    : [];
  return parts.map((part) => cleanText(part && part.text)).filter(Boolean).join('\n');
}

function sourceKey(url) {
  try {
    const parsed = new URL(cleanText(url));
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '').toLowerCase();
  } catch (error) {
    return cleanText(url).replace(/\/$/, '').toLowerCase();
  }
}

function mergeSource(list, item) {
  const url = cleanText(item && (item.url || item.uri || item.source_url || item.sourceUrl));
  if (!isHttpUrl(url)) return;
  const key = sourceKey(url);
  if (!key) return;
  const existing = list.find((candidate) => candidate.key === key);
  const title = cleanText(item && (item.title || item.source_title || item.sourceTitle));
  const evidence = cleanText(item && (item.evidence || item.text || item.snippet));
  if (existing) {
    if (!existing.title && title) existing.title = title;
    if (!existing.evidence && evidence) existing.evidence = evidence;
    return;
  }
  list.push({
    key,
    url,
    title,
    evidence,
    harvest_source: cleanText(item && item.harvest_source) || 'source_url'
  });
}

function extractGroundingSources(response) {
  const candidates = Array.isArray(response && response.candidates) ? response.candidates : [];
  const sources = [];
  candidates.forEach((candidate) => {
    const metadata = candidate && (candidate.groundingMetadata || candidate.grounding_metadata) || {};
    const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
    chunks.forEach((chunk) => {
      const web = chunk && chunk.web || {};
      const retrieved = chunk && chunk.retrievedContext || chunk && chunk.retrieved_context || {};
      mergeSource(sources, {
        url: web.uri || retrieved.uri || '',
        title: web.title || retrieved.title || '',
        harvest_source: 'grounding_chunk'
      });
    });
    const supports = Array.isArray(metadata.groundingSupports) ? metadata.groundingSupports
      : Array.isArray(metadata.grounding_supports) ? metadata.grounding_supports
        : [];
    supports.forEach((support) => {
      const segment = support && support.segment || {};
      const indexes = Array.isArray(support && support.groundingChunkIndices) ? support.groundingChunkIndices
        : Array.isArray(support && support.grounding_chunk_indices) ? support.grounding_chunk_indices
          : [];
      indexes.forEach((idx) => {
        const chunk = chunks[idx] || {};
        const web = chunk.web || {};
        const retrieved = chunk.retrievedContext || chunk.retrieved_context || {};
        mergeSource(sources, {
          url: web.uri || retrieved.uri || '',
          title: web.title || retrieved.title || '',
          evidence: segment.text || '',
          harvest_source: 'grounding_support'
        });
      });
    });
  });
  return sources;
}

function extractGroundingUrls(response) {
  return extractGroundingSources(response).map((source) => source.url).filter(isHttpUrl);
}

function extractTextSources(text) {
  const sources = [];
  uniqueList(String(text || '').match(/https?:\/\/[^\s"'<>),]+/gi) || []).forEach((url) => {
    mergeSource(sources, { url, harvest_source: 'response_text' });
  });
  return sources;
}

function collectSourcesFromValue(value, sources) {
  if (!value) return;
  if (typeof value === 'string') {
    if (isHttpUrl(value)) mergeSource(sources, { url: value, harvest_source: 'parsed_json' });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSourcesFromValue(item, sources));
    return;
  }
  if (typeof value === 'object') {
    const url = value.source_url || value.sourceUrl || value.url || value.uri || value.link || '';
    if (isHttpUrl(url)) {
      mergeSource(sources, {
        url,
        title: value.source_title || value.sourceTitle || value.title || '',
        evidence: value.evidence_snippet || value.snippet || value.summary || '',
        harvest_source: 'parsed_json'
      });
    }
    Object.keys(value).forEach((key) => {
      if (!/url|uri|link|source|citation/i.test(key)) return;
      collectSourcesFromValue(value[key], sources);
    });
  }
}

function harvestProviderSources(response, text, parsedCandidates) {
  const sources = [];
  extractGroundingSources(response).forEach((source) => mergeSource(sources, source));
  extractTextSources(text).forEach((source) => mergeSource(sources, source));
  collectSourcesFromValue(parsedCandidates, sources);
  return sources.filter((source) => isHttpUrl(source.url));
}

function isGoogleGroundingRedirectUrl(url) {
  const hp = hostAndPath(url);
  return /vertexaisearch\.cloud\.google\.com$/i.test(hp.host) && /grounding-api-redirect/i.test(hp.path);
}

async function resolveGroundingSourceUrl(source, options) {
  const url = cleanText(source && source.url);
  if (!isHttpUrl(url)) return Object.assign({}, source);
  const canonical = canonicalizeSourceUrl(url);
  if (!canonical.is_google_redirect_like) {
    return Object.assign({}, source, {
      url: canonical.canonical_url || url,
      canonical_url: canonical.canonical_url || url,
      original_url: canonical.original_url || url,
      canonicalized: canonical.canonicalized === true,
      canonicalization_source: canonical.canonicalization_source || 'original',
      canonicalization_note: canonical.canonicalization_note || ''
    });
  }
  if (canonical.canonicalized && canonical.canonical_url && canonical.canonical_url !== url) {
    return Object.assign({}, source, {
      url: canonical.canonical_url,
      canonical_url: canonical.canonical_url,
      original_url: canonical.original_url || url,
      canonicalized: true,
      canonicalization_source: canonical.canonicalization_source || 'query_param',
      canonicalization_note: canonical.canonicalization_note || 'Source URL was canonicalized from redirect query parameters.'
    });
  }
  const fetchImpl = options && options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    return Object.assign({}, source, {
      url,
      canonical_url: canonical.canonical_url || url,
      original_url: canonical.original_url || url,
      canonicalized: canonical.canonicalized === true,
      canonicalization_source: canonical.canonicalization_source || 'redirect_like',
      canonicalization_note: canonical.canonicalization_note || 'Google grounding redirect did not yield an extractable target URL.'
    });
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = Math.min(Math.max(parseInt(options && (options.timeout_ms || options.timeoutMs) || 3500, 10) || 3500, 1000), 5000);
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller ? controller.signal : undefined
    });
    const finalUrl = cleanText(response && response.url);
    if (isHttpUrl(finalUrl) && !isGoogleRedirectLikeUrl(finalUrl)) {
      return Object.assign({}, source, {
        url: stripTrackingParams(finalUrl),
        canonical_url: stripTrackingParams(finalUrl),
        resolved_url: stripTrackingParams(finalUrl),
        resolved_from_grounding_redirect: true,
        original_url: url,
        canonicalized: true,
        canonicalization_source: 'redirect_follow',
        canonicalization_note: 'Source URL was canonicalized from Gemini/Google grounding result.'
      });
    }
  } catch (error) {
    return Object.assign({}, source, {
      resolve_error: cleanText(error && error.message),
      original_url: url,
      canonical_url: url,
      canonicalization_note: cleanText(error && error.message)
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
  return Object.assign({}, source, {
    url,
    canonical_url: url,
    original_url: url,
    canonicalized: false,
    canonicalization_source: 'redirect_like',
    canonicalization_note: 'Google grounding redirect did not yield an extractable target URL.'
  });
}

function groundingPresent(response) {
  const candidate = response && response.candidates && response.candidates[0] || null;
  return !!(candidate && (candidate.groundingMetadata || candidate.grounding_metadata));
}

function extractJsonText(text) {
  text = String(text || '').trim();
  if (!text) return '';
  if (/^```/i.test(text)) text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const firstObject = text.indexOf('{');
  const lastObject = text.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) return text.slice(firstObject, lastObject + 1);
  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) return text.slice(firstArray, lastArray + 1);
  return text;
}

function parseProviderCandidates(text, groundingUrls) {
  try {
    const parsed = JSON.parse(extractJsonText(text));
    if (Array.isArray(parsed)) return { candidates: parsed, warnings: [] };
    return {
      candidates: Array.isArray(parsed && parsed.candidates) ? parsed.candidates : [],
      warnings: Array.isArray(parsed && parsed.warnings) ? parsed.warnings.map(cleanText).filter(Boolean) : []
    };
  } catch (error) {
    const urls = uniqueList((String(text || '').match(/https?:\/\/[^\s"'<>),]+/gi) || []).concat(groundingUrls || []));
    return {
      candidates: urls.map((url, idx) => ({
        candidate_title: `Public source result ${idx + 1}`,
        source_url: url,
        source_title: '',
        source_type: '',
        address: '',
        strategy_match: [],
        distress_signals: [],
        why_it_might_be_deal: 'Gemini returned a source URL, but not enough structured property detail.',
        missing_evidence: ['structured property details'],
        risk_flags: ['provider output was not valid JSON'],
        confidence: 'Low',
        suggested_next_action: 'Open the source and verify whether it is property-specific before outreach.',
        call_angle: 'Verify source evidence before calling.'
      })),
      warnings: ['Gemini output could not be parsed as JSON; using source URLs only.']
    };
  }
}

function inferSignalsFromSource(source, context) {
  const text = `${cleanText(source && source.title)} ${cleanText(source && source.url)} ${cleanText(source && source.evidence)} ${(context && context.strategy_labels || []).join(' ')}`.toLowerCase();
  const signals = [];
  if (/\b(fixer|needs[-\s]?tlc|as[-\s]?is|cash[-\s]?only|investor[-\s]?special|repair)\b/i.test(text)) signals.push('fixer/as-is signal from source text');
  if (/\b(foreclos|trustee|pre[-\s]?foreclosure)\b/i.test(text)) signals.push('foreclosure/trustee signal from source text');
  if (/\b(tax[-\s]?sale|tax[-\s]?foreclosure|struck[-\s]?off|resale)\b/i.test(text)) signals.push('tax foreclosure/tax sale signal from source text');
  if (/\bauction\b/i.test(text)) signals.push('public auction signal from source text');
  if (/\b(price[-\s]?reduced|price[-\s]?cut|motivated)\b/i.test(text)) signals.push('price cut/motivation signal from source text');
  return uniqueList(signals);
}

function displayTitleFromSource(source, classification) {
  const title = cleanText(source && source.title);
  if (title) return title;
  try {
    const canonical = canonicalizeSourceUrl(source && (source.canonical_url || source.url));
    if (canonical.is_google_redirect_like && !canonical.canonicalized) return sourceClassificationLabel(classification);
    const parsed = new URL(cleanText(canonical.canonical_url || source && source.url));
    const path = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/[-_]+/g, ' ');
    return cleanText(path) || sourceClassificationLabel(classification);
  } catch (error) {
    return sourceClassificationLabel(classification);
  }
}

function candidateFromHarvestedSource(source, context) {
  const sourceUrlOriginal = cleanText(source.original_url || source.source_url_original || source.url);
  const canonical = canonicalizeSourceUrl(source.canonical_url || source.url);
  const sourceUrl = cleanText(canonical.canonical_url || source.canonical_url || source.url);
  const classification = classifySourceUrl(sourceUrl, source.title, source.evidence);
  const title = displayTitleFromSource(source, classification);
  const sourceType = classifySourceType(sourceUrl, classification);
  const identity = extractPropertyIdentityFromSourceUrl(sourceUrl, source.title, classification);
  const signals = inferSignalsFromSource(source, context);
  const generic = sourceClassificationIsGeneric(classification);
  const propertySpecific = sourceClassificationIsPropertySpecific(classification);
  if (classification === 'generic_homepage' || classification === 'broad_article_or_blog') return null;
  return {
    candidate_title: title || 'Gemini source URL needs review',
    address: identity.normalized_address || identity.address || '',
    property_address: identity.normalized_address || identity.address || '',
    display_address: identity.normalized_address || identity.address || '',
    city: identity.city || '',
    state: identity.state || '',
    zip: identity.zip || '',
    county: '',
    source_url: sourceUrl,
    source_url_original: sourceUrlOriginal,
    source_url_canonicalized: canonical.canonicalized === true || (sourceUrlOriginal && sourceUrlOriginal !== sourceUrl),
    canonical_source_url: sourceUrl,
    source_url_canonicalization_source: canonical.canonicalization_source || source.canonicalization_source || 'original',
    source_url_canonicalization_note: canonical.canonicalization_note || source.canonicalization_note || '',
    source_title: title,
    source_type: sourceType,
    property_identity: identity,
    strategy_match: context && context.strategy_labels || [],
    distress_signals: signals,
    visible_price_or_bid: '',
    auction_date_or_timing: '',
    listing_status: '',
    evidence_snippet: cleanText(source.evidence) || 'Gemini grounding returned this public source URL.',
    why_it_might_be_deal: propertySpecific
      ? 'Gemini grounding returned a property-specific public source URL. Verify the visible address and source details before outreach.'
      : generic
        ? 'Gemini grounding returned a broad listing/search source. It may help discovery, but it is not exact property proof.'
        : 'Gemini grounding returned a public source URL that needs property/source verification.',
    missing_evidence: uniqueList([
      propertySpecific ? 'verified visible property address' : 'property-specific source URL',
      'source page details',
      sourceType === 'auction_marketplace' || sourceType === 'listing_marketplace' ? 'official/property source verification' : '',
      sourceType === 'auction_marketplace' || sourceType === 'listing_marketplace' ? 'equity not verified' : '',
      sourceType === 'auction_marketplace' || sourceType === 'listing_marketplace' ? 'ARV/MAO not verified' : ''
    ].filter(Boolean)),
    risk_flags: uniqueList([
      'created from Gemini source URL',
      classification === 'auction_property_page' || classification === 'auction_search_page' ? 'auction marketplace candidate only' : '',
      classification === 'listing_property_page' || classification === 'listing_search_page' ? 'listing marketplace candidate only' : '',
      generic ? 'not exact property proof' : ''
    ].filter(Boolean)),
    confidence: propertySpecific ? 'Low' : 'Blocked',
    suggested_next_action: propertySpecific
      ? 'Open the source and verify visible address, timing/status, and official/source evidence before analyzer handoff.'
      : 'Use this source only for discovery. Find an exact property page or official/property source before outreach.',
    call_angle: 'Verify source evidence before calling.',
    created_from_grounding_url: true,
    source_classification: classification,
    source_evidence_status: identity.source_evidence_status,
    source_evidence_label: identity.source_evidence_label,
    property_identity_status: identity.property_identity_status,
    property_identity_label: identity.property_identity_label,
    property_identity_basis: identity.property_identity_basis,
    source_harvest_source: source.harvest_source
  };
}

function summarizeSourceHarvest(sources, cards) {
  const classifications = sources.map((source) => classifySourceUrl(canonicalizeSourceUrl(source.url).canonical_url || source.url, source.title, source.evidence));
  const cardList = Array.isArray(cards) ? cards : [];
  return {
    grounding_urls_found: sources.filter((source) => source.harvest_source === 'grounding_chunk' || source.harvest_source === 'grounding_support').length,
    urls_harvested: sources.length,
    property_specific_urls: classifications.filter(sourceClassificationIsPropertySpecific).length,
    generic_urls_filtered: classifications.filter((classification) => classification === 'generic_homepage' || classification === 'broad_article_or_blog').length,
    cards_from_grounding_urls: cardList.filter((card) => card.created_from_grounding_url === true).length,
    research_ready_count: cardList.filter((card) => card.status === 'Research Ready' || card.status === 'Call Ready').length,
    needs_source_proof_count: cardList.filter((card) => card.status === 'Needs Source Proof').length,
    needs_address_repair_count: cardList.filter((card) => card.status === 'Needs Address Repair').length
  };
}

function hostAndPath(url) {
  try {
    const parsed = new URL(cleanText(url));
    return { host: parsed.hostname.toLowerCase(), path: parsed.pathname.toLowerCase(), href: parsed.href };
  } catch (error) {
    return { host: '', path: '', href: '' };
  }
}

function isGoogleRedirectLikeUrl(url) {
  const hp = hostAndPath(url);
  if (/vertexaisearch\.cloud\.google\.com$/i.test(hp.host) && /grounding-api-redirect/i.test(hp.path)) return true;
  if (/google\.(com|[a-z.]+)$/i.test(hp.host) && /\/url\b/i.test(hp.path)) return true;
  if (/google\.(com|[a-z.]+)$/i.test(hp.host) && /\/search\b/i.test(hp.path)) return true;
  return false;
}

function stripTrackingParams(url) {
  const text = cleanText(url);
  if (!isHttpUrl(text)) return text;
  try {
    const parsed = new URL(text);
    Array.from(parsed.searchParams.keys()).forEach((key) => {
      if (/^(utm_|gclid|gbraid|wbraid|yclid|fbclid|msclkid|ref|source|campaign|cmpid|cid|mkt_tok)/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    });
    parsed.hash = '';
    return parsed.href;
  } catch (error) {
    return text;
  }
}

function extractRedirectTargetUrl(url) {
  const text = cleanText(url);
  if (!isHttpUrl(text)) return '';
  try {
    const parsed = new URL(text);
    const keys = ['url', 'u', 'q', 'target', 'redirect', 'dest', 'destination', 'to', 'r', 'adurl'];
    for (const key of keys) {
      const value = parsed.searchParams.get(key);
      if (!value) continue;
      const decoded = decodeURIComponentRepeated(value);
      if (isHttpUrl(decoded)) return stripTrackingParams(decoded);
      const nested = decoded.match(/https?:\/\/[^\s"'<>)+\]]+/i);
      if (nested && nested[0]) return stripTrackingParams(nested[0]);
    }
    const decodedFull = decodeURIComponentRepeated(text);
    const nestedFull = decodedFull.match(/https?:\/\/[^\s"'<>)+\]]+/i);
    if (nestedFull && nestedFull[0] && nestedFull[0] !== text) {
      const nestedHp = hostAndPath(nestedFull[0]);
      if (!(nestedHp.host === hostAndPath(text).host && nestedHp.path === hostAndPath(text).path)) {
        return stripTrackingParams(nestedFull[0]);
      }
    }
  } catch (error) {
    return '';
  }
  return '';
}

function canonicalizeSourceUrl(url, options) {
  const original = cleanText(url);
  const out = {
    original_url: original,
    canonical_url: original,
    canonicalized: false,
    canonicalization_source: 'original',
    canonicalization_note: '',
    is_google_redirect_like: isGoogleRedirectLikeUrl(original)
  };
  if (!isHttpUrl(original)) return out;

  const paramTarget = extractRedirectTargetUrl(original);
  if (isHttpUrl(paramTarget)) {
    return Object.assign({}, out, {
      canonical_url: paramTarget,
      canonicalized: true,
      canonicalization_source: 'query_param',
      canonicalization_note: 'Source URL was canonicalized from redirect query parameters.'
    });
  }

  if (out.is_google_redirect_like) {
    if (/vertexaisearch\.cloud\.google\.com$/i.test(hostAndPath(original).host) && /grounding-api-redirect/i.test(hostAndPath(original).path)) {
      return Object.assign({}, out, {
        canonicalization_note: 'Google grounding redirect did not yield an extractable target URL.'
      });
    }
    return Object.assign({}, out, {
      canonicalization_note: 'Google redirect did not yield an extractable target URL.'
    });
  }

  const stripped = stripTrackingParams(original);
  if (stripped && stripped !== original) {
    return Object.assign({}, out, {
      canonical_url: stripped,
      canonicalized: true,
      canonicalization_source: 'tracking_stripped',
      canonicalization_note: 'Tracking parameters were removed from the source URL.'
    });
  }
  return out;
}

function addressLikePath(path) {
  const text = cleanText(path).replace(/[-_/]+/g, ' ');
  return /\b\d{2,7}\b/.test(text) &&
    /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|sq|unit|apt)\b/i.test(text);
}

function decodeURIComponentSafe(value) {
  const text = cleanText(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
}

function decodeURIComponentRepeated(value, limit) {
  let text = cleanText(value);
  const max = Math.max(1, Math.min(parseInt(limit || 4, 10) || 4, 8));
  for (let i = 0; i < max; i += 1) {
    const decoded = decodeURIComponentSafe(text);
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

function titleCaseWord(word) {
  const text = cleanText(word);
  if (!text) return '';
  const lower = text.toLowerCase();
  const specials = {
    tx: 'TX',
    il: 'IL',
    ca: 'CA',
    ny: 'NY',
    fl: 'FL',
    nj: 'NJ',
    dc: 'DC',
    ln: 'Ln',
    rd: 'Rd',
    dr: 'Dr',
    st: 'St',
    ave: 'Ave',
    blvd: 'Blvd',
    pkwy: 'Pkwy',
    hwy: 'Hwy',
    ct: 'Ct',
    cir: 'Cir',
    ter: 'Ter',
    apt: 'Apt',
    unit: 'Unit',
    no: 'No'
  };
  if (specials[lower]) return specials[lower];
  if (/^\d+$/.test(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCaseText(value) {
  return cleanText(value).split(/\s+/).map(titleCaseWord).filter(Boolean).join(' ');
}

function extractAddressFromSourceText() {
  const values = Array.from(arguments || []).map((value) => cleanText(value)).filter(Boolean);
  const haystack = values.join(' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!haystack) return null;
  const match = haystack.match(/\b(?<street>\d{2,7}\s+[A-Za-z0-9.'# -]+?\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop))(?:[,\s]+(?<city>Dallas))(?:[,\s]+(?<state>TX|Texas))?(?:[,\s]+(?<zip>\d{5})(?:-\d{4})?)?\b/i);
  if (!match || !match.groups) return null;
  const street = titleCaseText(match.groups.street);
  const city = titleCaseText(match.groups.city || '');
  const state = match.groups.state ? 'TX' : '';
  const zip = match.groups.zip || '';
  const stateZip = [state, zip].filter(Boolean).join(' ');
  const normalized = [street, [city, stateZip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  if (!street) return null;
  return {
    address: street,
    city,
    state,
    zip,
    normalized_address: normalized,
    address_extracted_from_source_url: false,
    property_identity_status: city && (state || zip) ? 'partial' : 'needs_source_repair',
    property_identity_label: city && (state || zip) ? 'Partial from source text' : 'Needs repair',
    property_identity_basis: 'source_text',
    source_evidence_status: 'source_text',
    source_evidence_label: 'Source text',
    market_match_basis: normalized
  };
}

function normalizeSourceSlug(value) {
  return decodeURIComponentSafe(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPropertyIdentityFromSourceUrl(sourceUrl, sourceTitle, sourceClassification) {
  const canonical = canonicalizeSourceUrl(sourceUrl);
  const effectiveUrl = canonical.canonicalized && canonical.canonical_url ? canonical.canonical_url : canonical.is_google_redirect_like ? '' : canonical.canonical_url;
  const classification = cleanText(sourceClassification) || classifySourceUrl(effectiveUrl || sourceUrl, sourceTitle);
  const hostPath = hostAndPath(effectiveUrl || sourceUrl);
  const path = decodeURIComponentSafe(hostPath.path);
  const title = cleanText(sourceTitle);
  const out = {
    address: '',
    city: '',
    state: '',
    zip: '',
    normalized_address: '',
    property_identity_status: sourceClassificationIsPropertySpecific(classification) ? 'partial' : 'needs_source_repair',
    property_identity_label: sourceClassificationIsPropertySpecific(classification) ? 'Partial from source URL' : 'Needs repair',
    property_identity_basis: sourceClassificationIsPropertySpecific(classification) ? 'source_url' : 'source_url_unverified',
    source_evidence_status: sourceClassificationIsPropertySpecific(classification) ? 'property_source_url' : 'source_url',
    source_evidence_label: sourceClassificationIsPropertySpecific(classification) ? 'Property URL' : 'Source URL',
    address_extracted_from_source_url: false,
    market_match_basis: '',
    source_classification: classification
  };

  if (!sourceClassificationIsPropertySpecific(classification)) return out;
  if (canonical.is_google_redirect_like && !canonical.canonicalized) return out;

  let rawAddress = '';
  let rawCity = '';
  let rawState = '';
  let rawZip = '';

  if (/realtor\.com$/i.test(hostPath.host)) {
    const match = path.match(/realestateandhomes-detail\/([^/?#]+)/i);
    const slug = normalizeSourceSlug(match && match[1] || '');
    const details = slug.match(/^(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
    if (details && details.groups) {
      rawAddress = details.groups.address;
      rawCity = details.groups.city;
      rawState = details.groups.state;
      rawZip = details.groups.zip;
    }
  } else if (/redfin\.com$/i.test(hostPath.host)) {
    const match = path.match(/\/(?<state>[A-Za-z]{2})\/(?<city>[A-Za-z][A-Za-z-]*)\/(?<street>[^/?#]+?)\/home\//i);
    if (match && match.groups) {
      rawState = match.groups.state;
      rawCity = match.groups.city;
      rawAddress = normalizeSourceSlug(match.groups.street).replace(/\b\d{5}(?:-\d{4})?$/i, '').trim();
      const zipMatch = cleanText(match.groups.street).match(/\b(\d{5})(?:-\d{4})?$/);
      rawZip = zipMatch ? zipMatch[1] : '';
    }
  } else if (/zillow\.com$/i.test(hostPath.host)) {
    const match = path.match(/homedetails\/([^/?#]+)/i);
    const slug = normalizeSourceSlug(match && match[1] || '');
    const details = slug.match(/^(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
    if (details && details.groups) {
      rawAddress = details.groups.address;
      rawCity = details.groups.city;
      rawState = details.groups.state;
      rawZip = details.groups.zip;
    }
  } else if (/(auction\.com|realauction\.com)$/i.test(hostPath.host)) {
    const auctionSegment = normalizeSourceSlug((path.split('/').filter(Boolean).pop()) || '');
    const slugSource = auctionSegment;
    const details = slugSource.match(/(?<address>.+?)\s+(?<city>[A-Za-z][A-Za-z-]*)\s+(?<state>[A-Za-z]{2})\s+(?<zip>\d{5})(?:\s|$)/i);
    if (details && details.groups) {
      rawAddress = details.groups.address;
      rawCity = details.groups.city;
      rawState = details.groups.state;
      rawZip = details.groups.zip;
    } else {
      const hyphenDetails = auctionSegment.match(/^(?<address>.+?)-([A-Za-z][A-Za-z-]*)-([A-Za-z]{2})-(\d{5})(?:-|$)/i);
      if (hyphenDetails) {
        rawAddress = normalizeSourceSlug((hyphenDetails.groups && hyphenDetails.groups.address) || hyphenDetails[1] || '');
        rawCity = hyphenDetails[2] || '';
        rawState = hyphenDetails[3] || '';
        rawZip = hyphenDetails[4] || '';
      }
    }
  } else if (/har\.com$/i.test(hostPath.host)) {
    const match = path.match(/\/homedetail\/([^/?#]+)(?:\/\d+)?/i);
    const slug = decodeURIComponentSafe(match && match[1] || '');
    const parts = slug.split('-').map(cleanText).filter(Boolean);
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

  const normalizedParts = [
    titleCaseText(rawAddress),
    titleCaseText(rawCity),
    [rawState ? rawState.toUpperCase() : '', rawZip].filter(Boolean).join(' ')
  ].filter(Boolean);
  const cityStateZip = [titleCaseText(rawCity), [rawState ? rawState.toUpperCase() : '', rawZip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  out.address = titleCaseText(rawAddress);
  out.city = titleCaseText(rawCity);
  out.state = rawState ? rawState.toUpperCase() : '';
  out.zip = rawZip;
  out.normalized_address = normalizedParts.join(', ');
  out.address_extracted_from_source_url = !!out.address || !!out.city || !!out.state || !!out.zip;
  out.property_identity_status = out.address_extracted_from_source_url
    ? (out.address && out.city && out.state && out.zip ? 'resolved' : 'partial')
    : 'needs_source_repair';
  out.property_identity_label = out.address_extracted_from_source_url
    ? (out.property_identity_status === 'resolved' ? 'Resolved from source URL' : 'Partial from source URL')
    : 'Needs repair';
  out.market_match_basis = cityStateZip || normalizedParts.join(', ');
  out.source_evidence_status = out.address_extracted_from_source_url ? 'property_source_url' : 'source_url';
  out.source_evidence_label = out.address_extracted_from_source_url ? 'Property URL' : 'Source URL';
  return out;
}

function isBlockedSource(url) {
  const hp = hostAndPath(url);
  return /\bforeclosure\.com$/i.test(hp.host);
}

function classifySourceUrl(url, title, evidence) {
  const canonical = canonicalizeSourceUrl(url);
  const effectiveUrl = canonical.canonicalized && canonical.canonical_url ? canonical.canonical_url : canonical.is_google_redirect_like ? '' : canonical.canonical_url;
  const hp = hostAndPath(effectiveUrl || url);
  const sourceText = `${cleanText(title)} ${cleanText(evidence)} ${hp.path}`.toLowerCase();
  if (canonical.is_google_redirect_like && !canonical.canonicalized) {
    if (/\b(search|results|listing|homes|for-sale|marketplace)\b/i.test(sourceText)) return 'listing_search_page';
    return 'unknown_source';
  }
  if (!hp.host) return 'unknown_source';
  if (hp.path === '/' || hp.path === '') return 'generic_homepage';
  if (/\/(blog|article|news|learn|resources|guides?)\b/i.test(hp.path)) return 'broad_article_or_blog';
  if (/(redfin|zillow|realtor|trulia|homes|har)\.com$/i.test(hp.host)) {
    if (/redfin\.com$/i.test(hp.host) && /\/home\/\d+/i.test(hp.path)) return 'listing_property_page';
    if (/zillow\.com$/i.test(hp.host) && /\/homedetails\//i.test(hp.path)) return 'listing_property_page';
    if (/realtor\.com$/i.test(hp.host) && /\/realestateandhomes-detail\//i.test(hp.path)) return 'listing_property_page';
    if (/har\.com$/i.test(hp.host) && /\/homedetail\//i.test(hp.path)) return 'listing_property_page';
    if (addressLikePath(hp.path) && !/\b(search|city|homes|for-sale|realestateandhomes-search)\b/i.test(hp.path)) return 'listing_property_page';
    return /\/(search|city|homes|for-sale|realestateandhomes-search|apartments|rentals|homes-for-sale)\b/i.test(hp.path)
      ? 'listing_search_page'
      : 'generic_homepage';
  }
  if (/(auction\.com|realauction\.com)$/i.test(hp.host)) {
    if (/\/(details|detail|auction|property)\//i.test(hp.path) || addressLikePath(hp.path)) return 'auction_property_page';
    return /\/(search|allsearch|residential|commercial|bank-owned|foreclosure|asset|property-search|calendar|index)\b/i.test(hp.path)
      ? 'auction_search_page'
      : 'generic_homepage';
  }
  if (/\.gov$/i.test(hp.host) || (/\.org$/i.test(hp.host) && /\b(county|court|clerk|sheriff|tax)\b/i.test(hp.host))) {
    if (/\b(document|record|instrument|notice|foreclosure|trustee|sheriff|tax|parcel|property)\b/i.test(sourceText) && (/\.(pdf|aspx|php|html?)$/i.test(hp.path) || addressLikePath(hp.path))) {
      return 'official_property_notice';
    }
    return 'unknown_source';
  }
  if (/\b(property|listing|details|home|house|auction|foreclosure|parcel|homedetail|homedetails)\b/i.test(sourceText) && !/\b(search|city|county|category)\b/i.test(sourceText)) return 'exact_property_page';
  if (/\b(search|city|county|category|results)\b/i.test(sourceText)) return 'listing_search_page';
  return 'unknown_source';
}

function sourceClassificationIsPropertySpecific(classification) {
  return [
    'exact_property_page',
    'auction_property_page',
    'official_property_notice',
    'listing_property_page'
  ].includes(cleanText(classification));
}

function sourceClassificationIsGeneric(classification) {
  return [
    'listing_search_page',
    'auction_search_page',
    'generic_homepage',
    'broad_article_or_blog'
  ].includes(cleanText(classification));
}

function isGenericSourceUrl(url) {
  const canonical = canonicalizeSourceUrl(url);
  if (canonical.is_google_redirect_like && !canonical.canonicalized) return true;
  const classification = classifySourceUrl(canonical.canonical_url || url);
  if (classification === 'generic_homepage' || classification === 'broad_article_or_blog' || classification === 'listing_search_page' || classification === 'auction_search_page') return true;
  const hp = hostAndPath(canonical.canonical_url || url);
  if (!hp.host) return true;
  if (/google\./i.test(hp.host)) return true;
  if (hp.path === '/' || hp.path === '') return true;
  if (/\/(search|sitemap|login|account|contact|about|help|privacy|terms)\/?$/i.test(hp.path)) return true;
  if (/(zillow|redfin|realtor|auction|realauction)\.com$/i.test(hp.host) && !isPropertySpecificSourceUrl(url)) return true;
  return false;
}

function isPropertySpecificSourceUrl(url) {
  const canonical = canonicalizeSourceUrl(url);
  if (canonical.is_google_redirect_like && !canonical.canonicalized) return false;
  const classification = classifySourceUrl(canonical.canonical_url || url);
  if (sourceClassificationIsPropertySpecific(classification)) return true;
  if (sourceClassificationIsGeneric(classification)) return false;
  const hp = hostAndPath(canonical.canonical_url || url);
  if (!hp.host || !hp.path || hp.path === '/') return false;
  if (/redfin\.com$/i.test(hp.host)) return /\/home\/\d+/i.test(hp.path);
  if (/zillow\.com$/i.test(hp.host)) return /\/homedetails\//i.test(hp.path);
  if (/realtor\.com$/i.test(hp.host)) return /\/realestateandhomes-detail\//i.test(hp.path);
  if (/har\.com$/i.test(hp.host)) return /\/homedetail\//i.test(hp.path);
  if (/(auction\.com|realauction\.com)$/i.test(hp.host)) return /\/(details|detail|auction|property)\//i.test(hp.path) || addressLikePath(hp.path);
  if (/\.gov$/i.test(hp.host) || /\.org$/i.test(hp.host)) return /\.(pdf|aspx|php|html?)$/i.test(hp.path) || /\b(document|record|foreclosure|trustee|sale|tax|sheriff|property|parcel)\b/i.test(hp.path);
  return /\b(property|listing|details|home|house|auction|foreclosure|parcel)\b/i.test(hp.path) && !/\b(search|city|county|category|blog|article)\b/i.test(hp.path);
}

function classifySourceType(url, sourceType) {
  const explicit = safeLower(sourceType);
  const canonical = canonicalizeSourceUrl(url);
  if (canonical.is_google_redirect_like && !canonical.canonicalized) return cleanText(sourceType) || 'public_web';
  const hp = hostAndPath(canonical.canonical_url || url);
  if (/(auction\.com|realauction\.com)$/i.test(hp.host) || /\bauction\b/.test(explicit)) return 'auction_marketplace';
  if (/(zillow|redfin|realtor|trulia|homes|har)\.com$/i.test(hp.host) || /\blisting\b/.test(explicit)) return 'listing_marketplace';
  if (/\.gov$/i.test(hp.host) || /\.org$/i.test(hp.host) && /\b(county|court|clerk|sheriff|tax)\b/i.test(hp.host)) return 'official_public_source';
  return cleanText(sourceType) || 'public_web';
}

function sourceClassificationLabel(classification) {
  const labels = {
    exact_property_page: 'Exact property page',
    auction_property_page: 'Auction property page',
    official_property_notice: 'Official property notice',
    listing_property_page: 'Listing property page',
    listing_search_page: 'Listing/search page',
    auction_search_page: 'Auction search page',
    generic_homepage: 'Generic homepage',
    broad_article_or_blog: 'Broad article/blog',
    unknown_source: 'Unknown source'
  };
  return labels[cleanText(classification)] || 'Unknown source';
}

function looksLikeAddress(value) {
  const text = cleanText(value);
  return /\b\d{1,7}\b/.test(text) &&
    /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop|run|sq|square|plaza|expy|fwy|freeway)\b/i.test(text);
}

function addressQuality(address, sourceText) {
  const text = cleanText(address);
  const probe = `${text} ${cleanText(sourceText)}`.toLowerCase();
  if (!text) return 'missing';
  if (/\b(contact us|login|search results|homepage|home page|privacy policy|terms of use|foreclosure\.com)\b/i.test(probe)) return 'junk';
  return looksLikeAddress(text) ? 'valid' : 'partial';
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  const text = cleanText(value);
  return text ? text.split(/[,;|]/).map(cleanText).filter(Boolean) : [];
}

function normalizeConfidence(value, status) {
  const text = safeLower(value);
  if (status === 'Needs Source Proof' || status === 'Needs Address Repair') return text === 'blocked' ? 'Blocked' : 'Repair';
  if (/high/.test(text)) return 'High';
  if (/medium|med/.test(text)) return 'Medium';
  if (/low/.test(text)) return 'Low';
  return status === 'Call Ready' ? 'High' : status === 'Research Ready' ? 'Medium' : 'Low';
}

function marketMatchDetails(candidate, context) {
  const selected = `${safeLower(context && context.location)} ${safeLower(context && context.market)}`.trim();
  const identity = candidate && candidate.property_identity || {};
  const haystack = [
    candidate && candidate.address,
    candidate && candidate.property_address,
    candidate && candidate.display_address,
    candidate && candidate.city,
    candidate && candidate.state,
    candidate && candidate.county,
    candidate && candidate.source_title,
    candidate && candidate.candidate_title,
    candidate && candidate.source_url,
    identity.address,
    identity.city,
    identity.state,
    identity.zip,
    identity.normalized_address,
    identity.market_match_basis
  ].map(safeLower).join(' ');
  const dallasRegex = /\bdallas\b/;
  const outOfMarketRegex = /\b(houston|harris|austin|travis|fort worth|tarrant|san antonio|bexar|chicago|cook|cook county)\b/i;

  if (!selected) {
    return { score: 10, label: 'Matches selected market', basis: 'No market specified' };
  }
  if (dallasRegex.test(selected)) {
    if (outOfMarketRegex.test(haystack)) {
      return { score: 0, label: 'Market mismatch', basis: 'Out-of-market city/county in source URL or text' };
    }
    if (/\bdallas county\b/.test(haystack) || (/\bdallas\b/.test(haystack) && /\b(tx|texas)\b/.test(haystack))) {
      return { score: 10, label: 'Matches selected market', basis: identity.address_extracted_from_source_url ? 'City/state/zip extracted from source URL' : 'Dallas match from source text' };
    }
    if (/\b(tx|texas)\b/.test(haystack)) {
      return { score: 5, label: 'Likely in selected market', basis: 'State matches selected market; county not verified' };
    }
    return { score: 0, label: 'Market mismatch', basis: 'No selected-market evidence in source URL or text' };
  }
  const tokens = uniqueList(selected.split(/[^a-z0-9]+/i).filter((token) => token.length > 2 && !/^(county|state|city|texas|tx|national)$/i.test(token)));
  if (!tokens.length) return { score: 10, label: 'Matches selected market', basis: 'No specific market tokens to compare' };
  const match = tokens.some((token) => haystack.includes(token));
  return {
    score: match ? 10 : 0,
    label: match ? 'Matches selected market' : 'Market mismatch',
    basis: match ? 'Selected market tokens found in source URL or text' : 'Selected market tokens not found in source URL or text'
  };
}

function marketMatchScore(candidate, context) {
  return marketMatchDetails(candidate, context).score;
}

function distressSignalScore(signals, proofText) {
  const text = `${normalizeArray(signals).join(' ')} ${cleanText(proofText)}`.toLowerCase();
  if (/\b(foreclos|trustee|tax sale|tax foreclosure|sheriff|auction|cash only|investor special|as.?is|needs tlc|fixer|repair|price cut|reduced|distressed|motivated)\b/.test(text)) return 20;
  if (/\b(for sale|listing|public source|property)\b/.test(text)) return 8;
  return 0;
}

function sourceQualityLabel(sourceUrl, sourceType, propertySpecific, sourceGeneric, sourceClassification) {
  if (!isHttpUrl(sourceUrl)) return 'Missing source URL';
  if (sourceClassification === 'auction_search_page') return 'Auction search page';
  if (sourceClassification === 'listing_search_page') return 'Listing/search page';
  if (sourceClassification === 'generic_homepage') return 'Generic homepage';
  if (sourceClassification === 'broad_article_or_blog') return 'Broad article/blog';
  if (sourceGeneric) return 'Generic listing/search page';
  if (propertySpecific && sourceType === 'official_public_source') return 'Property-specific official source';
  if (sourceClassification === 'auction_property_page') return 'Auction property page';
  if (sourceClassification === 'listing_property_page') return 'Listing property page';
  if (propertySpecific) return 'Property-specific public source';
  return 'Public source needs review';
}

function scoreCandidate(candidate, context, sourceUrl, sourceType, sourceGeneric, quality, signals, proofText, sourceClassification) {
  const propertySpecific = sourceClassificationIsPropertySpecific(sourceClassification) || isPropertySpecificSourceUrl(sourceUrl);
  const marketMatch = marketMatchDetails(candidate, context);
  const marketScore = marketMatch.score;
  const sourceQualityScore = !isHttpUrl(sourceUrl) ? 0 : sourceGeneric ? 5 : propertySpecific ? 20 : 10;
  const addressScore = quality === 'valid' ? 20 : quality === 'partial' ? 8 : 0;
  const signalScore = distressSignalScore(signals, proofText);
  const actionabilityScore = propertySpecific && quality === 'valid' && marketScore >= 10 && signalScore > 0 ? 20 : propertySpecific && isHttpUrl(sourceUrl) ? 8 : 0;
  return {
    property_specific: propertySpecific,
    property_specific_score: propertySpecific ? 20 : 0,
    address_confidence_score: addressScore,
    market_match_score: marketScore,
    market_match_label: marketMatch.label,
    market_match_basis: marketMatch.basis,
    source_quality_score: sourceQualityScore,
    distress_signal_score: signalScore,
    actionability_score: actionabilityScore,
    scout_priority_score: sourceQualityScore + addressScore + marketScore + signalScore + actionabilityScore
  };
}

function qualityExplanations(score, sourceGeneric, quality, sourceClassification, createdFromGroundingUrl) {
  const out = [];
  if (createdFromGroundingUrl) out.push('Created from Gemini source URL');
  if (!score.property_specific) out.push(sourceGeneric ? 'Generic listing/search page, not exact property proof' : 'Source is not clearly property-specific');
  if (quality !== 'valid') out.push('No visible usable property address found');
  if (score.market_match_score <= 0) out.push('Market mismatch');
  if (score.distress_signal_score <= 0) out.push('Missing distress signal');
  if (score.property_specific && quality === 'valid') out.push('Property-specific public source found');
  if (score.distress_signal_score > 0) out.push('Visible distress/listing signal found');
  return uniqueList(out);
}

function statusForCandidate(candidate, sourceUrl, sourceType, sourceGeneric, quality, signals, score, proofText) {
  if (!isHttpUrl(sourceUrl) || sourceGeneric || !score.property_specific) return 'Needs Source Proof';
  if (quality === 'junk') return 'Junk/Archive';
  if (quality === 'missing' || quality === 'partial') return 'Needs Address Repair';
  if (score.market_match_score <= 0) return 'Needs Source Proof';
  if (score.distress_signal_score <= 0) return 'Support Signal Only';
  return 'Research Ready';
}

function normalizeCandidate(candidate, context) {
  candidate = candidate || {};
  context = context || {};
  const sourceUrlRaw = cleanText(candidate.source_url || candidate.url || candidate.sourceUrl);
  const sourceUrlOriginal = cleanText(candidate.source_url_original || candidate.original_source_url || sourceUrlRaw);
  const canonicalInfo = canonicalizeSourceUrl(candidate.canonical_source_url || candidate.final_source_url || sourceUrlRaw);
  const sourceUrl = cleanText(canonicalInfo.canonical_url || candidate.canonical_source_url || candidate.final_source_url || sourceUrlRaw);
  const canonicalizationNote = cleanText(candidate.source_url_canonicalization_note || candidate.canonicalization_note || canonicalInfo.canonicalization_note || candidate.source_url_resolve_error);
  const blockedSource = isBlockedSource(sourceUrl);
  const sourceType = classifySourceType(sourceUrl, candidate.source_type || candidate.sourceType);
  const sourceClassification = classifySourceUrl(sourceUrl, candidate.source_title || candidate.title || candidate.candidate_title, candidate.evidence_snippet || candidate.summary || candidate.why_it_might_be_deal);
  const sourceGeneric = sourceClassificationIsGeneric(sourceClassification) || isGenericSourceUrl(sourceUrl);
  const extractedIdentity = extractPropertyIdentityFromSourceUrl(sourceUrl, candidate.source_title || candidate.title || candidate.candidate_title, sourceClassification);
  const textRescueIdentity = extractAddressFromSourceText(
    candidate.address,
    candidate.property_address,
    candidate.display_address,
    sourceUrl,
    candidate.source_title,
    candidate.title,
    candidate.candidate_title,
    candidate.evidence_snippet,
    candidate.summary,
    candidate.why_it_might_be_deal,
    candidate.call_angle
  );
  const identityFallback = extractedIdentity && extractedIdentity.normalized_address ? extractedIdentity : (textRescueIdentity || extractedIdentity);
  const mergedIdentity = Object.assign({}, identityFallback, candidate.property_identity || {});
  if (!extractedIdentity.address_extracted_from_source_url && textRescueIdentity && textRescueIdentity.normalized_address && !(candidate.property_identity && candidate.property_identity.normalized_address)) {
    mergedIdentity.address_rescued_from_source_text = true;
    mergedIdentity.property_identity_status = mergedIdentity.property_identity_status || textRescueIdentity.property_identity_status;
    mergedIdentity.property_identity_label = mergedIdentity.property_identity_label || textRescueIdentity.property_identity_label;
    mergedIdentity.property_identity_basis = mergedIdentity.property_identity_basis || textRescueIdentity.property_identity_basis;
    mergedIdentity.market_match_basis = mergedIdentity.market_match_basis || textRescueIdentity.market_match_basis;
  }
  const address = cleanText(candidate.address || candidate.property_address || candidate.display_address || mergedIdentity.normalized_address || mergedIdentity.address);
  const title = cleanText(candidate.candidate_title || candidate.source_title || candidate.title || address || 'Live public discovery result');
  const strategyTags = uniqueList(normalizeArray(candidate.strategy_match).concat(context.strategy_labels || []));
  const distressSignals = uniqueList(normalizeArray(candidate.distress_signals).concat(normalizeArray(candidate.strategy_match)));
  const proofText = cleanText(candidate.evidence_snippet || candidate.why_it_might_be_deal || candidate.summary || title);
  const quality = addressQuality(address, proofText);
  const score = scoreCandidate(Object.assign({}, candidate, { property_identity: mergedIdentity }), context, sourceUrl, sourceType, sourceGeneric, quality, distressSignals, proofText, sourceClassification);
  const createdFromGroundingUrl = candidate.created_from_grounding_url === true;
  const explanations = qualityExplanations(score, sourceGeneric, quality, sourceClassification, createdFromGroundingUrl);
  const missing = uniqueList([]
    .concat(normalizeArray(candidate.missing_evidence))
    .concat(blockedSource ? ['approved public source'] : [])
    .concat(!isHttpUrl(sourceUrl) ? ['source URL'] : [])
    .concat(!score.property_specific || sourceGeneric ? ['property-specific source URL'] : [])
    .concat(quality !== 'valid' ? ['usable property address'] : [])
    .concat(score.market_match_score <= 0 ? ['selected market match'] : [])
    .concat(score.distress_signal_score <= 0 ? ['visible distress/listing signal'] : [])
    .concat(sourceType === 'auction_marketplace' || sourceType === 'listing_marketplace' ? ['official/property source verification', 'equity not verified', 'ARV/MAO not verified'] : [])
  );
  const riskFlags = uniqueList([]
    .concat(normalizeArray(candidate.risk_flags))
    .concat(blockedSource ? ['blocked source'] : [])
    .concat(createdFromGroundingUrl ? ['created from Gemini source URL'] : [])
    .concat(sourceType === 'auction_marketplace' ? ['auction marketplace candidate only'] : [])
    .concat(sourceType === 'listing_marketplace' ? ['listing marketplace candidate only'] : [])
  );
  const status = blockedSource
    ? 'Junk/Archive'
    : statusForCandidate(candidate, sourceUrl, sourceType, sourceGeneric, quality, distressSignals, score, proofText);
  const sourceTitle = cleanText(candidate.source_title || candidate.title || title);
  const sourceUrls = uniqueList([sourceUrl].concat(context.provider_source_urls || [])).filter(isHttpUrl);
  const why = proofText || explanations[0] || 'Gemini found a public source candidate. Verify the source before outreach.';
  const addressNote = mergedIdentity.address_extracted_from_source_url
    ? 'Address extracted from property URL - verify before offer.'
    : mergedIdentity.address_rescued_from_source_text
      ? 'Address rescued from source title/snippet - verify before offer.'
    : '';
  const canonicalizationNoteText = canonicalizationNote || (sourceUrlOriginal && sourceUrlOriginal !== sourceUrl
    ? 'Source URL was canonicalized from Gemini/Google grounding result.'
    : '');
  const next = cleanText(candidate.suggested_next_action) || (
    sourceType === 'auction_marketplace' || sourceType === 'listing_marketplace'
      ? 'Verify official/property source before offer. Do not assume equity or ARV.'
      : status === 'Research Ready'
        ? 'Send to AI Deal Analyzer for source verification and comp research gates.'
        : 'Repair missing source/address evidence before outreach.'
  );
  const displayAddress = address || title || cleanText(candidate.source_title) || 'Live source candidate needs review';
  return {
    card_id: hashId('fmc', `gemini|${displayAddress}|${sourceUrl}|${sourceTitle}`),
    source_kind: 'gemini_live_discovery',
    candidate_id: hashId('gld', `${displayAddress}|${sourceUrl}|${sourceTitle}`),
    display_address: displayAddress,
    address_or_source_text: displayAddress,
    address_extracted_from_source_url: mergedIdentity.address_extracted_from_source_url === true,
    property_identity_status: mergedIdentity.property_identity_status || 'needs_source_repair',
    property_identity_label: mergedIdentity.property_identity_label || 'Needs repair',
    property_identity_basis: mergedIdentity.property_identity_basis || 'source_url',
    source_evidence_status: mergedIdentity.source_evidence_status || 'source_url',
    source_evidence_label: mergedIdentity.source_evidence_label || 'Source URL',
    city: cleanText(candidate.city || mergedIdentity.city),
    state: cleanText(candidate.state || mergedIdentity.state),
    zip: cleanText(candidate.zip || mergedIdentity.zip),
    county: cleanText(candidate.county),
    location: [candidate.city || mergedIdentity.city, candidate.county, candidate.state || mergedIdentity.state, mergedIdentity.zip].map(cleanText).filter(Boolean).join(', ') || cleanText(context.location || context.market),
    source_url: isHttpUrl(sourceUrl) && !blockedSource ? sourceUrl : '',
    source_url_original: isHttpUrl(sourceUrlOriginal) ? sourceUrlOriginal : '',
    canonical_source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    source_url_canonicalized: canonicalInfo.canonicalized === true || (!!sourceUrlOriginal && sourceUrlOriginal !== sourceUrl),
    source_url_canonicalization_note: canonicalizationNoteText,
    source_title: sourceTitle,
    source_type: sourceType,
    source_classification: sourceClassification,
    source_classification_label: sourceClassificationLabel(sourceClassification),
    source_quality: sourceQualityLabel(sourceUrl, sourceType, score.property_specific, sourceGeneric, sourceClassification),
    property_specific_source: score.property_specific,
    market_match: score.market_match_label || (score.market_match_score > 0 ? 'Matches selected market' : 'Market mismatch'),
    market_match_basis: score.market_match_basis || '',
    address_extracted_from_source_url: mergedIdentity.address_extracted_from_source_url === true,
    property_identity_status: mergedIdentity.property_identity_status || 'needs_source_repair',
    property_identity_label: mergedIdentity.property_identity_label || 'Needs repair',
    property_identity_basis: mergedIdentity.property_identity_basis || 'source_url',
    source_evidence_status: mergedIdentity.source_evidence_status || 'source_url',
    source_evidence_label: mergedIdentity.source_evidence_label || 'Source URL',
    lead_source_type: sourceType,
    strategy_tags: strategyTags,
    signal_summary: distressSignals.join(', '),
    why_it_matters: why,
    why_this_might_be_a_deal: addressNote ? `${why} ${addressNote}`.trim() : why,
    quality_explanations: explanations,
    distress_motivation_signals: distressSignals,
    visible_price_or_bid: cleanText(candidate.visible_price_or_bid),
    auction_date_or_timing: cleanText(candidate.auction_date_or_timing),
    listing_status: cleanText(candidate.listing_status),
    missing_evidence: missing,
    risk_flags: riskFlags,
    confidence: normalizeConfidence(candidate.confidence, status),
    confidence_level: normalizeConfidence(candidate.confidence, status),
    next_action: next,
    next_best_action: next,
    call_angle: cleanText(candidate.call_angle) || 'Verify source evidence and ask about timing and condition.',
    status,
    dirty_lead_category: status === 'Research Ready' || status === 'Call Ready'
      ? 'Research Ready'
      : status === 'Needs Address Repair'
        ? 'Needs Address Repair'
        : status === 'Needs Source Proof'
          ? 'Source Repair Needed'
          : status === 'Support Signal Only'
            ? 'Support Signal Only'
            : 'Junk / Archive Candidate',
    pipeline_status: 'New',
    note: '',
    can_send_to_analyzer: status === 'Call Ready' || status === 'Research Ready',
    provider: 'Gemini',
    provider_grounding_present: context.provider_grounding_present === true,
    provider_source_urls: sourceUrls,
    created_from_grounding_url: createdFromGroundingUrl,
    source_url_type: sourceType,
    canonical_source_url: isHttpUrl(sourceUrl) ? sourceUrl : '',
    original_source_url: isHttpUrl(sourceUrlOriginal) ? sourceUrlOriginal : '',
    why_card_exists: addressNote
      ? `${addressNote} ${canonicalizationNoteText ? canonicalizationNoteText + ' ' : ''}${createdFromGroundingUrl ? 'Created from Gemini source URL because grounded search returned a public source but no complete structured candidate.' : 'Created from Gemini structured candidate output.'}`.trim()
      : (createdFromGroundingUrl
        ? `${canonicalizationNoteText ? canonicalizationNoteText + ' ' : ''}Created from Gemini source URL because grounded search returned a public source but no complete structured candidate.`.trim()
        : 'Created from Gemini structured candidate output.'),
    property_specific_score: score.property_specific_score,
    address_confidence_score: score.address_confidence_score,
    market_match_score: score.market_match_score,
    source_quality_score: score.source_quality_score,
    distress_signal_score: score.distress_signal_score,
    actionability_score: score.actionability_score,
    scout_priority_score: score.scout_priority_score,
    preview_only: true,
    should_ingest: false,
    created_from: 'Gemini live public discovery'
  };
}

async function fetchGeminiJson(url, body, headers, options) {
  options = options || {};
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Gemini Live Discovery requires fetch support.');
  const timeoutMs = Math.min(Math.max(parseInt(options.timeout_ms || options.timeoutMs || 60000, 10) || 60000, 1000), 75000);
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
      const message = data && data.error && data.error.message ? data.error.message : `Gemini Live Discovery failed with HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runGeminiScoutDiscovery(job, options = {}) {
  const env = options.env || process.env;
  const config = geminiConfig(env);
  const requestedCount = Math.max(1, Math.min(parseInt(job && job.batch_size || 10, 10) || 10, MAX_DISCOVERY_RESULTS));
  if (!config.configured) {
    return {
      attempted: false,
      status: config.status,
      message: config.message,
      model: config.model,
      cards: [],
      candidates_found: 0,
      source_urls_found_count: 0,
      source_urls: [],
      grounding_present: false,
      grounding_urls_found: 0,
      urls_harvested: 0,
      property_specific_urls: 0,
      generic_urls_filtered: 0,
      cards_from_grounding_urls: 0,
      research_ready_count: 0,
      needs_source_proof_count: 0,
      needs_address_repair_count: 0,
      warnings: [config.message]
    };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const prompt = buildDiscoveryPrompt(job, requestedCount);
  try {
    const response = await fetchGeminiJson(url, {
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 4096
      }
    }, {
      'x-goog-api-key': options.apiKey || env.GEMINI_API_KEY
    }, options);
    const text = extractGeminiText(response);
    const groundingUrls = extractGroundingUrls(response);
    const parsed = parseProviderCandidates(text, groundingUrls);
    const context = {
      market: job && job.market,
      location: job && job.location,
      strategy_labels: strategyLabels(job && job.strategies),
      provider_grounding_present: groundingPresent(response),
      provider_source_urls: groundingUrls
    };
    const harvestedSources = harvestProviderSources(response, text, parsed.candidates);
    const resolvedSources = [];
    for (const source of harvestedSources.slice(0, MAX_DISCOVERY_RESULTS)) {
      resolvedSources.push(await resolveGroundingSourceUrl(source, options));
    }
    const parsedCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    const resolvedParsedCandidates = parsedCandidates.length
      ? await Promise.all(parsedCandidates.map(async (candidate) => {
        const source = await resolveGroundingSourceUrl({
          url: candidate && (candidate.source_url || candidate.url || candidate.sourceUrl),
          title: candidate && (candidate.source_title || candidate.title),
          evidence: candidate && (candidate.evidence_snippet || candidate.summary || candidate.why_it_might_be_deal),
          harvest_source: 'parsed_candidate'
        }, options);
        return Object.assign({}, candidate, {
          source_url: source.url || cleanText(candidate && (candidate.source_url || candidate.url || candidate.sourceUrl)),
          source_url_original: source.original_url || cleanText(candidate && (candidate.source_url_original || candidate.original_source_url || candidate.source_url || candidate.url || candidate.sourceUrl)),
          canonical_source_url: source.canonical_url || source.url || cleanText(candidate && (candidate.source_url || candidate.url || candidate.sourceUrl)),
          source_url_resolved: source.resolved_from_grounding_redirect === true,
          source_url_resolve_error: source.resolve_error || '',
          source_url_canonicalized: source.canonicalized === true || (source.canonical_url && source.canonical_url !== cleanText(candidate && (candidate.source_url || candidate.url || candidate.sourceUrl))),
          source_url_canonicalization_note: source.canonicalization_note || ''
        });
      }))
      : [];
    const providerSourceUrls = uniqueList(
      groundingUrls
        .concat(resolvedSources.map((source) => source.url).filter(isHttpUrl))
        .concat(resolvedParsedCandidates.map((candidate) => candidate && candidate.source_url).filter(isHttpUrl))
    );
    context.provider_source_urls = providerSourceUrls;
    const sourceCandidates = resolvedParsedCandidates.length
      ? []
      : resolvedSources
        .map((source) => candidateFromHarvestedSource(source, context))
        .filter(Boolean);
    const cards = resolvedParsedCandidates.concat(sourceCandidates)
      .map((candidate) => normalizeCandidate(candidate, context))
      .sort((a, b) => (Number(b.scout_priority_score || 0) - Number(a.scout_priority_score || 0)))
      .slice(0, requestedCount);
    const harvestSummary = summarizeSourceHarvest(resolvedSources, cards);
    return {
      attempted: true,
      status: 'available',
      message: cards.length
        ? sourceCandidates.length
          ? `Gemini Live Discovery harvested ${cards.length} source URL card${cards.length === 1 ? '' : 's'}.`
          : `Gemini Live Discovery returned ${cards.length} candidate card${cards.length === 1 ? '' : 's'}.`
        : 'Gemini Live Discovery returned source grounding but no property-specific candidates.',
      model: config.model,
      cards,
      candidates_found: cards.length,
      source_urls_found_count: context.provider_source_urls.length,
      source_urls: context.provider_source_urls,
      grounding_present: context.provider_grounding_present,
      grounding_urls_found: harvestSummary.grounding_urls_found,
      urls_harvested: harvestSummary.urls_harvested,
      property_specific_urls: harvestSummary.property_specific_urls,
      generic_urls_filtered: harvestSummary.generic_urls_filtered,
      cards_from_grounding_urls: harvestSummary.cards_from_grounding_urls,
      research_ready_count: harvestSummary.research_ready_count,
      needs_source_proof_count: harvestSummary.needs_source_proof_count,
      needs_address_repair_count: harvestSummary.needs_address_repair_count,
      warnings: uniqueList(parsed.warnings.concat(sourceCandidates.length ? ['Created cards from Gemini source URLs because structured candidates were empty.'] : []))
    };
  } catch (error) {
    const classified = classifyGeminiError(error);
    return {
      attempted: true,
      status: classified.status,
      message: classified.message,
      model: config.model,
      cards: [],
      candidates_found: 0,
      source_urls_found_count: 0,
      source_urls: [],
      grounding_present: false,
      grounding_urls_found: 0,
      urls_harvested: 0,
      property_specific_urls: 0,
      generic_urls_filtered: 0,
      cards_from_grounding_urls: 0,
      research_ready_count: 0,
      needs_source_proof_count: 0,
      needs_address_repair_count: 0,
      warnings: [classified.message]
    };
  }
}

module.exports = {
  MAX_DISCOVERY_RESULTS,
  geminiConfig,
  buildDiscoveryPrompt,
  buildSearchQueryTemplates,
  extractGeminiText,
  extractGroundingUrls,
  parseProviderCandidates,
  normalizeCandidate,
  isPropertySpecificSourceUrl,
  runGeminiScoutDiscovery,
  isGenericSourceUrl,
  classifySourceType,
  classifySourceUrl,
  canonicalizeSourceUrl,
  extractRedirectTargetUrl,
  extractAddressFromSourceText,
  harvestProviderSources,
  candidateFromHarvestedSource,
  classifyGeminiError
};
