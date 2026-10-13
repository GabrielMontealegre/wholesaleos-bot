'use strict';
const assert=require('node:assert/strict');
const {grade}=require('../modules/agents/interim-deal-grade');
const deal={approval:'approved',evidence_reviewed_at:'2026-10-13T12:00:00Z',evidence_reviewed_by:'test-operator',address:'SYNTHETIC SUBJECT',source_url:'https://records.example.test/source'};
const evaluation={status:'vetted',verdict:'GOOD',value:{range:{low:200000,high:210000},tier:'Verified'},matches:[{estimated_spread:{low:10000}}],days_to_deadline:3};
assert.equal(grade(deal,evaluation).label,'Black Diamond');
for(const patch of [{value:{range:null,tier:'Locked'}},{matches:[]},{matches:[{estimated_spread:{low:9999}}]},{days_to_deadline:2}]){
  const result=grade(deal,{...evaluation,...patch});
  assert.equal(result.label,patch.matches?.length===0?'Silver':'Gold');
}
assert.equal(grade({...deal,approval:'pending'},evaluation).label,'Gold');
assert.equal(grade({...deal,approval:'pending'},{...evaluation,value:{range:null,tier:'Locked'}}).label,'Silver');
assert.equal(grade({...deal,claimed_arv:9999999},{...evaluation,value:{range:null,tier:'Locked'}}).missing.includes('value'),true);
assert.equal(grade(deal,{...evaluation,value:{range:{low:9999999},tier:'AVM'}}).label,'Gold');
for(const status of ['expired','closed','dead'])assert.equal(grade(deal,{...evaluation,status}).label,'Archive');
assert.equal(grade({...deal,approval:'rejected'},evaluation).label,'Archive');
assert.equal(grade({...deal,address:''},{...evaluation,value:{range:null,tier:'Locked'},matches:[]}).label,'Unrated');
for(const room of [NaN,Infinity,null])assert.ok(grade(deal,{...evaluation,matches:[{estimated_spread:{low:room}}]}).missing.includes('room'));
const frozen=JSON.stringify({deal,evaluation});grade(deal,evaluation);assert.equal(JSON.stringify({deal,evaluation}),frozen);
console.log('Interim stored-evaluation grades: all-five threshold, one/two missing, archive, no claimed AVM/value, finite room and purity passed; no readiness mutation.');
