'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const geography=require('../modules/research/lead-location-facets');
const shared=require('../dashboard/wos-list-filters');
const rows=Object.freeze([
  Object.freeze({id:'a',state:'FL',county:'Example County',city:'Northville',owner_name:'SYNTHETIC PRIVATE OWNER',phone:'555-111-2222',email:'private@example.test',mailing_address:'PRIVATE MAILING ADDRESS'}),
  Object.freeze({id:'b',state:'FL',county:'Example',city:'Southville'}),
  Object.freeze({id:'c',state:'TX',county:'Example',city:'Northville'}),
  Object.freeze({id:'d',state:'FL',county:'Example',city:'Northville'}),
  Object.freeze({id:'unknown',state:'',county:'Example',city:'Northville'})
]);
const before=JSON.stringify(rows);
const originals={fetch:global.fetch,write:fs.writeFileSync,now:Date.now};let sideEffects=0;
const forbidden=()=>{sideEffects++;throw Error('pure location projection side effect');};
global.fetch=forbidden;fs.writeFileSync=forbidden;Date.now=forbidden;
assert.deepEqual(geography.counts(rows),[{state:'FL',county:'Example',city:'Northville',count:2},{state:'FL',county:'Example',city:'Southville',count:1},{state:'TX',county:'Example',city:'Northville',count:1}]);
for(const secret of ['SYNTHETIC PRIVATE OWNER','555-111-2222','private@example.test','PRIVATE MAILING ADDRESS'])assert.ok(!JSON.stringify(geography.counts(rows)).includes(secret));
assert.deepEqual(geography.selection({state:'fl',county:'Example',city:'Southville'}),{state:'FL',county:'Example',city:'Southville'});
for(const query of [{county:'Example'},{state:'XXY'},{state:['FL']},{state:'FL',city:'Northville'}])assert.throws(()=>geography.selection(query),/lead_location_filter_invalid/);
assert.equal(geography.matches(rows[0],{state:'TX',county:'Example'}),false);
assert.equal(geography.matches(rows[0],{state:'FL',county:'Example',city:'Northville'}),true);
assert.equal(geography.matches(rows[0],{state:'FL',county:'Exam'}),false);
assert.deepEqual(shared.change({state:'FL',county:'Example',city:'Southville'},'state','TX'),{state:'TX',county:'',city:''});
assert.equal(JSON.stringify(rows),before);
assert.equal(sideEffects,0);global.fetch=originals.fetch;fs.writeFileSync=originals.write;Date.now=originals.now;

// Execute the real route body: geography is applied before paging, not a second test implementation.
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const start=source.indexOf("app.get('/api/leads',");const end=source.indexOf('\n});',start)+4;
let handler,legacyCalls=0;
const context={app:{get(_path,fn){handler=fn;}},db:{getLeads:()=>rows},leadLocationFacets:geography,
  leadMatchesRegionalModeForList(row){legacyCalls++;return row.state==='TX';},leadMatchesCountyNameForList(){return true;},
  classifyLeadQualityForList:()=>({rank:0,flags:[]}),parseLeadListLimit:v=>Number(v)||2,parseLeadListOffset:v=>Number(v)||0,
  withLeadIntelligence:v=>v,sanitizeLeadForList:v=>({...v}),isDallasLeadForList:()=>false,isDallasSheriffTaxSaleLeadForList:()=>false,
  operationalLeads:{classify:()=>({}),counts:()=>({})},buildLeadIntakeStatus:()=>({}),console:{error(){throw Error('unexpected route error');}}};
vm.runInNewContext(source.slice(start,end),context);
function run(query){let result,status=200;handler({query},{status(value){status=value;return this;},json(value){result=value;return this;}});return{status,result};}
let result=run({geography:'1',operational_mode:'old-restriction',metro:'DFW',limit:'2',offset:'2'});
assert.equal(result.status,200);assert.equal(result.result.totalFiltered,5);assert.equal(result.result.leads.length,2);assert.equal(result.result.offset,2);assert.equal(legacyCalls,0);
assert.deepEqual(result.result.location_counts,geography.counts(rows));
result=run({geography:'1',state:'FL',county:'Example',city:'Southville',limit:'2'});
assert.equal(result.result.totalFiltered,1);assert.equal(result.result.leads[0].id,'b');
result=run({geography:'1',state:'WY'});assert.equal(result.result.totalFiltered,0);assert.equal(result.result.totalAll,5);assert.equal(result.result.leads.length,0);
assert.equal(run({geography:'1',county:'Example'}).status,400);
result=run({operational_mode:'old-restriction'});assert.equal(result.result.totalFiltered,1);assert.equal(legacyCalls,5);
assert.equal(JSON.stringify(rows),before);

const html=fs.readFileSync(path.join(__dirname,'../dashboard/index.html'),'utf8');
const apiBuilder=html.match(/function buildLeadApiUrl\(offset\) \{[\s\S]*?\n\}/)[0];
const state={APP:{_leadApiLimit:2,_leadApiOffset:0},window:{regionalMode:()=> 'restricted'},URLSearchParams,
  getLeadToolbarFilters:()=>({state:'FL',county:'Example',city:'Southville'}),leadApiSortParam:()=> 'priority'};
vm.createContext(state);vm.runInContext(apiBuilder,state);const query=new URL('http://fixture.test'+state.buildLeadApiUrl(2)).searchParams;
assert.equal(query.get('geography'),'1');assert.equal(query.get('city'),'Southville');assert.equal(query.get('offset'),'2');
assert.equal(query.has('operational_mode'),false);assert.equal(query.has('metro'),false);
console.log('Lead geography: exact shared cascade, full-store private facets, pre-page route filtering, real zero, legacy API compatibility and unrestricted All states request passed.');
