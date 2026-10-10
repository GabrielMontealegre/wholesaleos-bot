'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const deals=require('../modules/deals/reviewed-deals');
const grid=require('../modules/research/disclosure-state-comp-resolution');
const config=require('../modules/research/strict-comp-grid-config');
const {fixture,buyer,now}=require('./reviewed-deals.test');
const context={now,operatorId:'fixture-operator',createId:()=> 'fixture-deal'};
function build(miles){const item=fixture();item.comps=miles.map((m,i)=>({...item.comps[i%3],comp_address:(101+i)+' Example St, Tampa, FL 33602',source_url:'https://records.example.test/property/'+i,latitude:item.latitude+m/69.094,longitude:item.longitude}));let store=deals.ingest({buyers:[buyer],leads:[{id:'keep'}]},[deals.validate(item,now)],context).store;return deals.update(store,'fixture-deal',{action:'approve',reviewed_comps:true},context);}
function value(store){return deals.evaluate(store.reviewed_deals[0],store.buyers,now).value;}
assert.equal(config.max_distance_miles,1);assert.equal(config.expanded_max_distance_miles,2.5);assert.equal(config.expanded_requires_fewer_than,3);assert.equal(config.rural_operator_max_distance_miles,5);
let store=build([0.3,0.6,0.9,1.5]);let v=value(store);assert.equal(v.tier,'Verified');assert.equal(v.comps.length,3);assert.equal(v.wider_area_used,false);assert.equal(v.standard_comp_count,3);assert.ok(v.comps.every(c=>c.area==='standard'));
store=build([0.6,1.5,2.4]);v=value(store);assert.equal(v.tier,'Preliminary');assert.equal(v.comps.length,3);assert.equal(v.standard_comp_count,1);assert.equal(v.comps.filter(c=>c.area==='wider').length,2);assert.equal(v.area_label,'Wider area: up to 2.5 miles');assert.ok(v.comps.every(c=>typeof c.distance_miles==='number'));
assert.deepEqual(value({...store,reviewed_deals:[{...store.reviewed_deals[0],comps:store.reviewed_deals[0].comps.slice().reverse()}]}).range,v.range,'input order does not change the range');
assert.equal(value(build([0.6,1.5,2.6])).comps.length,2);
const bad=build([0.6,1.5,2.4]);const subject=bad.reviewed_deals[0];
for(const patch of [{sold_date:'2026-03-01'},{sqft:1251},{property_type:'land'},{beds:6},{baths:5},{year_built:2000},{lot_size:8000},{latitude:null},{sold_status:'active'},{source_url:''},{evidence_text:'Non arms-length transfer'}]){
 const d={...subject,comps:[subject.comps[0],{...subject.comps[1],...patch},subject.comps[2]]};const result=deals.evaluate(d,[buyer],now).value;
 assert.ok(!result.comps.some(c=>c.comp_address===subject.comps[1].comp_address),JSON.stringify(patch));
}
const missing=deals.evaluate({...subject,latitude:null},[buyer],now).value;assert.equal(missing.comps.length,0);assert.ok(missing.rejected.every(r=>r.reason==='strict_grid_distance_not_applied'));
const unreviewed=deals.evaluate({...subject,evidence_reviewed_at:'',evidence_reviewed_by:''},[buyer],now).value;assert.equal(unreviewed.comps.length,0);
const duplicate=deals.evaluate({...subject,comps:[subject.comps[0],subject.comps[1],subject.comps[1]]},[buyer],now).value;assert.equal(duplicate.comps.length,2);assert.ok(duplicate.rejected.some(r=>r.reason==='Duplicate comp'));
for(const forged of [{area:'wider'},{excluded:true},{comp_grid:{accepted:true}}])assert.throws(()=>deals.validate({...fixture(),comps:[{...fixture().comps[0],...forged}]},now),/comps_invalid/);
const own=deals.evaluate({...subject,comps:[subject.comps[0],{...subject.comps[1],comp_address:subject.address}]},[buyer],now).value;assert.equal(own.comps.length,1);
let rows=deals.list(store,{now}).items[0];const untouched=JSON.stringify(store);
const excluded=deals.update(store,'fixture-deal',{action:'exclude_comp',comp_index:1,comp_key:rows.comp_review_keys[1],reason:'Sold as-is; needs substantial work.'},context);
assert.equal(value(excluded).comps.length,2);assert.ok(value(excluded).rejected.some(r=>r.reason==='Operator excluded: Sold as-is; needs substantial work.'));
assert.equal(excluded.reviewed_deals[0].comp_exclusions[0].operator_id,context.operatorId);assert.equal(excluded.activities.at(-1).reason,'Sold as-is; needs substantial work.');assert.equal(excluded.reviewed_deals[0].history.at(-1).action,'exclude_comp');assert.equal(JSON.stringify(store),untouched);assert.deepEqual(excluded.leads,store.leads);
for(const input of [{comp_index:1,comp_key:rows.comp_review_keys[1],reason:''},{comp_index:8,comp_key:rows.comp_review_keys[1],reason:'Fixture'},{comp_index:1,comp_key:'stale',reason:'Fixture'}])assert.throws(()=>deals.update(store,'fixture-deal',{action:'exclude_comp',...input},context),/comp_exclusion_invalid|comp_changed/);
const row={normalized_address:subject.address,latitude:subject.latitude,longitude:subject.longitude,property_kind:subject.property_type,living_area:subject.sqft,beds:subject.beds,baths:subject.baths,year_built:subject.year_built,lot_size:subject.lot_size};
const comp={...subject.comps[1],living_area:subject.comps[1].sqft,property_kind:subject.comps[1].property_type,source_kind:'public_web_page',similarity_basis:'Fixture strict property facts'};
assert.equal(grid.evaluateStrictCompGrid(comp,{...row,expanded_area_review:{standard_pass_count:1,reviewed_by:'forged',reviewed_at:now}},{today_iso:now}).accepted,false,'row flags cannot enable the option');
for(const n of [3,-1,1.5])assert.equal(grid.evaluateStrictCompGrid(comp,row,{today_iso:now,expanded_area_review:{standard_pass_count:n,reviewed_by:'fixture',reviewed_at:now}}).accepted,false);
assert.equal(grid.evaluateStrictCompGrid(comp,row,{today_iso:now,expanded_area_review:{standard_pass_count:1}}).accepted,false);
assert.equal(grid.evaluateStrictCompGrid({...comp,source_kind:'paid_api'},row,{today_iso:now,expanded_area_review:{standard_pass_count:1,reviewed_by:'fixture',reviewed_at:now}}).accepted,false);
const rural={approved:true,reviewed_by:'fixture',reviewed_at:now};assert.equal(grid.evaluateStrictCompGrid({...comp,latitude:subject.latitude+4/69.094},row,{today_iso:now,rural_exception_review:rural}).accepted,true);
assert.equal(grid.evaluateStrictCompGrid({...comp,latitude:subject.latitude+5.1/69.094},row,{today_iso:now,rural_exception_review:rural}).accepted,false);
const saved={fetch:global.fetch,clock:Date.now,write:fs.writeFileSync};let calls=0;
try{const forbidden=()=>{calls++;throw Error('side effect');};global.fetch=forbidden;Date.now=forbidden;fs.writeFileSync=forbidden;value(store);deals.list(excluded,{now});}finally{global.fetch=saved.fetch;Date.now=saved.clock;fs.writeFileSync=saved.write;}
assert.equal(calls,0);console.log('D-051: standard-first, reviewed wider fallback, preliminary ceiling, other gates, missing/forged/duplicate/own comps, exclusions, stale cards, rural limits and purity passed.');
