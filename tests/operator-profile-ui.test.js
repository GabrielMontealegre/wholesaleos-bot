'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createFixtureApp}=require('../scripts/verify-marketplace-ui'),{launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const profiles=require('../modules/records/operator-profile'),templates=require('../modules/email/template-approvals');
(async()=>{
 const fixture=createFixtureApp(),server=await new Promise(resolve=>{const s=fixture.app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port;
 let browser,store={},posts=0,templatePosts=0,conflict=false,hold=false,release=null;const errors=[],external=[],unexpected=[];
 const now='2026-10-07T12:00:00.000Z',operatorId='fixture-admin';
 try{
  browser=(await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true})).browser;const context=await browser.newContext();
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
   if(u.pathname==='/helper/status')return route.fulfill({json:{paired:false}});
   if(u.origin!==base){external.push(u.hostname);return route.abort();}
   if(u.pathname==='/api/auth/logout'&&req.method()==='POST')return route.fulfill({json:{ok:true}});
   if(u.pathname==='/api/dashboard/email-templates'){
    if(req.method()==='POST'){templatePosts++;store=templates.save(store,req.postDataJSON(),{now,operatorId}).store;return route.fulfill({json:{ok:true,status:'Reviewed template saved. No email sent.'}});}
    const result=templates.list(store,{now}),draft=profiles.draft(store,operatorId,{now});
    for(const item of result.items)if(item.template)item.profile_preview={subject:profiles.fill(item.template.subject,draft),body:profiles.fill(item.template.body,draft),signature_is_evidence:false};
    return route.fulfill({json:result});
   }
   if(u.pathname==='/api/dashboard/operator-profile'){
    if(req.method()==='GET'){
     const body=profiles.read(store,operatorId,{now});
     if(hold){hold=false;await new Promise(resolve=>release=resolve);}
     return route.fulfill({json:body});
    }
    if(req.method()==='POST'){
     posts++;if(conflict)return route.fulfill({status:409,json:{code:'operator_profile_changed'}});
     const result=profiles.save(store,req.postDataJSON(),{now,operatorId});store=result.store;
     return route.fulfill({json:{ok:true,saved:result.saved,...profiles.read(store,operatorId,{now})}});
    }
   }
   if(!['GET','HEAD'].includes(req.method())){unexpected.push(req.method()+' '+u.pathname);return route.abort();}
   if(u.pathname==='/api/drive/status')return route.fulfill({json:{code:'DRIVE_CONFIGURATION_MISSING',connected:false}});
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1366,400,412]){
   store=templates.save({},{kind:'holder_jv_reply',subject:'Synthetic draft',body:'For {{operator_legal_name}}',reviewed:true,version:templates.list({},{now}).items[0].version},{now,operatorId}).store;conflict=false;const start=posts;
   await page.setViewportSize({width,height:width===1366?768:915});await page.goto(base+'/dashboard/');await page.locator('.marketplace-topnav').waitFor({state:'attached'});
   await page.evaluate(()=>navigate('settings',null));await page.locator('[data-profile-status]').filter({hasText:'No saved profile'}).waitFor();
   assert.equal(await page.locator('#s-company,#s-name,#s-address,#s-email').count(),0,'obsolete fake-save profile removed');
   assert.equal(await page.locator('#operator-profile').count(),1);assert.equal(posts,start,'no writes on load');
   const form=page.locator('[data-profile-form]');await form.locator('[name=legal_name]').fill('SYNTHETIC OPERATOR, an individual');
   await form.locator('[name=email]').fill('operator@example.test');await form.locator('[name=typed_signature]').fill('SYNTHETIC DRAFT SIGNATURE');
   await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.locator('[data-profile-status]').filter({hasText:'tick the checkbox'}).waitFor();assert.equal(posts,start);
   await form.locator('[name=reviewed]').check();await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.locator('[data-profile-status]').filter({hasText:'Reviewed profile saved'}).waitFor();assert.equal(posts,start+1);
   assert.equal(await form.locator('[name=reviewed]').isChecked(),false);assert.equal(store.operator_profile_history.length,1);
   await page.getByRole('button',{name:'Reload saved profile',exact:true}).click();await page.locator('[data-profile-status]').filter({hasText:'Saved profile loaded'}).waitFor();assert.equal(await form.locator('[name=legal_name]').inputValue(),'SYNTHETIC OPERATOR, an individual');
   assert.ok((await page.locator('#operator-profile').innerText()).includes('Legacy contract autofill is unavailable'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   for(const button of await page.locator('#operator-profile button').all())assert.ok(await button.evaluate(el=>el.getBoundingClientRect().height>=44));
   if(process.argv.includes('--screenshots')){
    const dir=path.join(__dirname,'../docs/screens/2026-10-19-366-i');fs.mkdirSync(dir,{recursive:true});await page.locator('#operator-profile').scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.screenshot({path:path.join(dir,'synthetic-profile-'+width+'.png')});
   }
   conflict=true;await form.locator('[name=llc]').fill('SYNTHETIC COMPANY');await form.locator('[name=reviewed]').check();await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.locator('[data-profile-status]').filter({hasText:'Profile changed'}).waitFor();assert.equal(await page.getByRole('button',{name:'Save profile',exact:true}).isEnabled(),false);assert.equal(store.operator_profile_history.length,1);
   conflict=false;await page.getByRole('button',{name:'Reload saved profile',exact:true}).click();await page.locator('[data-profile-status]').filter({hasText:'Saved profile loaded'}).waitFor();assert.equal(await form.locator('[name=llc]').inputValue(),'');
   assert.equal(await page.locator('[data-profile-image]').getAttribute('accept'),'image/png,image/jpeg');
   await page.locator('[data-profile-image]').setInputFiles({name:'invalid.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await page.locator('[data-profile-status]').filter({hasText:'Choose a PNG or JPEG'}).waitFor();
   await page.locator('[data-profile-image]').setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.alloc(20)});await page.locator('[data-profile-status]').filter({hasText:'Image could not be read'}).waitFor();
   const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8s8AAAAASUVORK5CYII=','base64');
   await page.locator('[data-profile-image]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await page.locator('[data-profile-status]').filter({hasText:'Image added to draft'}).waitFor();assert.equal(await page.locator('#operator-profile img').count(),1);
   await page.getByRole('button',{name:'Remove image from draft',exact:true}).click();assert.equal(await page.locator('#operator-profile img').count(),0);assert.equal(store.operator_profile_history.length,1,'local image draft does not write');
   await page.evaluate(()=>navigate('gmail',null));await page.getByRole('button',{name:'Load reviewed templates',exact:true}).click();await page.locator('[data-template-profile-field]').waitFor();
   await page.locator('[data-template-profile-field]').selectOption('operator_signature');assert.ok((await page.locator('[data-template-form] [name=body]').inputValue()).includes('{{operator_signature}}'));assert.equal(await page.locator('[data-template-form] [name=reviewed]').isChecked(),false);
   await page.locator('[data-template-form] [name=reviewed]').check();await page.getByRole('button',{name:'Save reviewed template',exact:true}).click();await page.locator('[data-template-status]').filter({hasText:'Reviewed template saved'}).waitFor();
   await page.getByText('Preview with my saved profile',{exact:true}).click();await page.locator('.et-profile-preview').filter({hasText:'SYNTHETIC DRAFT SIGNATURE'}).waitFor();
   if(process.argv.includes('--screenshots')){await page.locator('#email-template-library').scrollIntoViewIfNeeded();await page.mouse.move(0,0);await page.screenshot({path:path.join(__dirname,'../docs/screens/2026-10-19-366-i/synthetic-template-'+width+'.png')});}
   await page.evaluate(()=>navigate('settings',null));await page.locator('[data-profile-status]').filter({hasText:'Saved profile loaded'}).waitFor();
  }
  // Late private GET cannot rehydrate the profile after sign-out.
  hold=true;await page.getByRole('button',{name:'Reload saved profile',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-profile-status]')?.textContent.includes('Loading'));
  await page.evaluate(async()=>{await window.signOutDashboard();});
  if(release)release();await page.locator('[data-profile-status]').filter({hasText:'Dashboard login required'}).waitFor({state:'attached'});
  assert.equal(await page.locator('[data-profile-form] [name=legal_name]').inputValue(),'');assert.ok(!(await page.locator('#operator-profile').textContent()).includes('SYNTHETIC DRAFT SIGNATURE'));
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.equal(templatePosts,3);fixture.assertUnchanged();
  console.log('Profile actual dashboard1366/400/412: no load writes, real reviewed fixture save/reload, inline review/conflict guards, phone layout/44px controls, legacy excluded, late logout response discarded; zero external requests and console errors passed.');
 }finally{if(release)release();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
