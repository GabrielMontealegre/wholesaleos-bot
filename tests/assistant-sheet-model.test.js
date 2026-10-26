'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const model = require('../dashboard/workspace/assistant-model');
const { appendSnapshot, latestSnapshot } = require('../modules/records/assistant-snapshot');
const now = '2026-10-26T15:00:00Z';
function fixture() {
  return { schema:'wos-assistant-snapshot',version:1,generated_at:'2026-10-26T13:00:00Z',
    deals:[{id:'demo-deal',name:'Synthetic property',stage:'finding_buyer',people:[{name:'Synthetic person',role:'buyer',phone:null,email:null}],
      numbers:{ask:0,seller_number:null,our_offer:null,target:null,value_fixed:null,repairs:null,buyer_number:{amount:null,buyer:null},fee_estimate_low:0,fee_estimate_high:0},
      next_seller:null,next_buyer:'Ask a question.',needs_gabriel:'Review the reported offer.',updated_at:'2026-10-26T12:00:00Z',log:[{at:'2026-10-25',text:'Reported event.'}],source_file:'deal-brains/demo.md'}],
    buyers:[{id:'demo-buyer',name:'Synthetic buyer',company:null,areas:['Example Area'],buy_box:null,pof:null,approval:'approved',last_contact:'2026-10-25',deals_sent:['demo-deal'],phone:null,email:null,source_url:null}],
    calls:[{name:'Synthetic person',role:'seller',phone:'+1 (555) 123-4567',why:'Confirm status.',questions:['What changed?'],deal:'demo-deal',rank:2}],
    texts:[{id:'demo-text',to_name:'Synthetic person',role:'seller',phone:'+15551234567',text:'Question & <script>not markup</script>',deal:'demo-deal',status:'drafted',drafted_at:'2026-10-25'}],
    emails_waiting:[{who:'Synthetic person',role:'buyer',subject:'Reported subject',deal:'demo-deal',draft_ref:'opaque-draft-ref',rank:1}] };
}
const raw = Buffer.from(JSON.stringify(fixture()));
const store = appendSnapshot({ buyers:[],reviewed_deals:[] },raw,{now,operatorId:'synthetic-owner',filename:'snapshot.json'});
const receipt = latestSnapshot(store,{now,operatorId:'synthetic-owner'});
const before = JSON.stringify(receipt), output = model.project(receipt);
assert.equal(JSON.stringify(receipt),before);
assert.equal(output.stages[0].deals[0].numbers.ask,0);
assert.equal(output.stages[0].deals[0].numbers.repairs,null);
assert.equal(output.stages[0].deals[0].numbers.fee_estimate_low,0);
assert.equal(output.needs_next.id,'demo-deal');
assert.equal(output.calls[0].href,'tel:+15551234567');
assert.equal(output.texts[0].href,'sms:+15551234567?&body='+encodeURIComponent(fixture().texts[0].text));
assert.equal(output.texts[0].device_key,receipt.file_sha256+':demo-text');
assert.equal(output.emails[0].href,'/app?preview=1&view=email','Opaque draft IDs do not become guessed Gmail URLs');
assert.equal(output.reported_approved_buyers,1);
assert.equal(output.buyers[0].reported_pof,null);
assert.equal(output.buyers[0].reported_approval,'approved');
assert.equal(output.buyers[0].last_contact,'2026-10-25');
assert.equal(output.recent_replies,null,'Contact never becomes reply evidence or reply ordering');
assert.deepEqual(output.calls[0].provenance,{source_kind:'assistant_snapshot_import',generated_at:receipt.generated_at,source_file:'snapshot.json',reported:true});
assert.equal(output.stages[0].deals[0].provenance.source_file,'deal-brains/demo.md');
assert.equal(store.buyers.length,0);
assert.equal(store.reviewed_deals.length,0);
assert.equal(model.project(null),null);
function invalid(change) { const value=structuredClone(receipt);change(value);assert.throws(()=>model.project(value),/^Error: assistant_sheet_invalid$/); }
invalid(r=>{r.source_kind='canonical_record';});
invalid(r=>{delete r.id;});
invalid(r=>{r.file_sha256='forged';});
invalid(r=>{r.generated_at='2026-02-30T12:00:00Z';r.snapshot.generated_at=r.generated_at;});
invalid(r=>{r.generated_at='2026-10-27T12:00:00Z';r.snapshot.generated_at=r.generated_at;});
invalid(r=>{r.snapshot.version=2;});
invalid(r=>{r.snapshot.deals.push(r.snapshot.deals[0]);});
invalid(r=>{r.snapshot.texts[0].id=r.snapshot.buyers[0].id;});
invalid(r=>{r.snapshot.calls[0].deal='unrelated';});
invalid(r=>{r.snapshot.deals[0].source_file='../private.md';});
invalid(r=>{r.filename='../../private.json';});
invalid(r=>{r.snapshot.deals[0].numbers.ask='0';});
invalid(r=>{r.snapshot.buyers[0].pof='true';});
invalid(r=>{r.snapshot.buyers[0].last_contact='10/06/2026';});
invalid(r=>{r.snapshot.buyers[0].last_contact='2026-10-27';});
invalid(r=>{r.snapshot.deals[0].updated_at='2026-10-27T12:00:00Z';});
invalid(r=>{r.snapshot.buyers[0].deals_sent=[null];});
invalid(r=>{r.snapshot.buyers[0].source_url='javascript:alert(1)';});
invalid(r=>{r.snapshot.deals[0].log[0].at='2026-02-30';});
invalid(r=>{r.snapshot.calls[0].rank=0;});
invalid(r=>{delete r.snapshot.calls[0];});
let callbacks=0;
const accessor=structuredClone(receipt);Object.defineProperty(accessor.snapshot.deals[0],'name',{get(){callbacks++;throw Error('private-text');},enumerable:true});
assert.throws(()=>model.project(accessor),/assistant_sheet_invalid/);assert.equal(callbacks,0);
for(const phone of ['javascript:alert(1)','+1555;ext=999','+1555?body=forged','555','...','1\n5551234567',null]) assert.equal(model.phoneLink(phone),null);
assert.equal(model.phoneLink('+15551234567','\ud800'),null);
const empty=fixture();for(const key of ['deals','buyers','calls','texts','emails_waiting'])empty[key]=[];
const emptyReceipt=latestSnapshot(appendSnapshot({},Buffer.from(JSON.stringify(empty)),{now,operatorId:'owner',filename:'empty.json'}),{now,operatorId:'owner'});
const emptyOutput=model.project(emptyReceipt);assert.equal(emptyOutput.needs_next,null);assert.equal(emptyOutput.reported_approved_buyers,0);
const reordered=structuredClone(receipt);
reordered.snapshot.calls.push({...reordered.snapshot.calls[0],name:'First by rank',rank:1});
reordered.snapshot.texts.push({...reordered.snapshot.texts[0],id:'already-sent',status:'sent'});
reordered.snapshot.deals.push({...structuredClone(reordered.snapshot.deals[0]),id:'dead-deal',stage:'dead',needs_gabriel:null});
assert.equal(model.project(reordered).calls[0].name,'First by rank');
assert.equal(model.project(reordered).texts.length,1,'Reported sent/replied drafts are not queued to send again');
assert.equal(model.project(reordered).stages[5].deals.length,1,'Dead deals retained,not silently discarded');
const oldNow=Date.now,oldFetch=global.fetch;
try { Date.now=()=>{throw Error('ambient clock');};global.fetch=()=>{throw Error('network');};assert.deepEqual(model.project(receipt),output); }
finally {Date.now=oldNow;global.fetch=oldFetch;}
const browser={window:{},URL,console};vm.runInNewContext(fs.readFileSync(require.resolve('../dashboard/workspace/assistant-model'),'utf8'),browser);
assert.equal(vm.runInNewContext('window.WOSAssistantModel.project(JSON.parse('+JSON.stringify(before)+')).reported_approved_buyers',browser),1);
console.log('assistant-sheet-model: real importer receipts,reported-only provenance,unknown/zero,rank/source/link/identity negatives,reply gap,private-safe errors and purity passed;not wired UI');
