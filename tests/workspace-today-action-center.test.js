'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');

async function accessibility(today){
 const http=require('node:http'),net=require('node:net'),{pathToFileURL}=require('node:url');
 const lighthouse=(await import(pathToFileURL(process.env.WOS_LIGHTHOUSE_PATH).href)).default;
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  const payload=pathname==='/api/auth/session'?{authenticated:true,role:'admin'}:pathname==='/api/dashboard/today-workspace'?today:null;
  if(payload){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(payload));}
  const relative=pathname==='/app'?'workspace/index.html':pathname.startsWith('/dashboard/')?pathname.slice(11):'';
  if(!relative||relative.includes('..')){res.writeHead(404);return res.end();}
  const file=path.join(__dirname,'../dashboard',relative);
  if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true,args:['--remote-debugging-port='+port]})).browser;
  const results=[];
  for(const width of [1366,412]){
   const result=await lighthouse('http://127.0.0.1:'+server.address().port+'/app?preview=1',{port,logLevel:'error',onlyCategories:['accessibility'],formFactor:width===1366?'desktop':'mobile',throttlingMethod:'provided',screenEmulation:{mobile:width!==1366,width,height:width===1366?768:915,deviceScaleFactor:1,disabled:false}});
   const score=Math.round(result.lhr.categories.accessibility.score*100);assert(score>=90,'synthetic accessibility at '+width);results.push({width,score,lighthouse_version:result.lhr.lighthouseVersion});
  }
  return results;
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

