'use strict';
const assert=require('node:assert/strict');
const {sanitizeEvent}=require('../dashboard/wos-error-privacy');
const sentry=require('@sentry/node');
const https=require('node:https'),http=require('node:http');
const originals={fetch:global.fetch,http:http.request,https:https.request};let network=0;
const forbidden=()=>{network++;throw Error('real telemetry network forbidden');};
global.fetch=forbidden;http.request=forbidden;https.request=forbidden;
const sentinels=['SYNTHETIC SECRET OWNER','private.owner@example.test','+1 555 987 6543','PRIVATE SESSION COOKIE'];
const raw=sentinels.join(' '),envelopes=[];
(async()=>{
  try{
    sentry.init({dsn:'https://abc123@o1.ingest.sentry.io/123',defaultIntegrations:false,integrations:[],sendDefaultPii:false,tracesSampleRate:0,enableLogs:false,beforeSend:sanitizeEvent,beforeBreadcrumb:()=>null,beforeSendTransaction:()=>null,
      transport:()=>({send(envelope){envelopes.push(envelope);return Promise.resolve({statusCode:200});},flush(){return Promise.resolve(true);}})});
    sentry.withScope(scope=>{scope.setUser({name:raw,email:raw});scope.setExtra('row',{owner:raw});scope.setTag('owner',raw);sentry.captureException(new Error(raw));});
    await sentry.flush(1500);assert.equal(envelopes.length,1);
    const payload=JSON.stringify(envelopes);for(const secret of sentinels)assert.ok(!payload.includes(secret),'sensitive sentinel absent from actual SDK envelope');
    assert.ok(payload.includes('Error details withheld for privacy'));assert.equal(network,0);
    console.log('Actual Sentry SDK: one custom-transport envelope, private sentinels absent after SDK processing, zero network passed.');
  }finally{await sentry.close(1500);global.fetch=originals.fetch;http.request=originals.http;https.request=originals.https;}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
