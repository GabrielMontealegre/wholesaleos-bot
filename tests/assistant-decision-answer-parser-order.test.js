'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const {registerDecisionAnswerRoutes}=require('../modules/records/assistant-decision-answer-routes');
const serverSource=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const registration=serverSource.indexOf("require('./modules/records/assistant-decision-answer-routes').registerDecisionAnswerRoutes(app");
assert(registration>=0&&registration<serverSource.indexOf('app.use(express.json('),'Real server must register private answer auth,small parser and redacted errors before generic parsers');
(async()=>{
 let store={},writes=0,generic=0,limited=0;
 const app=express();
 registerDecisionAnswerRoutes(app,{db:{readDBStrict:()=>store,writeDB:value=>{store=value;writes++;}},now:()=> '2026-10-31T12:00:00Z',limiter(req,res,next){limited++;next();},requireAdmin(req,res,next){if(req.get('X-Test-Admin')!=='signed')return res.status(401).json({code:'SESSION_REQUIRED'});req.currentUser={id:'synthetic-owner'};next();}});
 app.use((req,res,next)=>{generic++;next();},express.json({strict:false,limit:'1mb'}),express.text({type:'text/plain',limit:'100mb'}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 async function request(status,headers,body){const r=await fetch(base+'/api/dashboard/assistant-snapshot-answers',{method:'POST',headers,body});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');const text=await r.text();assert(!text.includes('PRIVATE_SYNTHETIC_SENTINEL'));return text;}
 const headers={'Content-Type':'application/json',Origin:base,'X-WOS-Assistant-Answer':'1','X-Test-Admin':'signed'};
 try{
  await request(401,{'Content-Type':'application/json'},'{PRIVATE_SYNTHETIC_SENTINEL');assert.equal(limited,0);
  await request(403,{...headers,Origin:'https://wrong.example.test'},'{PRIVATE_SYNTHETIC_SENTINEL');
  await request(400,headers,'{PRIVATE_SYNTHETIC_SENTINEL');
  await request(413,headers,JSON.stringify({note:'PRIVATE_SYNTHETIC_SENTINEL'+'x'.repeat(9000)}));
  await request(415,{...headers,'Content-Type':'text/plain'},'PRIVATE_SYNTHETIC_SENTINEL');
  assert.equal(generic,0,'No private answer payload reaches a generic parser');assert.equal(writes,0);assert.equal(limited,4,'Authorized traffic retains the shared rate limiter');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 console.log('assistant-decision-answer-parser-order: real server pre-parser registration,auth-first,8kb cap,no-store,redacted errors and shared limiter passed');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
