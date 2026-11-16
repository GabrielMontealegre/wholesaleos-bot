'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {createFixtureApp}=require('./verify-marketplace-ui');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
async function prove(){
  const baselineSha='ca483e7042a6f77d16c6d36b9181ab572f9ff647';
  const prior=new Map(['index.html','wos-todays-deals.js'].map(file=>[file,execFileSync('git',['show',baselineSha+':dashboard/'+file],{maxBuffer:8*1024*1024})]));
  const fixture=createFixtureApp({seedLead:true,todayProof:true,actualDealRoutes:true});
  const server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  const output=path.resolve(process.env.WOS_BACK_PROOF_DIR||'docs/screens/2026-10-26-classic-back');
  const report={synthetic_only:true,baseline_sha:baselineSha,cases:[],accessibility:[]};
  const writes=[],external=[],errors=[];
  let browser;
  try{
    fs.mkdirSync(output,{recursive:true});
    const net=require('node:net'),portServer=net.createServer();
    await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));const port=portServer.address().port;
    await new Promise(resolve=>portServer.close(resolve));
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true,args:['--remote-debugging-port='+port]})).browser;
    const context=await browser.newContext();
    let baseline=false,release=null;
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      if(url.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(baseline&&url.pathname==='/dashboard/')return route.fulfill({contentType:'text/html',body:prior.get('index.html').toString().replace('<title>Montsan REI','<title>SYNTHETIC BASELINE - Montsan REI')});
      if(baseline&&url.pathname==='/dashboard/wos-todays-deals.js')return route.fulfill({contentType:'text/javascript',body:prior.get('wos-todays-deals.js')});
      if(url.pathname==='/api/dashboard/todays-deals'&&url.searchParams.get('record_id'))return new Promise(resolve=>{release=async()=>{await route.continue();resolve();};});
      return route.continue();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    for(const width of [1366,400,412])for(const before of [true,false]){
      baseline=before;release=null;
      await page.setViewportSize({width,height:width===1366?768:915});
      await page.goto(base+'/dashboard/?workspace=deals');await page.locator('.td-card').first().waitFor();
      const initial=await page.locator('.td-card').count();assert.equal(initial,2);
      const paint=await page.evaluate(()=>performance.getEntriesByName('first-contentful-paint')[0]?.startTime);
      assert(typeof paint==='number'&&paint<2000);
      const pending=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/dashboard/todays-deals'&&!!new URL(r.url()).searchParams.get('record_id'));
      await page.getByRole('button',{name:'Open deal',exact:true}).first().click();await pending;
      await page.locator('.td-open-view').waitFor();await page.getByRole('button',{name:'Back to results',exact:true}).click();
      const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dashboard/todays-deals'&&!!new URL(r.url()).searchParams.get('record_id'));
      await release();await (await response).finished();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      if(!before)await page.waitForFunction(()=>document.querySelectorAll('.td-card').length===2&&!document.querySelector('.td-open-view'));
      const cards=await page.locator('.td-card').count();assert.equal(cards,before?1:2);
      const file=(before?'before':'after')+'-back-'+width+'.png';await page.screenshot({path:path.join(output,file)});
      report.cases.push({width,height:width===1366?768:915,baseline:before,initial_cards:initial,after_back_cards:cards,first_contentful_paint_ms:paint,screenshot:file});
    }
    baseline=false;
    if(process.env.WOS_LIGHTHOUSE_PATH){
      const lighthouse=(await import(pathToFileURL(path.resolve(process.env.WOS_LIGHTHOUSE_PATH)).href)).default;
      for(const width of [1366,412]){
        const result=await lighthouse(base+'/dashboard/?workspace=deals',{port,logLevel:'error',onlyCategories:['accessibility'],formFactor:width===1366?'desktop':'mobile',throttlingMethod:'provided',screenEmulation:{mobile:width!==1366,width,height:width===1366?768:915,deviceScaleFactor:1,disabled:false}});
        const score=Math.round(result.lhr.categories.accessibility.score*100);
        report.accessibility.push({width,score,lighthouse_version:result.lhr.lighthouseVersion});
        assert(score>=90);
      }
    }
    fixture.assertUnchanged();assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'synthetic-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={prove};
