'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const states=require('../modules/research/lead-operations-state');
const source=fs.readFileSync(path.join(__dirname,'../dashboard/wos-public-deals.js'),'utf8');
let effects=0;const denied=()=>{effects++;throw Error('source state label side effect');};
const context={window:{},document:{readyState:'loading',addEventListener(){}},MutationObserver:function(){},setTimeout(){},setInterval(){},fetch:denied};
vm.runInNewContext(source,context);const hooks=context.window.__wosPublicDealsTestHooks;
const expected={LOCKED:'Needs verification',CALL_READY:'Phone route recorded',OUTREACH_READY:'Contact route recorded',MAIL_READY:'Mailing route recorded',NEEDS_CONTACT_SEARCH:'Contact search needed',NEEDS_SKIP_TRACE:'Contact lookup needed',NEEDS_COMPS:'Comparable sales needed',TITLE_NEEDED:'Title review needed',CLOSED_NOT_INTERESTED:'Closed: not interested',CONTACT_COMPLETE:'Contact recorded',PROPERTY_READY:'Property research ready',NEEDS_PROPERTY_FACTS:'Property facts needed',NEEDS_VALUE_SOURCE:'Value evidence needed'};
for(const [kind,values] of [['row',states.ROW_STATES],['contact',states.CONTACT_STATES],['property',states.PROPERTY_STATES]]){
  for(const value of Object.values(values))assert.equal(hooks.sourceStateLabel(value,kind),expected[value]);
  for(const value of ['__proto__','toString','constructor','APPROVED',null,undefined,true,{},['CALL_READY'],'<img src=x>'])assert.equal(hooks.sourceStateLabel(value,kind),'Status not confirmed');
}
assert.equal(hooks.sourceStateLabel('CALL_READY','property'),'Status not confirmed');
assert.equal(hooks.sourceStateLabel('PROPERTY_READY','contact'),'Status not confirmed');
assert.equal(hooks.sourceStateLabel('CONTACT_COMPLETE','row'),'Status not confirmed');
assert.equal(hooks.sourceStateLabel('CALL_READY','__proto__'),'Status not confirmed');
assert.equal(hooks.sourceStateLabel('CALL_READY',{toString:()=> 'row'}),'Status not confirmed');
for(const [value,label] of Object.entries({INSPECT_NOW:'Review now',NEEDS_ZIP_REVIEW:'Postal code needs review',SOURCE_PROOF_ONLY:'Source reference only',REJECTED_GENERIC:'Not a property lead',NEEDS_IDENTITY:'Identity needs verification'}))assert.equal(hooks.sourceStateLabel(value,'quality'),label);
const row={queue_key:'synthetic-row-key',normalized_address:'100 Example St',row_state:'NEEDS_COMPS',contact_state:'CONTACT_COMPLETE',property_state:'NEEDS_COMPS',row_state_reason:'Synthetic source reason <img src=x>.',contact_state_reason:'Synthetic contact reason.',property_state_reason:'Synthetic property reason.',next_best_action:'SYNTHETIC_ACTION',risk_flags:[],missing_fields:[]};
const before=JSON.stringify(row),html=hooks.rowCard(row);
for(const value of ['Comparable sales needed','Contact recorded','Source status details','Legacy combined state: NEEDS_COMPS','Contact state: CONTACT_COMPLETE','Property state: NEEDS_COMPS','data-queue-key="synthetic-row-key"','SYNTHETIC_ACTION'])assert(html.includes(value));
assert(html.includes('&lt;img src=x&gt;'));assert(!html.includes('<img src=x>'));assert.equal(JSON.stringify(row),before);assert.equal(effects,0);
console.log('source-card-state-words: canonical row/contact/property enums, quality fallback, unknown/prototype/wrong-origin guards, exact source codes/reasons/identity/action preservation and no network/writes PASS');
