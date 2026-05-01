'use strict';
const path = require('path');
const fs   = require('fs');

class FileParser {
  async parse(filePath, src) {
    var ext = path.extname(filePath).toLowerCase();
    try {
      if (ext === '.pdf') return await this.parsePDF(filePath, src);
      if (ext === '.csv' || ext === '.txt') return this.parseCSV(filePath, src);
      if (ext === '.xlsx' || ext === '.xls') return this.parseExcel(filePath, src);
      if (ext === '.json') return this.parseJSON(filePath, src);
      console.log('[file-parser] unknown ext: ' + ext + ' for ' + path.basename(filePath));
      return [];
    } catch(e) {
      console.error('[file-parser] parse error ' + path.basename(filePath) + ': ' + e.message);
      return [];
    }
  }

  async parsePDF(filePath, src) {
    var records = [];
    var confidence = 'low';
    try {
      var pdfParse = require('pdf-parse');
      var buf = fs.readFileSync(filePath);
      var data = await pdfParse(buf);
      var text = data.text || '';
      if (text.trim().length < 50) {
        // Likely scanned image — store PDF ref, mark for OCR
        records.push({
          address: '',
          city: src.market ? src.market.split(',')[0].trim() : '',
          state: src.state,
          county: src.market,
          pdf_path: filePath,
          pdf_text: '',
          pdf_confidence: 'scanned_image',
          source_type: src.type,
          needs_ocr: true
        });
        return records;
      }
      confidence = 'high';
      // Parse addresses from text
      var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
      var addrPattern = /\d{1,5}\s+[A-Za-z0-9\s]{3,40}(?:St|Ave|Blvd|Dr|Rd|Ln|Ct|Way|Pl|Hwy|Pkwy|Cir|Ter|Trail|Row|Sq)[\.\s]/i;
      var currentRecord = {};
      lines.forEach(function(line) {
        var addrMatch = line.match(addrPattern);
        if (addrMatch) {
          if (currentRecord.address) records.push(Object.assign({}, currentRecord));
          currentRecord = {
            address: addrMatch[0].trim(),
            city: src.market ? src.market.split(',')[0].trim() : '',
            state: src.state,
            county: src.market,
            pdf_path: filePath,
            pdf_confidence: confidence,
            source_type: src.type,
            raw_line: line
          };
          // Look for owner name, amounts
          var amountMatch = line.match(/\$[\d,]+/);
          if (amountMatch) currentRecord.lien_amount = amountMatch[0];
        } else if (currentRecord.address) {
          // Look for owner name in following lines
          if (!currentRecord.owner_name && line.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+/)) {
            currentRecord.owner_name = line;
          }
          var amtMatch = line.match(/\$[\d,]+/);
          if (amtMatch && !currentRecord.lien_amount) currentRecord.lien_amount = amtMatch[0];
          var dateMatch = line.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
          if (dateMatch && !currentRecord.filed_date) currentRecord.filed_date = dateMatch[0];
        }
      });
      if (currentRecord.address) records.push(currentRecord);
    } catch(e) {
      console.error('[file-parser] PDF error: ' + e.message);
      // Always store the file path for Google Drive upload even if parse fails
      records.push({
        address: '',
        state: src.state,
        county: src.market,
        pdf_path: filePath,
        pdf_confidence: 'parse_failed',
        source_type: src.type,
        parse_error: e.message
      });
    }
    return records;
  }

  parseCSV(filePath, src) {
    var records = [];
    try {
      var text = fs.readFileSync(filePath, 'utf8');
      var lines = text.split('\n').filter(function(l){ return l.trim(); });
      if (lines.length < 2) return records;
      var headers = lines[0].split(',').map(function(h){ return h.trim().toLowerCase().replace(/[^a-z0-9_]/g,'_'); });
      lines.slice(1).forEach(function(line) {
        var cols = line.split(',');
        var row = {};
        headers.forEach(function(h, i){ row[h] = (cols[i]||'').trim(); });
        var addr = row.address || row.site_address || row.property_address || row.situs || '';
        if (!addr) return;
        records.push({
          address:    addr,
          city:       row.city || src.market.split(',')[0].trim(),
          state:      row.state || src.state,
          county:     row.county || src.market,
          zip:        row.zip || row.zip_code || '',
          owner_name: row.owner || row.owner_name || '',
          lien_amount: row.amount || row.lien_amount || row.tax_amount || '',
          filed_date:  row.date || row.filed_date || row.case_date || '',
          case_number: row.case || row.case_number || row.record_id || '',
          source_type: src.type,
          pdf_confidence: 'csv_direct'
        });
      });
    } catch(e) {
      console.error('[file-parser] CSV error: ' + e.message);
    }
    return records;
  }

  parseExcel(filePath, src) {
    var records = [];
    try {
      var XLSX = require('xlsx');
      var wb = XLSX.readFile(filePath);
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      rows.forEach(function(row) {
        var addr = row['Address'] || row['Site Address'] || row['Property Address'] || row['Situs'] || row['address'] || '';
        if (!addr) return;
        records.push({
          address:    String(addr).trim(),
          city:       String(row['City'] || row['city'] || src.market.split(',')[0].trim()),
          state:      String(row['State'] || row['state'] || src.state),
          county:     String(row['County'] || row['county'] || src.market),
          zip:        String(row['Zip'] || row['Zip Code'] || row['zip'] || ''),
          owner_name: String(row['Owner'] || row['Owner Name'] || row['owner'] || ''),
          lien_amount: String(row['Amount'] || row['Lien Amount'] || row['Tax Amount'] || ''),
          filed_date:  String(row['Date'] || row['Filed Date'] || row['Case Date'] || ''),
          case_number: String(row['Case #'] || row['Case Number'] || row['Record ID'] || ''),
          source_type: src.type,
          pdf_confidence: 'excel_direct'
        });
      });
    } catch(e) {
      console.error('[file-parser] Excel error: ' + e.message);
    }
    return records;
  }

  parseJSON(filePath, src) {
    try {
      var data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      var rows = Array.isArray(data) ? data : (data.features || data.records || data.data || []);
      return rows.map(function(r) {
        var props = r.properties || r.attributes || r;
        return {
          address:    String(props.address || props.Address || props.ADDRESS || ''),
          city:       String(props.city || props.City || src.market.split(',')[0].trim()),
          state:      String(props.state || props.State || src.state),
          county:     String(props.county || props.County || src.market),
          zip:        String(props.zip || props.Zip || props.zipcode || ''),
          owner_name: String(props.owner || props.Owner || props.owner_name || ''),
          source_type: src.type,
          pdf_confidence: 'json_direct'
        };
      }).filter(function(r){ return r.address; });
    } catch(e) {
      console.error('[file-parser] JSON error: ' + e.message);
      return [];
    }
  }
}

module.exports = FileParser;
