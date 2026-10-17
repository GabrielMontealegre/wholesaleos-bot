'use strict';
const {sanitizeEvent,validDsn}=require('../../dashboard/wos-error-privacy');
function createErrorTracking(env=process.env,{loadSdk=()=>require('@sentry/node')}={}){
  const dsn=validDsn(env.SENTRY_DSN);let sdk=null;
  if(dsn){try{sdk=loadSdk();sdk.init({dsn,defaultIntegrations:false,integrations:[],sendDefaultPii:false,autoSessionTracking:false,tracesSampleRate:0,enableLogs:false,beforeSend:sanitizeEvent,beforeSendTransaction:()=>null,beforeBreadcrumb:()=>null});}catch{sdk=null;}}
  return{
    enabled:!!sdk,
    config(){return{enabled:!!sdk,dsn:sdk?dsn:''};},
    capture(error){if(!sdk)return;try{sdk.captureException(error);}catch{}},
    flush(){if(!sdk)return Promise.resolve();try{return Promise.resolve(sdk.flush(1500)).catch(()=>{});}catch{return Promise.resolve();}},
    http(req,res,next){if(sdk)res.once('finish',()=>{if(res.statusCode>=500){try{sdk.captureMessage('HTTP server error','error');}catch{}}});next();},
    error(err,req,res,next){if(sdk&&(!Number.isInteger(err?.status)||err.status>=500)){try{sdk.captureException(err);}catch{}}next(err);}
  };
}
module.exports={createErrorTracking};
