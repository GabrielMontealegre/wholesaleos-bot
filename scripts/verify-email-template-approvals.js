'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express');
const templates=require('../modules/email/template-approvals');const {context,seed,input}=require('../tests/email-template-approvals.test');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');const root=path.resolve(__dirname,'..');
async function prove({screenshots=false}={}){
  let store=JSON.parse(JSON.stringify(seed)),writes=0,allow=true;const app=express();app.use(express.json());
  templates.registerRoutes(app,{db:{readDBStrict:()=>store,writeDB:value=>{store=value;writes++;}},requireAdmin:(req,res,next)=>{if(!allow)return res.status(401).json({code:'admin_required'});req.currentUser={id:context.operatorId};next();},now:()=>context.now});
  app.get('/',(_,res)=>res.type('html').send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOCAL SYNTHETIC EMAIL TEMPLATES</title><link rel="stylesheet" href="/dashboard/wos-marketplace.css"><body data-wos-design="marketplace"><p>LOCAL SYNTHETIC DATA - no real email</p><div id="app"><main id="content"></main></div><script>function renderGmail(){return "<h2>Email</h2>"}</script><script src="/dashboard/wos-email-templates.js"></script><script>document.getElementById("content").innerHTML=renderGmail()</script>'));
  app.use('/dashboard',express.static(path.join(root,'dashboard')));app.get('/favicon.ico',(_,res)=>res.status(204).end());
  const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});const base='http://127.0.0.1:'+server.address().port;let browser;
  const errors=[],external=[],posts=[];
  try{
    const post=body=>fetch(base+'/api/dashboard/email-templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    allow=false;assert.equal((await fetch(base+'/api/dashboard/email-templates')).status,401);assert.equal((await post(input())).status,401);allow=true;
    assert.equal((await post({...input(),reviewed:false})).status,400);assert.equal(writes,0);
    assert.equal((await post({...input(),version:'stale'})).status,409);assert.equal(writes,0);
    assert.equal((await post({payload:'x'.repeat(9000)})).status,413);assert.equal(writes,0);
    browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const session=await browser.newContext();
    await session.route('**/*',route=>{const request=route.request();if(!request.url().startsWith(base+'/')){external.push(new URL(request.url()).hostname);return route.abort();}if(request.method()==='POST')posts.push(new URL(request.url()).pathname);return route.continue();});
    const page=await session.newPage();page.on('pageerror',error=>errors.push(error.message));
    for(const width of [1366,400,412]){
      await page.setViewportSize({width,height:915});await page.goto(base);assert.equal(await page.locator('[data-template-form]').count(),0,'opening Email never writes or infers a template');
      await page.locator('[data-template-load]').click();await page.locator('[data-template-form]').waitFor();assert.equal(await page.locator('.et-counts dt').count(),4);
      assert.equal(await page.locator('[name=reviewed]').isChecked(),false);assert.ok((await page.locator('.et-counts').innerText()).includes('0 approved sends recorded'));
      await page.locator('[name=subject]').fill('Synthetic review');await page.locator('[name=body]').fill('Synthetic words only.');await page.locator('[data-template-form] [type=submit]').click();assert.equal(writes,0);
      const dimensions=await page.locator('#email-template-library').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,small:Array.from(el.querySelectorAll('input,select,textarea,button')).filter(el=>{const r=(el.type==='checkbox'?el.closest('label'):el).getBoundingClientRect();return r.height<44||r.width<44;}).length};});
      assert.ok(dimensions.left>=0&&dimensions.right<=width);assert.equal(dimensions.overflow,false);assert.equal(dimensions.small,0);
      if(screenshots){const dir=path.join(root,'docs/screens/2026-10-11-email-templates');fs.mkdirSync(dir,{recursive:true});await page.locator('#email-template-library').screenshot({path:path.join(dir,'synthetic-templates-'+width+'.png')});}
    }
    await page.locator('[name=reviewed]').check();await page.locator('[data-template-form] [type=submit]').click();await page.locator('[data-template-status]').filter({hasText:'Reviewed template saved. No email sent.'}).waitFor();
    assert.equal(writes,1);assert.equal(store.email_template_history.length,1);assert.equal(templates.list(store,context).items[0].approved_send_count,0);
    await page.reload();await page.locator('[data-template-load]').click();await page.locator('[name=body]').waitFor();assert.equal(await page.locator('[name=body]').inputValue(),'Synthetic words only.');
    await page.locator('[data-template-kind]').selectOption('buyer_teaser');assert.equal(await page.locator('[name=body]').inputValue(),'','kinds do not copy one another');
    await page.locator('[name=subject]').fill('<script>subject</script>');await page.locator('[name=body]').fill('<img src=x onerror=alert(1)>');await page.locator('[name=reviewed]').check();await page.locator('[data-template-form] [type=submit]').click();await page.locator('[data-template-status]').filter({hasText:'Reviewed template saved'}).waitFor();
    assert.equal(await page.locator('#email-template-library script,#email-template-library img').count(),0,'operator words stay escaped text');
    assert.equal(writes,2);assert.deepEqual(posts,['/api/dashboard/email-templates','/api/dashboard/email-templates']);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    for(const key of ['leads','buyers','reviewed_deals','conversations'])assert.deepEqual(store[key],seed[key]);
    console.log('Template real routes/UI: admin401,unchecked400,stale409,cap413; explicit save/reload,kind isolation,escaped words,zero sends;1366/400/412,44px/no overflow,preserved stores passed.');
  }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
module.exports={prove};if(require.main===module)prove({screenshots:process.argv.includes('--screenshots')}).catch(error=>{console.error(error.stack);process.exitCode=1;});
