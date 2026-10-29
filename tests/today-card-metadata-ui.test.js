'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const express=require('express');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const classic=require('../dashboard/wos-today-workspace');
const data={source_kind:'derived_workflow',now:'2026-10-07T18:00:00Z',today:'2026-10-07',counts:{replies:1,approvals:1,followups:0,deadlines:1},actions:[
 {key:'buyer:fixture-buyer',record_id:'fixture-buyer',kind:'buyer',heading:'Recorded buyer',label:'Buyer needs approval',ref:'BUY-0001',urgency:'review',action_label:'Review buyer',source_kind:'derived_workflow'},
 {key:'deadline:fixture-deal',record_id:'fixture-deal',kind:'deal',heading:'Recorded property',label:'Deadline within seven days',ref:'WOS-FL-1031',due_date:'2026-10-10',action_label:'Open deal',source_kind:'derived_workflow'}
],best_deals:[{id:'fixture-deal',ref:'WOS-FL-1031',heading:'Reviewed property',asking:100000,value_range:{low:160000,high:180000},spread:25000,comp_count:3,buyer_count:2,deadline:'2026-10-10',grade:'Gold',value_tier:'Verified'}],last_24h:[
 {key:'activity:match',ref:'M-0001',label:'Match recorded',at:'2026-10-07T17:00:00Z',source_kind:'recorded_activity',reported:true,target:{kind:'match',id:'match-fixture',deal_id:'fixture-deal'}},
 {key:'activity:release',label:'Verified release #475',at:'2026-10-07T16:00:00Z',source_kind:'verified_release_record',source_url:'https://github.com/GabrielMontealegre/wholesaleos-bot/pull/475'}
]};
const original=JSON.stringify(data);
function unit(){
 const text=classic.markup(data);assert(!/BUY-0001|WOS-FL-1031|M-0001/.test(text));
 assert(text.includes('data-today-action="buyer:fixture-buyer"'));assert(text.includes('data-today-deal="fixture-deal"'));assert(text.includes('data-today-record="activity:match"'));
 const missing=JSON.parse(original);delete missing.best_deals[0].heading;missing.best_deals[0].location='';
 assert(classic.markup(missing).includes('Property details needed'));assert(!classic.markup(missing).includes('WOS-FL-1031'));
 const source=JSON.parse(original);source.actions[0].heading='Source says BUY-4321 <img src=x onerror=alert(1)>';
 const escaped=classic.markup(source);assert(escaped.includes('Source says BUY-4321 &lt;img'));assert(!escaped.includes('<img src=x'));
 assert.equal(JSON.stringify(data),original,'rendering never mutates reference metadata');
}
async function prove(){
 unit();const fixture=createFixtureApp({todayProof:true}),app=express(),root=path.resolve(__dirname,'..');let writes=0;
 app.use((req,res,next)=>{if(req.method!=='GET'){writes++;return res.status(405).end();}next();});
 app.get('/api/dashboard/today-workspace',(_,res)=>res.set('Cache-Control','no-store').json(data));
 app.get('/app',(_,res)=>res.sendFile(path.join(root,'dashboard/workspace/index.html')));app.use(fixture.app);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  for(const view of ['native','classic'])for(const width of [1366,400,412]){
   const page=await browser.newPage({viewport:{width,height:width===1366?768:915}}),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.name));
   await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});if(url.origin===base)return route.continue();if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});external.push(url.hostname);return route.abort();});
   await page.goto(base+(view==='native'?'/app':'/dashboard/?workspace=today'));
   await page.locator(view==='native'?'.ws-today-action':'[data-today-action]').first().waitFor();
   const host=view==='native'?'.ws-today':'#wos-today-workspace';
   assert(!/BUY-0001|WOS-FL-1031|M-0001/.test(await page.locator(host).innerText()),'standalone metadata absent from '+view);
   if(view==='native'){
    assert.equal(await page.getByRole('link',{name:'Open best deal: Reviewed property',exact:true}).getAttribute('href'),'/dashboard/?record_ref=WOS-FL-1031');
    await page.locator('[data-row="actions:0"]').click();
    assert.equal(await page.getByRole('link',{name:'Open full record',exact:true}).getAttribute('href'),'/dashboard/?record_ref=BUY-0001');await page.keyboard.press('Escape');
    await page.locator('[data-row="activity:0"]').click();
    assert.equal(await page.getByRole('link',{name:'Open full record',exact:true}).getAttribute('href'),'/dashboard/?record_ref=M-0001');await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ws-today-event[href]').getAttribute('href'),data.last_24h[1].source_url);
    if(process.env.WOS_TODAY_WORDS_PROOF_DIR)await page.screenshot({path:path.join(process.env.WOS_TODAY_WORDS_PROOF_DIR,view+'-'+width+'.png')});
   }else{
    assert.equal(await page.locator('[data-today-action]').count(),2);assert.equal(await page.locator('[data-today-deal]').getAttribute('data-today-deal'),'fixture-deal');
    assert.equal(await page.locator('[data-today-record]').getAttribute('data-today-record'),'activity:match');
    if(process.env.WOS_TODAY_WORDS_PROOF_DIR)await page.screenshot({path:path.join(process.env.WOS_TODAY_WORDS_PROOF_DIR,view+'-'+width+'.png')});
    await page.locator('[data-today-deal]').click();await page.locator('.td-open-view[data-deal-id="fixture-deal"]').waitFor();
    assert((await page.locator('.td-open-view .td-detail').innerText()).includes('WOS-FL-1031'),'full record identity retained');
    await page.getByRole('button',{name:'Back to results',exact:true}).click();
   }
   const heading=data.actions[0].heading,ref=data.actions[0].ref;
   data.actions[0].heading='Source says BUY-4321 <img src=x onerror=alert(1)>';data.actions[0].ref='https://wrong.example.test/BUY-0001';
   if(view==='classic')await page.goto(base+'/dashboard/?workspace=today');
   else await page.getByRole('button',{name:'Refresh recorded work',exact:true}).click();
   await page.getByText(data.actions[0].heading,{exact:true}).waitFor();
   assert.equal(await page.locator('img[src="x"]').count(),0,'source text stays escaped, not censored');
   if(view==='native'){
    await page.locator('[data-row="actions:0"]').click();assert.equal(await page.getByRole('link',{name:'Open full record',exact:true}).count(),0,'malformed references cannot become links');await page.keyboard.press('Escape');
   }
   data.actions[0].heading=heading;data.actions[0].ref=ref;
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
  }
  fixture.assertUnchanged();assert.equal(writes,0);assert.equal(JSON.stringify(data),original);
  console.log('today-card-metadata: native/classic1366/400/412 metadata absence, exact record routes/identity, missing heading, source escaping/immutability and no writes/external errors passed');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
if(process.env.WOS_TODAY_WORDS_PROOF_DIR)fs.mkdirSync(process.env.WOS_TODAY_WORDS_PROOF_DIR,{recursive:true});
prove().catch(e=>{console.error(e.stack);process.exitCode=1;});
