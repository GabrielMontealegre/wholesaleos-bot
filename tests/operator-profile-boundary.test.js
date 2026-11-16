'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const profiles=require('../modules/records/operator-profile');
async function prove(){
  const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert(source.indexOf("app.use('/api/dashboard/operator-profile'")<source.indexOf("app.use(express.json("),'private authorization/parser precedes generic parser');
  const app=express();let reads=0,writes=0,store={};
  const requireAdmin=(req,res,next)=>{
    if(!req.headers['x-test-role'])return res.status(401).json({code:'SESSION_REQUIRED'});
    if(req.headers['x-test-role']!=='admin')return res.status(403).json({code:'ADMIN_REQUIRED'});
    req.currentUser={id:'synthetic-admin'};next();
  };
  app.use('/api/dashboard/operator-profile',profiles.noStore,requireAdmin,profiles.requireProfilePayload);
  app.use(express.json());
  profiles.registerRoutes(app,{db:{readDBStrict:()=>{reads++;return store;},writeDB:value=>{writes++;store=value;}},requireAdmin,now:()=> '2026-10-29T12:00:00.000Z'});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const url='http://127.0.0.1:'+server.address().port+'/api/dashboard/operator-profile';
  async function request({method='GET',role='admin',body,type='application/json'}={}){
    const headers={'content-type':type};if(role)headers['x-test-role']=role;
    const res=await fetch(url,{method,headers,body});assert.equal(res.headers.get('cache-control'),'no-store');
    return {status:res.status,body:await res.json()};
  }
  try{
    for(const method of ['GET','POST']){
      const body=method==='POST'?'{"legal_name":"Synthetic private parse sentinel",':undefined;
      assert.equal((await request({method,role:null,body})).status,401);
      assert.equal((await request({method,role:'agent',body})).status,403);
    }
    assert.equal(reads,0);assert.equal(writes,0);
    assert.deepEqual(await request({method:'POST',body:'{"profile":"Synthetic private parse sentinel",'}),{status:400,body:{code:'operator_profile_request_invalid'}});
    assert.equal((await request({method:'POST',body:'x',type:'text/plain'})).status,415);
    assert.equal((await request({method:'POST',body:JSON.stringify({profile:'x'.repeat(96*1024)})})).status,413);
    assert.equal((await request({method:'PATCH',body:'{}'})).status,405);
    assert.equal(reads,0);assert.equal(writes,0);
    const empty=await request();assert.equal(empty.status,200);assert.equal(empty.body.profile,null);
    const profile={legal_name:'Synthetic operator',llc:'',email:'',phone:'',mailing_address:'',typed_signature:'',signature_image:''};
    assert.equal((await request({method:'POST',body:JSON.stringify({version:empty.body.version,reviewed:true,profile})})).status,200);
    assert.equal(writes,1);
    console.log('Profile private boundary: auth before parse, no-store, redacted malformed/oversize/type/method errors, explicit reviewed synthetic save PASS');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
prove().catch(()=>{console.error('Profile private boundary assertions failed');process.exitCode=1;});
