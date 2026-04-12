/**
 * FileParser — parses courthouse downloaded files into raw property records
 * Handles: CSV, XLSX/XLS, PDF, JSON (from Playwright extractions)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

class FileParser {
  async parse(filePath, src) {
    if (!filePath || !fs.existsSync(filePath)) return [];

    const ext = path.extname(filePath).toLowerCase();
    try {
      switch (ext) {
        case '.csv':   return this.parseCSV(filePath, src);
        case '.xlsx':
        case '.xls':   return this.parseExcel(filePath, src);
        case '.pdf':   return await this.parsePDF(filePath, src);
        case '.json':  return this.parseJSON(filePath, src);
        case '.html':  return this.parseHTML(filePath, src);
        default:       return this.parseCSV(filePath, src); // try CSV as fallback
      }
    } catch (err) {
      console.log(`    FileParser error [${ext}]: ${err.message}`);
      return [];
    }
  }

  // ── CSV ──────────────────────────────────────────────────────────
  parseCSV(filePath, src) {
    const content = fs.readFileSync(filePath, 'utf8');
    let rows;
    try {
      rows = parse(content, {
        columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, bom: true
      });
    } catch {
      // Try without headers
      const raw = parse(content, { skip_empty_lines: true, trim: true, relax_quotes: true });
      if (!raw.length) return [];
      const headers = raw[0].map((h, i) => h || `col_${i}`);
      rows = raw.slice(1).map(r => Object.fromEntries(r.map((v, i) => [headers[i], v])));
    }
    return rows.map(row => this.normalizeRow(row, src)).filter(Boolean);
  }

  // ── Excel ────────────────────────────────────────────────────────
  parseExcel(filePath, src) {
    const wb = XLSX.readFile(filePath, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return rows.map(row => this.normalizeRow(row, src)).filter(Boolean);
  }

  // ── PDF ──────────────────────────────────────────────────────────
  async parsePDF(filePath, src) {
    try {
      const pdfParse = require('pdf-parse');
      const buffer   = fs.readFileSync(filePath);
      const data     = await pdfParse(buffer);
      return this.extractFromText(data.text, src);
    } catch {
      return [];
    }
  }

  extractFromText(text, src) {
    const records = [];
    const lines   = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Address pattern: number + street name
    const addrRe  = /(\d{1,6}\s+[A-Z][a-zA-Z\s]+(?:St|Ave|Blvd|Dr|Rd|Ln|Ct|Way|Pl|Ter|Cir|Hwy|Pkwy)\.?)/gi;
    // Dollar amounts
    const amtRe   = /\$[\d,]+(?:\.\d{2})?/g;
    // Case numbers
    const caseRe  = /(?:Case|Case No\.?|#)\s*:?\s*([A-Z0-9-]+)/gi;
    // Dates
    const dateRe  = /(\d{1,2}\/\d{1,2}\/\d{2,4})/g;
    // Parcel numbers
    const parcelRe = /(?:Parcel|APN|PIN|Folio)\s*:?\s*([0-9-]+)/gi;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const addrMatch = line.match(addrRe);
      if (addrMatch) {
        const context = lines.slice(Math.max(0, i-2), i+3).join(' ');
        const amounts = context.match(amtRe) || [];
        const dates   = context.match(dateRe) || [];
        const cases   = [...context.matchAll(caseRe)].map(m => m[1]);
        const parcels = [...context.matchAll(parcelRe)].map(m => m[1]);

        records.push({
          address:     addrMatch[0],
          amount:      amounts[0] || '',
          date:        dates[0] || '',
          case_number: cases[0] || '',
          parcel:      parcels[0] || '',
          raw_text:    context,
          lead_type:   src.type,
          state:       src.state,
          market:      src.market,
          source_url:  src.url,
        });
      }
    }
    return records;
  }

  // ── JSON (from Playwright extractions) ───────────────────────────
  parseJSON(filePath, src) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rows = Array.isArray(data) ? data : [data];
    return rows.map(row => this.normalizeRow(row, src)).filter(Boolean);
  }

  // ── HTML ─────────────────────────────────────────────────────────
  parseHTML(filePath, src) {
    try {
      const cheerio = require('cheerio');
      const $ = cheerio.load(fs.readFileSync(filePath, 'utf8'));
      const rows = [];
      $('table tr').each((i, row) => {
        if (i === 0) return;
        const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
        if (cells.length >= 2) rows.push({ raw: cells });
      });
      return rows.map(row => this.normalizeRow(row, src)).filter(Boolean);
    } catch {
      return [];
    }
  }

  // ── Row normalizer — maps any column name to standard fields ─────
  normalizeRow(row, src) {
    if (!row) return null;

    // Collect all values for fuzzy matching
    const keys   = Object.keys(row);
    const values = Object.values(row);

    // Find address
    const address = this.findField(row, [
      'address', 'property_address', 'site_address', 'parcel_address',
      'situs', 'location', 'Address', 'Property Address', 'Site Address'
    ]) || (Array.isArray(row.raw) ? row.raw[1] : '') || '';

    if (!address && !row.caseNumber && !row.raw) return null;

    // Try to find city from address or dedicated field
    const city = this.findField(row, ['city', 'City', 'municipality', 'Municipality'])
      || this.extractCity(address, src.market);

    return {
      address:      this.cleanAddress(address),
      city:         city || '',
      state:        src.state,
      zip:          this.findField(row, ['zip', 'zipcode', 'zip_code', 'Zip', 'ZipCode', 'postal']) || this.extractZip(address),
      county:       this.findField(row, ['county', 'County']) || src.market,
      owner_name:   this.findField(row, ['owner', 'owner_name', 'Name', 'Grantor', 'Defendant', 'taxpayer']) || '',
      mailing_addr: this.findField(row, ['mailing', 'mailing_address', 'mail_addr']) || '',
      parcel:       this.findField(row, ['parcel', 'apn', 'pin', 'folio', 'parcel_number', 'Parcel']) || '',
      case_number:  this.findField(row, ['case', 'case_number', 'case_no', 'caseNumber', 'CaseNo']) || '',
      auction_date: this.findField(row, ['auction', 'sale_date', 'foreclosure_date', 'hearing_date', 'auction_date']) || '',
      lien_amount:  this.findField(row, ['amount', 'lien', 'balance', 'amount_due', 'total_due', 'Amount']) || '',
      doc_type:     this.findField(row, ['type', 'doc_type', 'document_type', 'case_type', 'violation_type']) || src.type,
      filed_date:   this.findField(row, ['filed', 'filed_date', 'record_date', 'date', 'Date', 'RecordDate']) || '',
      lead_type:    src.type,
      source_url:   src.url,
      market:       src.market,
      raw:          row,
    };
  }

  findField(row, candidates) {
    for (const key of candidates) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) {
        return String(row[key]).trim();
      }
      // Case-insensitive search
      const found = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
      if (found && row[found] !== undefined && String(row[found]).trim()) {
        return String(row[found]).trim();
      }
    }
    // Check raw array
    if (Array.isArray(row.raw)) {
      // Try positional — first element often is case#, second address
      if (candidates.some(c => c.includes('address')) && row.raw[1]) return row.raw[1];
      if (candidates.some(c => c.includes('case'))    && row.raw[0]) return row.raw[0];
    }
    return '';
  }

  cleanAddress(addr) {
    if (!addr) return '';
    return addr
      .replace(/\s+/g, ' ')
      .replace(/,+/g, ',')
      .trim();
  }

  extractCity(address, market) {
    // Try from market string e.g. "Dallas, TX"
    const mkt = market.split(',')[0].trim();
    if (mkt && !mkt.includes('County')) return mkt;
    // Try from address — after first comma
    const parts = address.split(',');
    return parts.length > 1 ? parts[1].trim() : '';
  }

  extractZip(address) {
    const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
    return m ? m[1] : '';
  }
}

module.exports = FileParser;
