'use strict';

const finds = require('./assistant-finds');
const BULK_APPROVAL_CLASSES = new Set(['end_buyer', 'end_buyer_strict', 'end_buyer_stale']);
function fail(code, status = 400) { const error = new Error(code); error.code = code; error.status = status; throw error; }

function prepareImport(store, body, { now }) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'items')) fail('find_request_invalid');
  if (Buffer.byteLength(JSON.stringify(body)) > finds.MAX_REQUEST_BYTES) fail('find_request_too_large', 413);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > finds.MAX_ITEMS) fail('find_item_limit');
  const items = [];
  const rejected = [];
  body.items.forEach((item, index) => {
    try { items.push(finds.validateItems({ items: [item] }, now)[0]); }
    catch (error) { rejected.push({ item: index + 1, reason: /^find_[a-z_]+$/.test(error.code || '') ? error.code : 'find_item_invalid' }); }
  });
  let sequence = 0;
  const preview = finds.ingest(store, items, { now, operatorId: 'preview', createId: () => '__preview_' + (++sequence) });
  const counts = { new_items: 0, duplicates: 0, rejected: rejected.length, bulk_approval_eligible: 0 };
  preview.results.forEach((result, index) => {
    if (result.result === 'created') {
      counts.new_items++;
      if (BULK_APPROVAL_CLASSES.has(items[index].classification)) counts.bulk_approval_eligible++;
    } else counts.duplicates++;
  });
  return { items, summary: { counts, rejected } };
}

function commitImport(store, plan, { now, operatorId, createId, bulkApprove = false }) {
  if (!plan.items.length) fail('find_import_empty');
  const result = finds.ingest(store, plan.items, { now, operatorId, createId });
  let updated = result.store;
  let approved = 0;
  result.results.forEach((entry, index) => {
    if (bulkApprove && entry.result === 'created' && BULK_APPROVAL_CLASSES.has(plan.items[index].classification)) {
      updated = finds.update(updated, entry.id, { approval: 'approved', reason: 'approved before import' }, { now, operatorId });
      approved++;
    }
  });
  return { store: updated, summary: { created: result.results.filter(entry => entry.result === 'created').length,
    duplicates: result.results.filter(entry => entry.result === 'duplicate').length, rejected: plan.summary.counts.rejected, approved } };
}

module.exports = { prepareImport, commitImport, BULK_APPROVAL_CLASSES };
