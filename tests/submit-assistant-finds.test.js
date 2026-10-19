'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const http=require('node:http'),https=require('node:https');
const cli=require('../scripts/submit-assistant-finds');
const imports=require('../modules/buyers/buyer-find-import');
const now='2026-10-19T16:00:00Z';
const directory=path.resolve('synthetic-private-input');
const config=path.resolve('synthetic-private-config.json');
const secret='SYNTHETIC_PAIRING_TOKEN_NOT_REAL';
const person='PRIVATE SYNTHETIC PERSON';
const buyer=(uid='one')=>({kind:'buyer',name:person,platform:'manual',uid,source_url:'https://public.example.test/buyers/'+uid,
  what_they_buy:'Source says houses',deal_type:'house',captured_at:now,email:uid+'@example.test',phone:uid==='one'?'555-010-1234':'555-010-5678',classification:'end_buyer'});
const deal={kind:'deal',deal_kind:'jv',platform:'facebook-wholesaler',source_url:'https://www.facebook.com/groups/123/posts/456/',
  address:'100 Example St, Tampa, FL 33602',city:'Tampa',county:'Hillsborough',state:'FL',zip:'33602',captured_at:now,comps:[]};
function fileSystem(values){
  const reads=[];
  const data=new Map(Object.entries(values).map(([k,v])=>[path.resolve(k),Buffer.isBuffer(v)?v:Buffer.from(JSON.stringify(v))]));
  const take=file=>{reads.push(path.resolve(file));if(!data.has(path.resolve(file)))throw Object.assign(Error('PRIVATE FILE DETAIL'),{code:'ENOENT'});return data.get(path.resolve(file));};
  return {reads,statSync:file=>({isFile:()=>true,size:take(file).length}),readFileSync:take};
}
function inputs(items,other={}){return fileSystem({[path.join(directory,'buyers.json')]:items,...other});}
async function run(){
  const originals={fetch:global.fetch,get:http.get,request:http.request,sget:https.get,srequest:https.request,write:fs.writeFileSync,mkdir:fs.mkdirSync};
  let sideEffects=0;
  const denied=()=>{sideEffects++;throw Error('Unexpected network or filesystem write');};
  global.fetch=denied;http.get=denied;http.request=denied;https.get=denied;https.request=denied;fs.writeFileSync=denied;fs.mkdirSync=denied;
  try{
    assert.deepEqual(cli.options([]),{submit:false});assert.equal(cli.options(['--dry-run']).submit,false);
    for(const args of [['--submit','--dry-run'],['--token',secret],['--config'],['--input-dir','x','--input-dir','y'],['--approve']])assert.throws(()=>cli.options(args),/arguments_invalid/);
    const io=inputs([buyer(),buyer()],{[path.join(directory,'deals.json')]:{items:[deal]}});
    const report=await cli.run({}, {io,now,fetchImpl:denied});
    // Default directory is the source checkout, so explicitly select this synthetic fixture below.
    assert.ok(report.input_errors.input_files_missing);
    const dry=await cli.run({directory},{io,now,fetchImpl:denied});
    assert.deepEqual(dry.counts,{new:2,duplicate:1,rejected:0});
    assert.equal(dry.duplicate_scope,'input_only_not_live');assert.equal(dry.mode,'dry_run');
    assert.ok(!io.reads.includes(config),'offline dry run never reads credentials');
    for(const privateValue of [person,buyer().email,buyer().phone,deal.address,secret,buyer().source_url])assert.ok(!JSON.stringify(dry).includes(privateValue));
    const bad=inputs([{...buyer(),approval:'approved'},{...buyer(),captured_at:'2099-01-01T00:00:00Z'},{...buyer(),source_url:'http://private.example.test'},{...buyer(),kind:'interaction'}],
      {[path.join(directory,'agents.json')]:[buyer('agent')],[path.join(directory,'deals.json')]:[{...deal,closing_date:'10/06/2026'}]});
    const rejected=await cli.run({directory},{io:bad,now,fetchImpl:denied});
    assert.equal(rejected.counts.rejected,6);
    assert.equal(rejected.reason_counts.find_unsupported_agent_kind,1);assert.ok(!bad.reads.includes(config));
    const malformed=fileSystem({[path.join(directory,'buyers.json')]:Buffer.from('{PRIVATE INVALID JSON')});
    assert.equal((await cli.run({directory},{io:malformed,now})).input_errors.input_json_invalid,1);
    assert.equal((await cli.run({directory,submit:true,config},{io:malformed,now,fetchImpl:denied})).stopped_reason,'preflight_rejected');
    const tooMany=inputs(Array(501).fill(buyer()));assert.equal((await cli.run({directory},{io:tooMany,now})).input_errors.input_row_limit,1);
    const big=inputs(Buffer.alloc(cli.MAX_FILE_BYTES+1));assert.equal((await cli.run({directory},{io:big,now})).input_errors.input_file_too_large_or_not_regular,1);
    assert.equal((await cli.run({directory},{io:inputs({unknown:[]}),now})).input_errors.input_shape_invalid,1);
    assert.equal((await cli.run({directory},{io:inputs({items:[buyer()],secret}),now})).input_errors.input_shape_invalid,1);

    const initial=imports.ingestMixed({buyers:[],reviewed_deals:[],leads:[{id:'keep'}]},imports.validateAgentItems({items:[buyer(),deal]},now),{now,operatorId:'fixture',createId:(()=>{let n=0;return()=>'fixture'+(++n);})()}).store;
    initial.buyers[0].name='OPERATOR EDIT';initial.buyers[0].assistant_find.approval='approved';initial.buyers[0].assistant_find.status='replied';
    initial.buyers[0].assistant_find.buyer_type='landlord';initial.buyers[0].assistant_find.buyer_type_source={source_kind:'operator_input'};
    initial.reviewed_deals[0].approval='approved';initial.reviewed_deals[0].status='vetted';
    const before=JSON.stringify(initial),baseline=path.resolve('synthetic-baseline.json');
    const baseIO=inputs([buyer()],{[baseline]:initial});
    const existing=await cli.run({directory,baseline},{io:baseIO,now});
    assert.deepEqual(existing.counts,{new:0,duplicate:1,rejected:0});assert.equal(existing.duplicate_scope,'provided_local_baseline');assert.equal(JSON.stringify(initial),before);

    const batches=cli.batches(Array(51).fill(buyer()));assert.deepEqual(batches.map(b=>b.length),[50,1]);
    assert.throws(()=>cli.batches(Array(501).fill(buyer())),/request_budget_exceeded/);
    const byteChunks=cli.batches(Array(50).fill({...buyer(),drafted_message:'x'.repeat(7000)}));
    assert.ok(byteChunks.length>1);assert.ok(byteChunks.every(items=>Buffer.byteLength(JSON.stringify({items}))<=256*1024));
    for(const origin of ['https://evil.example.test','https://wholesaleos-bot-production.up.railway.app.evil.test','https://user:pass@wholesaleos-bot-production.up.railway.app','https://wholesaleos-bot-production.up.railway.app/other','https://wholesaleos-bot-production.up.railway.app/?token=x']){
      assert.throws(()=>cli.readSession(config,{io:fileSystem({[config]:{dashboard_url:origin,agent_token:secret}})}),/dashboard_origin_refused/);
    }
    const session={origin:'https://wholesaleos-bot-production.up.railway.app',token:secret};
    const sessionIO=fileSystem({[config]:{dashboard_url:session.origin,agent_token:secret}});
    assert.deepEqual(cli.readSession(config,{io:sessionIO}),session);
    const sleep=[],requests=[];let serverStore=initial;
    const fakeFetch=async(url,opts)=>{
      assert.equal(url,session.origin+'/api/assistant/finds');assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer '+secret);
      requests.push(url);const body=JSON.parse(opts.body);
      const result=imports.ingestMixed(serverStore,imports.validateAgentItems(body,now),{now,operatorId:'paired-fixture',createId:()=> 'new-fixture'});serverStore=result.store;
      return {ok:true,status:200,json:async()=>({results:result.results})};
    };
    const submitted=await cli.submit([[buyer(),deal],[buyer('new')]],session,{fetchImpl:fakeFetch,sleep:async n=>sleep.push(n)});
    assert.equal(submitted.created,1);assert.equal(submitted.duplicate,2);assert.equal(submitted.not_submitted,0);assert.equal(submitted.requests,2);assert.deepEqual(sleep,[1000]);
    assert.equal(serverStore.buyers[0].name,'OPERATOR EDIT');assert.equal(serverStore.buyers[0].assistant_find.approval,'approved');assert.equal(serverStore.buyers[0].assistant_find.status,'replied');
    assert.equal(serverStore.buyers[0].assistant_find.buyer_type_source.source_kind,'operator_input');
    assert.equal(serverStore.buyers[0].assistant_find.buyer_type,'landlord');
    assert.equal(serverStore.reviewed_deals[0].approval,'approved');assert.equal(serverStore.reviewed_deals[0].status,'vetted');
    assert.equal(serverStore.buyers.at(-1).assistant_find.approval,'pending');assert.deepEqual(serverStore.leads,[{id:'keep'}]);
    const newDeal=imports.ingestMixed(serverStore,imports.validateAgentItems({items:[{...deal,source_url:'https://public.example.test/second'}]},now),{now,operatorId:'fixture',createId:()=> 'new-deal'});
    assert.equal(newDeal.store.reviewed_deals.at(-1).approval,'pending');
    for(const status of [401,403,429]){
      let attempts=0;const result=await cli.submit([[buyer()],[buyer('two')]],session,{fetchImpl:async()=>{attempts++;return {ok:false,status};},sleep:denied});
      assert.equal(attempts,1);assert.equal(result.http_status,status);assert.equal(result.stopped_reason,'server_request_refused');assert.equal(result.not_submitted,2);
    }
    for(const response of [null,{ok:false,status:503},{ok:true,status:200,json:async()=>({results:[]})}]){
      let attempts=0;const result=await cli.submit([[buyer()],[buyer('two')]],session,{fetchImpl:async()=>{attempts++;if(!response)throw Error(secret+person);return response;},sleep:denied});
      assert.equal(attempts,1);assert.equal(result.outcome_unknown,1);assert.equal(result.not_submitted,1);assert.equal(result.stopped_reason,'submit_outcome_unknown');assert.ok(!JSON.stringify(result).includes(secret));
    }
    const fullIO=inputs([buyer(),{...buyer('rejected'),approval:'approved'}],{[config]:{dashboard_url:session.origin,agent_token:secret}});
    const full=await cli.run({directory,submit:true,config},{io:fullIO,now,fetchImpl:fakeFetch,sleep:denied});assert.equal(full.submission.duplicate,1);assert.equal(full.counts.rejected,1,'invalid rows are excluded, not repaired or posted');
    const lines=[],log=console.log;console.log=(value)=>lines.push(value);
    try{assert.equal(await cli.main(['--input-dir',directory],{io:inputs([buyer()]),now}),0);assert.equal(await cli.main(['--token',secret]),1);}
    finally{console.log=log;}
    assert.ok(!lines.join('\n').includes(secret));assert.ok(!lines.join('\n').includes(person));
    assert.equal(sideEffects,0,'no real network or filesystem writes; no sources, approvals or outreach');
  }finally{global.fetch=originals.fetch;http.get=originals.get;http.request=originals.request;https.get=originals.sget;https.request=originals.srequest;fs.writeFileSync=originals.write;fs.mkdirSync=originals.mkdir;}
  console.log('Assistant local submit: offline default/count-only privacy, canonical validation/dedupe, malformed/future/ambiguous/forged refusal, agents not relabeled, pending new records/operator edits preserved, signed endpoint only, byte/row/request caps, pace,401/403/429 stop and uncertain-result no-retry passed.');
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
