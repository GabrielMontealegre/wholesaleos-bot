'use strict';
const assert=require('node:assert/strict');
const status=require('../modules/integrations/drive-connection-status');
const {markup,reasons}=require('../dashboard/wos-drive-status');
(async()=>{
 const env={GMAIL_CLIENT_ID:'PRIVATE_CLIENT',GMAIL_CLIENT_SECRET:'PRIVATE_SECRET',GDRIVE_REFRESH_TOKEN:'PRIVATE_TOKEN'},before=JSON.stringify(env);let calls=0;
 for(const key of status.REQUIRED){const v={...env,[key]:' '},r=await status.readDriveStatus({env:v,createClient:()=>{throw Error('must not call');}});assert.equal(r.status,'not_connected');assert.deepEqual(r.missing,[key]);assert.equal(r.connected,false);}
 const ok=await status.readDriveStatus({env,createClient:()=>({about:{get:async(params,options)=>{calls++;assert.deepEqual(params,{fields:'user(permissionId)'});assert.deepEqual(options,{timeout:8000,retry:false});return {data:{user:{emailAddress:'PRIVATE_EMAIL',permissionId:'PRIVATE_ID'}}};}}})});assert.equal(ok.connected,true);assert.equal(calls,1);assert.ok(!JSON.stringify(ok).includes('PRIVATE_'));
 const cases=[
  [{response:{data:{error:'invalid_grant'},status:400}},'DRIVE_AUTHORIZATION_EXPIRED'],
  [{message:'invalid_client PRIVATE_SECRET'},'DRIVE_CLIENT_REJECTED'],
  [{response:{status:403,data:{error:{errors:[{reason:'insufficientPermissions'}]}}}},'DRIVE_SCOPE_MISSING'],
  [{response:{status:403,data:{error:{errors:[{reason:'accessNotConfigured'}]}}}},'DRIVE_API_DISABLED'],
  [{response:{status:403}},'DRIVE_FORBIDDEN'],[{response:{status:401}},'DRIVE_AUTHORIZATION_REQUIRED'],
  [{response:{status:429}},'DRIVE_RATE_LIMITED'],[{code:'ETIMEDOUT'},'DRIVE_TIMEOUT'],
  [{message:'PRIVATE_TOKEN https://example.test?secret=PRIVATE_SECRET',config:env},'DRIVE_UNAVAILABLE']
 ];
 for(const [error,code] of cases){const r=await status.readDriveStatus({env,createClient:()=>({about:{get:async()=>{throw error;}}})});assert.equal(r.code,code);assert.equal(r.connected,false);assert.equal(r.status,'error');assert.ok(!JSON.stringify(r).includes('PRIVATE_'));assert.equal(reasons[code],r.reason);}
 const unknown=markup({data:{connected:false,code:'evil',reason:'PRIVATE_SECRET <script>bad</script>',missing:['PRIVATE_TOKEN']}});assert.ok(!unknown.includes('PRIVATE_'));assert.ok(!unknown.includes('<script>'));assert.ok(!markup({data:ok}).includes('syncing automatically'));assert.ok(markup({data:ok}).includes('File sync and backups have not been checked.'));assert.equal(JSON.stringify(env),before);
 const fs=require('node:fs'),vm=require('node:vm'),http=require('node:http'),https=require('node:https');
 const saved={fetch:global.fetch,get:http.get,request:http.request,sget:https.get,srequest:https.request,write:fs.writeFileSync};let forbidden=0;
 const deny=()=>{forbidden++;throw Error('unexpected side effect');};
 try{global.fetch=http.get=http.request=https.get=https.request=fs.writeFileSync=deny;assert.equal(status.classifyError({message:'invalid_grant'}).code,'DRIVE_AUTHORIZATION_EXPIRED');status.missingConfiguration(env);markup({data:ok});assert.equal(forbidden,0);}finally{global.fetch=saved.fetch;http.get=saved.get;http.request=saved.request;https.get=saved.sget;https.request=saved.srequest;fs.writeFileSync=saved.write;}
 let html='',resolveFetch,click;
 const element={set outerHTML(v){html=v;}},document={querySelector:()=>element,querySelectorAll:()=>[element],addEventListener:(_name,fn)=>{click=fn;}},window={renderSettings:()=>'',signOutDashboard:()=>{}};
 const pending=new Promise(resolve=>{resolveFetch=resolve;});
 vm.runInNewContext(fs.readFileSync(require.resolve('../dashboard/wos-drive-status'),'utf8'),{window,document,setTimeout:()=>{},fetch:()=>pending});
 const loading=window.checkDriveConnection();window.signOutDashboard();resolveFetch({ok:true,json:async()=>ok});await loading;assert.ok(html.includes('Dashboard login required.'));assert.ok(!html.includes('drive-connected'));assert.equal(typeof click,'function');
 console.log('Drive status: independent missing variables, single bounded read, structured provider reasons, generic403 truth, no retry, no user data/secrets/raw errors, client allowlist and no config mutation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