async function prove(){
 const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
 const proof={synthetic_only:true,widths:[]};
 const today={source_kind:'derived_workflow',now:'2026-10-21T18:00:00Z',today:'2026-10-21',counts:{replies:1,approvals:2,followups:1,deadlines:2},actions:[
  {key:'overdue',kind:'conversation',heading:'Synthetic overdue follow-up',label:'Follow-up due',ref:'WOS-FL-1012',due_date:'2026-10-20',urgency:'overdue',action_label:'Open conversation',source_kind:'imported_report'},
  {key:'due',kind:'conversation',heading:'Synthetic due today',label:'Reply waiting',ref:'WOS-FL-1012',due_date:'2026-10-21',urgency:'due_today',action_label:'Open conversation',source_kind:'imported_report'},
  {key:'review',kind:'buyer',heading:'Synthetic buyer review',label:'Buyer needs approval',ref:'BUY-0005',urgency:'review',action_label:'Review buyer',source_kind:'derived_workflow'},
  {key:'waiting',kind:'conversation',heading:'Synthetic waiting',label:'Waiting on someone else',ref:'WOS-FL-1012',urgency:'waiting',waiting_days:4,action_label:'Open conversation',source_kind:'imported_report'},
  {key:'upcoming',kind:'deal',heading:'Synthetic upcoming deadline',label:'Deadline within seven days',ref:'WOS-FL-1012',due_date:'2026-10-23',urgency:'upcoming',action_label:'Open deal',source_kind:'derived_workflow'}
 ],pending:{drafts:[{heading:'Fixture draft buyer',ref:'BUY-0005',label:'Draft not sent',reason:'Saved draft needs review.'}],waiting:[{heading:'Fixture waiting contact',label:'Waiting on someone else',reason:'Waiting for a recorded reply.'}],bounced:[{heading:'Fixture bounce contact',ref:'BUY-0005',label:'Bounce reported',reason:'Resolution is not recorded.'}],reminders:[{heading:'Fixture reminder',ref:'WOS-FL-1012',label:"Don't forget",reason:'Review rent roll.'}]},best_deals:[{id:'deal-synthetic',ref:'WOS-FL-1012',heading:'Synthetic reviewed property',asking:100000,value_range:{low:160000,high:180000},spread:25000,comp_count:3,buyer_count:2,deadline:'2026-10-27'}],last_24h:[{key:'activity-synthetic',label:'Conversation updated (reported)',at:'2026-10-21T17:18:00Z',ref:'WOS-FL-1012',source_kind:'recorded_activity'}]};
 try{
  for(const width of [1366,400,412]){
   const height=width===1366?768:915,page=await browser.newPage({viewport:{width,height}}),errors=[],writes=[],external=[];let authenticated=true,role='admin';
   page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!=='https://fixture.test'){external.push(url.origin);return route.abort();}
    if(req.method()!=='GET'){writes.push(req.method()+' '+url.pathname);return route.abort();}
    if(url.pathname==='/api/auth/session')return route.fulfill({json:{authenticated,role}});
    if(url.pathname==='/api/gmail/messages')return route.fulfill({json:{ok:true,messages:[]}});
    if(url.pathname==='/api/dashboard/today-workspace')return route.fulfill({json:today});
    if(url.pathname==='/app')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../dashboard/workspace/index.html'))});
    if(url.pathname.startsWith('/dashboard/')){
     const relative=url.pathname.slice('/dashboard/'.length);assert(!relative.includes('..'));
     const file=path.join(__dirname,'../dashboard',relative);if(!fs.existsSync(file))return route.fulfill({status:404,body:'not found'});
     const type=relative.endsWith('.css')?'text/css':relative.endsWith('.svg')?'image/svg+xml':'text/javascript';
     return route.fulfill({contentType:type,body:fs.readFileSync(file)});
    }
    throw Error('Unexpected request '+url.pathname);
   });
   await page.goto('https://fixture.test/app?preview=1');
   await page.getByRole('heading',{name:'Your action queue',exact:true}).waitFor();
   assert.equal(await page.locator('.ws-today > section').first().getByRole('heading',{name:'Hey Gabriel',exact:true}).count(),1,'pending panel is the first Today section');
   for(const name of ['Fixture draft buyer','Fixture waiting contact','Fixture bounce contact','Fixture reminder']){
    await page.getByRole('button',{name:'Review '+name,exact:true}).click();
    assert(await page.getByRole('dialog',{name:'Record',exact:true}).isVisible());
    if(name==='Fixture waiting contact')assert.equal(await page.getByRole('link',{name:'Open full record',exact:true}).count(),0,'unlinked waiting item never guesses a record');
    else assert(await page.getByRole('link',{name:'Open full record',exact:true}).isVisible());
    await page.keyboard.press('Escape');
   }
   for(const [label,group] of [['Overdue','overdue'],['Due today','due_today'],['Needs review','review'],['Waiting on someone else','waiting'],['Coming up','upcoming']])assert.equal(await page.locator('[data-urgency-group="'+group+'"]').count(),1,label+' group visible');
   assert((await page.locator('[data-urgency-group="waiting"]').innerText()).includes('Waiting 4 days'));
   assert(await page.getByRole('link',{name:'Open best deal: Synthetic reviewed property'}).isVisible());
   assert.equal(await page.getByRole('link',{name:'Open best deal: Synthetic reviewed property'}).getAttribute('href'),'/dashboard/?record_ref=WOS-FL-1012');
   const best=await page.locator('.ws-today-deal').innerText();for(const fact of ['$100,000','$160,000 to $180,000','3 comps','$25,000 before closing costs','2 approved buyers match'])assert(best.includes(fact),fact);
   assert((await page.locator('.ws-today-stats').innerText()).includes('1 reply waiting'));
   assert.equal(await page.getByRole('button',{name:/Send|Approve|Contact/}).count(),0,'Today exposes no outbound or approval command');
   await page.getByRole('button',{name:/Synthetic overdue follow-up/}).click();
   assert.equal(await page.getByRole('link',{name:'Open full record',exact:true}).getAttribute('href'),'/dashboard/?record_ref=WOS-FL-1012');
   await page.getByRole('button',{name:'Close Record',exact:true}).click();
   await page.getByRole('button',{name:/Conversation updated/}).click();
   assert(await page.getByRole('link',{name:'Open full record',exact:true}).isVisible(),'unique linked activity opens its record');
   await page.keyboard.press('Escape');
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,firstPaint:performance.getEntriesByName('first-contentful-paint')[0]?.startTime||null,styles:Array.from(document.styleSheets).map(s=>new URL(s.href).pathname)}));
   assert.equal(geometry.overflow,false,'no horizontal overflow at '+width);
   assert.deepEqual(geometry.styles,['/dashboard/workspace/design-system.css']);
   assert(geometry.firstPaint!==null&&geometry.firstPaint<2000,'synthetic first paint under 2s');
   proof.widths.push({width,height,first_contentful_paint_ms:geometry.firstPaint,horizontal_overflow:geometry.overflow,stylesheet_count:geometry.styles.length});
   if(process.argv.includes('--screenshots')){await page.evaluate(async()=>{document.activeElement?.blur();await new Promise(requestAnimationFrame);window.scrollTo(0,0);document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});await new Promise(requestAnimationFrame);});await page.mouse.move(0,0);const dir=path.join(__dirname,'../docs/screens/2026-10-21-today-action-center');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-today-'+width+'.png')});}
   const originalPending=today.pending;
   today.pending={...originalPending,drafts:Array.from({length:7},(_,i)=>({heading:'Fixture saved draft '+i,ref:'BUY-0005',label:'Draft not sent',reason:i===6?'<img src="https://blocked.test/pixel">':'Saved draft; review before sending.'}))};
   await page.getByRole('button',{name:'Refresh recorded work',exact:true}).click();
   await page.getByRole('heading',{name:'Hey Gabriel',exact:true}).waitFor();
   await page.locator('.ws-today-pending summary').click();
   await page.getByRole('button',{name:'Review Fixture saved draft 6',exact:true}).click();
   assert(await page.getByRole('dialog',{name:'Record',exact:true}).getByText('<img src="https://blocked.test/pixel">',{exact:true}).isVisible(),'unsafe reason renders as text');
   assert.equal(await page.locator('img[src="https://blocked.test/pixel"]').count(),0);
   await page.keyboard.press('Escape');
   delete today.pending;
   await page.getByRole('button',{name:'Refresh recorded work',exact:true}).click();
   await page.getByRole('heading',{name:'Pending summary unavailable',exact:true}).waitFor();
   today.pending=originalPending;
   assert.deepEqual(writes,[],'no state-changing request');assert.deepEqual(external,[],'no external fetch');assert.deepEqual(errors,[],'console and page errors');
   await page.close();
  }
  if(process.env.WOS_LIGHTHOUSE_PATH)proof.accessibility=await accessibility(today);
  if(process.argv.includes('--screenshots')){const dir=path.join(__dirname,'../docs/screens/2026-10-21-today-action-center');fs.writeFileSync(path.join(dir,'synthetic-proof.json'),JSON.stringify(proof,null,2)+'\n');}
  console.log('workspace-today-action-center: synthetic 1366/400/412 panels, urgency, truthful waiting age, reviewed deal facts, canonical record links, zero send/approval controls, no overflow, first paint <2s, no writes/external calls/errors passed');
 }finally{await browser.close();}
}
prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
