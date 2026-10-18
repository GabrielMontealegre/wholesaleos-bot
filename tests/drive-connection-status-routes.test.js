'use strict';
const assert=require('node:assert/strict'),express=require('express');
const {registerDriveStatus}=require('../modules/integrations/drive-connection-status');
(async()=>{
 const app=express();let calls=0;
 registerDriveStatus(app,{env:{},createClient:()=>{calls++;throw Error('PRIVATE_SECRET');},requireAdmin:(req,res,next)=>{if(req.headers['x-fixture-role']!=='admin')return res.status(req.headers['x-fixture-role']?403:401).json({code:'denied'});next();}});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),url='http://127.0.0.1:'+server.address().port+'/api/drive/status';
 try{assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{'x-fixture-role':'user'}})).status,403);const r=await fetch(url,{headers:{'x-fixture-role':'admin'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual((await r.json()).missing,['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GDRIVE_REFRESH_TOKEN']);assert.equal(calls,0);console.log('Drive route: admin guard, no-store, exact missing names and no provider call when unconfigured passed.');}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
