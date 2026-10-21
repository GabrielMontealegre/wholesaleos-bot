'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');

async function prove(){
 const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
 const proof={synthetic_only:true,widths:[]};
 const today={source_kind:'derived_workflow',now:'2026-10-21T18:00:00Z',today:'2026-10-21',counts:{replies:1,approvals:2,followups:1,deadlines:2},actions:[
  {key:'overdue',kind:'conversation',heading:'Synthetic overdue follow-up',label:'Follow-up due',ref:'WOS-FL-1012',due_date:'2026-10-20',urgency:'overdue',action_label:'Open conversation',source_kind:'imported_report'},
  {key:'due',kind:'conversation',heading:'Synthetic due today',label:'Reply waiting',ref:'WOS-FL-1012',due_date:'2026-10-21',urgency:'due_today',action_label:'Open conversation',source_kind:'imported_report'},
  {key:'review',kind:'buyer',heading:'Synthetic buyer review',label:'Buyer needs approval',ref:'BUY-0005',urgency:'review',action_label:'Review buyer',source_kind:'derived_workflow'},
  {key:'waiting',kind:'conversation',heading:'Synthetic waiting',label:'Waiting on someone else',ref:'WOS-FL-1012',urgency:'waiting',waiting_days:4,action_label:'Open conversation',source_kind:'imported_report'},
  {key:'upcoming',kind:'deal',heading:'Synthetic upcoming deadline',label:'Deadline within seven days',ref:'WOS-FL-1012',due_date:'2026-10-23',urgency:'upcoming',action_label:'Open deal',source_kind:'derived_workflow'}
 ],best_deals:[{id:'deal-synthetic',ref:'WOS-FL-1012',heading:'Synthetic reviewed property',asking:100000,value_range:{low:160000,high:180000},spread:25000,comp_count:3,buyer_count:2,deadline:'2026-10-27'}],last_24h:[{key:'activity-synthetic',label:'Conversation updated (reported)',at:'2026-10-21T17:18:00Z',ref:'WOS-FL-1012',source_kind:'recorded_activity'}]};
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
   if(process.argv.includes('--screenshots')){await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});document.activeElement?.blur();});await page.mouse.move(0,0);const dir=path.join(__dirname,'../docs/screens/2026-10-21-today-action-center');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'synthetic-today-'+width+'.png')});}
   assert.deepEqual(writes,[],'no state-changing request');assert.deepEqual(external,[],'no external fetch');assert.deepEqual(errors,[],'console and page errors');
   await page.close();
  }
  if(process.argv.includes('--screenshots')){const dir=path.join(__dirname,'../docs/screens/2026-10-21-today-action-center');fs.writeFileSync(path.join(dir,'synthetic-proof.json'),JSON.stringify(proof,null,2)+'\n');}
  console.log('workspace-today-action-center: synthetic 1366/400/412 panels, urgency, truthful waiting age, reviewed deal facts, canonical record links, zero send/approval controls, no overflow, first paint <2s, no writes/external calls/errors passed');
 }finally{await browser.close();}
}
prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
