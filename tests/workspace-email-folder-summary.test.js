'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launchChromiumWithResolvedBrowser}=require('../modules/research/playwright-browser-resolver');
const {fixture}=require('./mailbox-attachments.test');
async function run(){
  const source=await fixture();
  const {browser}=await launchChromiumWithResolvedBrowser(require('playwright'),{headless:true});
  try{for(const width of [1366,400,412]){
    const page=await browser.newPage({viewport:{width,height:width===1366?768:915}});
    await page.addInitScript(()=>{const original=window.setTimeout;window.setTimeout=(callback,ms,...args)=>{if(ms>59000&&ms<=60000)window.expireSyntheticFolderCount=callback;return original(callback,ms,...args);};});
    const pending=[],forbidden=[],errors=[];let metadataReads=0,bodyReads=0,capability=true;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()!=='GET'||url.origin!=='https://fixture.test'){forbidden.push(request.method()+' '+url.origin);return route.abort();}
      if(url.pathname==='/api/auth/session')return route.fulfill({json:{authenticated:true,role:'admin'}});
      if(url.pathname==='/api/gmail/messages'){
        metadataReads++;const folder=url.searchParams.get('folder');
        return route.fulfill({json:{ok:true,messages:[source.metadata],folder_summary_available:capability,folder_scope:{folder,origin:'imap_status',scope_id:folder==='inbox'?'INBOX':'Sent',uid_validity:'7'}}});
      }
      if(url.pathname==='/api/gmail/folder-summary')return new Promise(resolve=>pending.push({folder:url.searchParams.get('folder'),async finish(response){await route.fulfill(response);resolve();}}));
      if(url.pathname.startsWith('/api/gmail/message/')){bodyReads++;return route.fulfill({json:source.body});}
      if(url.pathname.endsWith('/thread-replies/status'))return route.fulfill({json:{enabled:false,configured:true}});
      if(url.pathname==='/app')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../dashboard/workspace/index.html'))});
      assert(url.pathname.startsWith('/dashboard/')&&!url.pathname.includes('..'));
      return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.svg')?'image/svg+xml':'text/javascript',body:fs.readFileSync(path.join(__dirname,'../dashboard',url.pathname.slice('/dashboard/'.length)))});
    });
    const waitPending=async count=>{for(let i=0;pending.length<count&&i<100;i++)await page.waitForTimeout(10);assert.equal(pending.length,count);};
    const snapshot=(folder,total=200,unread=12)=>({ok:true,summary:{folder,source_kind:'connected_mailbox',origin:'imap_status',scope_id:folder==='inbox'?'INBOX':'Sent',uid_validity:'7',captured_at:new Date().toISOString(),scope:'messages',total_messages:total,unread_messages:unread}});
    await page.goto('https://fixture.test/app?preview=1&view=email');await page.locator('.ws-mail-row').waitFor();await waitPending(1);
    assert.equal(metadataReads,1);assert.equal(bodyReads,0);assert.equal(await page.locator('[data-mail-folder-count]').innerText(),'');
    await page.locator('.ws-mail-row').click();await page.locator('.ws-mail-body').waitFor();
    await page.getByRole('button',{name:'Reply',exact:true}).click();
    await page.locator('.ws-composer textarea').fill('Synthetic unsent draft remains exactly intact.');
    await page.locator('.ws-composer').evaluate(form=>{form.dataset.identity='same-form';});
    await pending[0].finish({json:snapshot('inbox')});
    await page.waitForFunction(()=>document.querySelector('[data-mail-folder-count]').textContent.includes('200 messages'));
    assert.equal(await page.locator('.ws-composer').getAttribute('data-identity'),'same-form','Late counts do not repaint/rebind the composer');
    assert.equal(await page.locator('.ws-composer textarea').inputValue(),'Synthetic unsent draft remains exactly intact.');
    assert.equal(bodyReads,1);assert.equal(pending.length,1);
    await page.getByRole('button',{name:'Close reply',exact:true}).click();await page.getByRole('button',{name:'Back to messages',exact:true}).click();
    assert((await page.locator('.ws-mail-range').innerText()).includes('of 1 loaded'),'Message totals are never a grouped-thread denominator');
    assert(await page.locator('.ws-mail-status').evaluate(el=>el.scrollWidth<=el.clientWidth));
    if(process.env.WOS_FOLDER_COUNT_PROOF_DIR){fs.mkdirSync(process.env.WOS_FOLDER_COUNT_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.WOS_FOLDER_COUNT_PROOF_DIR,'synthetic-counts-'+width+'.png')});}
    await page.evaluate(()=>window.expireSyntheticFolderCount());assert.equal(await page.locator('[data-mail-folder-count]').innerText(),'');assert.equal(pending.length,1,'Expiry clears status without a provider poll');
    await page.getByRole('button',{name:'Refresh mailbox',exact:true}).click();await waitPending(2);
    assert.equal(await page.locator('[data-mail-folder-count]').innerText(),'');
    if(await page.getByRole('button',{name:'Mail folders',exact:true}).isVisible()){
      await page.getByRole('button',{name:'Mail folders',exact:true}).click();
      await page.getByRole('dialog',{name:'Mail folders',exact:true}).getByRole('button',{name:'Sent',exact:true}).click();
    }else await page.locator('.ws-mail-rail').getByRole('button',{name:'Sent',exact:true}).click();
    await waitPending(3);
    await pending[1].finish({json:snapshot('inbox',999,99)});await page.waitForTimeout(30);
    assert.equal(await page.locator('.ws-mail-row').count(),1);
    assert.equal(await page.locator('[data-mail-folder-count]').innerText(),'','An obsolete-folder snapshot cannot affect the current folder');
    await pending[2].finish({json:snapshot('sent',0,0)});
    await page.waitForFunction(()=>document.querySelector('[data-mail-folder-count]').textContent.includes('0 messages, 0 unread'));
    await page.getByRole('button',{name:'Refresh mailbox',exact:true}).click();await waitPending(4);await pending[3].finish({status:429,json:{ok:false}});
    await page.waitForTimeout(30);assert.equal(await page.locator('.ws-mail-row').count(),1);assert.equal(await page.locator('[data-mail-folder-count]').innerText(),'');assert.equal(pending.length,4,'No automatic retries after rate limits');
    await page.getByRole('button',{name:'Refresh mailbox',exact:true}).click();await waitPending(5);
    await page.locator('.ws-mail-row').click();await page.locator('.ws-mail-body').waitFor();await page.getByRole('button',{name:'Reply',exact:true}).click();
    await page.locator('.ws-composer textarea').fill('Synthetic draft survives provider-only authorization failure.');await page.locator('.ws-composer').evaluate(form=>{form.dataset.identity='provider-error-form';});
    await pending[4].finish({status:503,json:{ok:false,code:'email_folder_summary_provider_auth'}});await page.waitForTimeout(30);
    assert.equal(await page.locator('.ws-composer').getAttribute('data-identity'),'provider-error-form');assert.equal(await page.locator('.ws-composer textarea').inputValue(),'Synthetic draft survives provider-only authorization failure.');
    await page.getByRole('button',{name:'Close reply',exact:true}).click();await page.getByRole('button',{name:'Back to messages',exact:true}).click();
    capability=false;await page.getByRole('button',{name:'Refresh mailbox',exact:true}).click();await page.waitForTimeout(50);assert.equal(pending.length,5,'Legacy/unsupported metadata makes no summary request');
    capability=true;await page.getByRole('button',{name:'Refresh mailbox',exact:true}).click();await waitPending(6);
    await page.locator('.ws-mail-row').click();await page.locator('.ws-mail-body').waitFor();await page.getByRole('button',{name:'Reply',exact:true}).click();
    await page.locator('.ws-composer textarea').fill('Synthetic draft must be discarded on a late unauthorized response.');
    await pending[5].finish({status:401,json:{ok:false}});
    await page.waitForFunction(()=>!document.querySelector('.ws-mail-row'));assert.equal(await page.locator('.ws-composer').count(),0);
    assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);await page.close();
  }}finally{await browser.close();}
  console.log('workspace-email-folder-summary:1366/400/412 one count request after hydration,no extra body reads,late draft DOM preservation,real zero,conversation/message separation,obsolete snapshot refusal,late401 clears draft,rate-limit/legacy refusal and zero writes/external/errors passed');
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
