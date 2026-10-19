'use strict';

const fs=require('node:fs');
const path=require('node:path');
const imports=require('../modules/buyers/buyer-find-import');
const limits=require('../modules/buyers/assistant-finds');
const localConfig=require('../modules/security/local-config-path');

const FILES=Object.freeze({'buyers.json':'buyer','land-buyers.json':'buyer','deals.json':'deal','agents.json':null});
const ARRAY_KEYS=Object.freeze({'buyers.json':'buyers','land-buyers.json':'buyers','deals.json':'deals','agents.json':'agents'});
const MAX_FILE_BYTES=4*1024*1024;
const MAX_ROWS=500;
const MAX_REQUESTS=10;
const DASHBOARD_HOST='wholesaleos-bot-production.up.railway.app';
function fail(code){throw Object.assign(new Error(code),{code});}
function reason(error){return /^find_[a-z_]+$/.test(error?.code||'')?error.code:'local_validation_failed';}
function bump(map,key,n=1){map[key]=(map[key]||0)+n;}
function options(argv){
  const out={submit:false};let mode=null;
  const values={'--input-dir':'directory','--baseline':'baseline','--config':'config'};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];
    if(flag==='--help'){out.help=true;continue;}
    if(flag==='--submit'||flag==='--dry-run'){
      if(mode)fail('arguments_invalid');mode=flag;out.submit=flag==='--submit';continue;
    }
    if(!Object.hasOwn(values,flag)||out[values[flag]]!==undefined||typeof argv[i+1]!=='string'||argv[i+1].startsWith('--'))fail('arguments_invalid');
    out[values[flag]]=argv[++i];
  }
  return out;
}
function readJson(file,io=fs){
  const stat=io.statSync(file);
  if(!stat.isFile()||stat.size>MAX_FILE_BYTES)fail('input_file_too_large_or_not_regular');
  const raw=io.readFileSync(file);
  if(Buffer.byteLength(raw)>MAX_FILE_BYTES)fail('input_file_too_large_or_not_regular');
  try{return JSON.parse(raw.toString('utf8'));}catch{fail('input_json_invalid');}
}
function readInputs(directory,io=fs){
  const rows=[],issues={},files={};let present=0;
  for(const [name,kind] of Object.entries(FILES)){
    files[name]={rows:0,rows_considered:0,truncated_count:0,rejected:0,missing:false};let value;
    try{value=readJson(path.join(directory,name),io);present++;}
    catch(error){
      if(error?.code==='ENOENT'){files[name].missing=true;continue;}
      bump(issues,['input_json_invalid','input_file_too_large_or_not_regular'].includes(error?.code)?error.code:'input_file_unreadable');continue;
    }
    const key=ARRAY_KEYS[name];let items=null;
    if(Array.isArray(value))items=value;
    else if(value&&typeof value==='object'){
      // Only a file's named payload may have sibling metadata; ambiguous payloads fail closed.
      if(Object.hasOwn(value,key)){
        if(Array.isArray(value[key])&&!['items','buyers','deals','agents'].some(k=>k!==key&&Object.hasOwn(value,k)))items=value[key];
      }else if(Object.keys(value).length===1&&Array.isArray(value.items))items=value.items;
    }
    if(!items){bump(issues,'input_shape_invalid');continue;}
    files[name].rows=items.length;
    files[name].rows_considered=Math.min(items.length,MAX_ROWS);
    files[name].truncated_count=Math.max(0,items.length-MAX_ROWS);
    if(files[name].truncated_count)bump(issues,'input_row_limit');
    for(const item of items.slice(0,MAX_ROWS))rows.push({file:name,kind,item});
  }
  if(!present&&!Object.keys(issues).length)bump(issues,'input_files_missing');
  return {rows,issues,files};
}
function plan(input,{now,baseline={}}){
  if(!Number.isFinite(Date.parse(now)))fail('clock_invalid');
  let store=baseline,serial=0;
  const occupied=new Set([...(baseline.buyers||[]),...(baseline.reviewed_deals||[])].map(row=>row.id));
  const items=[],counts={new:0,duplicate:0,rejected:0},reasons={};
  const files=JSON.parse(JSON.stringify(input.files));
  for(const row of input.rows){
    try{
      if(!row.kind)fail('find_unsupported_agent_kind');
      if(!row.item||typeof row.item!=='object'||Array.isArray(row.item)||Object.hasOwn(row.item,'kind')&&row.item.kind!==row.kind)fail('find_item_kind_invalid');
      const raw={...row.item,kind:row.kind};
      const normalized=imports.validateAgentItems({items:[raw]},now);
      const next=imports.ingestMixed(store,normalized,{now,operatorId:'local-dry-run',createId:()=>{
        let id;do{id='__local_preview_'+(++serial);}while(occupied.has(id));occupied.add(id);return id;
      }});
      const result=next.results[0]?.result;
      if(!['created','duplicate'].includes(result))fail('find_local_result_invalid');
      store=next.store;items.push(raw);counts[result==='created'?'new':'duplicate']++;
    }catch(error){counts.rejected++;files[row.file].rejected++;bump(reasons,reason(error));}
  }
  return {items,counts,reasons,files,input_errors:{...input.issues}};
}
function batches(items){
  const output=[];let current=[];
  for(const item of items){
    if(current.length&&(current.length>=limits.MAX_ITEMS||Buffer.byteLength(JSON.stringify({items:current.concat(item)}))>limits.MAX_REQUEST_BYTES)){output.push(current);current=[];}
    current.push(item);
    if(Buffer.byteLength(JSON.stringify({items:current}))>limits.MAX_REQUEST_BYTES)fail('request_item_too_large');
  }
  if(current.length)output.push(current);
  if(output.length>MAX_REQUESTS)fail('request_budget_exceeded');
  return output;
}
function readSession(config,{io=fs,env=process.env}={}){
  // Read candidates only: resolving a writable path would probe/migrate credentials.
  const candidates=config?[{path:path.resolve(config)}]:localConfig.candidateList({env});
  for(const candidate of candidates){
    let value;
    try{value=readJson(candidate.path,io);}catch(error){if(!config&&error?.code==='ENOENT')continue;fail('pairing_config_unreadable');}
    let url;try{url=new URL(value?.dashboard_url);}catch{fail('pairing_config_invalid');}
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||
      !(url.hostname===DASHBOARD_HOST&&url.protocol==='https:'&&!url.port||local&&url.protocol==='http:'))fail('dashboard_origin_refused');
    if(typeof value.agent_token!=='string'||!value.agent_token.trim()||value.agent_token.length>16384||/[\r\n]/.test(value.agent_token))fail('pairing_config_invalid');
    return {origin:url.origin,token:value.agent_token};
  }
  fail('pairing_config_missing');
}
async function submit(chunks,session,{fetchImpl=global.fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  if(!Array.isArray(chunks)||chunks.length>MAX_REQUESTS||chunks.some(items=>!Array.isArray(items)||!items.length||items.length>limits.MAX_ITEMS||Buffer.byteLength(JSON.stringify({items}))>limits.MAX_REQUEST_BYTES))fail('request_budget_exceeded');
  const out={requests:0,created:0,duplicate:0,not_submitted:chunks.reduce((n,c)=>n+c.length,0),outcome_unknown:0,stopped_reason:null,http_status:null};
  for(const chunk of chunks){
    if(out.requests)await sleep(1000);
    out.requests++;let response,data;
    try{
      response=await fetchImpl(session.origin+'/api/assistant/finds',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({items:chunk})});
      if([400,401,403,409,413,422,429].includes(response.status)){
        out.http_status=response.status;out.stopped_reason='server_request_refused';break;
      }
      if(!response.ok)throw Error();
      data=await response.json();
      if(!Array.isArray(data.results)||data.results.length!==chunk.length||data.results.some(row=>!['created','duplicate'].includes(row?.result)))throw Error();
    }catch{
      out.outcome_unknown+=chunk.length;out.not_submitted-=chunk.length;out.stopped_reason='submit_outcome_unknown';break;
    }
    for(const row of data.results)out[row.result==='created'?'created':'duplicate']++;
    out.not_submitted-=chunk.length;
  }
  return out;
}
async function run(args,{io=fs,env=process.env,now=new Date().toISOString(),fetchImpl=global.fetch,sleep}={}){
  const directory=path.resolve(args.directory||path.join(__dirname,'../exports/assistant'));
  let baseline={};
  if(args.baseline){
    try{baseline=readJson(path.resolve(args.baseline),io);}catch{fail('baseline_unreadable');}
    if(!baseline||typeof baseline!=='object'||Array.isArray(baseline)||['buyers','reviewed_deals'].some(k=>baseline[k]!==undefined&&!Array.isArray(baseline[k])))fail('baseline_invalid');
  }
  const result=plan(readInputs(directory,io),{now,baseline});
  const report={mode:args.submit?'submit':'dry_run',duplicate_scope:args.baseline?'provided_local_baseline':'input_only_not_live',counts:result.counts,reason_counts:result.reasons,files:result.files,input_errors:result.input_errors,truncated_count:Object.values(result.files).reduce((n,f)=>n+f.truncated_count,0)};
  if(!args.submit)return report;
  if(Object.keys(result.input_errors).length){report.stopped_reason='preflight_rejected';return report;}
  if(!result.items.length){report.stopped_reason='nothing_to_submit';return report;}
  const chunks=batches(result.items),session=readSession(args.config,{io,env});
  report.submission=await submit(chunks,session,{fetchImpl,sleep});return report;
}
async function main(argv=process.argv.slice(2),dependencies={}){
  try{
    const args=options(argv);
    if(args.help){console.log('node scripts/submit-assistant-finds.js [--input-dir DIR] [--baseline FILE] [--dry-run | --submit] [--config FILE]\nDefault: offline counts only. Submit requires existing paired config; newly created records stay pending. No approvals or outreach.');return 0;}
    const report=await run(args,dependencies);console.log(JSON.stringify(report));
    return report.stopped_reason||report.submission?.stopped_reason||report.counts.rejected||Object.keys(report.input_errors).length?1:0;
  }catch(error){
    const allowed=['arguments_invalid','clock_invalid','baseline_unreadable','baseline_invalid','request_item_too_large','request_budget_exceeded','pairing_config_unreadable','pairing_config_invalid','pairing_config_missing','dashboard_origin_refused'];
    console.log(JSON.stringify({ok:false,reason:allowed.includes(error?.code)?error.code:'local_submit_failed'}));return 1;
  }
}
if(require.main===module)main().then(code=>{process.exitCode=code;});
module.exports={options,readInputs,plan,batches,readSession,submit,run,main,FILES,MAX_FILE_BYTES,MAX_ROWS,MAX_REQUESTS};
