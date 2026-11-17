'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const templates=require('../modules/email/template-approvals');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const now='2026-11-03T19:18:00.000Z',base='https://fixture.test';
const cases=[['2026-10-30T19:18:00Z','Fri 12:18 PM'],['2026-10-20T19:18:00Z','Oct 20'],
  ['2025-10-20T19:18:00Z','Oct 20, 2025'],['2026-11-03T06:59:59.999Z','Mon 11:59 PM'],
  ['2026-11-03T07:00:00Z','Tue 12:00 AM'],['11/03/2026','Time not confirmed'],
  ['2026-02-30T12:00:00Z','Time not confirmed'],['2026-11-03T19:19:00Z','Time not confirmed'],
  ['2026-10-30','Time not confirmed'],['2026-10-30T19:18:00+00:00','Time not confirmed'],['','Time not confirmed']];
const input={kind:'holder_jv_reply',subject:'Synthetic reviewed subject',body:'Synthetic source prose 11/03/2026 <img src=x>.',reviewed:true};
const empty=templates.list({}, {now}).items[0];
const saved=templates.save({}, {...input,version:empty.version},{now:cases[0][0],operatorId:'synthetic-owner'}).store;
const response=templates.list(saved,{now});
assert.equal(response.items[0].template.recorded_at,cases[0][0]);
assert.equal(response.items[0].approved_send_count,0);
assert.equal(response.items[0].automatic_send_allowed,false);
const frozen=JSON.stringify({saved,response});let phase='startup';
async function main(){
  const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
  try{for(const width of [1366,400,412]){
    const context=await browser.newContext({viewport:{width,height:915},timezoneId:'Asia/Tokyo'}),page=await context.newPage();
    const errors=[],external=[],writes=[];let at=cases[0][0];
    page.setDefaultTimeout(10000);
    await page.addInitScript(value=>{const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:[value]));}static now(){return value;}};},Date.parse(now));
    page.on('pageerror',error=>errors.push(error.name));
    await page.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/dashboard/email-templates'){
        const value=structuredClone(response);value.items[0].template.recorded_at=at;
        return route.fulfill({json:value});
      }
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#101317;color:#e5e7eb;font:16px Arial}main{max-width:720px;padding:16px;margin:auto}button,input,select,textarea{font:inherit}button{background:#193e32;color:#fff;border:1px solid #608876;padding:8px}input,select,textarea{background:#191d23;color:#fff;border:1px solid #6b7280}h1{font-size:24px}</style></head><body><main><h1>Email</h1><div id="content"></div></main><script>window.APP={unlocked:true,currentUser:{id:"synthetic-owner"}};window.renderGmail=function(){return ""};</script><script src="/dashboard/wos-card-clock.js?v=3"></script><script src="/dashboard/wos-email-templates.js?v=3"></script><script>document.getElementById("content").innerHTML=renderGmail();</script></body></html>'});
      if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
      const files={'/dashboard/wos-card-clock.js':'wos-card-clock.js','/dashboard/wos-email-templates.js':'wos-email-templates.js'};
      assert(Object.hasOwn(files,url.pathname));
      return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../dashboard',files[url.pathname]))});
    });
    async function load(label){await page.locator('[data-template-load]').click();await page.getByText('Operator-reviewed text; recorded '+label+' by synthetic-owner.',{exact:true}).waitFor();}
    try{
      phase=width+':labels';await page.goto(base);
      for(const [value,label] of cases){at=value;await load(label);}
      phase=width+':proof';at=cases[width===1366?0:width===400?1:2][0];await load(cases[width===1366?0:width===400?1:2][1]);
      assert.equal(await page.locator('[name=subject]').inputValue(),input.subject);
      assert.equal(await page.locator('[name=body]').inputValue(),input.body);
      assert.equal(await page.locator('[name=reviewed]').isChecked(),false);
      assert.equal(await page.locator('#email-template-library img').count(),0);
      for(const control of await page.locator('button,select,input:not([type=checkbox]),textarea').all()){
        const box=await control.boundingBox();assert(box&&box.height>=44&&box.width>=44&&box.x>=0&&box.x+box.width<=width+1);
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.WOS_TEMPLATE_TIMES_PROOF_DIR){fs.mkdirSync(process.env.WOS_TEMPLATE_TIMES_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.WOS_TEMPLATE_TIMES_PROOF_DIR,'templates-'+width+'.png')});}
      phase=width+':missing-clock';await page.evaluate(()=>{window.wosCardClock=null;document.getElementById('content').innerHTML=renderGmail();});
      await page.getByText('Operator-reviewed text; recorded Time not confirmed by synthetic-owner.',{exact:true}).waitFor();
      phase=width+':session';await page.evaluate(()=>dispatchEvent(new Event('wos:session-ended')));
      assert.equal(await page.locator('[data-template-form]').count(),0);
      assert.equal(JSON.stringify({saved,response}),frozen);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);
    }finally{await context.close();}
  }}finally{await browser.close();}
  console.log('template-time-labels: synthetic 1366/400/412 Tokyo/recent-old-year/midnight/invalid-future/missing-clock/source-text/session/no-writes PASS');
}
main().catch(error=>{console.error('template-time-labels failed '+phase+' '+error.stack);process.exitCode=1;});
