'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const now='2026-12-28T19:18:00.000Z',base='https://fixture.test';
const rows=[
  {id:'a'.repeat(32),created_at:'2026-12-24T19:18:00.000Z',expires_at:'2027-01-23T19:18:00.000Z',revoked_at:null,active:true,current:true},
  {id:'b'.repeat(32),created_at:'2025-12-20T19:18:00.000Z',expires_at:'2026-01-19T19:18:00.000Z',revoked_at:'2026-01-01T19:18:00.000Z',active:false,current:false},
  {id:'c'.repeat(32),created_at:'2026-11-20T19:18:00.000Z',expires_at:'2026-12-20T19:18:00.000Z',revoked_at:null,active:false,current:false}
];
let phase='start';
async function run(){
  const browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
  try{for(const width of [1366,400,412]){
    phase=width+':labels';
    const context=await browser.newContext({viewport:{width,height:915},timezoneId:'Asia/Tokyo'}),page=await context.newPage();
    const errors=[],external=[],writes=[],before=JSON.stringify(rows);let devices=rows;
    await page.addInitScript(value=>{const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:[value]));}static now(){return value;}};},Date.parse(now));
    page.on('pageerror',e=>errors.push(e.name));
    await page.route('**/*',route=>{
      const req=route.request(),url=new URL(req.url());
      if(req.method()!=='GET'){writes.push(url.pathname);return route.abort();}
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/api/auth/devices')return route.fulfill({json:{ok:true,devices}});
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#101317;color:#e5e7eb;font:16px Arial}main{max-width:720px;padding:16px;margin:auto}button{font:inherit}h1{font-size:24px}</style><link rel="stylesheet" href="/dashboard/wos-remember-devices.css?v=2"></head><body><main><h1>Settings</h1><div id="content"></div></main><script>window.APP={unlocked:true,currentUser:{id:"synthetic-owner"}};window.renderSettings=function(){return ""};</script><script src="/dashboard/wos-card-clock.js?v=3"></script><script src="/dashboard/wos-remember-devices.js?v=2"></script><script>document.getElementById("content").innerHTML=renderSettings();</script></body></html>'});
      if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
      assert(url.pathname.startsWith('/dashboard/')&&!url.pathname.includes('..'));
      const relative=url.pathname.slice(11);
      return route.fulfill({contentType:relative.endsWith('.css')?'text/css':relative.endsWith('.svg')?'image/svg+xml':'text/javascript',body:fs.readFileSync(path.join(__dirname,'../dashboard',relative))});
    });
    try{
      await page.goto(base);await page.getByText('Expires Jan 23, 2027, 12:18 PM',{exact:true}).waitFor();
      for(const label of ['Added Thu 12:18 PM','Added Dec 20, 2025','Forgotten Jan 1','Expired Dec 20'])assert.equal(await page.getByText(label,{exact:true}).count(),1);
      assert.equal(await page.locator('[data-device-forget]').count(),1);
      assert.equal(await page.getByText('This device',{exact:true}).count(),1);
      for(const control of await page.locator('button').all()){const r=await control.boundingBox();assert(r&&r.height>=44&&r.width>=44&&r.x>=0&&r.x+r.width<=width+1);}
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
      if(process.env.WOS_DEVICE_TIMES_PROOF_DIR){fs.mkdirSync(process.env.WOS_DEVICE_TIMES_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.WOS_DEVICE_TIMES_PROOF_DIR,'settings-'+width+'.png')});}
      phase=width+':missing-clock';await page.evaluate(()=>{window.wosCardClock=null;document.getElementById('content').innerHTML=renderSettings();});
      await page.getByText('Expires Time not confirmed',{exact:true}).waitFor();
      phase=width+':invalid';devices=[{...rows[0],created_at:'12/24/2026'}];await page.locator('[data-device-refresh]').click();
      await page.getByText('Remembered devices unavailable.',{exact:true}).waitFor();assert.equal(await page.locator('#remembered-device-settings li').count(),0);
      assert.equal(await page.getByText('No remembered devices.',{exact:true}).count(),0);
      assert.equal(JSON.stringify(rows),before);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);
    }finally{await context.close();}
  }}finally{await browser.close();}
  console.log('device-time-labels: three widths/Tokyo zone/recent-old-year/future expiry/server state/missing clock/invalid metadata/no writes PASS');
}
run().catch(e=>{console.error('device-time-labels failed '+phase+' '+e.stack);process.exitCode=1;});
