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
      : cleanText(error && error.message ? error.message : 'Gemini Live Discovery failed. Scout used saved leads mode only.')
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
    vacant_absentee: 'vacant/absentee if evidence exists'
  };
  return uniqueList((Array.isArray(strategies) ? strategies : []).map((strategy) => labels[strategy] || cleanText(strategy).replace(/_/g, ' ')));
}

function marketSearchTerms(job) {
  const market = cleanText(job && job.market);
  const location = cleanText(job && job.location);
  const base = location || market || 'Dallas County, TX';
  const cityState = /\bdallas\b/i.test(base) && !/\btx\b|\btexas\b/i.test(base)
    ? `${base} TX`
    : base;
  return {
    base,
    city_state: cityState,
    county: base
  };
}

function buildSearchQueryTemplates(job) {
  const terms = marketSearchTerms(job);
  const selected = new Set(Array.isArray(job && job.strategies) ? job.strategies : []);
  const queries = [];
  function add(query) {
    const text = cleanText(query);
    if (text) queries.push(text);
  }
  if (selected.has('fixer') || selected.has('ugly') || selected.has('as_is')) {
    add(`site:redfin.com ${terms.city_state} fixer upper house`);
    add(`site:realtor.com ${terms.city_state} as is house for sale`);
    add(`site:zillow.com ${terms.city_state} fixer upper house`);
    add(`${terms.city_state} "investor special" house for sale`);
    add(`${terms.city_state} "cash only" house for sale`);
    add(`${terms.city_state} "needs TLC" "for sale"`);
  }
  if (selected.has('auction_public') || selected.has('public_auction') || selected.has('auction_soon')) {
    add(`site:auction.com ${terms.city_state} foreclosure auction property`);
    add(`${terms.city_state} foreclosure auction property`);
    add(`${terms.city_state} public auction property`);
  }
  if (selected.has('foreclosure_notice') || selected.has('trustee_notice') || selected.has('pre_foreclosure')) {
    add(`${terms.county} trustee sale property`);
    add(`${terms.county} foreclosure notice property address`);
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
    add(`site:redfin.com ${terms.city_state} fixer upper house`);
    add(`site:realtor.com ${terms.city_state} as is house for sale`);
    add(`site:auction.com ${terms.city_state} foreclosure auction property`);
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
    'Use these search query starting points. Prefer exact property pages over broad result pages:',
    queries.map((query) => `- ${query}`).join('\n'),
    '',
    'Prefer exact property pages, listing/property URLs, official property notices/documents, and auction property pages.',
    'Avoid homepages, generic search pages, category pages, broad city pages, blog posts, SEO pages, and pages with no visible address.',
    '',
    'Hard rules:',
    '- Return only candidate properties or property-specific source pages with source URLs.',
    '- Do not invent addresses, owner names, debt, DOM, auction amounts, tax amounts, sold prices, listing history, phone, email, ARV, or MAO.',
    '- If a field is not visible from the public source, set it to an empty string or say not verified.',
    '- Do not use Foreclosure.com as a source.',
    '- Do not use login, paywall, CAPTCHA, or subscription-only pages.',
    '- Auction.com or marketplace pages are candidate discovery only, not official proof.',
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

function extractGroundingUrls(response) {
  const candidates = Array.isArray(response && response.candidates) ? response.candidates : [];
  const urls = [];
  candidates.forEach((candidate) => {
    const metadata = candidate && (candidate.groundingMetadata || candidate.grounding_metadata) || {};
    const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
    chunks.forEach((chunk) => {
      const url = chunk && chunk.web && chunk.web.uri || chunk && chunk.retrievedContext && chunk.retrievedContext.uri || '';
      if (isHttpUrl(url)) urls.push(url);
    });
  });
  return uniqueList(urls);
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

function hostAndPath(url) {
  try {
    const parsed = new URL(cleanText(url));
    return { host: parsed.hostname.toLowerCase(), path: parsed.pathname.toLowerCase(), href: parsed.href };
  } catch (error) {
    return { host: '', path: '', href: '' };
  }
}

function isBlockedSource(url) {
  const hp = hostAndPath(url);
  return /\bforeclosure\.com$/i.test(hp.host);
}

function isGenericSourceUrl(url) {
  const hp = hostAndPath(url);
  if (!hp.host) return true;
  if (/google\./i.test(hp.host)) return true;
  if (hp.path === '/' || hp.path === '') return true;
  if (/\/(search|sitemap|login|account|contact|about|help|privacy|terms)\/?$/i.test(hp.path)) return true;
  if (/(zillow|redfin|realtor|auction)\.com$/i.test(hp.host) && !isPropertySpecificSourceUrl(url)) return true;
  return false;
}

function isPropertySpecificSourceUrl(url) {
  const hp = hostAndPath(url);
  if (!hp.host || !hp.path || hp.path === '/') return false;
  if (/redfin\.com$/i.test(hp.host)) return /\/home\/\d+/i.test(hp.path);
  if (/zillow\.com$/i.test(hp.host)) return /\/homedetails\//i.test(hp.path);
  if (/realtor\.com$/i.test(hp.host)) return /\/realestateandhomes-detail\//i.test(hp.path);
  if (/auction\.com$/i.test(hp.host)) return /\/(details|auction|property)\//i.test(hp.path);
  if (/\.gov$/i.test(hp.host) || /\.org$/i.test(hp.host)) return /\.(pdf|aspx|php|html?)$/i.test(hp.path) || /\b(document|record|foreclosure|trustee|sale|tax|sheriff|property|parcel)\b/i.test(hp.path);
  return /\b(property|listing|details|home|house|auction|foreclosure|parcel)\b/i.test(hp.path) && !/\b(search|city|county|category|blog|article)\b/i.test(hp.path);
}

function classifySourceType(url, sourceType) {
  const explicit = safeLower(sourceType);
  const hp = hostAndPath(url);
  if (/auction\.com$/i.test(hp.host) || /\bauction\b/.test(explicit)) return 'auction_marketplace';
  if (/(zillow|redfin|realtor|trulia|homes)\.com$/i.test(hp.host) || /\blisting\b/.test(explicit)) return 'listing_marketplace';
  if (/\.gov$/i.test(hp.host) || /\.org$/i.test(hp.host) && /\b(county|court|clerk|sheriff|tax)\b/i.test(hp.host)) return 'official_public_source';
  return cleanText(sourceType) || 'public_web';
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

function marketMatchScore(candidate, context) {
  const haystack = [
    candidate && candidate.address,
    candidate && candidate.property_address,
    candidate && candidate.display_address,
    candidate && candidate.city,
    candidate && candidate.state,
    candidate && candidate.county,
    candidate && candidate.source_title,
    candidate && candidate.candidate_title
  ].map(safeLower).join(' ');
  const selected = `${safeLower(context && context.location)} ${safeLower(context && context.market)}`;
  if (!selected.trim()) return 10;
  if (/\bdallas\b/.test(selected)) {
    if (/\bdallas\b/.test(haystack) || /\bdallas county\b/.test(haystack)) return 10;
    if (/\btx\b|\btexas\b/.test(haystack) && !/\b(houston|harris|austin|travis|fort worth|tarrant|san antonio|bexar)\b/.test(haystack)) return 5;
    return 0;
  }
  const tokens = uniqueList(selected.split(/[^a-z0-9]+/i).filter((token) => token.length > 2 && !/^(county|state|city|texas|tx|national)$/.test(token)));
  if (!tokens.length) return 10;
  return tokens.some((token) => haystack.includes(token)) ? 10 : 0;
}

function distressSignalScore(signals, proofText) {
  const text = `${normalizeArray(signals).join(' ')} ${cleanText(proofText)}`.toLowerCase();
  if (/\b(foreclos|trustee|tax sale|tax foreclosure|sheriff|auction|cash only|investor special|as.?is|needs tlc|fixer|repair|price cut|reduced|distressed|motivated)\b/.test(text)) return 20;
  if (/\b(for sale|listing|public source|property)\b/.test(text)) return 8;
  return 0;
}

function sourceQualityLabel(sourceUrl, sourceType, propertySpecific, sourceGeneric) {
  if (!isHttpUrl(sourceUrl)) return 'Missing source URL';
  if (sourceGeneric) return 'Generic listing/search page';
  if (propertySpecific && sourceType === 'official_public_source') return 'Property-specific official source';
  if (propertySpecific) return 'Property-specific public source';
  return 'Public source needs review';
}

function scoreCandidate(candidate, context, sourceUrl, sourceType, sourceGeneric, quality, signals, proofText) {
  const propertySpecific = isPropertySpecificSourceUrl(sourceUrl);
  const marketScore = marketMatchScore(candidate, context);
  const sourceQualityScore = !isHttpUrl(sourceUrl) ? 0 : sourceGeneric ? 5 : propertySpecific ? 20 : 10;
  const addressScore = quality === 'valid' ? 20 : quality === 'partial' ? 8 : 0;
  const signalScore = distressSignalScore(signals, proofText);
  const actionabilityScore = propertySpecific && quality === 'valid' && marketScore >= 10 && signalScore > 0 ? 20 : propertySpecific && isHttpUrl(sourceUrl) ? 8 : 0;
  return {
    property_specific: propertySpecific,
    property_specific_score: propertySpecific ? 20 : 0,
    address_confidence_score: addressScore,
    market_match_score: marketScore,
    source_quality_score: sourceQualityScore,
    distress_signal_score: signalScore,
    actionability_score: actionabilityScore,
    scout_priority_score: sourceQualityScore + addressScore + marketScore + signalScore + actionabilityScore
  };
}

function qualityExplanations(score, sourceGeneric, quality) {
  const out = [];
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
  const sourceUrl = cleanText(candidate.source_url || candidate.url || candidate.sourceUrl);
  const blockedSource = isBlockedSource(sourceUrl);
  const sourceGeneric = isGenericSourceUrl(sourceUrl);
  const sourceType = classifySourceType(sourceUrl, candidate.source_type || candidate.sourceType);
  const address = cleanText(candidate.address || candidate.property_address || candidate.display_address);
  const title = cleanText(candidate.candidate_title || candidate.source_title || candidate.title || address || 'Live public discovery result');
  const strategyTags = uniqueList(normalizeArray(candidate.strategy_match).concat(context.strategy_labels || []));
  const distressSignals = uniqueList(normalizeArray(candidate.distress_signals).concat(normalizeArray(candidate.strategy_match)));
  const proofText = cleanText(candidate.evidence_snippet || candidate.why_it_might_be_deal || candidate.summary || title);
  const quality = addressQuality(address, proofText);
  const score = scoreCandidate(candidate, context, sourceUrl, sourceType, sourceGeneric, quality, distressSignals, proofText);
  const explanations = qualityExplanations(score, sourceGeneric, quality);
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
    .concat(sourceType === 'auction_marketplace' ? ['auction marketplace candidate only'] : [])
    .concat(sourceType === 'listing_marketplace' ? ['listing marketplace candidate only'] : [])
  );
  const status = blockedSource
    ? 'Junk/Archive'
    : statusForCandidate(candidate, sourceUrl, sourceType, sourceGeneric, quality, distressSignals, score, proofText);
  const sourceTitle = cleanText(candidate.source_title || candidate.title || title);
  const sourceUrls = uniqueList([sourceUrl].concat(context.provider_source_urls || [])).filter(isHttpUrl);
  const why = proofText || explanations[0] || 'Gemini found a public source candidate. Verify the source before outreach.';
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
    city: cleanText(candidate.city),
    state: cleanText(candidate.state),
    county: cleanText(candidate.county),
    location: [candidate.city, candidate.county, candidate.state].map(cleanText).filter(Boolean).join(', ') || cleanText(context.location || context.market),
    source_url: isHttpUrl(sourceUrl) && !blockedSource ? sourceUrl : '',
    source_title: sourceTitle,
    source_type: sourceType,
    source_quality: sourceQualityLabel(sourceUrl, sourceType, score.property_specific, sourceGeneric),
    property_specific_source: score.property_specific,
    market_match: score.market_match_score > 0 ? 'Matches selected market' : 'Market mismatch',
    lead_source_type: sourceType,
    strategy_tags: strategyTags,
    signal_summary: distressSignals.join(', '),
    why_it_matters: why,
    why_this_might_be_a_deal: why,
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
    const groundingUrls = extractGroundingUrls(response);
    const text = extractGeminiText(response);
    const parsed = parseProviderCandidates(text, groundingUrls);
    const context = {
      market: job && job.market,
      location: job && job.location,
      strategy_labels: strategyLabels(job && job.strategies),
      provider_grounding_present: groundingPresent(response),
      provider_source_urls: groundingUrls
    };
    const cards = (Array.isArray(parsed.candidates) ? parsed.candidates : [])
      .map((candidate) => normalizeCandidate(candidate, context))
      .sort((a, b) => (Number(b.scout_priority_score || 0) - Number(a.scout_priority_score || 0)))
      .slice(0, requestedCount);
    return {
      attempted: true,
      status: 'available',
      message: cards.length
        ? `Gemini Live Discovery returned ${cards.length} candidate card${cards.length === 1 ? '' : 's'}.`
        : 'Gemini Live Discovery returned source grounding but no property-specific candidates.',
      model: config.model,
      cards,
      candidates_found: cards.length,
      source_urls_found_count: groundingUrls.length,
      source_urls: groundingUrls,
      grounding_present: context.provider_grounding_present,
      warnings: uniqueList(parsed.warnings)
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
  classifyGeminiError
};
