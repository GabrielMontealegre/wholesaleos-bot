'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const privacy=require('../dashboard/wos-error-privacy');
const {createErrorTracking}=require('../modules/observability/error-tracking');
const secrets=['SYNTHETIC OWNER PRIVATE','SYNTHETIC TAXPAYER PRIVATE','private.person@example.test','+1 (555) 123-4567','123 Private Mailing St','fixture-session-private'];
const raw=secrets.join(' '),event={message:raw,user:{name:raw,email:raw,ip_address:raw},request:{url:raw,headers:{cookie:raw,authorization:raw},data:raw},extra:{row:{owner:raw}},contexts:{anything:raw},tags:{owner:raw},breadcrumbs:[{message:raw}],attachments:[{data:raw}],exception:{values:[{type:raw,value:raw,stacktrace:{frames:[{filename:'https://example.test/'+raw,function:raw,vars:{owner:raw},pre_context:[raw],lineno:12,colno:4},{filename:'C:\\Users\\PRIVATE\\server.js?private='+raw,lineno:90,colno:1}]}}]}};
const before=JSON.stringify(event),clean=privacy.sanitizeEvent(event),out=JSON.stringify(clean);
for(const secret of secrets)assert.ok(!out.includes(secret));
assert.equal(JSON.stringify(event),before);assert.equal(clean.exception.values[0].type,'Error');
assert.deepEqual(clean.exception.values[0].stacktrace.frames,[{filename:'application.js',lineno:12,colno:4},{filename:'server.js',lineno:90,colno:1}]);
assert.equal(privacy.sanitizeEvent({type:'transaction',message:raw}),null);
assert.equal(privacy.validDsn('https://abc123@o1.ingest.sentry.io/123'),'https://abc123@o1.ingest.sentry.io/123');
for(const value of ['',undefined,'http://abc123@host.test/123','https://abc:secret@host.test/123','https://abc@host.test/123?token=secret','javascript:alert(1)'])assert.equal(privacy.validDsn(value),'');
let loads=0;const disabled=createErrorTracking({}, {loadSdk(){loads++;throw Error();}});disabled.capture(Error(raw));disabled.http(null,null,()=>{});assert.equal(loads,0);assert.equal(disabled.enabled,false);assert.deepEqual(disabled.config(),{enabled:false,dsn:''});
const calls=[],sdk={init(options){calls.push(options);},captureException(error){calls.push('exception');},captureMessage(){calls.push('http500');},flush(ms){assert.equal(ms,1500);return Promise.resolve(true);}};
const enabled=createErrorTracking({SENTRY_DSN:'https://abc123@o1.ingest.sentry.io/123'},{loadSdk:()=>sdk});
assert.equal(enabled.enabled,true);const options=calls[0];assert.equal(options.defaultIntegrations,false);assert.equal(options.sendDefaultPii,false);assert.equal(options.tracesSampleRate,0);assert.equal(options.enableLogs,false);assert.equal(options.beforeBreadcrumb({message:raw}),null);assert.equal(options.beforeSendTransaction({message:raw}),null);assert.equal(JSON.stringify(options.beforeSend(event)),out);
const handlers={};let next=0;enabled.http(Object.defineProperty({},'body',{get(){throw Error('must not read request body');}}),{statusCode:500,once(name,fn){handlers[name]=fn;}},()=>next++);handlers.finish();assert.equal(next,1);assert.ok(calls.includes('http500'));enabled.error(Error(raw),{}, {},()=>next++);assert.ok(calls.includes('exception'));
const unavailable=createErrorTracking({SENTRY_DSN:'https://abc123@o1.ingest.sentry.io/123'},{loadSdk(){throw Error(raw);}});assert.equal(unavailable.enabled,false);
const request={},response={statusCode:500,once(name,fn){handlers[name]=fn;}};
const oldSignals=calls.filter(v=>v==='http500').length;enabled.http(request,response,()=>{});enabled.error(Error(raw),request,response,()=>{});handlers.finish();assert.equal(calls.filter(v=>v==='http500').length,oldSignals,'Express exception and status finish do not duplicate the event');
async function browserCase({config,locked=false,expire=false}){
  let requests=0,appends=0,init=0,captures=0,load;
  const listeners={};const root={APP:{unlocked:!locked,currentUser:{role:'admin'}},wosErrorPrivacy:privacy,Sentry:{init(options){init++;assert.equal(options.defaultIntegrations,false);assert.equal(JSON.stringify(options.beforeSend(event)),out);},captureException(){captures++;}},addEventListener(name,fn){listeners[name]=fn;}};
  const document={getElementById(){return{};},createElement(){return{};},head:{appendChild(script){appends++;assert.equal(script.src,'https://browser.sentry-cdn.com/10.22.0/bundle.min.js');load=script.onload;}}};
  const context=vm.createContext({window:root,document,MutationObserver:class{observe(){}},fetch:async()=>{requests++;if(expire)root.APP.unlocked=false;return{ok:true,json:async()=>config};},Error});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dashboard/wos-error-tracking.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));if(load)load();
  if(listeners.error){listeners.error({error:Error(raw)});root.APP.unlocked=false;listeners.error({error:Error(raw)});}
  return{requests,appends,init,captures};
}
(async()=>{
  assert.deepEqual(await browserCase({config:{enabled:false,dsn:''}}),{requests:1,appends:0,init:0,captures:0});
  assert.deepEqual(await browserCase({locked:true,config:{enabled:true,dsn:'https://abc123@o1.ingest.sentry.io/123'}}),{requests:0,appends:0,init:0,captures:0});
  assert.deepEqual(await browserCase({expire:true,config:{enabled:true,dsn:'https://abc123@o1.ingest.sentry.io/123'}}),{requests:1,appends:0,init:0,captures:0});
  assert.deepEqual(await browserCase({config:{enabled:true,dsn:'https://abc123@o1.ingest.sentry.io/123'}}),{requests:1,appends:1,init:1,captures:1});
  await enabled.flush();await disabled.flush();
  const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');assert.ok(source.includes("app.get('/api/dashboard/error-tracking-config', requireAdmin"));assert.ok(source.indexOf("app.get('/api/dashboard/error-tracking-config'")>source.indexOf("app.use('/api', (req, res, next) => {"));
  console.log('Sentry privacy: OFF imports/requests0, strict event allowlist, no names/phones/emails/body/headers/messages, gates unchanged, admin config, expired-session cancellation, stubbed enabled capture and bounded flush passed; zero telemetry network.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
