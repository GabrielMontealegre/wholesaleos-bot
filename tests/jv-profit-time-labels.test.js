'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const now='2026-11-03T19:18:00.000Z',base='https://fixture.test';
const cases=[['2026-10-30T19:18:00Z','Fri 12:18 PM'],['2026-10-20T19:18:00Z','Oct 20'],
  ['2025-10-20T19:18:00Z','Oct 20, 2025'],['2026-11-03T06:59:59.999Z','Mon 11:59 PM'],
  ['2026-11-03T07:00:00Z','Tue 12:00 AM'],['11/03/2026','Time not confirmed'],
  ['2026-02-30T12:00:00Z','Time not confirmed'],['2026-11-03T19:19:00Z','Time not confirmed'],
  ['2026-10-30','Time not confirmed'],['2026-10-30T19:18:00+00:00','Time not confirmed'],['','Time not confirmed']];
const event={to:'dead',operator_id:'Synthetic operator',evidence_text:'Synthetic report prose 11/03/2026 <img src=x>.',source_url:'https://evidence.example/action'};
const deal={approval:'approved',evaluation:{matches:[],status:'dead'},jv_workflow:{stage:'dead',label:'Dead',next_stage:null,
  stages:[],events:[{...event,happened_at:cases[0][0],recorded_at:cases[1][0]}],signature_reviews:[],history_invalid:false}};
const profit={net_fee:{low:17000,high:24000},our_net:{low:8500,high:12000},buyer_price:{low:160000,high:165000},
  contract_price:{low:140000,high:141000},costs:{low:1000,high:2000},path:'assignment',field_provenance:{},source_kind:'derived_workflow',reported_only:true,buyer_confirmed:false,report_id:'synthetic-time-fixture',our_share:0.5,missing:[]};
let phase='startup';
async function main(){
  const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
  try{for(const width of [1366,400,412]){
    const context=await browser.newContext({viewport:{width,height:915},timezoneId:'Asia/Tokyo'}),page=await context.newPage();
    const errors=[],external=[],writes=[];page.setDefaultTimeout(10000);
    await page.addInitScript(value=>{const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:[value]));}static now(){return value;}};},Date.parse(now));
    page.on('pageerror',error=>errors.push(error.name));
    await page.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
      if(url.origin!==base){external.push(url.hostname);return route.abort();}
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#101317;color:#e5e7eb;font:16px Arial}main{max-width:720px;padding:16px;margin:auto}a{color:#8ab7ff}h1{font-size:24px}details{overflow-wrap:anywhere}</style><link rel="stylesheet" href="/dashboard/wos-match-profit.css"></head><body><main><h1>Recorded deal metadata</h1><div id="profit"></div><div id="jv"></div></main><script src="/dashboard/wos-match-profit.js?v=2"></script><script src="/dashboard/wos-card-clock.js?v=3"></script><script src="/dashboard/wos-jv-workflow.js?v=3"></script></body></html>'});
      if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
      const files={'/dashboard/wos-card-clock.js':'wos-card-clock.js','/dashboard/wos-match-profit.js':'wos-match-profit.js','/dashboard/wos-match-profit.css':'wos-match-profit.css','/dashboard/wos-jv-workflow.js':'wos-jv-workflow.js'};
      assert(Object.hasOwn(files,url.pathname));return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(__dirname,'../dashboard',files[url.pathname]))});
    });
    async function render(values){return page.evaluate(({deal,profit,values})=>{
      const d=structuredClone(deal),p=structuredClone(profit);
      d.jv_workflow.events=values.map(at=>({...d.jv_workflow.events[0],happened_at:at,recorded_at:at}));
      d.jv_workflow.signature_reviews=values.map(at=>({happened_at:at,operator_id:'Synthetic reviewer',evidence_text:'Synthetic review prose.'}));
      ['buyer_price','contract_price','costs'].forEach((key,i)=>{p.field_provenance[key]={...p.field_provenance[key],source_kind:'imported_report',evidence_text:'Synthetic reported price evidence.',source_url:'https://evidence.example/'+key,captured_at:values[i%values.length]};});
      const before=JSON.stringify({d,p});document.getElementById('profit').innerHTML=wosMatchProfit.markup(p);document.getElementById('jv').innerHTML=wosJVWorkflow.render(d);
      document.querySelectorAll('details').forEach(el=>{el.open=true;});return before===JSON.stringify({d,p});
    },{deal,profit,values});}
    try{
      phase=width+':labels';await page.goto(base);
      for(const [value,label] of cases){assert(await render([value]));const a=await page.locator('#profit').innerText(),b=await page.locator('#jv').innerText();assert(a.includes('('+label+')'));assert(b.includes(' - '+label+' - '));assert(b.includes('Operator report recorded '+label));assert(b.includes('Operator review - '+label));}
      phase=width+':proof';assert(await render(cases.slice(0,3).map(row=>row[0])));
      assert((await page.locator('#profit').innerText()).includes('Net fee before split'));
      assert((await page.locator('#profit').innerText()).includes('$17,000 - $24,000'));
      assert((await page.locator('#profit').innerText()).includes('Estimated profit: $8,500 - $12,000'));
      assert((await page.locator('#profit').innerText()).includes('no confirmed buyer'));
      assert((await page.locator('#jv').innerText()).includes(event.evidence_text));
      assert.equal(await page.locator('#jv img').count(),0);
      assert.equal(await page.locator('#profit a').count(),3);
      for(const link of await page.locator('#profit a').all()){const box=await link.boundingBox();assert(box&&box.height>=44&&box.x>=0&&box.x+box.width<=width+1);}
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(process.env.WOS_JV_PROFIT_TIMES_PROOF_DIR){fs.mkdirSync(process.env.WOS_JV_PROFIT_TIMES_PROOF_DIR,{recursive:true});for(const [name,selector] of [['profit','#profit'],['jv-history','#jv details:first-of-type']])await page.locator(selector).screenshot({path:path.join(process.env.WOS_JV_PROFIT_TIMES_PROOF_DIR,name+'-'+width+'.png')});}
      phase=width+':missing-clock';await page.evaluate(()=>{window.wosCardClock=null;});assert(await render([cases[0][0]]));
      assert((await page.locator('#profit').innerText()).includes('(Time not confirmed)'));assert((await page.locator('#jv').innerText()).includes('Operator report recorded Time not confirmed'));
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);
    }finally{await context.close();}
  }}finally{await browser.close();}
  console.log('jv-profit-time-labels: synthetic three widths/Tokyo/11cases/delayed shared clock/source-money preservation/unknown/no writes PASS');
}
main().catch(error=>{console.error('jv-profit-time-labels failed '+phase+' '+error.stack);process.exitCode=1;});
