'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const base='https://fixture.test';
const row={queue_key:'synthetic-row-key',normalized_address:'100 Example St',county:'Example',row_state:'NEEDS_COMPS',contact_state:'CONTACT_COMPLETE',property_state:'NEEDS_COMPS',
  row_state_reason:'Synthetic source reason <img src=x>.',contact_state_reason:'Synthetic contact objective recorded.',property_state_reason:'Synthetic comparable sales are still missing.',
  next_best_action:'SYNTHETIC_ACTION',risk_flags:[],missing_fields:[]};
let phase='startup';
async function main(){
  const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
  try{for(const width of [1366,400,412]){
    const context=await browser.newContext({viewport:{width,height:915}}),page=await context.newPage();
    const errors=[],external=[],writes=[];page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.name));
    await page.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#101317;color:#e5e7eb;font:16px Arial}main{max-width:720px;padding:16px;margin:auto}h1{font-size:24px}.wos-public-deal-row{color:#1f2937;overflow-wrap:anywhere}</style></head><body><main><h1>Source review</h1><div id="card"></div></main><script>window.APP={page:"synthetic-source-card"};</script><script src="/dashboard/wos-public-deals.js?v=58"></script></body></html>'});
      if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
      assert.equal(url.pathname,'/dashboard/wos-public-deals.js');return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../dashboard/wos-public-deals.js'))});
    });
    async function render(value){assert(await page.evaluate(value=>{const before=JSON.stringify(value);document.getElementById('card').innerHTML=__wosPublicDealsTestHooks.rowCard(value);return before===JSON.stringify(value);},value));}
    async function capture(name){if(process.env.WOS_SOURCE_WORDS_PROOF_DIR){fs.mkdirSync(process.env.WOS_SOURCE_WORDS_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.WOS_SOURCE_WORDS_PROOF_DIR,name+'-'+width+'.png')});}}
    try{
      phase=width+':positive';await page.goto(base);await render(row);
      const card=page.locator('#card'),details=card.locator('.wos-source-status-details'),summary=details.locator('summary');
      const visible=await card.innerText();for(const label of ['Comparable sales needed','Contact recorded',row.contact_state_reason,row.property_state_reason,'SYNTHETIC_ACTION'])assert(visible.includes(label));
      assert(!visible.includes('NEEDS_COMPS'));assert(!visible.includes('CONTACT_COMPLETE'));assert.equal(await details.getAttribute('open'),null);
      assert.equal(await card.locator('[data-queue-key]').getAttribute('data-queue-key'),row.queue_key);
      const box=await summary.boundingBox();assert(box&&box.height>=44&&box.x>=0&&box.x+box.width<=width+1);
      const badge=card.locator('.wos-source-state-label'),badgeBox=await badge.boundingBox();assert(badgeBox&&badgeBox.x>=0&&badgeBox.x+badgeBox.width<=width+1);assert.equal(await badge.evaluate(el=>getComputedStyle(el).display),'inline-block');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture('collapsed');
      phase=width+':disclosure';await summary.click();assert(await details.evaluate(el=>el.open));
      const raw=await details.innerText();for(const text of ['Legacy combined state: NEEDS_COMPS','Contact state: CONTACT_COMPLETE','Property state: NEEDS_COMPS',row.row_state_reason])assert(raw.includes(text));
      assert.equal(await card.locator('img').count(),0);await capture('expanded');await summary.focus();await page.keyboard.press('Enter');assert.equal(await details.evaluate(el=>el.open),false);
      phase=width+':unknown';await render({...row,row_state:'__proto__',contact_state:'PROPERTY_READY',property_state:'CALL_READY'});
      assert.equal(((await card.innerText()).match(/Status not confirmed/g)||[]).length,3);
      assert(!(await card.innerText()).includes('Phone route recorded'));
      phase=width+':quality';await render({...row,row_state:'',quality_bucket:'INSPECT_NOW'});assert((await card.innerText()).includes('Review now'));
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);
    }finally{await context.close();}
  }}finally{await browser.close();}
  console.log('source-card-state-words-ui: actual synthetic renderer1366/400/412, plain captions/exact source disclosure, click/keyboard,44px/no overflow, wrong-origin/unknown/no writes PASS');
}
main().catch(error=>{console.error('source-card-state-words-ui failed '+phase+' '+error.stack);process.exitCode=1;});
