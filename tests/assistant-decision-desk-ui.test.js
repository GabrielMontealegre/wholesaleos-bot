'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const {fixture}=require('./helpers/assistant-snapshot-v2-fixture');
const {registerAssistantSnapshotRoutes}=require('../modules/records/assistant-snapshot-routes');
const {registerDecisionAnswerRoutes}=require('../modules/records/assistant-decision-answer-routes');
const {appendSnapshot}=require('../modules/records/assistant-snapshot');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const now='2026-10-31T12:00:00Z';
async function main(){
 const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
 try{for(const width of [1366,400,412]){
  let store={buyers:[],reviewed_deals:[]},authenticated=true,writes=0,answerPosts=0,hold=false,holdRead=false,lose=false,release;
  const data=fixture();data.open_items[0].suggestion='Synthetic draft <img src=x>\nSecond line.';
  const app=express();
  app.get('/api/auth/session',(_,res)=>res.json({authenticated,role:'admin'}));
  app.get('/api/dashboard/today-workspace',(_,res)=>res.json({source_kind:'derived_workflow',now,today:'2026-10-31',counts:{},actions:[],best_deals:[],last_24h:[],capabilities:{assistant_snapshot_import:true}}));
  app.use('/api/dashboard/assistant-snapshot-answers',(req,res,next)=>{if(req.method==='POST')answerPosts++;if(req.method==='POST'&&lose){res.json=()=>{res.destroy();return res;};}else if(req.method==='POST'&&hold||req.method==='GET'&&holdRead){hold=false;holdRead=false;const json=res.json.bind(res);res.json=body=>{release=()=>json(body);return res;};}next();});
  const dependencies={db:{readDBStrict:()=>store,writeDB:value=>{store=value;writes++;}},requireAdmin(req,res,next){if(!authenticated)return res.status(401).json({code:'SESSION_REQUIRED'});req.currentUser={id:'synthetic-owner',role:'admin'};next();},now:()=>now};
  registerDecisionAnswerRoutes(app,dependencies);registerAssistantSnapshotRoutes(app,dependencies);
  app.get('/app',(_,res)=>res.sendFile(path.join(__dirname,'../dashboard/workspace/index.html')));
  app.get('/favicon.ico',(_,res)=>res.status(204).end());app.use('/dashboard',express.static(path.join(__dirname,'../dashboard')));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port,context=await browser.newContext({viewport:{width,height:width===1366?768:915}}),page=await context.newPage(),errors=[],external=[],otherWrites=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base){external.push(url.origin);return route.abort();}if(req.method()!=='GET'&&!(req.method()==='POST'&&['/api/dashboard/assistant-snapshots','/api/dashboard/assistant-snapshot-answers'].includes(url.pathname))){otherWrites.push(req.method());return route.abort();}return route.continue();});
  try{
   await page.goto(base+'/app?preview=1');await page.getByText('No file imported yet.',{exact:true}).waitFor();
   await page.locator('#assistant-file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});assert.equal(writes,0);
   await page.locator('#assistant-import').click();await page.getByRole('heading',{name:'Decision Desk',exact:true}).waitFor();
   const choice=page.locator('[data-decision-choice="0:A"]');await page.waitForFunction(()=>document.querySelector('[data-decision-choice="0:A"]')?.disabled===false);
   assert.equal(await page.locator('[data-decision-card]').count(),3);assert.equal(await page.getByText('Synthetic decision 3',{exact:true}).count(),0);assert.equal(await page.getByText('Synthetic decision 4',{exact:true}).count(),0);
   assert.equal(await page.locator('.ws-decision-draft').first().textContent(),data.open_items[0].suggestion);assert.equal(await page.locator('#assistant-slot img[src=x]').count(),0);
   assert((await page.locator('#assistant-slot').innerText()).includes('1 follow-ups due today'));
   assert((await page.locator('.ws-decision-numbers').first().innerText()).includes('$0'));
   await page.locator('[data-decision-note="0"]').fill('Synthetic owner note');hold=true;await choice.click();
   await page.waitForFunction(()=>document.querySelector('[data-decision-status]')?.textContent==='Recording your answer...');
   assert(await choice.isDisabled());await page.locator('[data-decision-choice="0:B"]').dispatchEvent('click');
   await page.waitForFunction(()=>document.querySelector('#assistant-refresh')?.disabled===true);
   const deadline=Date.now()+5000;while(!release&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert(release,'Actual local response reached bounded hold');release();release=null;
   await page.getByText('Answer recorded.',{exact:true}).waitFor();assert.equal(answerPosts,1);assert.equal(store.assistant_decision_answers.length,1);assert.equal(store.assistant_decision_answers[0].note,'Synthetic owner note');assert.equal(await page.evaluate(()=>document.activeElement.dataset.decisionChoice),'0:A');
   await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-decision-recorded]')?.textContent.startsWith('Your answer: Ask'));
   assert.equal(writes,2,'Readback never appends');assert.equal(await page.locator('[data-decision-recorded-note]').first().textContent(),'Your note: Synthetic owner note');
   const cardBoxes=await page.locator('[data-decision-card]').first().evaluate(card=>[...card.querySelectorAll('[data-decision-choice]')].map(el=>{const r=el.getBoundingClientRect(),p=card.getBoundingClientRect();return {height:r.height,inside:r.left>=p.left&&r.right<=p.right,overflow:el.scrollWidth>el.clientWidth};}));for(const box of cardBoxes){assert(box.height>=44);assert(box.inside);assert.equal(box.overflow,false);}
   if(process.env.WOS_DECISION_PROOF_DIR){fs.mkdirSync(process.env.WOS_DECISION_PROOF_DIR,{recursive:true});await page.locator('[data-decision-recorded-note]').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.WOS_DECISION_PROOF_DIR,'synthetic-answer-readback-'+width+'.png')});}
   await page.locator('[data-decision-choice="0:B"]').click();await page.getByText('Answer recorded.',{exact:true}).waitFor();assert.deepEqual(store.assistant_decision_answers.map(row=>row.choice),['A','B']);
   lose=true;await page.locator('[data-decision-choice="0:C"]').click();await page.getByText('The answer may be recorded. Refresh before choosing again.',{exact:true}).waitFor();lose=false;
   assert.deepEqual(store.assistant_decision_answers.map(row=>row.choice),['A','B','C']);assert(await choice.isDisabled());assert.equal(writes,4,'Unknown transport outcome appends only one explicit UUID request');
   await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-decision-recorded]')?.textContent.startsWith('Your answer: Pass'));assert.equal(writes,4,'Lost response recovery uses GET only');
   await page.getByRole('tab',{name:'Agents',exact:true}).click();assert((await page.locator('#decision-panel-agents').innerText()).includes('Listing agent'));assert((await page.locator('#decision-panel-agents').innerText()).includes('Response time: Not reported'));
   await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Outreach',exact:true}).getAttribute('aria-selected'),'true');assert((await page.locator('#decision-panel-outreach').innerText()).includes('Review the reported question.'));
   for(const tab of ['Decision Desk','Agents','Outreach']){await page.getByRole('tab',{name:tab,exact:true}).click();const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,tabs:[...document.querySelectorAll('[data-decision-tab]')].map(el=>({height:el.getBoundingClientRect().height,overflow:el.scrollWidth>el.clientWidth}))}));assert.equal(geometry.overflow,false);for(const box of geometry.tabs){assert(box.height>=44);assert.equal(box.overflow,false);}if(process.env.WOS_DECISION_PROOF_DIR){fs.mkdirSync(process.env.WOS_DECISION_PROOF_DIR,{recursive:true});await page.locator('#assistant-slot').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.WOS_DECISION_PROOF_DIR,'synthetic-'+tab.replace(/ /g,'-').toLowerCase()+'-'+width+'.png')});}}
   await page.getByRole('tab',{name:'Decision Desk',exact:true}).click();const newer=fixture();newer.open_items[0].title='Synthetic replacement';store=appendSnapshot(store,Buffer.from(JSON.stringify(newer)),{now,operatorId:'synthetic-owner',filename:'replacement.json'});
   await page.locator('[data-decision-choice="0:B"]').click();await page.getByText('This file or answer changed. Refresh before choosing again.',{exact:true}).waitFor();assert.equal(store.assistant_decision_answers.length,3);assert(await choice.isDisabled());
   await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await page.getByRole('heading',{name:'Synthetic replacement',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-decision-choice="0:A"]')?.disabled===false);assert((await page.locator('[data-decision-recorded]').first().innerText()).startsWith('No answer recorded'));
   holdRead=true;await page.getByRole('button',{name:'Refresh assistant sheet',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-decision-status]')?.textContent==='Loading recorded answers...');
   const readDeadline=Date.now()+5000;while(!release&&Date.now()<readDeadline)await new Promise(resolve=>setTimeout(resolve,10));assert(release,'Late answer read reached bounded hold');
   authenticated=false;await page.getByRole('button',{name:'Refresh recorded work',exact:true}).click();await page.getByRole('heading',{name:'Unlock your workspace',exact:true}).waitFor();release();release=null;
   assert.equal(await page.locator('[data-decision-desk]').count(),0,'Aborted late answer read cannot restore the destroyed signed view');
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(otherWrites,[]);assert.equal(store.buyers.length,0);assert.equal(store.reviewed_deals.length,0);
  }finally{await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }}finally{await browser.close();}
 console.log('assistant-decision-desk-ui: synthetic 1366/400/412 import/full context/tier counts/escaped draft/answers/readback/stale source/tabs/auth clearing/geometry passed');
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
