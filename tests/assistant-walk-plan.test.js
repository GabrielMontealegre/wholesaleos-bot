'use strict';
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/assistant-snapshot-v2-fixture');
const {appendSnapshot,latestSnapshot}=require('../modules/records/assistant-snapshot');
const model=require('../dashboard/workspace/assistant-model');
const {validateV2Fields}=require('../modules/records/assistant-snapshot-v2-fields');
const now='2026-10-31T12:00:00Z',options={now,operatorId:'synthetic-owner',filename:'synthetic.json'};
function project(value){return model.project(latestSnapshot(appendSnapshot({},Buffer.from(JSON.stringify(value)),options),options));}
const source=fixture();source.open_items[0].walk_plan={rung:'agent_video',status:'waiting for a time',scheduled_at:null};
const first=project(source);assert.equal(first.decision_desk.tiers[0].items[0].walk_plan.rung,'agent_video');
assert.equal(Object.hasOwn(project(fixture()).decision_desk.tiers[0].items[0],'walk_plan'),false);
for(const rung of ['agent_video','contractor_bid','paid_walker']){const value=fixture();value.open_items[0].walk_plan={rung,status:'scheduled',scheduled_at:'2026-11-02T15:00:00Z'};assert.equal(project(value).decision_desk.tiers[0].items[0].walk_plan.scheduled_at,'2026-11-02T15:00:00Z');}
const unknown=fixture();unknown.open_items[0].walk_plan={rung:'signed_partner_buyer',status:'Synthetic unverified walker detail',scheduled_at:null};
assert.equal(project(unknown).decision_desk.tiers[0].items[0].walk_buyer_agreement_reported_signed,false,'A rung label is not proof of an agreement');
function signed(){const value=structuredClone(unknown);value.open_items[0].walk_plan.buyer_agreement={buyer_id:value.buyers[0].id,non_circumvention_signed:true,signed_at:'2026-10-30T12:00:00Z',reference:'synthetic-agreement-ref'};return value;}
assert.equal(project(signed()).decision_desk.tiers[0].items[0].walk_buyer_agreement_reported_signed,true);
for(const patch of [{non_circumvention_signed:null,signed_at:null},{non_circumvention_signed:false,signed_at:null},{buyer_id:null},{reference:null},{signed_at:null}]){const value=signed();Object.assign(value.open_items[0].walk_plan.buyer_agreement,patch);assert.equal(project(value).decision_desk.tiers[0].items[0].walk_buyer_agreement_reported_signed,false);}
function invalid(change){const value=signed();change(value.open_items[0].walk_plan,value);assert.throws(()=>project(value),/assistant_snapshot_/);}
for(const patch of [{rung:'buyer'},{status:42},{status:''},{scheduled_at:'11/02/2026'},{scheduled_at:'2026-02-30T12:00:00Z'},{scheduled_at:'2026-11-02T15:00:00-05:00'},{extra:true}])invalid(walk=>Object.assign(walk,patch));
invalid(walk=>{walk.buyer_agreement.buyer_id='wrong-buyer';});invalid(walk=>{walk.buyer_agreement.non_circumvention_signed='true';});invalid(walk=>{walk.buyer_agreement.signed_at='2026-11-01T00:00:00Z';});invalid(walk=>{walk.rung='agent_video';});
const signedSource=signed(),copied=project(signedSource);copied.decision_desk.tiers[0].items[0].walk_plan.buyer_agreement.reference='changed';assert.equal(signedSource.open_items[0].walk_plan.buyer_agreement.reference,'synthetic-agreement-ref');
invalid((walk,value)=>{value.open_items[0].walk_buyer_agreement_reported_signed=true;});
let getters=0;for(const key of ['walk_plan','status']){const value=signed(),target=key==='walk_plan'?value.open_items[0]:value.open_items[0].walk_plan;Object.defineProperty(target,key,{enumerable:true,get(){getters++;return null;}});assert.throws(()=>validateV2Fields(value,{now}),/fields_invalid/);}assert.equal(getters,0);
const nullable=fixture();nullable.open_items[0].walk_plan=null;assert.doesNotThrow(()=>project(nullable));
const {markup}=require('../dashboard/workspace/decision-desk');
const helpers={c:{escape:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),button:()=>''},stamp:value=>value||'Not reported',dollars:value=>value===null?'Not reported':String(value)};
const state={answers:new Map(),notes:new Map(),ready:true,busy:false,uncertain:false,tab:'desk',message:''};
for(const [rung,label] of [['agent_video','agent video call'],['contractor_bid','contractor bid'],['paid_walker','paid walker']]){const value=fixture();value.open_items[0].walk_plan={rung,status:'Synthetic <img src=x>',scheduled_at:null};const html=markup(project(value),state,helpers);assert(html.includes('Walk: '+label+', Synthetic &lt;img src=x&gt;'));assert(!html.includes('Synthetic <img'));}
assert(!markup(project(unknown),state,helpers).includes('Synthetic unverified walker detail'));
const legacyApproval=structuredClone(unknown);legacyApproval.buyers[0].approval='approved';legacyApproval.buyers[0].pof=true;assert.equal(project(legacyApproval).decision_desk.tiers[0].items[0].walk_buyer_agreement_reported_signed,false);
const batch=fixture();batch.open_items=Array.from({length:20},(_,i)=>({...structuredClone(source.open_items[0]),id:'walk-'+i,tier:i%5+1,walk_plan:{rung:['agent_video','contractor_bid','signed_partner_buyer','paid_walker'][i%4],status:'waiting for a time',scheduled_at:null}}));
const batchBefore=JSON.stringify(batch);assert.doesNotThrow(()=>project(batch));assert.equal(JSON.stringify(batch),batchBefore);
const stored=appendSnapshot({},Buffer.from(JSON.stringify(fixture())),options),storedBefore=JSON.stringify(stored),bad=fixture();bad.open_items[0].walk_plan={rung:'forged',status:'waiting',scheduled_at:null};assert.throws(()=>appendSnapshot(stored,Buffer.from(JSON.stringify(bad)),options),/assistant_snapshot_/);assert.equal(JSON.stringify(stored),storedBefore);
console.log('assistant-walk-plan: optional compatibility,reported schedule,exact buyer agreement joins,unknown withholding and malformed whole-file rejection passed');
