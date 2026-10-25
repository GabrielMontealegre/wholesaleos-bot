'use strict';
const assert=require('node:assert/strict');
const {google}=require('googleapis');
const {createMailboxReader}=require('../modules/email/mailbox-reader');
const env={GMAIL_USER:'operator@example.test',GMAIL_CLIENT_ID:'synthetic',GMAIL_CLIENT_SECRET:'synthetic',GMAIL_REFRESH_TOKEN:'synthetic'};
let calls=[],failure=null,pendingToken=false,finishToken=null,tokenSignal=null;
class OAuth2 extends google.auth.OAuth2 {
  constructor(...args){
    super(...args);
    this.transporter.request=async options=>{
      assert.equal(options.retry,false);assert.equal(options.timeout,12000);assert.equal(options.signal.aborted,false);
      const token=String(options.url).includes('/token');calls.push(token?'token':'label');
      if(failure&&(failure.stage===(token?'token':'label'))){const error=Error('Synthetic provider failure');error.response={status:failure.status,config:{data:''}};throw error;}
      if(token){
        tokenSignal=options.signal;
        if(pendingToken)await new Promise(resolve=>{finishToken=resolve;});
        return {data:{access_token:'synthetic-access',expires_in:3600,token_type:'Bearer'}};
      }
      return {data:{id:'INBOX',messagesTotal:10,messagesUnread:1}};
    };
  }
}
const reader=createMailboxReader({env,googleImpl:{auth:{OAuth2},gmail:google.gmail.bind(google)},now:()=> '2026-10-25T23:00:00Z'});
async function main(){
  assert.equal((await reader.folderSummary('inbox')).summary.total_messages,10);assert.deepEqual(calls,['token','label']);
  for(const stage of ['token','label'])for(const status of [401,403,429,500]){
    failure={stage,status};calls=[];
    await assert.rejects(reader.folderSummary('inbox'),error=>error.status===(status===429?429:503));
    assert.deepEqual(calls,stage==='token'?['token']:['token','label'],'The real OAuth client must not refresh/retry after provider authorization or rate errors');
  }
  failure=null;calls=[];pendingToken=true;
  const original=setTimeout;global.setTimeout=(fn,ms,...args)=>original(fn,ms===12000?15:ms,...args);
  try{
    await assert.rejects(reader.folderSummary('inbox'),error=>error.status===504);
    assert.equal(tokenSignal.aborted,true);assert.deepEqual(calls,['token']);
    finishToken();await new Promise(resolve=>original(resolve,5));
    assert.deepEqual(calls,['token'],'Even a late noncooperative token transport cannot dispatch a label request after expiry');
  }finally{global.setTimeout=original;pendingToken=false;}
  calls=[];assert.equal((await reader.folderSummary('inbox')).summary.total_messages,10);assert.deepEqual(calls,['token','label']);
  console.log('mailbox-folder-summary-oauth: actual OAuth2Client token+label transports share cancellation/deadline/no-retry,provider401403 stay non-session503,429 stops,and late refresh cannot dispatch after expiry;synthetic transport only');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
