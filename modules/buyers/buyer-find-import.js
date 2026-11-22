'use strict';

const finds = require('./assistant-finds');
const deals = require('../deals/reviewed-deals');
const activity = require('../records/record-activity');
const conversations = require('../records/conversations');
const pipeline = require('../records/pipeline-reports');
const pipelineReviews = require('../records/pipeline-report-review');
const BULK_APPROVAL_CLASSES = new Set(['end_buyer', 'end_buyer_strict', 'end_buyer_stale']);
function fail(code, status = 400) { const error = new Error(code); error.code = code; error.status = status; throw error; }
function editableRevision(store, revision, now) {
  const view=pipeline.project(store,{now}),item=view.items.find(row=>row.id===revision),reviewed=pipelineReviews.project(store,{now,items:view.items}),review=reviewed.reviews.get(revision);
  if(view.coverage.invalid_reports||view.coverage.conflicting_report_ids||reviewed.coverage.invalid_reviews||!item||item.address_withheld||review?.can_review!==true||review.conflict)fail('find_pipeline_changed',409);
  return {report:(store.pipeline_reports || []).find(row=>row.id===revision)?.report,version:review.version};
}

function validateAgentItems(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'items')) fail('find_request_invalid');
  if (Buffer.byteLength(JSON.stringify(body)) > finds.MAX_REQUEST_BYTES) fail('find_request_too_large', 413);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > finds.MAX_ITEMS) fail('find_item_limit');
  return body.items.map(item => item?.kind === 'pipeline_item' ? pipeline.validate(item,now) : item?.kind === 'conversation' ? conversations.validate(item,now) :
    item?.kind === 'interaction' ? activity.validateInteraction(item,now) :
    item?.kind === 'deal' ? deals.validate(item,now) :
    finds.validateItems({items:[item?.kind === 'buyer' ? Object.fromEntries(Object.entries(item).filter(([key])=>key!=='kind')) : item]},now)[0]);
}

function prepareImport(store, body, { now }) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['items','expected_pipeline_revision','expected_pipeline_version'].includes(key))) fail('find_request_invalid');
  if(Object.hasOwn(body,'expected_pipeline_version')!==Object.hasOwn(body,'expected_pipeline_revision'))fail('find_request_invalid');
  if (Buffer.byteLength(JSON.stringify(body)) > finds.MAX_REQUEST_BYTES) fail('find_request_too_large', 413);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > finds.MAX_ITEMS) fail('find_item_limit');
  const items = [];
  const rejected = [];
  body.items.forEach((item, index) => {
    try {
      if (item && item.kind === 'pipeline_item') items.push(pipeline.validate(item, now));
      else if (item && item.kind === 'conversation') items.push(conversations.validate(item, now));
      else if (item && item.kind === 'interaction') items.push(activity.validateInteraction(item, now));
      else if (item && item.kind === 'deal') items.push(deals.validate(item, now));
      else if (item && item.kind === 'deal_update') items.push(deals.validateDealUpdate(store,item,now));
      else { const buyer = item && item.kind === 'buyer' ? Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'kind')) : item; items.push(finds.validateItems({ items: [buyer] }, now)[0]); }
    }
    catch (error) { rejected.push({ item: index + 1, reason: /^find_[a-z_]+$/.test(error.code || '') ? error.code : 'find_item_invalid' }); }
  });
  const latestRevision = id => (store.pipeline_reports || []).filter(row=>row.report?.report_id===id).sort((a,b)=>b.report.captured_at.localeCompare(a.report.captured_at))[0]?.id || null;
  if(Object.hasOwn(body,'expected_pipeline_revision')){
    if(typeof body.expected_pipeline_revision!=='string'||! /^[a-f0-9]{64}$/.test(body.expected_pipeline_revision)||typeof body.expected_pipeline_version!=='string'||! /^[a-f0-9]{64}$/.test(body.expected_pipeline_version)||body.items.length!==1||items.length!==1||items[0].kind!=='pipeline_item')fail('find_request_invalid');
    if(latestRevision(items[0].report_id)!==body.expected_pipeline_revision)fail('find_pipeline_changed',409);
    const current=editableRevision(store,body.expected_pipeline_revision,now),prior=current.report,editable=new Set(['buyer_price','contract_price','costs','our_share','captured_at','evidence_text']);
    if(current.version!==body.expected_pipeline_version)fail('find_pipeline_changed',409);
    if(!prior||Object.keys(prior).some(key=>!editable.has(key)&&JSON.stringify(prior[key])!==JSON.stringify(items[0][key])))fail('find_pipeline_context_changed',409);
  }
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
  const pipeline_versions=items.filter(item=>item.kind==='pipeline_item').map(item=>({report_id:item.report_id,revision:latestRevision(item.report_id)}));
  return { items, deal_versions, pipeline_versions, pipeline_editor_revision:body.expected_pipeline_revision || null, pipeline_editor_version:body.expected_pipeline_version || null, summary: { counts, rejected } };
}

function commitImport(store, plan, { now, operatorId, createId, bulkApprove = false }) {
  if (!plan.items.length) fail('find_import_empty');
  for(const version of plan.pipeline_versions || []){
    const current=(store.pipeline_reports || []).filter(row=>row.report?.report_id===version.report_id).sort((a,b)=>b.report.captured_at.localeCompare(a.report.captured_at))[0]?.id || null;
    if(current!==version.revision)fail('find_pipeline_changed',409);
  }
  if(plan.pipeline_editor_revision&&editableRevision(store,plan.pipeline_editor_revision,now).version!==plan.pipeline_editor_version)fail('find_pipeline_changed',409);
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
    const result = item.kind === 'pipeline_item' ? pipeline.upsert(updated,item,context) : item.kind === 'conversation' ? conversations.upsert(updated,item,context) : item.kind === 'interaction' ? activity.importInteraction(updated, item, context) : ['deal','deal_update'].includes(item.kind) ? deals.ingest(updated, [item], context) : finds.ingest(updated, [item], context);
    updated = result.store; results.push(result.results[0]);
  }
  return { store: updated, results };
}
module.exports = { prepareImport, commitImport, validateAgentItems, ingestMixed, BULK_APPROVAL_CLASSES };
