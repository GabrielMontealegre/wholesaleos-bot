'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const now='2026-11-03T19:18:00.000Z',base='https://fixture.test';
const times=[{created:'2026-11-02',created_at:'2026-11-03T07:00:00Z'},
  {created_at:'2026-11-03T06:59:59.999Z'},{created_at:'2026-11-04T19:18:00Z'},
  {updated_at:'2026-11-03T19:00:00Z'},{created:'11/03/2026'},{created:'2026-11-03'}];
const rows=times.map((value,i)=>({id:'age-'+i,record_ref:'WOS-FL-'+(1040+i),address:(100+i)+' Example St',city:'Northville',county:'Example',state:'FL',
  source:'manual',source_kind:'operator_input',status:'new',row_state:'LOCKED',contact_state:'LOCKED',address_state:'needs_source_proof',preview_only:true,not_a_saved_lead:true,...value}));
const before=JSON.stringify(rows);let phase='startup';
async function main(){
  const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
  try{for(const width of [1366,400,412]){
    const context=await browser.newContext({viewport:{width,height:915},timezoneId:'Asia/Tokyo'}),page=await context.newPage();
    const errors=[],external=[],writes=[];let reads=0;
    page.setDefaultTimeout(10000);
    await page.addInitScript(value=>{const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:[value]));}static now(){return value;}};},Date.parse(now));
    page.on('pageerror',error=>errors.push(error.name));
    await page.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(!['GET','HEAD'].includes(request.method())){writes.push(url.pathname);return route.abort();}
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/auth/session')return route.fulfill({json:{authenticated:true,role:'admin',user:{id:'synthetic-owner',role:'admin',name:'Synthetic operator'}}});
      if(url.pathname==='/api/leads'){reads++;return route.fulfill({json:{leads:rows,totalAll:rows.length,totalFiltered:rows.length,offset:0,limit:300,has_more:false,next_offset:null,prev_offset:null,location_counts:[]}});}
      if(url.pathname==='/api/dashboard/filter-counties')return route.fulfill({json:{schema_version:1,states:[{code:'FL',name:'Florida'}],counties:[{state:'FL',name:'Example'}]}});
      if(url.pathname==='/api/dashboard/today-workspace')return route.fulfill({json:{source_kind:'derived_workflow',now,today:'2026-11-03',yesterday:'2026-11-02',counts:{},actions:[],best_deals:[],last_24h:[]}});
      if(url.pathname.startsWith('/api/'))return route.fulfill({json:[]});
      if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
      const relative=url.pathname==='/dashboard/'?'index.html':url.pathname.startsWith('/dashboard/')?url.pathname.slice(11):null;
      assert(relative&&!relative.includes('..'));return route.fulfill({contentType:relative.endsWith('.html')?'text/html':relative.endsWith('.css')?'text/css':relative.endsWith('.svg')?'image/svg+xml':'text/javascript',body:fs.readFileSync(path.join(__dirname,'../dashboard',relative))});
    });
    try{
      phase=width+':ready';await page.goto(base+'/dashboard/');await page.waitForFunction(()=>APP.currentUser&&!APP._leadsLoading);
      await page.evaluate(async()=>{APP._leadToolbarFilters={age:'',sort:'priority'};navigate('leads',null);await loadLeadsFromAPI({offset:0,resetPage:true});APP._leadFilterBarOpen=true;render();});
      await page.waitForFunction(()=>APP.filtered.length===6&&!APP._leadsLoading);
      phase=width+':today';const initial=reads;await page.locator('#lfAge').selectOption('1');
      await page.waitForFunction(()=>!APP._leadsLoading&&APP.filtered.length===1&&APP.filtered[0].id==='age-0');
      assert(reads>initial,'Actual filter reload must pass through final API loader');
      assert.equal(await page.locator('#lfAge').inputValue(),'1');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.WOS_LEAD_AGE_PROOF_DIR){fs.mkdirSync(process.env.WOS_LEAD_AGE_PROOF_DIR,{recursive:true});await page.screenshot({fullPage:true,path:path.join(process.env.WOS_LEAD_AGE_PROOF_DIR,'today-'+width+'.png')});}
      phase=width+':visible-result';const address=page.getByText('100 Example St',{exact:true}).first();await address.scrollIntoViewIfNeeded();assert(await address.isVisible());
      for(let i=1;i<rows.length;i++)assert.equal(await page.getByText((100+i)+' Example St',{exact:true}).count(),0);
      if(process.env.WOS_LEAD_AGE_PROOF_DIR)await page.screenshot({path:path.join(process.env.WOS_LEAD_AGE_PROOF_DIR,'today-result-'+width+'.png')});
      phase=width+':any-time';await page.locator('#lfAge').selectOption('');await page.waitForFunction(()=>!APP._leadsLoading&&APP.filtered.length===6);
      assert.equal(JSON.stringify(rows),before);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);
    }finally{await context.close();}
  }}finally{await browser.close();}
  console.log('lead-age-calendar-ui: actual synthetic dashboard/filter/API loader1366/400/412 Tokyo,UTC-7 Today/exclusions/Any Time restoration/no overflow/no writes PASS');
}
main().catch(error=>{console.error('lead-age-calendar-ui failed '+phase+' '+error.stack);process.exitCode=1;});
