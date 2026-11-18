'use strict';

// B-23: one generic reader per format. Each takes the already-fetched body plus reader
// options from the profile and returns rows with a row reference that points back to the
// exact place in the source (row number, feature id, page and line). Pure: no network,
// no clock, no writes. Rows are never dropped here; empty rows are reported as skipped.

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function nonEmptyFields(fields) {
  return Object.values(fields).some((value) => clean(value) !== '');
}

function finish(reader, rawRows, warnings = []) {
  const rows = [];
  let skipped = 0;
  for (const row of rawRows) {
    if (nonEmptyFields(row.fields)) rows.push(row); else skipped += 1;
  }
  return { reader, rows, skipped_empty: skipped, warnings };
}

function readCsv(text, options = {}) {
  const { parse } = require('csv-parse/sync');
  const records = parse(String(text || ''), {
    columns: true, skip_empty_lines: true, relax_column_count: true, trim: true, bom: true, info: true
  });
  const idField = clean(options.id_field);
  return finish('csv', records.map(({ record: fields, info }, index) => ({
    fields,
    // The parser's physical end line includes blank and quoted multiline records.
    row_reference: idField && clean(fields[idField]) ? `${idField} ${clean(fields[idField])}` : `row ${index + 1} (line ${info.lines})`
  })));
}

function readXlsx(buffer, options = {}) {
  const XLSX = require('xlsx');
  const book = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'array', cellDates: false });
  const sheetName = clean(options.sheet) || book.SheetNames[0];
  const sheet = book.Sheets[sheetName];
  if (!sheet) return finish('xlsx', [], [`sheet_not_found:${sheetName}`]);
  const records = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return finish('xlsx', records.map((fields) => {
    if (!Number.isSafeInteger(fields.__rowNum__) || fields.__rowNum__ < 0) throw new TypeError('worksheet_row_reference_unavailable');
    return { fields, row_reference: `sheet ${sheetName} row ${fields.__rowNum__ + 1}` };
  }));
}

function readArcgisJson(body, options = {}) {
  const data = typeof body === 'string' ? JSON.parse(body) : body;
  if (data && data.error) return finish('arcgis_json', [], [`arcgis_error:${clean(data.error.code)}`]);
  const features = Array.isArray(data && data.features) ? data.features : [];
  const idField = clean(options.id_field) || clean(data && data.objectIdFieldName) || 'OBJECTID';
  const warnings = data && data.exceededTransferLimit ? ['more_rows_than_one_page'] : [];
  return finish('arcgis_json', features.map((feature, index) => {
    const fields = Object.assign({}, feature && feature.attributes);
    const id = clean(fields[idField]);
    return { fields, row_reference: id ? `feature ${idField}=${id}` : `feature index ${index}` };
  }), warnings);
}

function readJsonRows(body, options = {}, reader = 'json_rows') {
  const data = typeof body === 'string' ? JSON.parse(body) : body;
  // rows_path is a dotted path such as "result.records" (CKAN); the default is "data".
  const nested = (clean(options.rows_path) || clean(options.rows_key) || 'data').split('.')
    .reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), data);
  const list = Array.isArray(data) ? data : Array.isArray(nested) ? nested : [];
  const idField = clean(options.id_field) || (reader === 'socrata_json' ? ':id' : '');
  return finish(reader, list.map((fields, index) => {
    const flat = Object.assign({}, fields);
    const id = idField ? clean(flat[idField]) : '';
    return { fields: flat, row_reference: id ? `${idField} ${id}` : `record ${index + 1}` };
  }));
}

function readSocrataJson(body, options = {}) {
  return readJsonRows(body, options, 'socrata_json');
}

function readHtmlTable(html, options = {}) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(String(html || ''));
  const tables = $(clean(options.table_selector) || 'table');
  const tableIndex = Number(options.table_index) || 0;
  const table = tables.eq(tableIndex);
  if (!table.length) return finish('html_table', [], ['table_not_found']);
  let headers = table.find('thead tr').first().find('th,td').map((_, cell) => clean($(cell).text())).get();
  let bodyRows = table.find('tbody tr').get();
  if (!headers.length) {
    const all = table.find('tr').get();
    headers = $(all[0]).find('th,td').map((_, cell) => clean($(cell).text())).get();
    bodyRows = all.slice(1);
  } else if (!bodyRows.length) {
    bodyRows = table.find('tr').get().slice(1);
  }
  return finish('html_table', bodyRows.map((row, index) => {
    const cells = $(row).find('td,th');
    const fields = {};
    cells.each((cellIndex, cell) => {
      const key = headers[cellIndex] || `column_${cellIndex + 1}`;
      fields[key] = clean($(cell).text());
      const link = $(cell).find('a[href]').first().attr('href');
      if (link) fields[`${key} link`] = clean(link);
    });
    return { fields, row_reference: `table ${tableIndex + 1} row ${index + 1}` };
  }));
}

// PDF text arrives already extracted (pdf-parse or OCR happens before the reader, with the
// page split kept). `options.row_pattern` is a regular expression with named groups; each
// matching line becomes a row. Lines that match nothing are counted, never invented into rows.
function readPdfText(pages, options = {}) {
  const pageList = Array.isArray(pages) ? pages : [String(pages || '')];
  if (!clean(options.row_pattern)) return finish('pdf_text', [], ['row_pattern_missing']);
  const pattern = new RegExp(options.row_pattern, 'i');
  const rows = [];
  let unmatched = 0;
  pageList.forEach((pageText, pageIndex) => {
    String(pageText || '').split(/\r?\n/).forEach((line, lineIndex) => {
      const text = clean(line);
      if (!text) return;
      const match = text.match(pattern);
      if (!match || !match.groups) { unmatched += 1; return; }
      rows.push({
        fields: Object.assign({}, match.groups, { source_line: text }),
        row_reference: `page ${pageIndex + 1} line ${lineIndex + 1}`
      });
    });
  });
  return Object.assign(finish('pdf_text', rows), { unmatched_lines: unmatched });
}

const READERS = Object.freeze({
  csv: readCsv, xlsx: readXlsx, arcgis_json: readArcgisJson, socrata_json: readSocrataJson,
  json_rows: readJsonRows, html_table: readHtmlTable, pdf_text: readPdfText
});

function readWithProfile(profile, body, options = {}) {
  const reader = READERS[profile && profile.reader];
  if (!reader) return { reader: '', rows: [], skipped_empty: 0, warnings: ['no_reader_for_format'] };
  return reader(body, options);
}

module.exports = {
  READERS, readCsv, readXlsx, readArcgisJson, readSocrataJson, readJsonRows,
  readHtmlTable, readPdfText, readWithProfile
};
