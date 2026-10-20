'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),https=require('node:https');
const cli=require('../scripts/submit-assistant-finds'),reports=require('../modules/records/pipeline-reports');
const {fixture,report,now}=require('./pipeline-workspace.test');
const directory=path.resolve('synthetic-pipeline-input'),file=path.join(directory,'explicit-reports.json'),baseline=path.join(directory,'references.json');
function io(payload,base=fixture()){
 const data=new Map([[file,Buffer.from(typeof payload==='string'?payload:JSON.stringify(payload))],[baseline,Buffer.from(JSON.stringify(base))]]),reads=[];
 const take=p=>{reads.push(p);if(!data.has(p))throw Object.assign(Error('PRIVATE PATH'),{code:'ENOENT'});return data.get(p);};
 return {reads,statSync:p=>({isFile:()=>true,size:take(p).length}),readFileSync:take};
}
(async()=>{
 const old={fetch:global.fetch,write:fs.writeFileSync,hg:http.get,hr:http.request,sg:https.get,sr:https.request};let effects=0;
 const denied=()=>{effects++;throw Error('no real network or writes');};
 try{
  global.fetch=fs.writeFileSync=http.get=http.request=https.get=https.request=denied;
  assert.equal(cli.options(['--pipeline-file',file,'--baseline',baseline]).pipelineFile,file);
  await assert.rejects(()=>cli.run({pipelineFile:file},{io:io([]),now}),/pipeline_baseline_required/);
  const args={directory,pipelineFile:file,baseline},input=io({pipeline_items:[report()],private_metadata:'DO NOT LOG'}),result=await cli.run(args,{io:input,now,fetchImpl:denied});
  assert.deepEqual(result.counts,{new:1,duplicate:0,rejected:0});assert.equal(result.mode,'dry_run');assert.equal(result.duplicate_scope,'provided_local_baseline');assert.equal(result.files.pipeline_file.rows,1);assert.ok(!JSON.stringify(result).includes('DO NOT LOG'));assert.ok(!JSON.stringify(result).includes(file));assert.ok(!input.reads.some(p=>p.endsWith('helper.json')));
  const stored=reports.upsert(fixture(),report(),{now,operatorId:'fixture-admin'}).store;
  assert.equal((await cli.run(args,{io:io([report()],stored),now})).counts.duplicate,1);
  for(const extra of [{record_ref:'WOS-FL-9999'},{approved:true},{captured_at:'2027-01-01T00:00:00Z'},{next_date:'10/21/2026'},{kind:'buyer'}])assert.equal((await cli.run(args,{io:io([report(extra)]),now})).counts.rejected,1);
  for(const payload of ['# Pipeline\nA buyer probably has funds.',{pipeline_items:[report()],buyers:[]},{pipeline_items:'not an array'}])assert.ok(Object.keys((await cli.run(args,{io:io(payload),now})).input_errors).length);
  const excessive=await cli.run({...args,submit:true,config:'MUST NOT READ'},{io:io(Array(501).fill(report())),now,fetchImpl:denied});assert.equal(excessive.stopped_reason,'preflight_rejected');assert.equal(excessive.truncated_count,1);
  const missing=io([]);missing.statSync=p=>{if(p===file)throw Object.assign(Error('PRIVATE PATH'),{code:'ENOENT'});return {isFile:()=>true,size:missing.readFileSync(p).length};};assert.equal((await cli.run(args,{io:missing,now})).input_errors.pipeline_file_missing,1);
  assert.deepEqual((await cli.run({directory},{io:input,now})).files.pipeline_file,undefined,'no implicit Pipeline-file discovery');
  const normalized=cli.plan(cli.readInputs(directory,io({items:[report()]}),file),{now,baseline:fixture()});assert.equal(normalized.items[0].kind,'pipeline_item');assert.equal(cli.batches(normalized.items)[0][0].report_id,report().report_id);assert.equal(effects,0);
  console.log('Pipeline producer: explicit file/baseline only, offline counts, exact refs, pending canonical report reuse, duplicate/forged/future/ambiguous rejection, no prose parsing, missing/truncated refusal before credentials, no private logs and zero real network/writes passed.');
 }finally{global.fetch=old.fetch;fs.writeFileSync=old.write;http.get=old.hg;http.request=old.hr;https.get=old.sg;https.request=old.sr;}
})().catch(e=>{console.error(e);process.exitCode=1;});
