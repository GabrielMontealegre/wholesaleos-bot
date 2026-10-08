'use strict';
const assert = require('assert'); const express = require('express');
const records = require('../modules/records/record-activity');
const imports = require('../modules/buyers/buyer-find-import');
const deals = require('../modules/deals/reviewed-deals');
const { registerRecordActivityRoutes } = require('../modules/records/record-activity-routes');
const { registerReviewedDealRoutes } = require('../modules/deals/reviewed-deal-routes');
const { fixture, now } = require('./reviewed-deals.test');
(async () => {
  let store = { buyers: [], leads: [{ id:'lead1',state:'FL',reference_id:'LEGACY-ONE',address:'Private fixture address',owner_name:'Private fixture owner',phone:'555-555-9999' }], activities: [] }; let writes=0;
  const original=JSON.stringify(store); const app=express();app.use(express.json());
  registerRecordActivityRoutes(app,{ db:{readDBStrict:()=>store,writeDB:s=>{store=s;writes++;}},requireAdmin:(req,res,next)=>{if(req.headers['x-fixture-admin']!=='yes')return res.status(401).json({code:'admin_required'});req.currentUser={id:'fixture-admin'};next();},now:()=>now });
  registerReviewedDealRoutes(app,{ db:{readDBStrict:()=>store,writeDB:s=>{store=s;writes++;}},requireAdmin:(req,res,next)=>{if(req.headers['x-fixture-admin']!=='yes')return res.status(401).json({code:'admin_required'});req.currentUser={id:'fixture-admin'};next();},now:()=>now });
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port;
  async function get(route,admin=true){const r=await fetch(base+route,{headers:admin?{'x-fixture-admin':'yes'}:{}});return{status:r.status,body:await r.json()};}
  async function post(body,admin=true){const r=await fetch(base+'/api/dashboard/record-refs/assign',{method:'POST',headers:{'Content-Type':'application/json',...(admin?{'x-fixture-admin':'yes'}:{})},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};}
  try{
    for(const route of ['/api/dashboard/record-activity','/api/dashboard/record-search?q=FL','/api/dashboard/record-refs'])assert.strictEqual((await get(route,false)).status,401);
    const counts=await get('/api/dashboard/record-refs');assert.strictEqual(counts.body.missing.leads,1);assert.ok(!JSON.stringify(counts.body).includes('Private fixture'));
    await get('/api/dashboard/record-activity');assert.strictEqual(JSON.stringify(store),original);assert.strictEqual(writes,0);
    assert.strictEqual((await get('/api/dashboard/record-activity?from=2026-99-99')).status,400);
    assert.strictEqual((await post({confirm:true},false)).status,401);assert.strictEqual((await post({})).status,400);assert.strictEqual(writes,0);
    assert.strictEqual((await post({confirm:true})).status,200);assert.strictEqual(writes,1);assert.strictEqual(store.leads[0].record_ref,'WOS-FL-0001');
    assert.deepStrictEqual(Object.fromEntries(Object.entries(store.leads[0]).filter(([k])=>k!=='record_ref')),JSON.parse(original).leads[0]);
    await post({confirm:true});assert.strictEqual(writes,1,'repeat assignment is idempotent');
    const plan=imports.prepareImport(store,{items:[{...fixture(),ref:'WOS-FL-0200'},{kind:'interaction',ts:now,who:'Assistant',channel:'manual',dir:'note',with:'Private party',ref:'WOS-FL-0200',summary:'Reported document review, not an evidence confirmation.'}]},{now});
    const before=JSON.stringify(store);assert.ok(!JSON.stringify(plan.summary).includes('Private party'));assert.strictEqual(JSON.stringify(store),before);
    const committed=imports.commitImport(store,plan,{now,operatorId:'fixture-admin',createId:()=> 'deal1',bulkApprove:false});store=committed.store;
    assert.strictEqual(store.reviewed_deals[0].record_ref,'WOS-FL-0200');assert.strictEqual(store.reviewed_deals[0].approval,'pending');
    let timeline=records.listActivity(store,{recordKind:'deal',recordId:'deal1'});assert.ok(timeline.items.some(e=>e.attribution==='imported_report'));assert.strictEqual(timeline.items.filter(e=>e.type==='imported').length,1);
    store=deals.update(store,'deal1',{action:'approve',reviewed_comps:true},{now,operatorId:'fixture-admin'});
    store=deals.update(store,'deal1',{action:'status',status:'dead'},{now,operatorId:'fixture-admin'});
    timeline=records.listActivity(store,{recordKind:'deal',recordId:'deal1'});assert.strictEqual(timeline.items.filter(e=>e.type==='status_change').length,1,'one canonical row per transition, no legacy-history duplicate');
    const api=await get('/api/dashboard/record-activity?ref=WOS-FL-0200');assert.ok(!JSON.stringify(api.body).includes('Private party'));
    assert.strictEqual((await get('/api/dashboard/record-search?q=WOS-FL-0200')).body.items[0].id,'deal1');
    const beforeDraft=store.activities.length;
    const generated=await fetch(base+'/api/dashboard/todays-deals/deal1/jv-draft',{method:'POST',headers:{'Content-Type':'application/json','x-fixture-admin':'yes'},body:'{}'});
    assert.strictEqual(generated.status,200);assert.ok((await generated.text()).includes('WOS-FL-0200'));assert.strictEqual(store.activities.length,beforeDraft+1);assert.strictEqual(store.activities.at(-1).type,'jv_generated');
    const readBefore=JSON.stringify(store);await fetch(base+'/api/dashboard/todays-deals/deal1/jv-draft',{headers:{'x-fixture-admin':'yes'}});assert.strictEqual(JSON.stringify(store),readBefore,'draft GET remains read-only');
    const malformed=await fetch(base+'/api/dashboard/record-refs/assign',{method:'POST',headers:{'Content-Type':'application/json','x-fixture-admin':'yes'},body:'{"private":"do-not-echo-contact"'});
    assert.strictEqual(malformed.status,400);assert.ok(!(await malformed.text()).includes('do-not-echo-contact'));assert.strictEqual(JSON.stringify(store),readBefore);
    console.log('Record routes: admin/no-write reads, explicit idempotent metadata assignment, mixed interaction import and one canonical transition row passed.');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
