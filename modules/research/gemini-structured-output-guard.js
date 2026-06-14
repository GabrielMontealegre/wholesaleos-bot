'use strict';

const leadEvidence = require('./lead-evidence');

function cleanText(value) {
  return leadEvidence.cleanText(value);
}

function uniqueList(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean)));
}

function extractJsonText(text) {
  text = String(text || '').trim();
  if (!text) return '';
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const firstObject = text.indexOf('{');
  const firstArray = text.indexOf('[');
  const lastObject = text.lastIndexOf('}');
  const lastArray = text.lastIndexOf(']');
  if (firstObject >= 0 && (firstArray < 0 || firstObject < firstArray)) {
    const end = Math.max(lastObject, lastArray);
    return end > firstObject ? text.slice(firstObject, end + 1) : text.slice(firstObject);
  }
  if (firstArray >= 0 && lastArray > firstArray) return text.slice(firstArray, lastArray + 1);
  return text;
}

function repairJsonText(text) {
  let json = extractJsonText(text);
  if (!json) return { text: '', repaired: false };
  const original = json;
  json = json.replace(/,\s*([}\]])/g, '$1').trim();
  const opens = (json.match(/{/g) || []).length;
  const closes = (json.match(/}/g) || []).length;
  const arrayOpens = (json.match(/\[/g) || []).length;
  const arrayCloses = (json.match(/\]/g) || []).length;
  if (opens > closes) json += '}'.repeat(Math.min(opens - closes, 3));
  if (arrayOpens > arrayCloses) json += ']'.repeat(Math.min(arrayOpens - arrayCloses, 3));
  return { text: json, repaired: json !== original };
}

function parseJsonWithRecovery(text) {
  const direct = extractJsonText(text);
  if (!direct) return { parsed: null, repaired: false, valid: false, format: 'empty' };
  try {
    return { parsed: JSON.parse(direct), repaired: false, valid: true, format: /^\s*\[/.test(direct) ? 'json_array' : 'json_object' };
  } catch (_) {
    const repaired = repairJsonText(text);
    if (!repaired.text) return { parsed: null, repaired: false, valid: false, format: 'unparseable' };
    try {
      return { parsed: JSON.parse(repaired.text), repaired: repaired.repaired, valid: false, format: /^\s*\[/.test(repaired.text) ? 'json_array' : 'json_object' };
    } catch (error) {
      return { parsed: null, repaired: repaired.repaired, valid: false, format: 'unparseable' };
    }
  }
}

function groundingSupports(response) {
  const candidate = response && response.candidates && response.candidates[0] || {};
  const metadata = candidate.groundingMetadata || candidate.grounding_metadata || {};
  const supports = Array.isArray(metadata.groundingSupports) ? metadata.groundingSupports : Array.isArray(metadata.grounding_supports) ? metadata.grounding_supports : [];
  return supports.map((support) => cleanText(support && support.segment && support.segment.text || support && support.text)).filter(Boolean);
}

function guardGeminiOutput(input = {}) {
  const text = cleanText(input.text);
  const groundingUrls = uniqueList(input.grounding_urls || input.groundingUrls || []);
  const recovered = parseJsonWithRecovery(text);
  const parsed = recovered.parsed;
  const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed && parsed.candidates) ? parsed.candidates : [];
  const textUrls = uniqueList((String(text || '').match(/https?:\/\/[^\s"'<>),]+/gi) || []).concat(groundingUrls));
  const supportCount = groundingSupports(input.response).length;
  const urlOnlyCount = candidates.length ? 0 : textUrls.length;
  const unusable = candidates.length || textUrls.length
    ? ''
    : recovered.format === 'empty'
      ? 'empty_output'
      : 'unparseable_no_urls';
  return {
    candidates,
    gemini_output_valid_json: recovered.valid === true,
    gemini_output_repaired: recovered.repaired === true,
    gemini_output_format: recovered.format,
    gemini_grounding_urls_count: groundingUrls.length,
    gemini_grounding_support_count: supportCount,
    gemini_candidates_recovered_count: candidates.length,
    gemini_url_only_count: urlOnlyCount,
    gemini_unusable_output_reason: unusable
  };
}

module.exports = {
  guardGeminiOutput,
  parseJsonWithRecovery,
  repairJsonText,
  groundingSupports
};
