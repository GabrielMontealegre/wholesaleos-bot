'use strict';

const finds = require('./assistant-finds');
const deals = require('../deals/reviewed-deals');
const activity = require('../records/record-activity');
const BULK_APPROVAL_CLASSES = new Set(['end_buyer', 'end_buyer_strict', 'end_buyer_stale']);
function fail(code, status = 400) { const error = new Error(code); error.code = code; error.status = status; throw error; }

function prepareImport(store, body, { now }) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'items')) fail('find_request_invalid');
  if (Buffer.byteLength(JSON.stringify(body)) > finds.MAX_REQUEST_BYTES) fail('find_request_too_large', 413);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > finds.MAX_ITEMS) fail('find_item_limit');
  const items = [];
  const rejected = [];
  body.items.forEach((item, index) => {
    try {
      if (item && item.kind === 'interaction') items.push(activity.validateInteraction(item, now));
      else if (item && item.kind === 'deal') items.push(deals.validate(item, now));
      else if (item && item.kind === 'deal_update') items.push(deals.validateDealUpdate(store,item,now));
      else { const buyer = item && item.kind === 'buyer' ? Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'kind')) : item; items.push(finds.validateItems({ items: [buyer] }, now)[0]); }
    }
    catch (error) { rejected.push({ item: index + 1, reason: /^find_[a-z_]+$/.test(error.code || '') ? error.code : 'find_item_invalid' }); }
  });
  let sequence = 0;
  const preview = ingestMixed(store, items, { now, operatorId: 'preview', createId: () => '__preview_' + (++sequence) });
  const counts = { new_items: 0, updates:0, duplicates: 0, rejected: rejected.length, bulk_approval_eligible: 0 };
  preview.results.forEach((result, index) => {
    if (result.result === 'created') {
      counts.new_items++;
      if (BULK_APPROVAL_CLASSES.has(items[index].classification)) counts.bulk_approval_eligible++;
    } else if(result.result==='updated') counts.updates++; else counts.duplicates++;
  });
  const deal_versions = items.filter(item=>item.kind==='deal_update').map(item=>({ref:item.ref,value:JSON.stringify((store.reviewed_deals || []).find(d=>activity.reference(d)===item.ref))}));
  return { items, deal_versions, summary: { counts, rejected } };
}

function commitImport(store, plan, { now, operatorId, createId, bulkApprove = false }) {
  if (!plan.items.length) fail('find_import_empty');
  for (const version of plan.deal_versions || []) {
    if (JSON.stringify((store.reviewed_deals || []).find(d=>activity.reference(d)===version.ref)) !== version.value) fail('find_deal_update_conflict',409);
  }
  const result = ingestMixed(store, plan.items, { now, operatorId, createId });
  let updated = result.store;
  let approved = 0;
  result.results.forEach((entry, index) => {
    if (bulkApprove && entry.result === 'created' && BULK_APPROVAL_CLASSES.has(plan.items[index].classification)) {
      updated = finds.update(updated, entry.id, { approval: 'approved', reason: 'approved before import' }, { now, operatorId });
      approved++;
    }
  });
  return { store: updated, summary: { created: result.results.filter(entry => entry.result === 'created').length,
    updated:result.results.filter(entry=>entry.result==='updated').length,
    duplicates: result.results.filter(entry => entry.result === 'duplicate').length, rejected: plan.summary.counts.rejected, approved } };
}

function ingestMixed(store, items, context) {
  let updated = store; const results = [];
  for (const item of items) {
    const result = item.kind === 'interaction' ? activity.importInteraction(updated, item, context) : ['deal','deal_update'].includes(item.kind) ? deals.ingest(updated, [item], context) : finds.ingest(updated, [item], context);
    updated = result.store; results.push(result.results[0]);
  }
  return { store: updated, results };
}
module.exports = { prepareImport, commitImport, BULK_APPROVAL_CLASSES };
