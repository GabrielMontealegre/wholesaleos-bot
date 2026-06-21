'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const browserFileEvidenceAdapter = require('./dallas-browser-file-evidence-adapter');

const MAX_FILE_LINKS = 8;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_ROWS_CHECKED = 500;
const MAX_TEXT_BLOCKS = 500;
const MAX_CANDIDATES = 10;

const SAFE_HOSTS = new Set([
  'www.dallascounty.org',
  'dallascounty.org',
  'dallas.texas.sheriffsaleauctions.com',
  'dallas.tx.publicsearch.us'
]);
const SAFE_LOCAL_FILE_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.text',
  '.html',
  '.htm',
  '.csv',
  '.xls',
  '.xlsx'
]);

const BLOCKED_PAGE_RE = /\b(captcha|human verification|verify you are human|access denied|forbidden|login required|sign in|register to bid|create an account)\b/i;
const JUNK_ROW_RE = /\b(contact us|phone directory|public information request|privacy policy|terms of use|site map|newsletter|department directory)\b/i;
const PARTIAL_ADDRESS_RE = /\b(?:property\s+address|address)\s*[:#-]\s*([^|;\n]{2,100})/i;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeId(value) {
  return crypto.createHash('sha1').update(cleanText(value) || crypto.randomUUID()).digest('hex').slice(0, 16);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function textFromHtml(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:tr|p|div|li|h\d|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function isSafeDallasOfficialFileUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    return SAFE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (error) {
    return false;
  }
}

function classifyLocalFilePath(filePath) {
  const ext = path.extname(cleanText(filePath)).toLowerCase();
  if (ext === '.pdf') return 'pdf_file';
  if (ext === '.csv') return 'csv_file';
  if (ext === '.xlsx') return 'xlsx_file';
  if (ext === '.xls') return 'xls_file';
  if (ext === '.txt' || ext === '.text') return 'text_file';
  if (ext === '.html' || ext === '.htm') return 'html_page';
  return 'unknown';
}

function classifyFileLink(input) {
  const url = cleanText(typeof input === 'string' ? input : input && input.url);
  const label = cleanText(input && input.label);
  const contentType = cleanText(input && input.content_type).toLowerCase();
  const value = `${url} ${label} ${contentType}`.toLowerCase();
  if (/\.pdf(?:$|[?#])|application\/pdf/.test(value)) return 'pdf_file';
  if (/\.csv(?:$|[?#])|text\/csv/.test(value)) return 'csv_file';
  if (/\.xlsx(?:$|[?#])|spreadsheetml|officedocument\.spreadsheetml/.test(value)) return 'xlsx_file';
  if (/\.xls(?:$|[?#])|application\/vnd\.ms-excel/.test(value)) return 'xls_file';
  if (/\.txt(?:$|[?#])|text\/plain/.test(value)) return 'text_file';
  if (/text\/html|\.html?(?:$|[?#])/.test(value)) return 'html_page';
  if (/\b(document|notice|foreclosure|sheriff|tax|sale|auction|resale|file|pdf)\b/.test(value)) return 'document_link';
  return 'unknown';
}

async function inspectLocalFile(filePath) {
  const resolvedPath = path.resolve(cleanText(filePath));
  let stats;
  try {
    stats = await fs.promises.lstat(resolvedPath);
  } catch (error) {
    return { blocked_reason: 'file_not_found' };
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    return { blocked_reason: 'file_not_regular' };
  }
  if (stats.size <= 0) {
    return { blocked_reason: 'file_not_regular' };
  }
  if (stats.size > MAX_FILE_BYTES) {
    return { blocked_reason: 'file_too_large' };
  }
  if (!SAFE_LOCAL_FILE_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) {
    return { blocked_reason: 'unsupported_file_type' };
  }
  let buffer;
  try {
    buffer = await fs.promises.readFile(resolvedPath);
  } catch (error) {
    return { blocked_reason: 'file_not_regular', error: error.message || 'read_failed' };
  }
  if (!buffer || !buffer.length) {
    return { blocked_reason: 'file_not_regular' };
  }
  return {
    ok: true,
    file_path: resolvedPath,
    file_basename: path.basename(resolvedPath),
    file_type: classifyLocalFilePath(resolvedPath),
    file_bytes: buffer.length,
    file_sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    buffer
  };
}

function countDetectedByType(links) {
  const counts = {
    files_detected: 0,
    pdf_files_detected: 0,
    csv_files_detected: 0,
    xlsx_files_detected: 0
  };
  for (const link of links) {
    const type = classifyFileLink(link);
    if (type === 'unknown' || type === 'html_page') continue;
    counts.files_detected += 1;
    if (type === 'pdf_file') counts.pdf_files_detected += 1;
    if (type === 'csv_file') counts.csv_files_detected += 1;
    if (type === 'xlsx_file' || type === 'xls_file') counts.xlsx_files_detected += 1;
  }
  return counts;
}

async function fetchBufferWithTimeout(url, options = {}) {
  const fetchImpl = options.fetch_impl || global.fetch || require('node-fetch');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout_ms || 10000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/pdf,text/csv,text/html,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*',
        'User-Agent': 'WholesaleOS Dallas Real File Parser Preview/1.0'
      }
    });
    const contentType = cleanText(response.headers && response.headers.get ? response.headers.get('content-type') : '');
    const contentLength = Number(response.headers && response.headers.get ? response.headers.get('content-length') : 0);
    const finalUrl = cleanText(response.url || url);
    if (finalUrl) {
      try {
        const finalHost = new URL(finalUrl).hostname.toLowerCase();
        if (!SAFE_HOSTS.has(finalHost)) {
          return { ok: false, status: response.status, content_type: contentType, blocked_reason: 'redirect_host_not_allowed' };
        }
      } catch (error) {
        return { ok: false, status: response.status, content_type: contentType, blocked_reason: 'redirect_host_not_allowed' };
      }
    }
    if (contentLength > MAX_FILE_BYTES) {
      return { ok: false, status: response.status, content_type: contentType, blocked_reason: 'file_too_large_for_preview_parser' };
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_FILE_BYTES) {
      return { ok: false, status: response.status, content_type: contentType, blocked_reason: 'file_too_large_for_preview_parser' };
    }
    return { ok: response.ok, status: response.status, content_type: contentType, buffer };
  } finally {
    clearTimeout(timer);
  }
}

async function parseLocalFileInput(filePath, source, options = {}) {
  const attempt = {
    url: '',
    label: path.basename(cleanText(filePath)),
    link_type: classifyLocalFilePath(filePath),
    status: 'not_attempted',
    rows_checked: 0,
    text_blocks_checked: 0,
    candidates_found: 0,
    blocked_reason: '',
    input_mode: 'local_file',
    file_basename: '',
    file_type: '',
    file_bytes: 0,
    file_sha256: ''
  };

  const inspected = await inspectLocalFile(filePath);
  if (!inspected.ok) {
    attempt.status = 'blocked';
    attempt.blocked_reason = inspected.blocked_reason || 'file_not_regular';
    return { attempt, candidates: [], file_meta: {} };
  }

  attempt.file_basename = inspected.file_basename;
  attempt.file_type = inspected.file_type;
  attempt.file_bytes = inspected.file_bytes;
  attempt.file_sha256 = inspected.file_sha256;
  attempt.link_type = inspected.file_type;

  let blocks = [];
  let blocked = null;
  if (inspected.file_type === 'pdf_file') {
    const parsed = await textFromPdfBuffer(inspected.buffer);
    if (parsed && typeof parsed === 'object' && parsed.blocked_reason) blocked = parsed;
    else blocks = textBlocksFromPlainText(parsed);
  } else if (inspected.file_type === 'csv_file') {
    blocks = rowsFromCsvText(inspected.buffer.toString('utf8'));
  } else if (inspected.file_type === 'xlsx_file' || inspected.file_type === 'xls_file') {
    const parsed = rowsFromXlsxBuffer(inspected.buffer);
    if (parsed && typeof parsed === 'object' && parsed.blocked_reason) blocked = parsed;
    else blocks = parsed;
  } else if (inspected.file_type === 'html_page') {
    const text = textFromHtml(inspected.buffer.toString('utf8'));
    if (BLOCKED_PAGE_RE.test(text)) {
      blocked = { blocked_reason: 'source_requires_login_or_human_review' };
    } else {
      blocks = textBlocksFromPlainText(text);
    }
  } else if (inspected.file_type === 'text_file') {
    blocks = textBlocksFromPlainText(inspected.buffer.toString('utf8'));
  } else {
    blocked = { blocked_reason: 'unsupported_file_type' };
  }

  if (blocked) {
    attempt.status = 'blocked';
    attempt.blocked_reason = blocked.blocked_reason || 'needs_file_adapter';
    if (blocked.error) attempt.error = blocked.error;
    return { attempt, candidates: [], file_meta: {
      basename: inspected.file_basename,
      file_type: inspected.file_type,
      file_bytes: inspected.file_bytes,
      file_sha256: inspected.file_sha256
    } };
  }

  attempt.status = 'parsed';
  attempt.rows_checked = Math.min(blocks.length, MAX_ROWS_CHECKED);
  attempt.text_blocks_checked = Math.min(blocks.length, MAX_TEXT_BLOCKS);
  const candidates = candidatesFromBlocks(blocks, {
    source_url: cleanText(source.source_url || ''),
    source_proof_url: cleanText(source.source_url || ''),
    source_reference: cleanText(source.source_reference || 'local file preview'),
    source_file_type: inspected.file_type,
    max_candidates: options.max_candidates || MAX_CANDIDATES
  });
  attempt.candidates_found = candidates.length;
  if (!candidates.length) attempt.blocked_reason = 'no_property_rows_found';
  return {
    attempt,
    candidates,
    file_meta: {
      basename: inspected.file_basename,
      file_type: inspected.file_type,
      file_bytes: inspected.file_bytes,
      file_sha256: inspected.file_sha256
    }
  };
}

async function textFromPdfBuffer(buffer) {
  try {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    return cleanText(parsed && parsed.text);
  } catch (error) {
    return { blocked_reason: 'pdf_parse_failed', error: error.message || 'pdf_parse_failed' };
  }
}

function rowsFromCsvText(text) {
  try {
    const csv = require('csv-parse/sync');
    const rows = csv.parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });
    return rowsToLabeledBlocks(rows);
  } catch (error) {
    return rowsToLabeledBlocks(simpleCsvRows(text));
  }
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  const text = String(line || '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && text[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      cells.push(cleanText(current));
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(cleanText(current));
  return cells;
}

function simpleCsvRows(text) {
  const lines = String(text || '').replace(/\r/g, '\n').split(/\n+/).map(cleanText).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (const line of lines.slice(1, MAX_ROWS_CHECKED + 1)) {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = cells[index] || '';
    });
    rows.push(row);
  }
  return rows;
}

function rowsFromXlsxBuffer(buffer) {
  try {
    const xlsx = require('xlsx');
    const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: false, dense: false });
    const blocks = [];
    for (const sheetName of (workbook.SheetNames || []).slice(0, 3)) {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false }).slice(0, MAX_ROWS_CHECKED);
      blocks.push(...rowsToLabeledBlocks(rows, sheetName));
      if (blocks.length >= MAX_TEXT_BLOCKS) break;
    }
    return blocks.slice(0, MAX_TEXT_BLOCKS);
  } catch (error) {
    return { blocked_reason: 'xlsx_parse_failed', error: error.message || 'xlsx_parse_failed' };
  }
}

function rowsToLabeledBlocks(rows, sheetName) {
  const blocks = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const entries = Object.keys(row)
      .map((key) => [cleanText(key), cleanText(row[key])])
      .filter((pair) => pair[0] && pair[1]);
    if (!entries.length) continue;
    const text = entries.map((pair) => `${pair[0]}: ${pair[1]}`).join(' | ');
    if (JUNK_ROW_RE.test(text) && !/\b\d{1,6}\s+/.test(text)) continue;
    blocks.push(sheetName ? `Sheet: ${sheetName} | ${text}` : text);
    if (blocks.length >= MAX_TEXT_BLOCKS) break;
  }
  return blocks;
}

function simpleDelimitedRows(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean)
    .filter((line) => !(JUNK_ROW_RE.test(line) && !/\b\d{1,6}\s+/.test(line)))
    .slice(0, MAX_TEXT_BLOCKS);
}

function textBlocksFromPlainText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split(/\n{1,}|(?=\b\d{1,6}\s+[A-Za-z0-9.'# -]{2,80}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|trl|trail|way|loop|ter|terrace|hwy|highway)\b)/i)
    .map(cleanText)
    .filter(Boolean)
    .filter((line) => !(JUNK_ROW_RE.test(line) && !/\b\d{1,6}\s+/.test(line)))
    .slice(0, MAX_TEXT_BLOCKS);
}

function candidatesFromBlocks(blocks, context) {
  const joined = (Array.isArray(blocks) ? blocks : []).join('\n');
  const candidates = browserFileEvidenceAdapter.extractCandidateRowsFromText(joined, {
    source_url: context.source_url,
    source_proof_url: context.source_proof_url,
    source_reference: context.source_reference,
    max_candidates: context.max_candidates || MAX_CANDIDATES
  }).map((candidate) => Object.assign({}, candidate, {
    id: candidate.id || `DAL-REAL-FILE-${safeId(`${context.source_proof_url}|${candidate.address}|${candidate.case_number}|${candidate.parcel}|${candidate.sale_date}`)}`,
    extraction_method: 'dallas_real_file_parser',
    source_file_type: context.source_file_type,
    case_number: cleanText(candidate.case_number).replace(/^(?:no|number)\s*:\s*/i, ''),
    parcel: cleanText(candidate.parcel).replace(/^(?:no|number|id)\s*:\s*/i, ''),
    apn: cleanText(candidate.apn).replace(/^(?:no|number|id)\s*:\s*/i, ''),
    preview_only: true,
    should_ingest: false
  }));
  if (candidates.length) return candidates;

  const repairCandidates = [];
  const seen = new Set();
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const text = cleanText(block);
    if (!text || JUNK_ROW_RE.test(text)) continue;
    const match = text.match(PARTIAL_ADDRESS_RE);
    const partialAddress = cleanText(match && match[1])
      .replace(/\b(?:borrower|sale date|case|cause|sale|auction|parcel|owner|tax|opening|minimum|foreclosure sale notice|notice of substitute trustee sale)\b.*$/i, '')
      .trim();
    if (!partialAddress || partialAddress.length < 4 || /\b(contact|phone|directory|request)\b/i.test(partialAddress)) continue;
    const key = `${context.source_proof_url}|${partialAddress}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    repairCandidates.push({
      id: `DAL-REAL-FILE-REPAIR-${safeId(key)}`,
      address: partialAddress,
      county: 'Dallas',
      state: 'TX',
      source_text: text,
      source_excerpt: text.slice(0, 500),
      source_page_text: text,
      source_url: context.source_url,
      source_record_url: context.source_proof_url,
      source_reference: context.source_reference || 'official Dallas file text',
      source_proof_text: text.slice(0, 500),
      raw_text: text.slice(0, 1000),
      missing_evidence: ['valid property address'],
      repair_flags: ['partial_address'],
      extraction_method: 'dallas_real_file_parser',
      extraction_confidence: 'Repair',
      source_file_type: context.source_file_type,
      preview_only: true,
      should_ingest: false
    });
    if (repairCandidates.length >= (context.max_candidates || MAX_CANDIDATES)) break;
  }
  return repairCandidates;
}

async function parseOfficialFileLink(link, source, options = {}) {
  const url = cleanText(link && link.url ? link.url : link);
  const linkType = classifyFileLink(link);
  const attempt = {
    url,
    label: cleanText(link && link.label),
    link_type: linkType,
    status: 'not_attempted',
    rows_checked: 0,
    text_blocks_checked: 0,
    candidates_found: 0,
    blocked_reason: ''
  };
  if (!url || !isSafeDallasOfficialFileUrl(url)) {
    attempt.status = 'blocked';
    attempt.blocked_reason = 'not_dallas_official_or_linked_source';
    return { attempt, candidates: [] };
  }
  if (linkType === 'unknown') {
    attempt.status = 'blocked';
    attempt.blocked_reason = 'unsupported_file_type';
    return { attempt, candidates: [] };
  }

  let fetched;
  try {
    fetched = await fetchBufferWithTimeout(url, options);
  } catch (error) {
    attempt.status = 'failed';
    attempt.blocked_reason = error && error.name === 'AbortError' ? 'timeout' : (error.message || 'fetch_failed');
    return { attempt, candidates: [] };
  }
  attempt.http_status = fetched.status;
  attempt.content_type = fetched.content_type;
  if (!fetched.ok || fetched.blocked_reason) {
    attempt.status = fetched.blocked_reason ? 'blocked' : 'failed';
    attempt.blocked_reason = fetched.blocked_reason || `http_${fetched.status}`;
    return { attempt, candidates: [] };
  }

  const actualType = classifyFileLink({ url, label: attempt.label, content_type: fetched.content_type }) || linkType;
  attempt.link_type = actualType;
  let blocks = [];
  let blocked = null;
  if (actualType === 'pdf_file') {
    const parsed = await textFromPdfBuffer(fetched.buffer);
    if (parsed && typeof parsed === 'object' && parsed.blocked_reason) blocked = parsed;
    else blocks = textBlocksFromPlainText(parsed);
  } else if (actualType === 'csv_file') {
    blocks = rowsFromCsvText(fetched.buffer.toString('utf8'));
  } else if (actualType === 'xlsx_file' || actualType === 'xls_file') {
    const parsed = rowsFromXlsxBuffer(fetched.buffer);
    if (parsed && typeof parsed === 'object' && parsed.blocked_reason) blocked = parsed;
    else blocks = parsed;
  } else if (actualType === 'text_file') {
    blocks = textBlocksFromPlainText(fetched.buffer.toString('utf8'));
  } else if (actualType === 'html_page' || actualType === 'document_link') {
    const text = textFromHtml(fetched.buffer.toString('utf8'));
    if (BLOCKED_PAGE_RE.test(text)) {
      blocked = { blocked_reason: 'source_requires_login_or_human_review' };
    } else {
      blocks = textBlocksFromPlainText(text);
    }
  } else {
    blocked = { blocked_reason: 'unsupported_file_type' };
  }

  if (blocked) {
    attempt.status = 'blocked';
    attempt.blocked_reason = blocked.blocked_reason || 'needs_file_adapter';
    if (blocked.error) attempt.error = blocked.error;
    return { attempt, candidates: [] };
  }

  attempt.status = 'parsed';
  attempt.rows_checked = Math.min(blocks.length, MAX_ROWS_CHECKED);
  attempt.text_blocks_checked = Math.min(blocks.length, MAX_TEXT_BLOCKS);
  const candidates = candidatesFromBlocks(blocks, {
    source_url: cleanText(source.source_url || url),
    source_proof_url: url,
    source_reference: attempt.label || `official Dallas ${actualType}`,
    source_file_type: actualType,
    max_candidates: options.max_candidates || MAX_CANDIDATES
  });
  attempt.candidates_found = candidates.length;
  if (!candidates.length) attempt.blocked_reason = 'no_property_rows_found';
  return { attempt, candidates };
}

function normalizeLinks(options = {}) {
  const source = options.source || {};
  const evidenceLinks = Array.isArray(options.evidence_links) ? options.evidence_links : [];
  const linkMap = new Map();
  for (const link of evidenceLinks) {
    const url = cleanText(link && link.url ? link.url : link);
    if (!url || linkMap.has(url)) continue;
    linkMap.set(url, Object.assign({}, link, { link_type: classifyFileLink(link) }));
  }
  const sourceUrl = cleanText(options.source_url || source.source_url);
  if (sourceUrl && !linkMap.has(sourceUrl)) {
    linkMap.set(sourceUrl, { url: sourceUrl, label: source.source_name || 'Official source page', link_type: 'html_page' });
  }
  return Array.from(linkMap.values());
}

async function runDallasRealFileParser(options = {}) {
  const source = options.source || {};
  const maxCandidates = Math.max(1, Math.min(Number(options.max_candidates || MAX_CANDIDATES) || MAX_CANDIDATES, MAX_CANDIDATES));
  const maxFiles = Math.max(1, Math.min(Number(options.max_files || MAX_FILE_LINKS) || MAX_FILE_LINKS, MAX_FILE_LINKS));
  const inputFile = cleanText(options.input_file || options.source_input_file || '');
  const links = inputFile ? [] : normalizeLinks(options);
  const detectedCounts = inputFile
    ? { files_detected: 1, pdf_files_detected: 0, csv_files_detected: 0, xlsx_files_detected: 0 }
    : countDetectedByType(links);
  const attempts = [];
  let candidates = [];

  if (inputFile) {
    const result = await parseLocalFileInput(inputFile, source, {
      timeout_ms: options.timeout_ms || 10000,
      max_candidates: maxCandidates
    });
    attempts.push(result.attempt);
    candidates = candidates.concat(result.candidates);
    if (result.file_meta) {
      detectedCounts.files_detected = 1;
      if (result.file_meta.file_type === 'pdf_file') detectedCounts.pdf_files_detected = 1;
      if (result.file_meta.file_type === 'csv_file') detectedCounts.csv_files_detected = 1;
      if (result.file_meta.file_type === 'xlsx_file' || result.file_meta.file_type === 'xls_file') detectedCounts.xlsx_files_detected = 1;
    }
  } else {
    for (const link of links.slice(0, maxFiles)) {
      if (candidates.length >= maxCandidates) break;
      const result = await parseOfficialFileLink(link, source, {
        timeout_ms: options.timeout_ms || 10000,
        fetch_impl: options.fetch_impl,
        max_candidates: maxCandidates - candidates.length
      });
      attempts.push(result.attempt);
      candidates = candidates.concat(result.candidates);
    }
  }

  const blockedReasons = attempts.map((attempt) => attempt.blocked_reason).filter(Boolean);
  const parsedCount = attempts.filter((attempt) => attempt.status === 'parsed').length;
  const blockedCount = attempts.filter((attempt) => attempt.status === 'blocked' || attempt.status === 'failed').length;
  const rowsChecked = attempts.reduce((sum, attempt) => sum + Number(attempt.rows_checked || 0), 0);
  const textBlocksChecked = attempts.reduce((sum, attempt) => sum + Number(attempt.text_blocks_checked || 0), 0);
  const status = candidates.length
    ? 'candidates_found'
    : blockedReasons.includes('needs_file_adapter')
      ? 'needs_file_adapter'
      : parsedCount
        ? 'no_property_rows_found'
        : 'needs_manual_review';

  return {
    ok: true,
    provider: 'dallas_real_file_parser',
    status,
    file_parser_attempted: true,
    files_detected: detectedCounts.files_detected,
    pdf_files_detected: detectedCounts.pdf_files_detected,
    csv_files_detected: detectedCounts.csv_files_detected,
    xlsx_files_detected: detectedCounts.xlsx_files_detected,
    files_parsed: parsedCount,
    files_blocked: blockedCount,
    file_text_blocks_checked: textBlocksChecked,
    file_rows_checked: rowsChecked,
    input_mode: inputFile ? 'local_file' : 'document_url',
    input_file: inputFile ? {
      basename: attempts[0] && attempts[0].file_basename || path.basename(inputFile),
      file_type: attempts[0] && attempts[0].file_type || classifyLocalFilePath(inputFile),
      file_bytes: attempts[0] && attempts[0].file_bytes || 0,
      file_sha256: attempts[0] && attempts[0].file_sha256 || ''
    } : null,
    candidates,
    candidates_extracted: candidates.length,
    attempts,
    blocked_reason: candidates.length ? '' : (blockedReasons[0] || status),
    captured_at: options.captured_at || nowIso(),
    preview_only: true,
    should_ingest: false
  };
}

module.exports = {
  classifyFileLink,
  isSafeDallasOfficialFileUrl,
  parseOfficialFileLink,
  runDallasRealFileParser
};
