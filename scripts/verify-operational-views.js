'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const sessions = require('../modules/security/dashboard-session');
const { launchChromiumWithResolvedBrowser } = require('../modules/research/playwright-browser-resolver');
const root = path.resolve(__dirname,'..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'wos-ops-ui-'));
const output = path.join(root,'docs/screens/operational-safety-local');
const source = 'https://county.example.gov/notices/TEST.pdf';
const good = { id:'TEST-good', address:'100 Test St, Example City, TX 75001', city:'Example City', county:'Example', state:'TX',
  source_url:source, source_kind:'official_public_record', source_structured_address_verified:true,
  source_proof_text:'Property address: 100 Test St, Example City, TX 75001.', status:'New Lead', type:'SFR', arv:200000,offer:100000,
  created_at:'2026-10-06T12:00:00Z' };
const junk = { ...good,id:'TEST-junk',address:'TOP HEADLINES FROM THE BOARD',source_structured_address_verified:false };
const wrong = { ...good,id:'TEST-wrong',redfin_url:'https://www.redfin.com/TX/Other-City/101-Test-St-75002/home/123' };
const noValue = { ...good,id:'TEST-no-value',address:'200 Test St, Example City, TX 75001',source_proof_text:'Property address: 200 Test St, Example City, TX 75001.',arv:0,offer:0 };
const database = { leads:[good,junk,wrong,noValue],buyers:[
  {id:'TEST-real-buyer',name:'Fixture Investor',verified:true,verified_by:'fixture-admin',verified_at:'2026-10-06T12:00:00Z',source_url:'https://company.example.test/buy-box',states:['TX'],buyTypes:['SFR'],maxPrice:150000},
  {id:'TEST-test-buyer',name:'Test Buyer 1',verified:true,state:'TX',maxPrice:500000}
],users:[{id:'fixture-admin',role:'admin',name:'SYNTHETIC ADMIN',firstLogin:false}],settings:{} };
const file = path.join(temporary,'db.json'); fs.writeFileSync(file,JSON.stringify(database));
const secret = crypto.randomBytes(48).toString('base64url');
const port = 41000 + process.pid % 18000;
const base = 'http://127.0.0.1:'+port;
const env = { ...process.env, PORT:String(port),DB_PATH:file,WOS_ADMIN_PIN:String(crypto.randomInt(2000,9000)),WOS_SESSION_SECRET:secret,
  WOS_ENABLE_BACKGROUND_INGESTION:'false', DEAL_BOARD_SNAPSHOTS_PATH:path.join(temporary,'snapshots.json'),
  DEAL_BOARD_JOBS_PATH:path.join(temporary,'jobs.json'),DEAL_BOARD_AUTO_RUN_PATH:path.join(temporary,'auto.json'),
  DEAL_CALL_DOSSIERS_PATH:path.join(temporary,'dossiers.json'),MANUAL_EVIDENCE_PACKETS_PATH:path.join(temporary,'packets.json'),WOS_PAIRING_STATE_PATH:path.join(temporary,'pairings.json') };
const child = childProcess.spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let processOutput='';child.stdout.on('data',data=>{processOutput+=String(data);});child.stderr.on('data',data=>{processOutput+=String(data);});
(async()=>{
  fs.mkdirSync(output,{recursive:true});let browser;
  try {
    let healthy=false;
    for(let i=0;i<300;i++){if(child.exitCode!==null)throw new Error('Local server exited');try{healthy=(await fetch(base+'/health')).ok;}catch(_){}if(healthy)break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.ok(healthy,'Local fixture server must become healthy');
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;
    const context=await browser.newContext();
    const token=sessions.issueSession({userId:'fixture-admin',role:'admin',scope:'dashboard'},{secret}).token;
    await context.addCookies([{name:'wos_session',value:token,url:base,httpOnly:true,sameSite:'Lax'}]);
    const external=[];await context.route('**/*',route=>{
      if(route.request().url().startsWith(base+'/'))return route.continue();
      if(route.request().url()==='http://127.0.0.1:8797/helper/status')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,running:false,paired:false})});
      external.push(route.request().url());return route.abort();
    });
    const page=await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    for(const width of [1366,400]){
      await page.setViewportSize({width,height:900});await page.goto(base+'/dashboard/');
      await page.locator('#app').waitFor({state:'visible'});
      for(const [nav,pageName] of [['Pipeline','pipeline'],['Outreach Hub','outreach'],['Matching','matching'],['Review Queue','review']]){
        if(width===400)await page.locator('.mobile-menu-btn').click();
        await page.locator(".nav-item[onclick=\"navigate('"+pageName+"',this)\"]").click();
        await page.locator('.ops-view').waitFor();
        await page.getByText('Showing 2 of 2 Properties with address proof.',{exact:true}).waitFor();
        assert.ok(!(await page.locator('.ops-view').innerText()).includes(junk.address));
        assert.strictEqual(await page.locator('.ops-view button').filter({hasText:/Send/}).count(),0);
        assert.strictEqual(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        if(pageName==='pipeline'){
          const ratios=await page.locator('.pipe-header').evaluateAll(elements=>{
            const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
            return elements.map(element=>{const a=luminance(getComputedStyle(element).color),b=luminance(getComputedStyle(element).backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
          });
          assert.ok(ratios.length && ratios.every(ratio=>ratio>=4.5),'Pipeline headings must be readable in the actual theme');
        }
        if(pageName==='matching'||pageName==='review'){
          assert.strictEqual(await page.locator('.ops-record').count(),1);
          assert.ok(!(await page.locator('.ops-view').innerText()).includes('Test Buyer 1'));
        }
        await page.screenshot({path:path.join(output,pageName+'-'+width+'.png'),fullPage:true});
        await page.locator('.ops-record').first().click();
        await page.locator('#modal-overlay').waitFor({state:'visible'});
        await page.evaluate(()=>window.closeModal());
      }
      await page.getByRole('button',{name:'Needs address proof: 1',exact:true}).click();
      await page.getByText('Showing 1 of 1 Needs address proof.',{exact:true}).waitFor();
      assert.strictEqual(await page.locator('.ops-record').count(),1);
      await page.getByRole('button',{name:'Link conflicts: 1',exact:true}).click();
      await page.getByText('Showing 1 of 1 Link conflicts.',{exact:true}).waitFor();
      assert.ok((await page.locator('.ops-view').innerText()).includes('Link points to a different property'));
      await page.getByRole('button',{name:'Properties with address proof: 2',exact:true}).click();
      await page.getByText('Showing 2 of 2 Properties with address proof.',{exact:true}).waitFor();
    }
    assert.deepStrictEqual(errors,[]);assert.deepStrictEqual(external,[]);
    const after=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.deepStrictEqual(after.leads,database.leads);assert.deepStrictEqual(after.buyers,database.buyers);
    console.log('Operational UI: 4 existing views at 1366/400; phone menu works; junk/conflicts excluded; valid match only; no Send; count lists reconcile; cards open; zero errors/external requests; stored leads/buyers unchanged.');
  }finally{
    if(browser)await browser.close();
    if(child.exitCode===null && child.signalCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
    const resolved=path.resolve(temporary);
    if(path.dirname(resolved)!==path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('wos-ops-ui-'))throw new Error('Unexpected cleanup path');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
