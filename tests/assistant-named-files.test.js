'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const cli=require('../scripts/submit-assistant-finds');
const directory=path.resolve('synthetic-named-input'),now='2026-10-19T12:00:00Z';
const buyer={name:'Fixture Investor',platform:'manual',uid:'one',source_url:'https://records.example.test/buyer/one',what_they_buy:'Recorded houses',deal_type:'house',classification:'end_buyer',captured_at:now};
const deal={deal_kind:'jv',platform:'facebook-wholesaler',source_url:'https://www.facebook.com/groups/123/posts/456/',address:'100 Example St, Tampa, FL 33602',city:'Tampa',county:'Hillsborough',state:'FL',zip:'33602',captured_at:now,comps:[]};
function io(values){const reads=[],data=new Map(Object.entries(values).map(([k,v])=>[path.join(directory,k),Buffer.from(JSON.stringify(v))]));const take=p=>{reads.push(p);if(!data.has(p))throw Object.assign(Error('PRIVATE PATH'),{code:'ENOENT'});return data.get(p);};return {reads,statSync:p=>({isFile:()=>true,size:take(p).length}),readFileSync:take};}
(async()=>{
 const old={fetch:global.fetch,write:fs.writeFileSync,mkdir:fs.mkdirSync,hg:http.get,hr:http.request,sg:https.get,sr:https.request};let effects=0;
 const denied=()=>{effects++;throw Error('no actual network or writes');};
 try{
  global.fetch=fs.writeFileSync=fs.mkdirSync=http.get=http.request=https.get=https.request=denied;
  const files=io({'buyers.json':{buyers:[buyer],note:'PRIVATE METADATA',captured_at:'not row evidence'},'land-buyers.json':{note:'PRIVATE METADATA',buyers:[buyer],county_record_method_2026_10_18:{private:'PRIVATE METADATA'}},'deals.json':{deals:[deal],version:7},'agents.json':{agents:[{name:'PRIVATE AGENT'}],note:'PRIVATE METADATA'}});
  const report=await cli.run({directory},{io:files,now,fetchImpl:denied});
  assert.deepEqual(report.input_errors,{});assert.deepEqual(report.counts,{new:2,duplicate:1,rejected:1});assert.equal(report.reason_counts.find_unsupported_agent_kind,1);assert.equal(report.truncated_count,0);
  for(const name of ['buyers.json','land-buyers.json','deals.json','agents.json']){assert.equal(report.files[name].rows,1);assert.equal(report.files[name].rows_considered,1);}
  for(const secret of ['PRIVATE METADATA','PRIVATE AGENT',buyer.name,buyer.source_url,deal.address])assert.ok(!JSON.stringify(report).includes(secret));
  for(const shape of [{unknown:[buyer]},{deals:[buyer]},{buyers:'bad'},{buyers:[buyer],items:[buyer]},{buyers:[buyer],agents:[]},{items:[buyer],note:'not the named wrapper'}])assert.equal((await cli.run({directory},{io:io({'buyers.json':shape}),now})).input_errors.input_shape_invalid,1);
  for(const shape of [[buyer],{items:[buyer]},{buyers:[],note:'empty named array'}])assert.deepEqual((await cli.run({directory},{io:io({'buyers.json':shape}),now})).input_errors,{});
  const moreThanOldGlobalCap=await cli.run({directory},{io:io({'buyers.json':{buyers:Array(300).fill(buyer)},'land-buyers.json':{buyers:Array(300).fill(buyer)}}),now});
  assert.equal(moreThanOldGlobalCap.counts.new+moreThanOldGlobalCap.counts.duplicate,600);assert.deepEqual(moreThanOldGlobalCap.input_errors,{});assert.equal(moreThanOldGlobalCap.truncated_count,0);
  const oversized=io({'buyers.json':{buyers:Array(501).fill(buyer)}}),truncated=await cli.run({directory},{io:oversized,now});
  assert.equal(truncated.files['buyers.json'].rows,501);assert.equal(truncated.files['buyers.json'].rows_considered,500);assert.equal(truncated.files['buyers.json'].truncated_count,1);assert.equal(truncated.truncated_count,1);assert.equal(truncated.input_errors.input_row_limit,1);
  const blocked=await cli.run({directory,submit:true,config:'must-not-read'},{io:oversized,now,fetchImpl:denied});assert.equal(blocked.stopped_reason,'preflight_rejected');assert.equal(blocked.truncated_count,1);
  assert.ok(!oversized.reads.some(p=>p.includes('must-not-read')),'truncation blocks before credentials are read');
  // Named metadata never enters the canonical row-validation/submission payload.
  const parsed=cli.readInputs(directory,io({'buyers.json':{buyers:[buyer],note:'PRIVATE METADATA'}}));const plan=cli.plan(parsed,{now});assert.equal(plan.items[0].kind,'buyer');assert.ok(!JSON.stringify(plan.items).includes('PRIVATE METADATA'));assert.deepEqual(plan.items[0],{...buyer,kind:'buyer'});
  assert.equal(cli.MAX_REQUESTS,10);assert.throws(()=>cli.batches(Array(501).fill({...buyer,kind:'buyer'})),/request_budget_exceeded/,'per-file reading never loosens server request budgets');
  assert.equal(effects,0);
 }finally{global.fetch=old.fetch;fs.writeFileSync=old.write;fs.mkdirSync=old.mkdir;http.get=old.hg;http.request=old.hr;https.get=old.sg;https.request=old.sr;}
 console.log('Assistant named files: exact file/key wrappers with metadata, unknown/ambiguous/malformed refusal, legacy array/items compatibility,600 rows across files, per-file truncation counts/submit refusal, raw-row-only payload, unchanged request caps and zero real network/writes passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
