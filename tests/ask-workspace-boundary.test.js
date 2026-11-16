'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),express=require('express');
const ask=require('../modules/agents/ask-workspace');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const boundary=source.indexOf("app.use('/api/dashboard/ask-workspace'");assert(boundary>=0&&boundary<source.indexOf('app.use(express.json('));
 const app=express();let reads=0;const auth=(req,res,next)=>{if(req.headers['x-test-role']!=='admin')return res.status(req.headers['x-test-role']?403:401).json({code:'session_required'});next();};
 app.use('/api/dashboard/ask-workspace',ask.noStore,auth,ask.requireReadPayload);app.use(express.json());
 ask.register(app,{db:{readDBStrict:()=>{reads++;throw Error('SYNTHETIC PRIVATE SENTINEL');}},requireAdmin:auth,now:()=> '2026-10-30T00:00:00.000Z'});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 async function request(method,role,body){return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/dashboard/ask-workspace',method,headers:{'content-type':'application/json',...(body?{'content-length':Buffer.byteLength(body)}:{}),...(role?{'x-test-role':role}:{})}},res=>{let value='';res.on('data',chunk=>value+=chunk);res.on('end',()=>{try{assert.equal(res.headers['cache-control'],'no-store');resolve({status:res.statusCode,value:JSON.parse(value)});}catch(e){reject(e);}});});req.on('error',reject);req.end(body);
 });}
 try{
  for(const method of ['GET','POST'])for(const role of [null,'agent'])assert.equal((await request(method,role,'{"private":"SYNTHETIC PARSE SENTINEL",')).status,role?403:401);
  assert.equal(reads,0);
  assert.deepEqual(await request('GET','admin','{"private":"SYNTHETIC PARSE SENTINEL",'),{status:400,value:{code:'ask_workspace_request_invalid'}});
  for(const method of ['POST','PATCH','DELETE'])assert.equal((await request(method,'admin','{"private":')).status,405);
  assert.equal(reads,0);assert.deepEqual(await request('GET','admin'),{status:503,value:{code:'ask_workspace_unavailable'}});assert.equal(reads,1);
  console.log('Ask private GET boundary: authorization/no-store before parser, body/method rejected without reads, generic failure with no private echo PASS');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(()=>{console.error('Ask boundary assertions failed');process.exitCode=1;});
