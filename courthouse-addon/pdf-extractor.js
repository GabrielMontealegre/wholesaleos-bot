'use strict';
// courthouse-addon/pdf-extractor.js
// Downloads and extracts lead data from courthouse PDFs
// Uses pdf-parse (already in package.json) + Playwright for PDF-generating pages

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Safe pdf-parse loader ────────────────────────────────────────────────
let pdfParse = null;
function getPdfParse() {
  if (pdfParse) return pdfParse;
  try { pdfParse = require('pdf-parse'); return pdfParse; }
  catch(e) { console.error('[pdf-extractor] pdf-parse not available:', e.message); return null; }
}

// ── Extract leads from PDF buffer ────────────────────────────────────────
async function extractFromPdfBuffer(buffer, source) {
  const parser = getPdfParse();
  if (!parser) return [];

  try {
    const data = await parser(buffer);
    const text = data.text || '';
    return parseLeadsFromText(text, source);
  } catch(e) {
    console.error('[pdf-extractor] parse error:', e.message);
    return [];
  }
}

// ── Extract leads from a PDF URL (direct download) ───────────────────────
async function extractFromPdfUrl(url, source) {
  const axios = require('axios');
  try {
    console.log('[pdf-extractor] downloading PDF:', url.slice(0, 80));
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*'
      }
    });
    if (!resp.data || resp.data.byteLength < 100) {
      console.warn('[pdf-extractor] PDF too small or empty');
      return [];
    }
    return extractFromPdfBuffer(Buffer.from(resp.data), source);
  } catch(e) {
    console.error('[pdf-extractor] download error:', e.message);
    return [];
  }
}

// ── Extract leads from a page that renders PDFs via Playwright ────────────
async function extractFromPlaywrightPdf(page, url, source) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for PDF content to load
    await page.waitForTimeout(3000);

    // Try to get page text directly first
    const bodyText = await page.evaluate(() => document.body.innerText || document.body.textContent || '');
    if (bodyText && bodyText.length > 100) {
      const leads = parseLeadsFromText(bodyText, source);
      if (leads.length > 0) return leads;
    }

    // Try downloading linked PDFs on the page
    const pdfLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(href => href.toLowerCase().indexOf('.pdf') > -1 || href.toLowerCase().indexOf('download') > -1)
        .slice(0, 10);
    });

    console.log('[pdf-extractor] found', pdfLinks.length, 'PDF links on page');
    const allLeads = [];
    for (var i = 0; i < Math.min(pdfLinks.length, 5); i++) {
      var leads = await extractFromPdfUrl(pdfLinks[i], source);
      allLeads.push.apply(allLeads, leads);
    }
    return allLeads;
  } catch(e) {
    console.error('[pdf-extractor] playwright PDF error:', e.message);
    return [];
  }
}

// ── Parse property leads from extracted text ─────────────────────────────
function parseLeadsFromText(text, source) {
  const leads = [];
  if (!text) return leads;

  // Split into lines and look for address patterns
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);

  // Common address patterns in courthouse docs
  // 1234 MAIN ST, CITY, ST 12345
  // 1234 N MAIN STREET
  // LOT X BLOCK Y SUBDIVISION NAME
  const addrPattern = /^\d+\s+[A-Z][A-Z\s\.]+(?:ST|AVE|RD|DR|BLVD|LN|CT|WAY|PL|PKWY|HWY|LOOP|CIR|TRAIL|TER|TERRACE|STREET|AVENUE|ROAD|DRIVE|BOULEVARD|LANE|COURT)[,\s]/i;
  const lotPattern  = /LOT\s+\d+|PARCEL|BLOCK\s+\d+/i;
  const namePattern = /^[A-Z][A-Za-z]+,?\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?$/;

  let currentRecord = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Address line
    if (addrPattern.test(line)) {
      if (currentRecord.address) {
        // Save previous record if it has an address
        var lead = buildLead(currentRecord, source);
        if (lead) leads.push(lead);
      }
      currentRecord = { address: line };
    }
    // Owner name (after address)
    else if (currentRecord.address && namePattern.test(line) && !currentRecord.owner) {
      currentRecord.owner = line;
    }
    // Dollar amounts (auction price, assessed value)
    else if (currentRecord.address && /\$[\d,]+/.test(line)) {
      var amount = parseInt(line.replace(/[^\d]/g, ''));
      if (amount > 1000 && !currentRecord.amount) currentRecord.amount = amount;
    }
    // Case/parcel numbers
    else if (currentRecord.address && /CASE|PARCEL|FOLIO|FILE/i.test(line)) {
      currentRecord.case_number = line.replace(/CASE|PARCEL|FOLIO|FILE/gi, '').trim();
    }
    // Dates
    else if (currentRecord.address && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) {
      if (!currentRecord.date) currentRecord.date = line.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)[0];
    }
  }

  // Don't forget last record
  if (currentRecord.address) {
    var lastLead = buildLead(currentRecord, source);
    if (lastLead) leads.push(lastLead);
  }

  console.log('[pdf-extractor] extracted', leads.length, 'leads from text (', lines.length, 'lines)');
  return leads;
}

function buildLead(record, source) {
  if (!record.address || record.address.length < 8) return null;

  // Parse address parts
  var parts = record.address.split(',').map(s => s.trim());
  var street = parts[0] || record.address;
  var city   = parts[1] || '';
  var stateZip = parts[2] || '';
  var stMatch = stateZip.match(/^([A-Z]{2})\s*(\d{5})?/);
  var state  = stMatch ? stMatch[1] : source.state || '';
  var zip    = stMatch && stMatch[2] ? stMatch[2] : '';

  return {
    address:        street.toUpperCase(),
    city:           city.toUpperCase() || source.market || '',
    state:          state.toUpperCase() || source.state || '',
    zip:            zip,
    owner_name:     record.owner || '',
    source:         source.type || 'Courthouse PDF',
    source_details: source.market + ' — ' + (source.type || 'PDF Record'),
    case_number:    record.case_number || '',
    auction_date:   record.date || '',
    assessed_value: record.amount || null,
    motivation:     source.type || 'courthouse',
    violations:     [source.type || 'Courthouse Record'],
    county:         source.market || '',
    pdf_source:     true,
    pdf_source_url: source.url || '',
  };
}

module.exports = { extractFromPdfBuffer, extractFromPdfUrl, extractFromPlaywrightPdf, parseLeadsFromText };
